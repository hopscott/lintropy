/**
 * Smart model discovery: bundled GGUF → Ollama → custom path.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type ModelSource = 'bundled' | 'ollama' | 'local';

export interface ResolvedModel {
  type: ModelSource;
  /** For bundled/local: absolute path. For ollama: model name. */
  pathOrName: string;
}

const DEFAULT_OLLAMA_BASE = 'http://localhost:11434';
const BUNDLED_MODEL_REL = 'models/phi3.q4.gguf';

interface LintropyConfig {
  model?: 'bundled' | 'ollama' | string;
  thresholds?: { ai?: number };
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

async function bundledExists(): Promise<boolean> {
  const abs = path.resolve(process.cwd(), BUNDLED_MODEL_REL);
  return fs
    .access(abs)
    .then(() => true)
    .catch(() => false);
}

async function findOllamaPhi3(baseUrl: string): Promise<string | null> {
  try {
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
 * Resolve which model to use. Order:
 * 1. --model CLI override (handled by CLI)
 * 2. .lintropy.json config
 * 3. Bundled model (models/phi3.q4.gguf)
 * 4. Ollama (auto-detect phi3)
 */
export async function findModel(options?: {
  /** Explicit override: "bundled" | "ollama" | path */
  override?: string;
}): Promise<ResolvedModel> {
  const config = await loadConfig();

  if (options?.override) {
    const v = options.override.toLowerCase();
    if (v === 'bundled') {
      const abs = path.resolve(process.cwd(), BUNDLED_MODEL_REL);
      const exists = await bundledExists();
      if (!exists) {
        throw new Error(`Bundled model not found at ${abs}. Run: npm run download-model`);
      }
      return { type: 'bundled', pathOrName: abs };
    }
    if (v === 'ollama') {
      const baseUrl = config?.ollama?.baseUrl ?? DEFAULT_OLLAMA_BASE;
      const preferred = config?.ollama?.model;
      const found = preferred
        ? await (async () => {
            try {
              const r = await fetch(`${baseUrl}/api/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: preferred }),
              });
              return r.ok ? preferred : null;
            } catch {
              return null;
            }
          })()
        : await findOllamaPhi3(baseUrl);
      if (!found) {
        throw new Error(
          `Ollama not running or no phi3 model. Start Ollama and run: ollama pull phi3`,
        );
      }
      return { type: 'ollama', pathOrName: found };
    }
    // Custom path
    const abs = path.resolve(process.cwd(), options.override);
    await fs.access(abs);
    return { type: 'local', pathOrName: abs };
  }

  // Config override
  const configModel = config?.model;
  if (configModel) {
    if (configModel === 'bundled') {
      const abs = path.resolve(process.cwd(), BUNDLED_MODEL_REL);
      if (await bundledExists()) return { type: 'bundled', pathOrName: abs };
    }
    if (configModel === 'ollama') {
      const baseUrl = config?.ollama?.baseUrl ?? DEFAULT_OLLAMA_BASE;
      const preferred = config?.ollama?.model;
      const found = preferred
        ? await (async () => {
            try {
              const r = await fetch(`${baseUrl}/api/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: preferred }),
              });
              return r.ok ? preferred : null;
            } catch {
              return null;
            }
          })()
        : await findOllamaPhi3(baseUrl);
      if (found) return { type: 'ollama', pathOrName: found };
    }
    if (configModel && configModel !== 'bundled' && configModel !== 'ollama') {
      const abs = path.resolve(process.cwd(), configModel);
      try {
        await fs.access(abs);
        return { type: 'local', pathOrName: abs };
      } catch {
        // fall through
      }
    }
  }

  // Auto: bundled first
  if (await bundledExists()) {
    const abs = path.resolve(process.cwd(), BUNDLED_MODEL_REL);
    return { type: 'bundled', pathOrName: abs };
  }

  // Auto: Ollama
  const ollamaModel = await findOllamaPhi3(config?.ollama?.baseUrl ?? DEFAULT_OLLAMA_BASE);
  if (ollamaModel) {
    return { type: 'ollama', pathOrName: ollamaModel };
  }

  throw new Error('No model found. Run: npm run download-model  (or use Ollama: ollama pull phi3)');
}
