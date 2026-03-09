import { describe, expect, it } from 'vitest';
import { selectAiCandidates } from '../../src/advisor/selection.js';

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
