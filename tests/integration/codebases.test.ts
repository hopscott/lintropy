import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeFile } from '../../src/analyze/ast.js';
import { discoverTypeScriptFiles } from '../../src/discovery/files.js';
import { scoreFile, scoreProject } from '../../src/score/entropy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codebasesRoot = path.resolve(__dirname, '../codebases');

async function scoreFixture(fixtureName: string) {
  const fixturePath = path.join(codebasesRoot, fixtureName, 'src');
  const files = await discoverTypeScriptFiles([fixturePath]);
  const scoredFiles = files.map((filePath) => scoreFile(analyzeFile(filePath)));
  const project = scoreProject(scoredFiles);
  return { scoredFiles, project };
}

describe('codebase fixtures regression', () => {
  it('scores unhealthy fixtures higher than healthy baseline', async () => {
    const healthy = await scoreFixture('healthy');
    const deepNesting = await scoreFixture('deep-nesting');
    const typeEscape = await scoreFixture('type-escape');
    const godFunction = await scoreFixture('god-function');

    expect(deepNesting.project.entropy).toBeGreaterThan(healthy.project.entropy);
    expect(typeEscape.project.entropy).toBeGreaterThan(healthy.project.entropy);
    expect(godFunction.project.entropy).toBeGreaterThan(healthy.project.entropy);
  });

  it('captures issue-specific dominant signals from fixture codebases', async () => {
    const deepNesting = await scoreFixture('deep-nesting');
    const typeEscape = await scoreFixture('type-escape');
    const godFunction = await scoreFixture('god-function');
    const healthy = await scoreFixture('healthy');

    expect(deepNesting.scoredFiles[0]?.signalScores.nesting ?? 0).toBeGreaterThan(0.6);
    expect(typeEscape.scoredFiles[0]?.signalScores.typeEscape ?? 0).toBeGreaterThan(0.1);
    expect(godFunction.scoredFiles[0]?.signalScores.functionLength ?? 0).toBeGreaterThan(0.5);
    expect(healthy.scoredFiles[0]?.entropy ?? 1).toBeLessThan(0.2);
  });
});
