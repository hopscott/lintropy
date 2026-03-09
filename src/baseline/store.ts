import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectScore, ScoredFile } from '../model/metrics.js';

export const DEFAULT_BASELINE_PATH = path.resolve('.lintropy-baseline.json');
const BASELINE_VERSION = 1;

interface BaselineData {
  version: number;
  recordedAt: string;
  project: {
    entropy: number;
    loc: number;
    fileCount: number;
  };
  files: Array<{
    path: string;
    entropy: number;
    loc: number;
  }>;
}

export async function readBaseline(filePath = DEFAULT_BASELINE_PATH): Promise<BaselineData | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as BaselineData;
    if (parsed.version !== BASELINE_VERSION) {
      throw new Error(
        `Unsupported baseline version ${parsed.version}. Expected ${BASELINE_VERSION}.`,
      );
    }
    return parsed;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

export async function writeBaseline(
  project: ProjectScore,
  files: ScoredFile[],
  filePath = DEFAULT_BASELINE_PATH,
): Promise<BaselineData> {
  const baseline: BaselineData = {
    version: BASELINE_VERSION,
    recordedAt: new Date().toISOString(),
    project: {
      entropy: project.entropy,
      loc: project.totalLoc,
      fileCount: project.fileCount,
    },
    files: [...files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => ({ path: file.path, entropy: file.entropy, loc: file.loc })),
  };

  await fs.writeFile(filePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
  return baseline;
}
