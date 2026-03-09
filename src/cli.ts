#!/usr/bin/env node
import { Command } from 'commander';
import type { AiAdvice } from './advisor/phi3.js';
import { runPhi3Advisor } from './advisor/phi3.js';
import { analyzeFile } from './analyze/ast.js';
import { DEFAULT_BASELINE_PATH, readBaseline, writeBaseline } from './baseline/store.js';
import { discoverTypeScriptFiles } from './discovery/files.js';
import { buildJsonReport, formatJsonReport } from './report/json.js';
import { formatTextReport } from './report/text.js';
import { ENTROPY_DEFAULTS, exceedsAbsoluteCap, scoreFile, scoreProject } from './score/entropy.js';

const DRIFT_DEFAULT_BUDGET = 0.05;
const DEFAULT_AI_MODEL_PATH = 'models/Phi-3.5-mini-instruct-Q4_K_M.gguf';

async function computeScores(paths: string[]) {
  const files = await discoverTypeScriptFiles(paths);
  const metrics = files.map((filePath) => analyzeFile(filePath));
  const scoredFiles = metrics.map((fileMetrics) => scoreFile(fileMetrics));
  const projectScore = scoreProject(scoredFiles);
  return { scoredFiles, projectScore };
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('lintropy')
    .description('Entropy linter for TypeScript vibe-coding issues')
    .version('0.1.0');

  program
    .command('check')
    .description('Analyze TypeScript files and report entropy')
    .argument('[paths...]', 'Paths to analyze', ['src'])
    .option(
      '--max-entropy <value>',
      'Override the project entropy cap',
      `${ENTROPY_DEFAULTS.absoluteCap}`,
    )
    .option('--drift-budget <value>', 'Override drift budget', `${DRIFT_DEFAULT_BUDGET}`)
    .option('--baseline-file <path>', 'Override baseline file path', DEFAULT_BASELINE_PATH)
    .option('--no-baseline', 'Skip baseline drift checks')
    .option('--format <mode>', 'Output format: text|json', 'text')
    .option('--ai', 'Enable Phi-3 advisor for top offenders', false)
    .option('--model-path <path>', 'Path to GGUF model file', DEFAULT_AI_MODEL_PATH)
    .option('--max-ai-files <count>', 'Max files to run AI advisor against', '3')
    .option('--ai-timeout-ms <value>', 'Per-file AI timeout in milliseconds', '45000')
    .option('--ai-retries <count>', 'AI retries per file on parse/runtime failure', '1')
    .action(
      async (
        paths: string[],
        options: {
          maxEntropy: string;
          format: string;
          baseline: boolean;
          baselineFile: string;
          driftBudget: string;
          ai: boolean;
          modelPath: string;
          maxAiFiles: string;
          aiTimeoutMs: string;
          aiRetries: string;
        },
      ) => {
        const { scoredFiles, projectScore } = await computeScores(paths);

        const driftBudget = Number(options.driftBudget);
        if (Number.isNaN(driftBudget)) {
          console.error('Invalid --drift-budget value. Expected a number.');
          process.exit(2);
        }

        let baselineEntropy: number | undefined;
        let drift: number | undefined;
        let driftPass: boolean | undefined;
        if (options.baseline) {
          const baseline = await readBaseline(options.baselineFile);
          if (baseline) {
            baselineEntropy = baseline.project.entropy;
            drift = projectScore.entropy - baseline.project.entropy;
            driftPass = drift <= driftBudget;
          }
        }

        const entropyCap = Number(options.maxEntropy);
        if (Number.isNaN(entropyCap)) {
          console.error('Invalid --max-entropy value. Expected a number.');
          process.exit(2);
        }

        const capPass = !exceedsAbsoluteCap(projectScore.entropy, entropyCap);
        const policyPass = capPass && (driftPass ?? true);
        const maxAiFiles = Number(options.maxAiFiles);
        if (Number.isNaN(maxAiFiles) || maxAiFiles < 0) {
          console.error('Invalid --max-ai-files value. Expected a non-negative number.');
          process.exit(2);
        }
        const aiTimeoutMs = Number(options.aiTimeoutMs);
        if (Number.isNaN(aiTimeoutMs) || aiTimeoutMs <= 0) {
          console.error('Invalid --ai-timeout-ms value. Expected a positive number.');
          process.exit(2);
        }
        const aiRetries = Number(options.aiRetries);
        if (Number.isNaN(aiRetries) || aiRetries < 0) {
          console.error('Invalid --ai-retries value. Expected a non-negative number.');
          process.exit(2);
        }

        let aiByPath: Map<string, AiAdvice> | undefined;
        if (options.ai && maxAiFiles > 0 && scoredFiles.length > 0) {
          try {
            aiByPath = await runPhi3Advisor(scoredFiles, {
              modelPath: options.modelPath,
              maxFiles: maxAiFiles,
              timeoutMs: aiTimeoutMs,
              retries: aiRetries,
            });
          } catch (error: unknown) {
            console.error(
              `AI advisor disabled: ${
                error instanceof Error ? error.message : 'unknown advisor failure'
              }`,
            );
          }
        }

        if (options.format === 'json') {
          const jsonReport = buildJsonReport({
            project: projectScore,
            files: scoredFiles,
            capPass,
            baselineEntropy,
            drift,
            driftPass,
            aiByPath,
          });
          console.log(formatJsonReport(jsonReport));
        } else {
          console.log(
            formatTextReport(projectScore, scoredFiles, {
              cap: entropyCap,
              capPass,
              baselineEntropy,
              drift,
              driftBudget,
              driftPass,
              aiByPath,
            }),
          );
        }

        if (!policyPass) {
          process.exit(1);
        }
      },
    );

  program
    .command('baseline')
    .description('Generate or overwrite a project entropy baseline file')
    .argument('[paths...]', 'Paths to analyze', ['src'])
    .option('--baseline-file <path>', 'Override baseline file path', DEFAULT_BASELINE_PATH)
    .action(async (paths: string[], options: { baselineFile: string }) => {
      const { scoredFiles, projectScore } = await computeScores(paths);
      const baseline = await writeBaseline(projectScore, scoredFiles, options.baselineFile);
      console.log(
        `Baseline written to ${options.baselineFile} at ${baseline.recordedAt} (entropy ${baseline.project.entropy.toFixed(3)}).`,
      );
    });

  program
    .command('diff')
    .description('Compare current entropy against the saved baseline')
    .argument('[paths...]', 'Paths to analyze', ['src'])
    .option('--baseline-file <path>', 'Override baseline file path', DEFAULT_BASELINE_PATH)
    .option('--format <mode>', 'Output format: text|json', 'text')
    .action(
      async (
        paths: string[],
        options: {
          baselineFile: string;
          format: string;
        },
      ) => {
        const baseline = await readBaseline(options.baselineFile);
        if (!baseline) {
          console.error(
            `No baseline found at ${options.baselineFile}. Run \`lintropy baseline\` first.`,
          );
          process.exit(2);
        }

        const { scoredFiles, projectScore } = await computeScores(paths);
        const drift = projectScore.entropy - baseline.project.entropy;
        const driftPass = drift <= DRIFT_DEFAULT_BUDGET;
        const capPass = !exceedsAbsoluteCap(projectScore.entropy, ENTROPY_DEFAULTS.absoluteCap);

        if (options.format === 'json') {
          const jsonReport = buildJsonReport({
            project: projectScore,
            files: scoredFiles,
            capPass,
            baselineEntropy: baseline.project.entropy,
            drift,
            driftPass,
            aiByPath: undefined,
          });
          console.log(formatJsonReport(jsonReport));
        } else {
          console.log(
            formatTextReport(projectScore, scoredFiles, {
              cap: ENTROPY_DEFAULTS.absoluteCap,
              capPass,
              baselineEntropy: baseline.project.entropy,
              drift,
              driftBudget: DRIFT_DEFAULT_BUDGET,
              driftPass,
              aiByPath: undefined,
            }),
          );
        }
      },
    );

  if (process.argv.length <= 2) {
    program.help();
  } else {
    await program.parseAsync(process.argv);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
