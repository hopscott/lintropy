import type { BaselineData } from '../baseline/store.js';
import type { ScoredFile } from '../model/metrics.js';

export interface AiSelection {
  candidates: ScoredFile[];
  threshold: number;
  totalFiles: number;
  eligibleFiles: number;
  fallbackUsed: boolean;
  /** Std dev multiplier when using outlier mode */
  outlierK?: number;
  /** Whether baseline-relative selection was used */
  baselineAware?: boolean;
  /** Selection mode used */
  mode?: 'threshold' | 'outlier';
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

interface SelectOutliersOptions {
  outlierK: number;
  baseline?: BaselineData | null;
  baselineAware?: boolean;
}

/**
 * Select files that are statistical outliers (entropy > mean + k * stdDev).
 * When baseline exists and baselineAware is true, uses delta outliers instead.
 */
export function selectAiOutliers(
  scoredFiles: ScoredFile[],
  options: SelectOutliersOptions,
): AiSelection {
  const { outlierK, baseline, baselineAware } = options;
  const sorted = [...scoredFiles].sort((a, b) => b.entropy - a.entropy);
  const topFile = sorted[0];

  if (sorted.length === 0) {
    return {
      candidates: [],
      threshold: 0,
      totalFiles: 0,
      eligibleFiles: 0,
      fallbackUsed: false,
      outlierK,
      baselineAware: baselineAware ?? false,
      mode: 'outlier',
    };
  }

  const baselineByPath =
    baseline?.files != null ? new Map(baseline.files.map((f) => [f.path, f.entropy])) : null;

  let cutoff: number;
  let mean: number;
  let sd: number;

  if (baselineAware && baselineByPath && baselineByPath.size > 0) {
    const deltaByPath = new Map(
      sorted.map((f) => {
        const base = baselineByPath.get(f.path) ?? 0;
        const delta = f.entropy - base;
        return [f.path, delta] as const;
      }),
    );
    const deltas = [...deltaByPath.values()].filter((d) => d > 0);
    if (deltas.length === 0) {
      return {
        candidates: topFile ? [topFile] : [],
        threshold: 0,
        totalFiles: sorted.length,
        eligibleFiles: 0,
        fallbackUsed: true,
        outlierK,
        baselineAware: true,
        mode: 'outlier',
      };
    }
    mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    sd = stdDev(deltas);
    cutoff = mean + outlierK * sd;
    const filtered = sorted.filter((f) => (deltaByPath.get(f.path) ?? 0) > cutoff);
    if (filtered.length === 0 && topFile) {
      const maxDelta = Math.max(...deltaByPath.values());
      const fallback =
        maxDelta > 0 ? sorted.find((f) => (deltaByPath.get(f.path) ?? 0) === maxDelta) : topFile;
      return {
        candidates: fallback ? [fallback] : [topFile],
        threshold: cutoff,
        totalFiles: sorted.length,
        eligibleFiles: 0,
        fallbackUsed: true,
        outlierK,
        baselineAware: true,
        mode: 'outlier',
      };
    }
    return {
      candidates: filtered.length > 0 ? filtered : topFile ? [topFile] : [],
      threshold: cutoff,
      totalFiles: sorted.length,
      eligibleFiles: filtered.length,
      fallbackUsed: filtered.length === 0 && !!topFile,
      outlierK,
      baselineAware: true,
      mode: 'outlier',
    };
  }

  const values = sorted.map((f) => f.entropy);
  mean = values.reduce((a, b) => a + b, 0) / values.length;
  sd = stdDev(values);
  cutoff = mean + outlierK * sd;

  const filtered = sorted.filter((f) => f.entropy > cutoff);

  if (topFile && filtered.length === 0) {
    return {
      candidates: [topFile],
      threshold: cutoff,
      totalFiles: sorted.length,
      eligibleFiles: 0,
      fallbackUsed: true,
      outlierK,
      baselineAware: false,
      mode: 'outlier',
    };
  }

  return {
    candidates: filtered,
    threshold: cutoff,
    totalFiles: sorted.length,
    eligibleFiles: filtered.length,
    fallbackUsed: false,
    outlierK,
    baselineAware: false,
    mode: 'outlier',
  };
}

export function selectAiCandidates(scoredFiles: ScoredFile[], threshold: number): AiSelection {
  const sorted = [...scoredFiles].sort((a, b) => b.entropy - a.entropy);
  const filtered = sorted.filter((file) => file.entropy >= threshold);
  const topFile = sorted[0];

  if (topFile && filtered.length === 0) {
    return {
      candidates: [topFile],
      threshold,
      totalFiles: sorted.length,
      eligibleFiles: 0,
      fallbackUsed: true,
      mode: 'threshold',
    };
  }

  return {
    candidates: filtered,
    threshold,
    totalFiles: sorted.length,
    eligibleFiles: filtered.length,
    fallbackUsed: false,
    mode: 'threshold',
  };
}
