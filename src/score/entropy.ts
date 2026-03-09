import type { FileMetrics, ProjectScore, ScoredFile, SignalScores } from '../model/metrics.js';
import type { Rule } from '../rules/base.js';
import { createFunctionLengthRule } from '../rules/function-length.js';
import { createNestingRule } from '../rules/nesting.js';
import { createTypeEscapeRule } from '../rules/type-escape.js';

export const ENTROPY_DEFAULTS = {
  depthCap: 6,
  functionLengthCap: 80,
  absoluteCap: 1.0,
  weights: {
    nesting: 0.4,
    functionLength: 0.35,
    typeEscape: 0.25,
  },
} as const;

const SIGNAL_RULES: Rule[] = [
  createNestingRule(ENTROPY_DEFAULTS.depthCap),
  createFunctionLengthRule(ENTROPY_DEFAULTS.functionLengthCap),
  createTypeEscapeRule(),
];

function scoreSignals(metrics: FileMetrics): SignalScores {
  const byId = new Map(SIGNAL_RULES.map((rule) => [rule.id, rule.apply(metrics)]));
  const nesting = byId.get('nesting') ?? 0;
  const functionLength = byId.get('functionLength') ?? 0;
  const typeEscape = byId.get('typeEscape') ?? 0;

  return { nesting, functionLength, typeEscape };
}

export function scoreFile(metrics: FileMetrics): ScoredFile {
  const signalScores = scoreSignals(metrics);
  const signalContributions = {
    nesting: signalScores.nesting * ENTROPY_DEFAULTS.weights.nesting,
    functionLength: signalScores.functionLength * ENTROPY_DEFAULTS.weights.functionLength,
    typeEscape: signalScores.typeEscape * ENTROPY_DEFAULTS.weights.typeEscape,
  };

  const entropy =
    signalContributions.nesting +
    signalContributions.functionLength +
    signalContributions.typeEscape;

  return {
    path: metrics.path,
    loc: metrics.loc,
    entropy,
    signalScores,
    signalContributions,
  };
}

export function scoreProject(scoredFiles: ScoredFile[]): ProjectScore {
  const totalLoc = scoredFiles.reduce((acc, file) => acc + Math.max(file.loc, 1), 0);
  const weightedEntropy = scoredFiles.reduce(
    (acc, file) => acc + file.entropy * Math.max(file.loc, 1),
    0,
  );

  return {
    entropy: totalLoc > 0 ? weightedEntropy / totalLoc : 0,
    fileCount: scoredFiles.length,
    totalLoc,
  };
}

export function exceedsAbsoluteCap(
  projectEntropy: number,
  cap: number = ENTROPY_DEFAULTS.absoluteCap,
): boolean {
  return projectEntropy > cap;
}
