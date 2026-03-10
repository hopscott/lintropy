import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type { FileMetrics, ScoredFile } from '../model/metrics.js';
import { buildAdvisorPrompt, type PRIMARY_ISSUES, parseAdvisorResponse } from './phi3-shared.js';

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
    const prompt = buildAdvisorPrompt(file, source.slice(0, 4000), fixMode, metrics);

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
        parsed = parseAdvisorResponse(raw, fixMode);
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
