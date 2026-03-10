# Third-Party Components

## Phi-3.5 Mini Instruct (GGUF)

- Component: `Phi-3.5-mini-instruct-Q4_K_M.gguf`
- Upstream: Microsoft Phi-3.5 Mini Instruct
- Source: `huggingface.co/microsoft/Phi-3.5-mini-instruct-gguf`
- Intended use: optional local AI advisor for `lintropy check --ai`
- Runtime: local Ollama API only (no external network dependency)

## Compliance Notes

- Verify the exact upstream license text and model card terms before redistribution.
- Keep model artifacts out of git history by default (`models/*.gguf` ignored).
- Prefer user-provisioned local model files for production and CI environments.
