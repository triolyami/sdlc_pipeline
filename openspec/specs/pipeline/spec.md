# Capability: pipeline

Automated SDLC pipeline orchestration over headless coding CLIs.

## Requirements

### The system SHALL define pipelines declaratively

A `pipeline.yaml` file SHALL describe stages (name, adapter, prompt/command,
transitions) and global retry limits. Adding or reordering stages SHALL NOT
require code changes.

#### Scenario: adding a stage

- GIVEN a working pipeline
- WHEN a user adds a stage entry with an `on` transition in `pipeline.yaml`
- THEN the engine executes it without modification to `src/`

### The system SHALL execute the pipeline as a state machine

The engine SHALL start at `start`, run each stage via its adapter, resolve the
next stage from the stage's `on` map keyed by the result status
(`done`, `ok`, `fail`, `approve`, `reject`), and terminate on `END`.

#### Scenario: review rejection loops back to implementation

- GIVEN an implemented change
- WHEN the review stage returns status `reject`
- THEN the engine SHALL return to `implement` with the reviewer's feedback
- AND repeat at most `limits.reject` times before failing the run

### Each stage SHALL run through an interchangeable adapter

Adapters SHALL implement `run(ctx) -> StageResult`. The registry SHALL include
`devin`, `opencode`, `shell`, `human`, and `mock` adapters. Stages SHALL NOT
know which binary executes them.

#### Scenario: swapping the implementer CLI

- WHEN `implement.adapter` changes from `devin` to `opencode`
- THEN the pipeline runs unchanged otherwise

### The system SHALL persist all run state as events

Every stage transition SHALL append a JSON object to
`runs/<run_id>/events.jsonl`. The log SHALL be sufficient to resume an
interrupted run (`--resume <run_id>`) and to replay a run for visualization.

### The verify stage SHALL be deterministic

Verification SHALL run a shell script (no agent). For the site domain it SHALL
check that `index.html` parses, referenced local assets exist, and no
`TODO`/`FIXME`/`PLACEHOLDER` markers remain. A failing verify SHALL send work
back to `implement` with the failure output.

### Deploy SHALL require human approval

The deploy stage SHALL block on human confirmation (interactive prompt in v1,
dashboard approval later). On approval it SHALL run the configured `then`
command. On rejection the run SHALL end as `aborted`.

### Agents SHALL receive uniform run context

Every agent prompt SHALL be rendered into `runs/<run_id>/<stage>.prompt.md`
with: the stage prompt body, the task, the workspace path, the artifacts
directory, and reviewer/verifier feedback when present. Feedback rounds SHALL
resume the agent's previous CLI session (`-c`) rather than start fresh.

## Non-goals (v1)

- Parallel worker fan-out, DAG execution
- Web dashboard / SSE (phase 2)
- Langfuse sinks (phase 2)
- iOS/xcodebuild domain
