import { describe, expect, it } from 'vitest';
import { selectAiCandidates, selectAiOutliers } from '../../src/advisor/selection.js';

const makeFile = (path: string, entropy: number) => ({
  path,
  loc: 10,
  entropy,
  signalScores: {
    nesting: 0,
    functionLength: 0,
    typeEscape: 0,
  },
  signalContributions: {
    nesting: 0,
    functionLength: 0,
    typeEscape: 0,
  },
});

describe('selectAiCandidates', () => {
  it('selects only files at or above threshold', () => {
    const selection = selectAiCandidates(
      [makeFile('/a.ts', 0.6), makeFile('/b.ts', 0.2), makeFile('/c.ts', 0.4)],
      0.4,
    );

    expect(selection.candidates.map((file) => file.path)).toEqual(['/a.ts', '/c.ts']);
    expect(selection.eligibleFiles).toBe(2);
    expect(selection.fallbackUsed).toBe(false);
  });

  it('falls back to top entropy file when threshold filters all files', () => {
    const selection = selectAiCandidates([makeFile('/a.ts', 0.2), makeFile('/b.ts', 0.1)], 0.9);

    expect(selection.candidates.map((file) => file.path)).toEqual(['/a.ts']);
    expect(selection.eligibleFiles).toBe(0);
    expect(selection.fallbackUsed).toBe(true);
  });
});

describe('selectAiOutliers', () => {
  it('selects files above mean + k*stdDev', () => {
    const files = [
      makeFile('/a.ts', 0.8),
      makeFile('/b.ts', 0.2),
      makeFile('/c.ts', 0.2),
      makeFile('/d.ts', 0.2),
      makeFile('/e.ts', 0.2),
    ];
    const selection = selectAiOutliers(files, { outlierK: 1.5 });

    expect(selection.mode).toBe('outlier');
    expect(selection.outlierK).toBe(1.5);
    expect(selection.candidates.map((f) => f.path)).toContain('/a.ts');
    expect(selection.candidates.length).toBeLessThanOrEqual(2);
  });

  it('falls back to top file when no outliers', () => {
    const files = [makeFile('/a.ts', 0.3), makeFile('/b.ts', 0.3), makeFile('/c.ts', 0.3)];
    const selection = selectAiOutliers(files, { outlierK: 2 });

    expect(selection.candidates.map((file) => file.path)).toEqual(['/a.ts']);
    expect(selection.fallbackUsed).toBe(true);
  });

  it('returns empty when no files', () => {
    const selection = selectAiOutliers([], { outlierK: 1.5 });

    expect(selection.candidates).toEqual([]);
    expect(selection.totalFiles).toBe(0);
  });

  it('uses baseline deltas when baselineAware and baseline provided', () => {
    const files = [makeFile('/a.ts', 0.8), makeFile('/b.ts', 0.3), makeFile('/c.ts', 0.3)];
    const baseline = {
      version: 1,
      recordedAt: new Date().toISOString(),
      project: { entropy: 0.4, loc: 100, fileCount: 3 },
      files: [
        { path: '/a.ts', entropy: 0.2, loc: 30 },
        { path: '/b.ts', entropy: 0.3, loc: 40 },
        { path: '/c.ts', entropy: 0.3, loc: 30 },
      ],
    };
    const selection = selectAiOutliers(files, {
      outlierK: 1.5,
      baseline,
      baselineAware: true,
    });

    expect(selection.baselineAware).toBe(true);
    expect(selection.candidates.map((f) => f.path)).toContain('/a.ts');
  });
});
