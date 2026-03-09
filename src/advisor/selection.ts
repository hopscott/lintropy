import type { ScoredFile } from '../model/metrics.js';

export interface AiSelection {
  candidates: ScoredFile[];
  threshold: number;
  totalFiles: number;
  eligibleFiles: number;
  fallbackUsed: boolean;
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
    };
  }

  return {
    candidates: filtered,
    threshold,
    totalFiles: sorted.length,
    eligibleFiles: filtered.length,
    fallbackUsed: false,
  };
}
