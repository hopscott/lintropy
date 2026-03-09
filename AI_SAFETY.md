# AI Advisor Safety Policy

`lintropy` AI mode is advisory-only. Static entropy gates remain the source of truth for pass/fail.

## Guardrails

- AI is opt-in via `--ai`.
- AI failures never crash lint execution; advisor degrades gracefully.
- Output must match strict JSON shape (`tags`, `severity`, `explanation`, `suggestion`) or is discarded.
- Deterministic defaults: fixed seed, low temperature, bounded token output.
- Per-file timeout and retry controls (`--ai-timeout-ms`, `--ai-retries`).
- Code input is truncated to reduce leakage and context spillover.
- Advisor runs local `llama-cli`; no network calls are made by advisor code.

## Operational Guidance

- Do not treat AI text as authoritative facts.
- Do not execute generated suggestions automatically.
- Keep AI non-blocking in CI until output stability is proven.
