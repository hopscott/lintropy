import type { FileMetrics } from '../model/metrics.js';
import type { Rule } from './base.js';

export function createNestingRule(depthCap: number): Rule {
  return {
    id: 'nesting',
    description: 'Normalized max nesting depth',
    apply(file: FileMetrics): number {
      return Math.max(0, Math.min(1, file.maxNestingDepth / depthCap));
    },
  };
}
