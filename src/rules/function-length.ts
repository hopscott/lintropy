import type { FileMetrics } from '../model/metrics.js';
import type { Rule } from './base.js';

function p90(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.9) - 1;
  const safeIndex = Math.max(0, Math.min(sorted.length - 1, index));
  return sorted[safeIndex] ?? 0;
}

export function createFunctionLengthRule(lengthCap: number): Rule {
  return {
    id: 'functionLength',
    description: 'Normalized p90 function length',
    apply(file: FileMetrics): number {
      return Math.max(0, Math.min(1, p90(file.functionLengths) / lengthCap));
    },
  };
}
