/**
 * Ollama-based AI advisor. Uses same prompt/parsing as phi3.
 */
import { promises as fs } from 'node:fs';
import type { FileMetrics, ScoredFile } from '../model/metrics.js';
import type { AiAdvice } from './phi3.js';
import { buildAdvisorPrompt, parseAdvisorResponse } from './phi3-shared.js';

const DEFAULT_OLLAMA_BASE = 'http://localhost:11434';

async function ollamaGenerate(args: {
  model: string;
  prompt: string;
  baseUrl: string;
  timeoutMs: number;
  maxTokens: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const res = await fetch(`${args.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: args.model,
        prompt: args.prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.1,
          seed: 42,
          num_predict: args.maxTokens,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { response?: string };
    return data.response ?? '';
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error) throw err;
    throw new Error(String(err));
  }
}

export interface OllamaAdvisorParams {
  modelName: string;
  baseUrl?: string;
  maxFiles: number;
  timeoutMs?: number;
  retries?: number;
  fixMode?: boolean;
  metricsByPath?: Map<string, FileMetrics>;
}

export async function runOllamaAdvisor(
  scoredFiles: ScoredFile[],
  params: OllamaAdvisorParams,
): Promise<Map<string, AiAdvice>> {
  const baseUrl = params.baseUrl ?? DEFAULT_OLLAMA_BASE;
  const fixMode = params.fixMode ?? false;
  const maxTokens = fixMode ? 8192 : 512;
  const timeoutMs = params.timeoutMs ?? 45_000;

  const topFiles = [...scoredFiles]
    .sort((a, b) => b.entropy - a.entropy)
    .slice(0, Math.max(0, params.maxFiles));

  const results = new Map<string, AiAdvice>();
  const metricsByPath = params.metricsByPath ?? new Map();
  const retries = Math.max(0, params.retries ?? 1);

  for (const file of topFiles) {
    const source = await fs.readFile(file.path, 'utf-8');
    const metrics = metricsByPath.get(file.path);
    const prompt = buildAdvisorPrompt(file, source.slice(0, 4000), fixMode, metrics);

    let raw = '';
    let parsed: AiAdvice | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        raw = await ollamaGenerate({
          model: params.modelName,
          prompt,
          baseUrl,
          timeoutMs,
          maxTokens,
        });
        parsed = parseAdvisorResponse(raw, fixMode);
        if (parsed) break;
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
