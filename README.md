# lintropy

`lintropy` is a TypeScript-focused entropy linter for vibe-coding issues.

## Quality foundation

This repo uses:
- Biome for formatting and fast linting
- ESLint for TypeScript safety rules
- TypeScript compiler for strict type checking
- Knip for dead files/exports/dependencies checks
- Husky pre-commit hooks for local quality enforcement

## Scripts

- `bun run lint`: Biome + ESLint
- `bun run format`: format with Biome
- `bun run typecheck`: `tsc --noEmit`
- `bun run knip`: dead code/dependencies checks
- `bun run check`: lint + typecheck + knip
- `bun run test`: run unit/snapshot tests
- `bun run build`: compile CLI to `dist/`
- `bun run dev -- check [paths...]`: run CLI from source

## Local developer guardrails

- Install deps with `bun install` (this runs `prepare` and installs Husky hooks).
- Pre-commit hook runs:
  - `bun run check`
  - `bun run test`
- If a commit fails, run `bun run format` and re-run checks before committing again.

## CLI usage

- Install once globally: `npm i -g lintropy`
- Run without install: `npx lintropy check src` (or `bunx lintropy check src`)
- `bun run dev -- check [paths...]`
  - analyzes TS files and enforces absolute-cap gate
  - options: `--format text|json`, `--max-entropy`, `--drift-budget`, `--no-baseline`
  - AI options: `--ai`, `--fix`, `--fix-dry-run`, `--ai-threshold`, `--ai-timeout-ms`, `--ai-retries`
- `bun run dev -- baseline [paths...]`
  - generates `.lintropy-baseline.json`
- `bun run dev -- diff [paths...]`
  - compares current project entropy to baseline

### AI advisor (Ollama)

**Setup:**

```bash
# Install Ollama, then run:
ollama pull phi3         # Or any phi3 variant
lintropy check --ai      # Static + AI advisor
```

**Config (`.lintropy.json`):**

```json
{
  "ollama": { "model": "phi3", "baseUrl": "http://localhost:11434" }
}
```

Examples:
- `lintropy check --ai` — analyze with AI advisor
- `lintropy check --ai --fix-dry-run` — preview AI fixes without applying
- `lintropy check --ai --fix` — apply AI-generated refactors

### AI safety and compliance

- AI mode is advisory-only and does not control policy pass/fail.
- Invalid AI output is dropped via strict JSON validation.
- Advisor uses local Ollama (no external API calls).
- See `AI_SAFETY.md` and `THIRD_PARTY.md` for policy/compliance details.

## Entropy defaults

- weights: `nesting=0.40`, `functionLength=0.35`, `typeEscape=0.25`
- normalization caps: `depthCap=6`, `functionLengthCap=80`
- project gate: `absoluteCap=1.00`
- drift budget default: `0.05`

## CI rollout strategy

1. Phase A (local only): run `lintropy check` manually while tuning.
2. Phase B (advisory CI): run in CI and publish report artifacts, non-blocking.
3. Phase C (blocking cap): fail CI on absolute-cap violations.
4. Phase D (blocking drift): fail CI on cap and drift budget violations.

Current GitHub Actions workflow runs `bun run check` and `bun run test` as the default quality gate.

## Branch and release workflow

- Feature work: create branch from `beta`, open PR into `beta`.
- Promotion: open PR from `beta` into `main` after beta validation.
- `main` and `beta` are protected branches with required PR checks.
- Only merge PRs after CI (`check`) passes.
- Release on npm:
  1. Ensure `main` is green (`bun run check` and `bun run test`).
  2. Run `bun run release` (or `npx release-it`) — bumps version, commits, tags, pushes, creates GitHub release.
  3. Tag pushes matching `v*` trigger `.github/workflows/publish.yml`.
  4. Publish job runs checks/tests and `npm publish --provenance --access public`.
