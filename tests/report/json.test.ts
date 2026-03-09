import { describe, expect, it } from 'vitest';
import { buildJsonReport } from '../../src/report/json.js';

describe('buildJsonReport', () => {
  it('produces stable schema for project and files', () => {
    const report = buildJsonReport({
      project: {
        entropy: 0.82,
        fileCount: 2,
        totalLoc: 110,
      },
      files: [
        {
          path: '/repo/src/a.ts',
          loc: 80,
          entropy: 1.1,
          signalScores: {
            nesting: 0.7,
            functionLength: 0.9,
            typeEscape: 0.2,
          },
          signalContributions: {
            nesting: 0.28,
            functionLength: 0.315,
            typeEscape: 0.05,
          },
        },
        {
          path: '/repo/src/b.ts',
          loc: 30,
          entropy: 0.1,
          signalScores: {
            nesting: 0.1,
            functionLength: 0.2,
            typeEscape: 0,
          },
          signalContributions: {
            nesting: 0.04,
            functionLength: 0.07,
            typeEscape: 0,
          },
        },
      ],
      capPass: false,
      baselineEntropy: undefined,
      drift: undefined,
      driftPass: undefined,
      aiByPath: undefined,
    });

    expect(report).toMatchInlineSnapshot(`
      {
        "files": [
          {
            "ai": null,
            "entropy": 1.1,
            "loc": 80,
            "path": "/repo/src/a.ts",
            "signalScores": {
              "functionLength": 0.9,
              "nesting": 0.7,
              "typeEscape": 0.2,
            },
          },
          {
            "ai": null,
            "entropy": 0.1,
            "loc": 30,
            "path": "/repo/src/b.ts",
            "signalScores": {
              "functionLength": 0.2,
              "nesting": 0.1,
              "typeEscape": 0,
            },
          },
        ],
        "gates": {
          "cap": "fail",
          "drift": "skipped",
        },
        "project": {
          "baselineEntropy": null,
          "drift": null,
          "entropy": 0.82,
          "fileCount": 2,
          "totalLoc": 110,
        },
      }
    `);
  });
});
