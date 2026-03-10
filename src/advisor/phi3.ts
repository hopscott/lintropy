import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type { FileMetrics, ScoredFile } from '../model/metrics.js';

/** Issue types the AI can classify. */
const PRIMARY_ISSUES = [
  'god_function',
  'deep_nesting',
  'mixed_responsibility',
  'noisy_types',
  'vibe_chaining',
] as const;

export type PrimaryIssue = (typeof PRIMARY_ISSUES)[number];

export interface AiAdvice {
  tags: string[];
  severity: number;
  explanation: string;
  suggestion: string;
  model: string;
  /** Full fixed file content when fix mode is enabled. */
  fixedCode?: string;
  /** Structured output: single biggest readability blocker. */
  primaryIssue?: PrimaryIssue | string;
  /** Line numbers or ranges (e.g. 23, "45-50", 78) to focus on. */
  blameLines?: (number | string)[];
  /** 2–8 lines of improved code snippet for copy-paste. */
  fixCode?: string;
  /** Estimated entropy reduction, e.g. "-0.3". */
  entropyDelta?: string;
  /** Model confidence 0–1. */
  confidence?: number;
}

interface AdvisorParams {
  modelPath: string;
  maxFiles: number;
  timeoutMs?: number;
  retries?: number;
  /** When true, prompt asks for fixedCode and token limit is increased. */
  fixMode?: boolean;
  /** Raw metrics by path for richer prompt context. */
  metricsByPath?: Map<string, FileMetrics>;
}

function parseBlameLines(raw: unknown): (number | string)[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: (number | string)[] = [];
  for (const v of raw) {
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) out.push(v);
    else if (typeof v === 'string' && /^\d+(-\d+)?$/.test(v)) out.push(v);
  }
  return out.length > 0 ? out : undefined;
}

function validateParsedAdvice(value: unknown, fixMode: boolean): AiAdvice | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const parsed = value as Partial<AiAdvice>;
  try {
    if (
      !Array.isArray(parsed.tags) ||
      typeof parsed.severity !== 'number' ||
      typeof parsed.explanation !== 'string' ||
      typeof parsed.suggestion !== 'string'
    ) {
      return null;
    }
    let fixedCode: string | undefined;
    if (fixMode && typeof parsed.fixedCode === 'string' && parsed.fixedCode.trim().length > 0) {
      fixedCode = extractFixedCode(parsed.fixedCode.trim());
    }
    const blameLines = parseBlameLines(parsed.blameLines);
    const fixCodeSnippet =
      typeof parsed.fixCode === 'string' && parsed.fixCode.trim().length > 0
        ? parsed.fixCode.trim()
        : undefined;
    return {
      tags: parsed.tags.map(String).slice(0, 6),
      severity: Math.max(0, Math.min(1, parsed.severity)),
      explanation: parsed.explanation.trim(),
      suggestion: parsed.suggestion.trim(),
      model: 'phi-3.5-mini-instruct',
      ...(fixedCode && { fixedCode }),
      ...(parsed.primaryIssue &&
        typeof parsed.primaryIssue === 'string' && { primaryIssue: parsed.primaryIssue }),
      ...(blameLines && { blameLines }),
      ...(fixCodeSnippet && { fixCode: fixCodeSnippet }),
      ...(parsed.entropyDelta &&
        typeof parsed.entropyDelta === 'string' && { entropyDelta: parsed.entropyDelta.trim() }),
      ...(typeof parsed.confidence === 'number' && {
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
      }),
    };
  } catch {
    return null;
  }
}

