# AGENTS.md

## What this repo is

`sdlc_pipeline` is a minimal orchestrator that runs an automated
**plan → implement → verify → review → deploy** pipeline for building static
websites. Each stage is executed by a headless coding CLI (`opencode`,
`devin`), a plain shell command, or a human approval gate — the pipeline
definition decides, the engine just interprets it.

Core rule: **agents never orchestrate**. Prompts define agent *behavior*;
code defines the *graph*. Control flow (loops, retries, gates) lives in
`pipeline.yaml` + `src/pipe/engine.py`, never in a prompt.

## Running it

Two servers, plus pipeline runs:

| Piece | Command | Port |
|---|---|---|
| Dashboard (UI + API, spawns/monitors runs) | `python3 dashboard/server.py` | **7890** — `--port`/`--host` flags or `PORT`/`HOST` env |
| Deployed site (static server for `deployed/`) | started automatically by the `deploy` stage | **8080** — the `8080` arg in the deploy `then:` line |

Start a run either way:

```bash
./pipe run "make me a landing page" --workspace ../site3   # CLI
# or from the dashboard UI / POST /api/runs {task, workspace?, mock?}
```

The deploy port isn't guaranteed: if a foreign (non-`http.server`) process
holds it, deploy moves to the next free port — always trust the
`DEPLOYED AT:` line in the run's events. See "Verify & deploy scripts".

## Architecture (5 layers)

```
1. DEFINITION   pipeline.yaml + prompts/*.md     what runs — pure data
2. ENGINE       src/pipe/engine.py               generic state-machine walker
3. ADAPTERS     src/pipe/adapters/*.py           how a stage executes
4. TELEMETRY    src/pipe/events.py               append-only events.jsonl
5. INTERFACES   src/pipe/cli.py + dashboard/     thin shells, no logic
```

The engine contains **zero** pipeline-specific knowledge — it can execute any
valid `pipeline.yaml`. Pipeline state persists only via `events.jsonl`;
resuming a run means replaying that log.

## The pipeline (pipeline.yaml)

| Stage | Adapter | What it does |
|---|---|---|
| `plan` | `opencode` | Writes `plan.md` (required `artifact:` — missing ⇒ stage fails) |
| `implement` | `devin` | Builds the site in the workspace (`--permission-mode dangerous`) |
| `verify` | `shell` | `scripts/verify_site.py` — deterministic checks, no agent |
| `review` | `opencode` | Skeptical read-only review, must end with `VERDICT: APPROVE\|REJECT` |
| `deploy` | `human` | Approval gate → `scripts/deploy_site.py` syncs + serves locally |

Statuses and edges: `done`, `ok`, `fail`, `approve`, `reject`. Loops:
`verify fail → implement`, `review reject → implement`,
`review fail → review` (retry, e.g. missing VERDICT). Global `limits`
(`fail: 5`, `reject: 5`) cap total occurrences per status per run — exceeding
one ends the run as `run_failed`. A missing edge for a status is a config
error → loud `run_failed`, never silent.

## Run layout (`runs/<run_id>/`)

- `events.jsonl` — append-only log; IS the persisted state (resume replays it)
- `task.txt`, `workspace.txt` — run inputs
- `<stage>.prompt.md` — rendered prompt actually sent to the agent
- `plan.md` — archived copy of the agent's plan artifact
- `approval_request.json` / `approval.json` — the file-based human gate
  (dashboard writes `approval.json`; the adapter polls for it)

At `runs/` root (not per-run): `deploy-server.json` (pid/port of the managed
server) and `deploy-server.log`.

## Artifacts live INSIDE the workspace (important)

