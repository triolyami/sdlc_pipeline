# Proposal: bootstrap sdlc_pipeline

## Why

We want an automated plan → implement → verify → review → deploy pipeline for
building static websites, driven by headless coding CLIs (`devin`, `opencode`)
rather than hand-rolled agents. Multi-agent orchestration needs deterministic
control flow — prompts define agent *behavior*, code defines the *graph*.

## What

- Declarative pipeline definition (`pipeline.yaml` + `prompts/*.md`)
- Generic state-machine engine with bounded retry loops
- Adapter layer: `devin`, `opencode`, `shell`, `human`, `mock`
- Append-only event log per run (`runs/<id>/events.jsonl`) = persisted state
- Deterministic site verification script
- Human-gated deploy (local copy to `deployed/` for v1)

## Out of scope

Dashboard/SSE, Langfuse, parallel workers — phase 2+.
