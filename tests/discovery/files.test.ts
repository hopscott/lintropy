import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverTypeScriptFiles } from '../../src/discovery/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const discoveryFixtureRoot = path.resolve(__dirname, '../codebases/discovery');

describe('discoverTypeScriptFiles', () => {
  it('finds ts/tsx files and skips ignored directories', async () => {
    const files = await discoverTypeScriptFiles([discoveryFixtureRoot]);
    const normalized = files.map((filePath) =>
      path.relative(discoveryFixtureRoot, filePath).replaceAll('\\', '/'),
    );

    expect(normalized).toContain('src/app.ts');
    expect(normalized).toContain('src/view.tsx');
    expect(normalized.some((file) => file.includes('node_modules'))).toBe(false);
    expect(normalized.some((file) => file.includes('dist/'))).toBe(false);
  });

  it('de-duplicates paths when overlapping inputs are provided', async () => {
    const files = await discoverTypeScriptFiles([
      discoveryFixtureRoot,
      path.join(discoveryFixtureRoot, 'src', 'app.ts'),
    ]);

    const appMatches = files.filter((file) => file.endsWith(path.join('src', 'app.ts')));
    expect(appMatches).toHaveLength(1);
  });
});
