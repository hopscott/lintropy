import { promises as fs } from 'node:fs';
import path from 'node:path';

const TS_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFromDirectory(dirPath: string, output: string[]): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await collectFromDirectory(fullPath, output);
      }
      continue;
    }

    if (entry.isFile() && TS_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(path.resolve(fullPath));
    }
  }
}

export async function discoverTypeScriptFiles(paths: string[]): Promise<string[]> {
  const candidates = paths.length > 0 ? paths : ['src'];
  const files: string[] = [];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!(await pathExists(resolved))) {
      continue;
    }

    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      await collectFromDirectory(resolved, files);
      continue;
    }

    if (stat.isFile() && TS_EXTENSIONS.has(path.extname(resolved))) {
      files.push(resolved);
    }
  }

  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}
