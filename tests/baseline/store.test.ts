import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBaseline, writeBaseline } from '../../src/baseline/store.js';

const tempDirs: string[] = [];

function createTempPath(fileName: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'lintropy-baseline-'));
  tempDirs.push(dir);
  return path.join(dir, fileName);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('baseline store', () => {
  it('writes and reads baseline payload', async () => {
    const baselinePath = createTempPath('baseline.json');
    const baseline = await writeBaseline(
      { entropy: 0.5, fileCount: 1, totalLoc: 50 },
      [
        {
          path: '/repo/a.ts',
          loc: 50,
          entropy: 0.5,
          signalScores: { nesting: 0.5, functionLength: 0.5, typeEscape: 0 },
          signalContributions: { nesting: 0.2, functionLength: 0.175, typeEscape: 0 },
        },
      ],
      baselinePath,
    );

    const loaded = await readBaseline(baselinePath);
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(1);
    expect(loaded?.project.entropy).toBe(baseline.project.entropy);
    expect(loaded?.files[0]?.path).toBe('/repo/a.ts');
  });

  it('returns null when baseline file does not exist', async () => {
    const baselinePath = createTempPath('missing.json');
    const loaded = await readBaseline(baselinePath);
    expect(loaded).toBeNull();
  });
});
