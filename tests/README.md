# Test Suites and Fixtures

This folder includes unit tests plus fixture codebases used for regression testing.

## Layout

- `analyze/`: AST metric extraction tests
- `score/`: entropy score behavior and threshold tests
- `baseline/`: baseline read/write and drift contract tests
- `report/`: text/json rendering tests
- `discovery/`: file discovery and ignore behavior tests
- `integration/`: end-to-end scoring assertions over fixture codebases
- `codebases/`: dummy TypeScript repos representing common vibe-coding smells

## Fixture codebases

- `healthy/`: clean baseline code
- `deep-nesting/`: heavy nested control flow
- `type-escape/`: unsafe `any` and broad casts
- `god-function/`: oversized mixed-responsibility function
- `discovery/`: file tree for include/ignore behavior

## Adding a new smell fixture

1. Add a new folder under `tests/codebases/<smell-name>/src/`.
2. Keep files small and focused on one dominant issue.
3. Add/update assertions in `tests/integration/codebases.test.ts` for expected signal behavior.
4. Run:
   - `bun run check`
   - `bun run test`
