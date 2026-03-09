import type { AiAdvice } from '../advisor/phi3.js';
import type { AiSelection } from '../advisor/selection.js';
import type { ProjectScore, ScoredFile } from '../model/metrics.js';

type GateState = 'pass' | 'fail' | 'skipped';

interface JsonFileReport {
  path: string;
  loc: number;
  entropy: number;
  signalScores: {
    nesting: number;
    functionLength: number;
    typeEscape: number;
  };
  ai: {
    tags: string[];
    severity: number;
    explanation: string;
    suggestion: string;
    model: string;
  } | null;
}

interface JsonReport {
  project: {
    entropy: number;
    fileCount: number;
    totalLoc: number;
    baselineEntropy: number | null;
    drift: number | null;
  };
  gates: {
    cap: GateState;
    drift: GateState;
  };
  ai: {
    reviewedFiles: number;
    threshold: number | null;
    eligibleFiles: number;
    totalFiles: number;
    fallbackUsed: boolean;
  };
  files: JsonFileReport[];
}

export function buildJsonReport(params: {
  project: ProjectScore;
  files: ScoredFile[];
  capPass: boolean;
  baselineEntropy: number | undefined;
  drift: number | undefined;
  driftPass: boolean | undefined;
  aiByPath: Map<string, AiAdvice> | undefined;
  aiSelection: AiSelection | undefined;
}): JsonReport {
  const sortedFiles = [...params.files].sort((a, b) => b.entropy - a.entropy);
  return {
    project: {
      entropy: params.project.entropy,
      fileCount: params.project.fileCount,
      totalLoc: params.project.totalLoc,
      baselineEntropy: params.baselineEntropy ?? null,
      drift: params.drift ?? null,
    },
    gates: {
      cap: params.capPass ? 'pass' : 'fail',
      drift: params.driftPass === undefined ? 'skipped' : params.driftPass ? 'pass' : 'fail',
    },
    ai: {
      reviewedFiles: params.aiByPath?.size ?? 0,
      threshold: params.aiSelection?.threshold ?? null,
      eligibleFiles: params.aiSelection?.eligibleFiles ?? 0,
      totalFiles: params.aiSelection?.totalFiles ?? params.files.length,
      fallbackUsed: params.aiSelection?.fallbackUsed ?? false,
    },
    files: sortedFiles.map((file) => ({
      ai: params.aiByPath?.get(file.path) ?? null,
      path: file.path,
      loc: file.loc,
      entropy: file.entropy,
      signalScores: file.signalScores,
    })),
  };
}

export function formatJsonReport(report: JsonReport): string {
  return JSON.stringify(report, null, 2);
}
