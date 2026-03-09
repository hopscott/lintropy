import type { FileMetrics } from '../model/metrics.js';
import type { Rule } from './base.js';

export function createTypeEscapeRule(): Rule {
  return {
    id: 'typeEscape',
    description: 'Normalized type-escape density',
    apply(file: FileMetrics): number {
      const safeLoc = Math.max(file.loc, 1);
      return Math.max(0, Math.min(1, file.typeEscapeCount / safeLoc));
    },
  };
}
