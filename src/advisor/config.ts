/**
 * Ollama model discovery. Uses .lintropy.json for model/baseUrl overrides.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_OLLAMA_BASE = 'http://localhost:11434';

interface LintropyConfig {
  ollama?: {
    model?: string;
    baseUrl?: string;
  };
}

async function loadConfig(): Promise<LintropyConfig | null> {
  const candidates = [
    path.join(process.cwd(), '.lintropy.json'),
    path.join(process.cwd(), 'lintropy.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf-8');
      return JSON.parse(raw) as LintropyConfig;
    } catch {
      // continue
    }
  }
  return null;
}

async function findOllamaModel(baseUrl: string, preferred?: string): Promise<string | null> {
  try {
    if (preferred) {
      const r = await fetch(`${baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: preferred }),
      });
      return r.ok ? preferred : null;
    }
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = data.models ?? [];
    const phi3 = models.find((m) => m.name.toLowerCase().includes('phi3'));
    return phi3?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve Ollama model. Uses .lintropy.json for model/baseUrl overrides.
 */
export async function findModel(): Promise<string> {
  const config = await loadConfig();
  const baseUrl = config?.ollama?.baseUrl ?? DEFAULT_OLLAMA_BASE;
  const preferred = config?.ollama?.model;

  const found = await findOllamaModel(baseUrl, preferred);
  if (!found) {
    throw new Error('Ollama not running or no phi3 model. Start Ollama and run: ollama pull phi3');
  }
  return found;
}
