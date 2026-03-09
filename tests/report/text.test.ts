import { describe, expect, it } from 'vitest';
import { formatTextReport } from '../../src/report/text.js';

describe('formatTextReport', () => {
  it('renders baseline, hints, and AI advisory details', () => {
    const report = formatTextReport(
      { entropy: 0.8, fileCount: 1, totalLoc: 50 },
      [
        {
          path: '/repo/src/problem.ts',
          loc: 50,
          entropy: 1.2,
          signalScores: {
            nesting: 0.9,
            functionLength: 0.8,
            typeEscape: 0.2,
          },
          signalContributions: {
            nesting: 0.36,
            functionLength: 0.28,
            typeEscape: 0.05,
          },
        },
      ],
      {
        cap: 1.0,
        capPass: false,
        baselineEntropy: 0.7,
        drift: 0.1,
        driftBudget: 0.05,
        driftPass: false,
        aiByPath: new Map([
          [
            '/repo/src/problem.ts',
            {
              tags: ['god_function', 'deep_nesting'],
              severity: 0.85,
              explanation: 'The file mixes many control paths.',
              suggestion: 'Split the handler into focused functions.',
              model: 'phi-3.5-mini-instruct',
            },
          ],
        ]),
      },
    );

    expect(report).toContain('Project entropy: 0.800');
    expect(report).toContain('Baseline: 0.700');
    expect(report).toContain('AI: [god_function, deep_nesting]');
    expect(report).toContain('AI Fix: Split the handler into focused functions.');
  });
});
