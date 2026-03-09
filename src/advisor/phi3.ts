import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type { ScoredFile } from '../model/metrics.js';

export interface AiAdvice {
  tags: string[];
  severity: number;
  explanation: string;
  suggestion: string;
  model: string;
}

interface AdvisorParams {
  modelPath: string;
  maxFiles: number;
  timeoutMs?: number;
  retries?: number;
}

function validateParsedAdvice(value: unknown): AiAdvice | null {
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
    return {
      tags: parsed.tags.map(String).slice(0, 6),
      severity: Math.max(0, Math.min(1, parsed.severity)),
      explanation: parsed.explanation.trim(),
      suggestion: parsed.suggestion.trim(),
      model: 'phi-3.5-mini-instruct',
    };
  } catch {
    return null;
  }
}

function safeJsonParse(text: string): AiAdvice | null {
  // Try to recover the last valid JSON object from noisy llama-cli output.
  for (let start = text.lastIndexOf('{'); start >= 0; start = text.lastIndexOf('{', start - 1)) {
    for (let end = text.indexOf('}', start); end >= 0; end = text.indexOf('}', end + 1)) {
      const candidate = text.slice(start, end + 1);
      try {
        const parsed = JSON.parse(candidate);
        const valid = validateParsedAdvice(parsed);
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
        '2048',
        '-n',
        '180',
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

function buildPrompt(file: ScoredFile, sourceSnippet: string): string {
  return `You are a TypeScript maintainability reviewer.
Return ONLY valid JSON with shape:
{"tags":["tag"],"severity":0.0,"explanation":"...","suggestion":"..."}

Constraints:
- tags: up to 4 snake_case tags
- severity: 0.0 to 1.0
- explanation: one short sentence
- suggestion: one actionable sentence

File: ${file.path}
Entropy: ${file.entropy.toFixed(3)}
LOC: ${file.loc}
SignalScores: nesting=${file.signalScores.nesting.toFixed(3)}, functionLength=${file.signalScores.functionLength.toFixed(3)}, typeEscape=${file.signalScores.typeEscape.toFixed(3)}

Code:
\`\`\`ts
${sourceSnippet}
\`\`\``;
}

export async function runPhi3Advisor(
  scoredFiles: ScoredFile[],
  params: AdvisorParams,
): Promise<Map<string, AiAdvice>> {
  await fs.access(params.modelPath);
  const topFiles = [...scoredFiles]
    .sort((a, b) => b.entropy - a.entropy)
    .slice(0, Math.max(0, params.maxFiles));

  const results = new Map<string, AiAdvice>();
  for (const file of topFiles) {
    const source = await fs.readFile(file.path, 'utf-8');
    const prompt = buildPrompt(file, source.slice(0, 4000));

    let raw = '';
    let parsed: AiAdvice | null = null;
    const retries = Math.max(0, params.retries ?? 1);
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        raw = await runLlamaPrompt({
          modelPath: params.modelPath,
          prompt,
          timeoutMs: params.timeoutMs ?? 45_000,
        });
        parsed = safeJsonParse(raw);
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
