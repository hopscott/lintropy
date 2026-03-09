import { describe, expect, it } from 'vitest';
import {
  ENTROPY_DEFAULTS,
  exceedsAbsoluteCap,
  scoreFile,
  scoreProject,
} from '../../src/score/entropy.js';

describe('entropy scoring', () => {
  it('scores a file and computes weighted project entropy', () => {
    const fileA = scoreFile({
      path: '/repo/a.ts',
      loc: 100,
      functionCount: 2,
      functionLengths: [20, 40],
      maxNestingDepth: 3,
      controlFlowCount: 0,
      typeEscapeCount: 1,
    });
    const fileB = scoreFile({
      path: '/repo/b.ts',
      loc: 20,
      functionCount: 1,
      functionLengths: [10],
      maxNestingDepth: 1,
      controlFlowCount: 0,
      typeEscapeCount: 0,
    });

    const project = scoreProject([fileA, fileB]);
    expect(project.fileCount).toBe(2);
    expect(project.totalLoc).toBe(120);
    expect(project.entropy).toBeGreaterThan(0);
    expect(fileA.entropy).toBeGreaterThan(fileB.entropy);
  });

  it('checks absolute cap boundaries', () => {
    expect(exceedsAbsoluteCap(ENTROPY_DEFAULTS.absoluteCap, ENTROPY_DEFAULTS.absoluteCap)).toBe(
      false,
    );
    expect(
      exceedsAbsoluteCap(ENTROPY_DEFAULTS.absoluteCap + 0.001, ENTROPY_DEFAULTS.absoluteCap),
    ).toBe(true);
  });
});
