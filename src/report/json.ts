import type { AiAdvice } from '../advisor/phi3-shared.js';
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
    primaryIssue?: string;
    blameLines?: (number | string)[];
    fixCode?: string;
    entropyDelta?: string;
    confidence?: number;
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
    files: sortedFiles.map((file) => {
      const advice = params.aiByPath?.get(file.path);
      const ai = advice
        ? {
            tags: advice.tags,
            severity: advice.severity,
            explanation: advice.explanation,
            suggestion: advice.suggestion,
            model: advice.model,
            ...(advice.primaryIssue && { primaryIssue: advice.primaryIssue }),
            ...(advice.blameLines?.length && { blameLines: advice.blameLines }),
            ...(advice.fixCode && { fixCode: advice.fixCode }),
            ...(advice.entropyDelta && { entropyDelta: advice.entropyDelta }),
            ...(advice.confidence != null && { confidence: advice.confidence }),
          }
        : null;
      return {
        ai,
        path: file.path,
        loc: file.loc,
        entropy: file.entropy,
        signalScores: file.signalScores,
      };
    }),
  };
}

export function formatJsonReport(report: JsonReport): string {
  return JSON.stringify(report, null, 2);
}