/** Strip markdown code fences if the model wrapped the output. */
function extractFixedCode(raw: string): string {
  const tsBlock = /^```(?:ts|typescript)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = raw.match(tsBlock);
  return match?.[1]?.trimEnd() ?? raw;
}

function safeJsonParse(text: string, fixMode: boolean): AiAdvice | null {
  // Try to recover the last valid JSON object from noisy llama-cli output.
  for (let start = text.lastIndexOf('{'); start >= 0; start = text.lastIndexOf('{', start - 1)) {
    for (let end = text.indexOf('}', start); end >= 0; end = text.indexOf('}', end + 1)) {
      const candidate = text.slice(start, end + 1);
      try {
        const parsed = JSON.parse(candidate);
        const valid = validateParsedAdvice(parsed, fixMode);
        if (valid) {
          return valid;
        }
      } catch {
        // Keep scanning until a valid object is found.
      }
    }
  }

  return null;
}

function runLlamaPrompt(args: {
  modelPath: string;
  prompt: string;
  timeoutMs: number;
  maxTokens: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'llama-cli',
      [
        '-m',
        args.modelPath,
        '--simple-io',
        '--log-disable',
        '--no-display-prompt',
        '-c',
        '4096',
        '-n',
        String(args.maxTokens),
        '--temp',
        '0.1',
        '--seed',
        '42',
        '-p',
        args.prompt,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`llama-cli timed out after ${args.timeoutMs}ms`));
    }, args.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `llama-cli exited with code ${code}`));
      }
    });
  });
}

function p90(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => b - a);
  const idx = Math.floor(sorted.length * 0.9);
  return sorted[idx] ?? 0;
}

function buildPrompt(
  file: ScoredFile,
  sourceSnippet: string,
  fixMode: boolean,
  metrics?: FileMetrics,
): string {
  const metricsBlock = metrics
    ? `
ENTROPY BREAKDOWN:
- LOC: ${metrics.loc}
- Max nesting: ${metrics.maxNestingDepth}
- P90 function length: ${p90(metrics.functionLengths)}
- Control flow density: ${metrics.loc > 0 ? (metrics.controlFlowCount / metrics.loc).toFixed(3) : 0}
- Type escapes: ${metrics.typeEscapeCount}
`
    : `
Entropy: ${file.entropy.toFixed(3)} | LOC: ${file.loc}
SignalScores: nesting=${file.signalScores.nesting.toFixed(3)}, functionLength=${file.signalScores.functionLength.toFixed(3)}, typeEscape=${file.signalScores.typeEscape.toFixed(3)}
`;

  const base = `You are a senior TypeScript engineer reviewing for READABILITY and MAINTAINABILITY.

FILE: ${file.path}${metricsBlock}

CODE (focus on high-entropy sections):
\`\`\`typescript
${sourceSnippet}
\`\`\``;

  if (fixMode) {
    return `${base}

Refactor the code to reduce entropy: extract nested logic into named functions, shorten long functions, replace any/unsafe casts.
Return ONLY valid JSON:
{"tags":["tag"],"severity":0.0,"explanation":"...","suggestion":"...","fixedCode":"<complete fixed file as escaped string>"}

Constraints:
- tags: up to 4 snake_case tags
- severity: 0.0 to 1.0
- explanation: one short sentence
- suggestion: one actionable sentence
- fixedCode: the ENTIRE refactored file. Preserve all imports, exports, and behavior. Escape newlines as \\n and quotes as \\".`;
  }

  return `${base}

TASK: Identify the SINGLE biggest readability blocker and give a concrete 2-4 line fix.

REASON step-by-step:
1. What specific pattern causes high entropy? (god_function, nesting hell, mixed concerns, etc.)
2. Which lines/nodes are worst?
3. One refactor that drops entropy 30%+

OUTPUT EXACTLY this JSON (no other text):

{
  "tags": ["tag1","tag2"],
  "primaryIssue": "${PRIMARY_ISSUES.join(' | ')}",
  "severity": 0.0,
  "blameLines": [23, "45-50", 78],
  "explanation": "1 sentence why this hurts readability",
  "suggestion": "one actionable sentence",
  "fixCode": "2-8 lines of improved code snippet",
  "entropyDelta": "-0.3 estimated",
  "confidence": 0.0
}

Constraints:
- primaryIssue: exactly one of the pipe-separated values
- blameLines: array of line numbers and/or "start-end" range strings
- fixCode: 2-8 lines of concrete refactored code the dev can copy-paste
- entropyDelta: estimated reduction e.g. "-0.3"
- confidence: 0.0 to 1.0`;
}

export async function runPhi3Advisor(
  scoredFiles: ScoredFile[],
  params: AdvisorParams,
): Promise<Map<string, AiAdvice>> {
  await fs.access(params.modelPath);
  const fixMode = params.fixMode ?? false;
  const maxTokens = fixMode ? 8192 : 512;

  const topFiles = [...scoredFiles]
    .sort((a, b) => b.entropy - a.entropy)
    .slice(0, Math.max(0, params.maxFiles));

  const results = new Map<string, AiAdvice>();
  const metricsByPath = params.metricsByPath ?? new Map();

  for (const file of topFiles) {
    const source = await fs.readFile(file.path, 'utf-8');
    const metrics = metricsByPath.get(file.path);
    const prompt = buildPrompt(file, source.slice(0, 4000), fixMode, metrics);

    let raw = '';
    let parsed: AiAdvice | null = null;
    const retries = Math.max(0, params.retries ?? 1);
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        raw = await runLlamaPrompt({
          modelPath: params.modelPath,
          prompt,
          timeoutMs: params.timeoutMs ?? 45_000,
          maxTokens,
        });
        parsed = safeJsonParse(raw, fixMode);
        if (parsed) {
          break;
        }
      } catch {
        if (attempt === retries) {
          throw new Error(`AI inference failed for ${file.path}`);
        }
      }
    }

    if (parsed) {
      results.set(file.path, parsed);
    }
  }

  return results;
}
