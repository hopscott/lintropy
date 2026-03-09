import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeFile } from '../../src/analyze/ast.js';

const tempDirs: string[] = [];

function createTempTsFile(name: string, source: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'lintropy-analyze-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  writeFileSync(filePath, source, 'utf-8');
  return filePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('analyzeFile', () => {
  it('extracts function lengths, nesting, and type escapes', () => {
    const filePath = createTempTsFile(
      'sample.ts',
      `
      export function demo(value: unknown) {
        if (value) {
          if (typeof value === 'string') {
            return value as any;
          }
        }
        return (value as unknown) as string;
      }
      `,
    );

    const metrics = analyzeFile(filePath);
    expect(metrics.functionCount).toBe(1);
    expect(metrics.maxNestingDepth).toBe(2);
    expect(metrics.typeEscapeCount).toBe(2);
    expect(metrics.functionLengths.length).toBe(1);
    expect(metrics.loc).toBeGreaterThan(0);
  });
});
