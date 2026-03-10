#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { findModel } from './advisor/config.js';
import { runOllamaAdvisor } from './advisor/ollama.js';
import type { AiAdvice, AiProgressInfo } from './advisor/phi3-shared.js';
import type { AiSelection } from './advisor/selection.js';
import { selectAiCandidates, selectAiOutliers } from './advisor/selection.js';
import { analyzeFile } from './analyze/ast.js';
import { DEFAULT_BASELINE_PATH, readBaseline, writeBaseline } from './baseline/store.js';
import { discoverTypeScriptFiles } from './discovery/files.js';
import { applyFixes } from './fix/applier.js';
import { buildJsonReport, formatJsonReport } from './report/json.js';
import { formatTextReport } from './report/text.js';
import { ENTROPY_DEFAULTS, exceedsAbsoluteCap, scoreFile, scoreProject } from './score/entropy.js';

const DRIFT_DEFAULT_BUDGET = 0.05;

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BAR_WIDTH = 16;

function formatEta(ms: number): string {
  if (ms < 1000) return '< 1s';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `~${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `~${min}m ${s}s` : `~${min}m`;
}

function createProgressReporter(): {
  onProgress: (info: AiProgressInfo) => void;
  onComplete: () => void;
} {
  const isTTY = process.stderr.isTTY === true;
  let frame = 0;
  let lastInfo: AiProgressInfo | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const render = () => {
    if (!lastInfo) return;
    const { current, total, filePath, etaMs } = lastInfo;
    const rel = path.relative(process.cwd(), filePath) || filePath;
    const truncated = rel.length > 36 ? `...${rel.slice(-33)}` : rel;
    const filled = Math.round((current / total) * BAR_WIDTH);
    const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
    const eta = etaMs !== undefined ? ` · ${formatEta(etaMs)} left` : '';
    const spin = isTTY ? SPINNER[frame % SPINNER.length] : '•';

    const line = `${spin} [${bar}] ${current}/${total} ${truncated}${eta}`;
    if (isTTY) {
      process.stderr.write(`\r${line}   `);
    } else {
      process.stderr.write(`${line}\n`);
    }
  };

  return {
    onProgress: (info) => {
      lastInfo = info;
      if (isTTY && !interval) {
        interval = setInterval(() => {
          frame += 1;
          render();
        }, 80);
      }
      render();
    },
    onComplete: () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (isTTY && lastInfo) {
        process.stderr.write(`\r${' '.repeat(100)}\r`);
      }
      lastInfo = null;
    },
  };
}

async function computeScores(paths: string[]) {
  const files = await discoverTypeScriptFiles(paths);
  const metrics = files.map((filePath) => analyzeFile(filePath));
  const scoredFiles = metrics.map((fileMetrics) => scoreFile(fileMetrics));
  const projectScore = scoreProject(scoredFiles);
  const metricsByPath = new Map(metrics.map((m) => [m.path, m]));
  return { scoredFiles, projectScore, metricsByPath };
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
    .option('--ai', 'Enable AI advisor for top offenders (requires Ollama)', false)
    .option('--fix', 'Apply AI-generated fixes to files (requires --ai)', false)
    .option('--fix-dry-run', 'Show what would be fixed without writing (requires --ai)', false)
    .option('--ai-threshold <value>', 'Legacy: run AI on files with entropy >= threshold', '0.35')
    .option(
      '--ai-outlier-k <value>',
      'Outlier mode: select files with entropy > mean + k*stdDev',
      '1.5',
    )
    .option('--ai-baseline-aware', 'Use baseline deltas for outlier selection when baseline exists')
    .option('--ai-max-files <N>', 'Cap number of files sent to AI', '10')
    .option('--ai-concurrency <N>', 'Max concurrent AI requests (Ollama only, default 1)', '1')
    .option('--ai-use-threshold', 'Use legacy threshold mode instead of outlier mode')
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
          fix: boolean;
          fixDryRun: boolean;
          aiThreshold: string;
          aiOutlierK: string;
          aiBaselineAware: boolean;
          aiMaxFiles: string;
          aiConcurrency: string;
          aiUseThreshold: boolean;
          aiTimeoutMs: string;
          aiRetries: string;
        },
      ) => {
        const { scoredFiles, projectScore, metricsByPath } = await computeScores(paths);

        const driftBudget = Number(options.driftBudget);
        if (Number.isNaN(driftBudget)) {
          console.error('Invalid --drift-budget value. Expected a number.');
          process.exit(2);
        }

        let baselineEntropy: number | undefined;
        let baseline: Awaited<ReturnType<typeof readBaseline>> = null;
        let drift: number | undefined;
        let driftPass: boolean | undefined;
        if (options.baseline) {
          baseline = await readBaseline(options.baselineFile);
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
        const aiTimeoutMs = Number(options.aiTimeoutMs);
        if (Number.isNaN(aiTimeoutMs) || aiTimeoutMs <= 0) {
          console.error('Invalid --ai-timeout-ms value. Expected a positive number.');
          process.exit(2);
        }
        const aiThreshold = Number(options.aiThreshold);
        if (Number.isNaN(aiThreshold) || aiThreshold < 0) {
          console.error('Invalid --ai-threshold value. Expected a non-negative number.');
          process.exit(2);
        }
        const aiRetries = Number(options.aiRetries);
        if (Number.isNaN(aiRetries) || aiRetries < 0) {
          console.error('Invalid --ai-retries value. Expected a non-negative number.');
          process.exit(2);
        }
        const aiOutlierK = Number(options.aiOutlierK);
        if (Number.isNaN(aiOutlierK) || aiOutlierK < 0) {
          console.error('Invalid --ai-outlier-k value. Expected a non-negative number.');
          process.exit(2);
        }
        const aiMaxFiles = Number(options.aiMaxFiles);
        if (Number.isNaN(aiMaxFiles) || aiMaxFiles < 1) {
          console.error('Invalid --ai-max-files value. Expected a positive integer.');
          process.exit(2);
        }
        const aiConcurrency = Number(options.aiConcurrency);
        if (Number.isNaN(aiConcurrency) || aiConcurrency < 1) {
          console.error('Invalid --ai-concurrency value. Expected a positive integer.');
          process.exit(2);
        }

        const fixMode = options.fix || options.fixDryRun;
        if (fixMode && !options.ai) {
          console.error('--fix and --fix-dry-run require --ai. Enable AI mode first.');
          process.exit(2);
        }

        let aiByPath: Map<string, AiAdvice> | undefined;
        let aiSelection: AiSelection | undefined;
        if (options.ai && scoredFiles.length > 0) {
          aiSelection = options.aiUseThreshold
            ? selectAiCandidates(scoredFiles, aiThreshold)
            : selectAiOutliers(scoredFiles, {
                outlierK: aiOutlierK,
                baseline,
                baselineAware: options.aiBaselineAware && !!baseline,
              });
          const candidates = aiSelection.candidates.slice(0, aiMaxFiles);
          const progress = createProgressReporter();
          try {
            const modelName = await findModel();
            console.error(`🤖 Using Ollama model: ${modelName}`);
            const n = candidates.length;
            if (n > 0) console.error(`AI analyzing ${n} file(s)...`);
            aiByPath = await runOllamaAdvisor(candidates, {
              modelName,
              maxFiles: candidates.length,
              timeoutMs: aiTimeoutMs,
              retries: aiRetries,
              concurrency: aiConcurrency,
              fixMode,
              metricsByPath,
              onProgress: progress.onProgress,
            });
            if (candidates.length > 0) progress.onComplete();
          } catch (error: unknown) {
            progress.onComplete();
            console.error(
              `AI advisor disabled: ${
                error instanceof Error ? error.message : 'unknown advisor failure'
              }`,
            );
          }
        }

        if (fixMode && aiByPath && aiByPath.size > 0) {
          const results = await applyFixes(aiByPath, options.fixDryRun);
          const applied = results.filter((r) => r.applied);
          const withFix = results.filter((r) => {
            const advice = aiByPath.get(r.path);
            return advice?.fixedCode;
          });
          if (options.fixDryRun) {
            console.error(
              `\nFix dry run: ${withFix.length} file(s) with AI fixes, 0 applied (dry run)`,
            );
          } else if (applied.length > 0) {
            console.error(`\nApplied fixes to ${applied.length} file(s):`);
            for (const r of applied) {
              console.error(`  - ${path.relative(process.cwd(), r.path) || r.path}`);
            }
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
            aiSelection,
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
              aiSelection,
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
            aiSelection: undefined,
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
              aiSelection: undefined,
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
