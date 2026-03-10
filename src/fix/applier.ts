import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AiAdvice } from '../advisor/phi3-shared.js';

interface ApplyResult {
  path: string;
  applied: boolean;
  reason?: string;
}

function relativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}

/**
 * Apply AI-generated fixes to files. When dryRun is true, prints what would be
 * applied without writing.
 */
export async function applyFixes(
  aiByPath: Map<string, AiAdvice>,
  dryRun: boolean,
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  for (const [filePath, advice] of aiByPath) {
    if (!advice.fixedCode) {
      results.push({ path: filePath, applied: false, reason: 'No fixedCode in AI output' });
      continue;
    }

    if (dryRun) {
      const original = await fs.readFile(filePath, 'utf-8');
      const diff = computeSimpleDiff(original, advice.fixedCode);
      if (diff) {
        console.error(`\n--- ${relativePath(filePath)} (dry run)`);
        console.error(diff);
      }
      results.push({ path: filePath, applied: false, reason: 'dry run' });
      continue;
    }

    try {
      await fs.writeFile(filePath, advice.fixedCode, 'utf-8');
      results.push({ path: filePath, applied: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      results.push({ path: filePath, applied: false, reason: msg });
    }
  }

  return results;
}

/** Produce a simple unified-diff style output for display. */
function computeSimpleDiff(original: string, fixed: string): string {
  if (original === fixed) {
    return '(no changes)';
  }
  const origLines = original.split('\n');
  const fixedLines = fixed.split('\n');
  const lines: string[] = [];
  const maxLen = Math.max(origLines.length, fixedLines.length);

  for (let i = 0; i < maxLen; i += 1) {
    const o = origLines[i];
    const f = fixedLines[i];
    if (o === undefined) {
      lines.push(`+ ${f ?? ''}`);
    } else if (f === undefined) {
      lines.push(`- ${o}`);
    } else if (o !== f) {
      lines.push(`- ${o}`);
      lines.push(`+ ${f}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '(no changes)';
}
