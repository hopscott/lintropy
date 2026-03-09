import type { FileMetrics } from '../model/metrics.js';

export interface Rule {
  id: string;
  description: string;
  apply(file: FileMetrics): number;
}
