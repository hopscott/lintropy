import path from 'node:path';
import type { AiAdvice } from '../advisor/phi3-shared.js';
import type { AiSelection } from '../advisor/selection.js';
import type { ProjectScore, ScoredFile, SignalContributions } from '../model/metrics.js';

const HINTS: Record<keyof SignalContributions, string> = {
  nesting: 'Flatten branch depth by extracting decision stages.',
  functionLength: 'Split long control path into named subroutines.',
  typeEscape: 'Replace `any` and unsafe casts at module boundaries first.',
};

function dominantSignals(signalContributions: SignalContributions): (keyof SignalContributions)[] {
  const sorted = Object.entries(signalContributions).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[1] ?? 0;
  return sorted
    .filter(([, score]) => score >= top * 0.75 && score > 0)
    .map(([name]) => name as keyof SignalContributions);
}

function relativeFilePath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}

export function formatTextReport(
  project: ProjectScore,
  files: ScoredFile[],
  options: {
    cap: number;
    capPass: boolean;
    limit?: number;
    baselineEntropy: number | undefined;
    drift: number | undefined;
    driftBudget: number | undefined;
    driftPass: boolean | undefined;
    aiByPath: Map<string, AiAdvice> | undefined;
    aiSelection: AiSelection | undefined;
  },
): string {
  const limit = options.limit ?? 5;
  const sorted = [...files].sort((a, b) => b.entropy - a.entropy);
  const topFiles = sorted.slice(0, limit);

  const lines: string[] = [];
  lines.push(
    `Project entropy: ${project.entropy.toFixed(3)} (cap ${options.cap.toFixed(2)}) [${
      options.capPass ? 'PASS' : 'FAIL'
    }]`,
  );
  if (typeof options.baselineEntropy === 'number') {
    const driftLabel =
      options.driftPass === undefined ? 'SKIPPED' : options.driftPass ? 'PASS' : 'FAIL';
    const driftValue = options.drift ?? 0;
    const budget = options.driftBudget ?? 0;
    lines.push(
      `Baseline: ${options.baselineEntropy.toFixed(3)} | Drift: ${driftValue.toFixed(3)} (budget ${budget.toFixed(3)}) [${driftLabel}]`,
    );
  } else {
    lines.push('Baseline: not found (drift gate skipped)');
  }
  lines.push(`Files analyzed: ${project.fileCount}, LOC: ${project.totalLoc}`);
  if (options.aiSelection) {
    const selection = options.aiSelection;
    const modeLabel =
      selection.mode === 'outlier'
        ? `outlier k=${selection.outlierK ?? 1.5}${selection.baselineAware ? ', baseline-aware' : ''}`
        : 'threshold';
    lines.push(
      `AI review: ${options.aiByPath?.size ?? 0} reviewed (${modeLabel}, cutoff ${selection.threshold.toFixed(2)}, eligible ${selection.eligibleFiles}/${selection.totalFiles}${selection.fallbackUsed ? ', fallback top-file used' : ''})`,
    );
  }
  lines.push('');

  if (topFiles.length === 0) {
    lines.push('No TypeScript files were found to analyze.');
    return lines.join('\n');
  }

  lines.push(`Top ${topFiles.length} files by entropy:`);
  topFiles.forEach((file, index) => {
    const dominant = dominantSignals(file.signalContributions);
    const signalList = dominant.join(', ') || 'none';
    const hint = dominant[0] ? HINTS[dominant[0]] : 'No dominant signal identified.';

    lines.push(
      `${index + 1}. ${relativeFilePath(file.path)}  E=${file.entropy.toFixed(3)}  LOC=${file.loc}  [${signalList}]`,
    );
    lines.push(`   Hint: ${hint}`);
    const ai = options.aiByPath?.get(file.path);
    if (ai) {
      const tagList = ai.tags.join(', ') || 'none';
      lines.push(`   AI: [${tagList}] ${ai.explanation}`);
      lines.push(`   AI Fix: ${ai.suggestion}`);
    }
  });

  return lines.join('\n');
}