Agents run with `cwd=<workspace>` and are sandboxed to it — anything outside
(e.g. `runs/<id>/`) triggers permission prompts that are auto-rejected
non-interactively. So agent-facing artifacts go to **`<workspace>/.pipeline/`**
(`ARTIFACTS_DIR` in the rendered prompt). After each agent stage, the adapter
copies `.pipeline/*` back into `run_dir` for the record
(`store.sync_artifacts`). `.pipeline/` is excluded from the deploy and skipped
by the verifier (dot-dirs aren't site content).

## Adapters (`src/pipe/adapters/`)

All conform to `run(ctx: StageCtx) -> StageResult`. Registry in
`adapters/__init__.py`; `--mock` swaps `devin`/`opencode` for `mock`.

- **opencode** — `opencode run <prompt>` first round, `opencode run -c
  <feedback>` on retry (resumes session in the workspace). `verdict: true`
  stages must produce `VERDICT: APPROVE|REJECT` (regex-parsed; no LLM judging
  the judge).
- **devin** — `devin -p --prompt-file … --permission-mode <cfg>` first round,
  `devin -c -p <feedback>` on retry. `permission_mode` comes from the stage
  config — currently `dangerous` (auto-approves all tools). Do NOT "tighten"
  it back to `accept-edits` without reason: in headless `-p` mode every
  non-auto-approved tool call is silently rejected, and devin has burned whole
  implement rounds probing APIs while writing nothing (verify catches it, the
  loop recovers, but rounds are wasted). Middle ground exists: `smart` mode
  uses a built-in fast-model judge, or a `PreToolUse` hook can delegate the
  approve/block decision to an external script/model.
- **shell** — formats `cmd` with `{workspace} {run_dir} {repo_root}`, runs from
  repo root; exit 0 → `ok`, else `fail` with output as feedback.
- **human** — TTY → stdin `[y/N]` prompt; non-TTY (dashboard/CI) → file gate.
  `--yes` / `PIPE_AUTO_APPROVE` auto-approve. On approval runs the optional
  `then` command; output (incl. deploy URL) is printed and stored in the event.
- **mock** — deterministic planner/implementer/reviewer for offline engine
  testing. `PIPE_MOCK_FAIL_ONCE=1` ships a broken site on round 0 to exercise
  the verify→implement loop.

Session note: `-c` resumes the most recent session **per cwd**, so one CLI
should own one role per workspace (v1: devin=implement, opencode=plan+review).

## CLI (`./pipe`)

```bash
./pipe run "task" [--workspace DIR] [--mock] [--yes]   # new run
./pipe run --resume <run_id>                            # replay + continue
./pipe list                                             # runs + last event
./pipe show <run_id>                                    # dump event log
```

`workspace` defaults to `../site` (sibling of repo, per pipeline.yaml);
`--workspace` overrides and is persisted in `workspace.txt` for resume.

## Dashboard (`dashboard/`)

`python3 dashboard/server.py [--port 7890]` — stdlib-only HTTP server:
REST API + serves `dashboard/web/dist` (React+Vite SPA; `npm run build` in
`dashboard/web` to rebuild). API: `GET /api/pipeline`, `GET/POST /api/runs`
(`{task, mock?, workspace?}` spawns `./pipe run`), `GET
/api/runs/<id>/events?after=N`, `POST /api/runs/<id>/{approval,resume,stop}`.
Run state is derived by folding `events.jsonl` (`derive_state`); processes are
tracked in `PROCS` for stop/resume.

## Verify & deploy scripts (`scripts/`)

- `verify_site.py <dir>` — `index.html` exists/parses, every local `src`/`href`
  resolves, no `TODO|FIXME|XXX|PLACEHOLDER|lorem ipsum` markers in text files
  (skips dot-dirs like `.pipeline/`). Exit 1 on any FAIL.
- `deploy_site.py <workspace> [port]` — mirrors workspace → `deployed/`
  (excludes `.pipeline/`), ensures a persistent `http.server`, prints
  `DEPLOYED AT: http://localhost:<port>/` (lands in the stage output → shown
  in dashboard EventLog). Port policy: serving our content → reuse; held by a
  stray `http.server` → kill + take over; held by anything else → next free
  port (never kills foreign processes). Server tracked in
  `runs/deploy-server.json`, survives the pipeline exit.

## Conventions

- Python 3, **stdlib + `pyyaml` only** for engine/CLI/scripts (dashboard web
  is the only place with npm deps).
- Agents only ever touch files inside their workspace; artifacts go to
  `.pipeline/`, never `run_dir` directly.
- Feedback flows only into a stage being **revisited** (first visit gets none).
- `openspec/` holds the spec-of-truth (`specs/pipeline/spec.md`, valid
  schema — keep it that way: `openspec validate --all`) and change proposals
  (`changes/`); archived changes live in `changes/archive/YYYY-MM-DD-*`.
  Workflow: one change per task — propose → user reviews → apply → archive.
  The `dashboard/` capability is real but not yet spec'd — a good next change.
- `site/` (in-repo) and `site2`/`site3`/`/tmp/pipe-smoke-site` are agent
  workspaces from past runs; `deployed/` is the live deploy output.
- Viewed through a Devin browser-preview URL, any served page gets
  `cascade-browser-integration.js` injected — that's where the "Send element"
  toolbar lives. It's preview chrome from the proxy, NOT repo/site code:
  nothing here can remove or move it. `localhost:8080` direct = clean page.
- To audit real agent invocations, shim the CLIs earlier in `PATH` (a script
  that logs `argv`/`cwd` then `exec`s the real binary) and run
  `PATH=/tmp/shim:$PATH ./pipe run …` — stage output in `events.jsonl` is the
  CLI's captured stdout.

## Quick checks

```bash
./pipe run "smoke" --mock --yes --workspace /tmp/ws   # full cycle, offline
PIPE_MOCK_FAIL_ONCE=1 ./pipe run "x" --mock --yes     # exercises retry loop
python3 scripts/verify_site.py deployed/              # verifier standalone
python3 dashboard/server.py --port 7890               # dashboard UI + API
```
