export interface FileMetrics {
  path: string;
  loc: number;
  functionCount: number;
  functionLengths: number[];
  maxNestingDepth: number;
  controlFlowCount: number;
  typeEscapeCount: number;
}

export interface SignalScores {
  nesting: number;
  functionLength: number;
  typeEscape: number;
}

export interface SignalContributions {
  nesting: number;
  functionLength: number;
  typeEscape: number;
}

export interface ScoredFile {
  path: string;
  loc: number;
  entropy: number;
  signalScores: SignalScores;
  signalContributions: SignalContributions;
}

export interface ProjectScore {
  entropy: number;
  fileCount: number;
  totalLoc: number;
}
