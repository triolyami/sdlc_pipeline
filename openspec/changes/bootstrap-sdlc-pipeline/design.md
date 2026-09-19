# Design: bootstrap sdlc_pipeline

## Layers (as agreed)

```
1. DEFINITION   pipeline.yaml + prompts/*.md     (what runs — data)
2. ENGINE       src/pipe/engine.py               (generic walker — code)
3. ADAPTERS     src/pipe/adapters/*.py           (how a stage executes)
4. TELEMETRY    src/pipe/events.py               (emit → sinks) [jsonl only in v1]
5. INTERFACES   src/pipe/cli.py, dashboard/      (thin shells)    [cli only in v1]
```

## State machine ownership split

- **Definition** declares states, transitions, guards (`on:`), limits.
- **Engine** is a generic interpreter: current state, edge resolution,
  counters, lifecycle. Contains zero pipeline-specific knowledge.
- **`events.jsonl`** is the persisted state — `--resume` replays it.

## Key decisions

- **Uniform run context**: engine renders `runs/<id>/<stage>.prompt.md` =
  stage prompt + task + workspace path + artifacts dir + feedback.
  Prompts stay generic; context is injected mechanically.
- **Feedback via session resume**: retry rounds call `devin -c` /
  `opencode run -c` in the workspace so the agent keeps its context.
  Constraint: one CLI may only own one session per workspace dir —
  v1 assigns different CLIs to different roles (devin=implementer,
  opencode=planner+reviewer) to avoid session collisions.
- **Workspace is persistent** (`site/`), like a real project; artifacts go
  to `runs/<id>/`.
- **Verdict contract**: reviewer must end with `VERDICT: APPROVE` or
  `VERDICT: REJECT` — parsed by regex, no LLM judging the judge.
- **Human gate**: stdin prompt in v1; later the dashboard writes
  `runs/<id>/approval.json` which the adapter polls — same adapter
  interface, no engine change.

## Failure handling

- Status counts (`fail`, `reject`) tracked globally per run; exceeding
  `limits` → `run_failed` event, exit non-zero.
- Adapter crashes → `fail` status → normal edge resolution.
- Unknown status / missing edge → `run_failed` (config error, loud).
