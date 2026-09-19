# Project: sdlc_pipeline

A minimal CLI orchestration tool that runs an automated SDLC pipeline
(**plan → implement → verify → review → deploy**) where each "agent" is a
headless invocation of an existing coding CLI (`devin`, `opencode`) or a
plain shell command.

## Current target domain

Static **website** generation (HTML/CSS/JS in `site/`), chosen because
verification is cheap and deterministic. The architecture is domain-agnostic:
swapping to iOS later = new `pipeline.yaml` + prompts + verify script.

## Conventions

- Python 3, stdlib + `pyyaml` only.
- Agents never orchestrate. The engine (code) owns control flow; agents own
  work inside a stage.
- All state lives in `runs/<run_id>/events.jsonl` (append-only).
- Repo layout:
  - `pipeline.yaml` — pipeline definition (layer 1)
  - `prompts/*.md` — per-stage agent instructions (layer 1)
  - `src/pipe/` — engine + adapters (layers 2–3)
  - `openspec/` — specs (truth) + changes (proposals, tasks)
  - `site/` — persistent workspace the agents build in
  - `deployed/` — local deploy target
  - `runs/` — per-run artifacts
