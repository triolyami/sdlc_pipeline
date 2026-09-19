# Tasks: bootstrap sdlc_pipeline

## 1. Scaffold & spec

- [x] 1.1 Create repo layout (`src/pipe/`, `prompts/`, `site/`, `runs/`, `openspec/`)
- [x] 1.2 Write capability spec (`openspec/specs/pipeline/spec.md`)
- [x] 1.3 Write proposal + design + this task list

## 2. Definition layer

- [x] 2.1 `pipeline.yaml` — 5 stages (plan/implement/verify/review/deploy) for static sites
- [x] 2.2 `prompts/planner.md`, `implementer.md`, `reviewer.md`
- [x] 2.3 `definition.py` — YAML → `Pipeline`/`Stage` dataclasses + validation

## 3. Adapter layer

- [x] 3.1 `base.py` — `StageCtx`, `StageResult`, adapter protocol
- [x] 3.2 `devin.py` — `-p --prompt-file`, `-c` resume on feedback, permission mode
- [x] 3.3 `opencode.py` — `opencode run`, `-c` resume, `VERDICT:` parsing
- [x] 3.4 `shell.py` — run command, ok/fail on exit code
- [x] 3.5 `human.py` — stdin gate (+`--yes`/`PIPE_AUTO_APPROVE`), optional `then` command
- [x] 3.6 `mock.py` — deterministic agents for offline engine testing

## 4. Engine layer

- [x] 4.1 `events.py` — append-only `events.jsonl` writer
- [x] 4.2 `store.py` — run dirs, rendered prompts, artifact copies
- [x] 4.3 `engine.py` — state machine loop, edge resolution, limits, resume
- [x] 4.4 `cli.py` + `pipe` launcher — `run`, `--mock`, `--yes`, `--resume`, `list`

## 5. Domain plumbing (static sites)

- [x] 5.1 `scripts/verify_site.py` — parse check, asset refs, TODO markers
- [x] 5.2 `deployed/` target + deploy `then` command

## 6. Validation

- [ ] 6.1 `pipe run --mock --yes` completes full cycle offline
- [ ] 6.2 `pipe list` / `--resume` work
- [ ] 6.3 Real run with devin/opencode on a real task

## 7. Phase 2 (not this change)

- [ ] 7.1 `sinks/langfuse.py` — trace per run, span per stage, scores
- [ ] 7.2 `sinks/sse.py` + `dashboard/server.py` + `index.html` — live DAG view
- [ ] 7.3 Human gate via `approval.json` file instead of stdin
- [ ] 7.4 Deep-link run → Langfuse trace from dashboard
