# Spec Delta

## Purpose

Automated SDLC pipeline orchestration over headless coding CLIs: a
declarative plan → implement → verify → review → deploy state machine,
currently targeting static website generation but domain-agnostic by design.

## ADDED Requirements

### Requirement: Declarative pipeline definition

A `pipeline.yaml` file SHALL describe stages (name, adapter, prompt/command,
transitions via `on:`) and global retry `limits`. Adding or reordering stages
SHALL NOT require code changes.

#### Scenario: Adding a stage

- **WHEN** a user adds a stage entry with an `on` transition in `pipeline.yaml`
- **THEN** the engine executes it without modification to `src/`

#### Scenario: Missing edge for a status

- **WHEN** a stage finishes with a status that has no declared edge
- **THEN** the run ends as `run_failed` with a loud config error, never silent

### Requirement: State machine execution

The engine SHALL start at `start`, run each stage via its adapter, resolve the
next stage from the stage's `on` map keyed by the result status (`done`,
`ok`, `fail`, `approve`, `reject`), and terminate on `END`. Global `limits`
SHALL cap total occurrences per status per run; exceeding one SHALL end the
run as `run_failed`. Feedback SHALL flow only into a stage being revisited.

#### Scenario: Verify failure loops back to implementation

- **WHEN** the verify stage returns status `fail`
- **THEN** the engine SHALL return to `implement` with the verifier output as
  feedback, and repeat at most `limits.fail` times before failing the run

#### Scenario: Review rejection loops back to implementation

- **WHEN** the review stage returns status `reject`
- **THEN** the engine SHALL return to `implement` with the reviewer's feedback
  AND repeat at most `limits.reject` times before failing the run

### Requirement: Interchangeable stage adapters

Adapters SHALL implement `run(ctx) -> StageResult`. The registry SHALL include
`devin`, `opencode`, `shell`, `human`, and `mock` adapters. Stages SHALL NOT
know which binary executes them. `--mock` SHALL swap agent adapters for the
deterministic mock adapter for offline testing.

#### Scenario: Swapping the implementer CLI

- **WHEN** `implement.adapter` changes from `devin` to `opencode`
- **THEN** the pipeline runs unchanged otherwise

### Requirement: Event-sourced run state

Every stage transition SHALL append a JSON object to
`runs/<run_id>/events.jsonl`, including an explicit `transition` record
(`{from, status, to}`) for each edge taken. The definition SHALL expose the
full declared edge list (`Pipeline.transitions`) for validation and
visualization. The log SHALL be sufficient to resume an interrupted run and
to replay a run for visualization.

#### Scenario: Resuming an interrupted run

- **WHEN** `pipe run --resume <run_id>` is invoked
- **THEN** the engine replays `events.jsonl` and continues from the last
  recorded stage without re-running completed stages

### Requirement: Uniform agent context

Every agent prompt SHALL be rendered into `runs/<run_id>/<stage>.prompt.md`
with: the stage prompt body, the task, the workspace path, the artifacts
directory, and reviewer/verifier feedback when present. Agents SHALL run
sandboxed to the workspace; agent-facing artifacts SHALL live in
`<workspace>/.pipeline/` and be copied back to `run_dir` after each agent
stage. Feedback rounds SHALL resume the agent's previous CLI session (`-c`)
rather than start fresh.

#### Scenario: Retry round resumes agent session

- **WHEN** a stage is revisited with feedback
- **THEN** the adapter invokes the CLI with `-c` and the feedback text in the
  same workspace, preserving agent context

### Requirement: Deterministic verification

The verify stage SHALL run a shell script with no agent involvement. For the
site domain it SHALL check that `index.html` exists and parses, every local
`src`/`href` resolves, and no `TODO`/`FIXME`/`XXX`/`PLACEHOLDER`/`lorem
ipsum` markers remain in text files, skipping dot-directories such as
`.pipeline/`.

#### Scenario: Marker found in site text

- **WHEN** the verifier finds a forbidden marker
- **THEN** it exits non-zero, the stage records status `fail`, and the output
  is passed to `implement` as feedback

### Requirement: Review verdict contract

Stages configured with `verdict: true` SHALL require the agent output to end
with `VERDICT: APPROVE` or `VERDICT: REJECT`, parsed by regex. A missing or
malformed verdict SHALL produce status `fail` (retryable), never an LLM
judgment of the judge.

#### Scenario: Missing verdict

- **WHEN** the review stage output contains no `VERDICT:` line
- **THEN** the stage records status `fail` and the configured retry edge is
  taken

### Requirement: Human-gated deploy

The deploy stage SHALL block on human confirmation: an interactive `[y/N]`
prompt on a TTY, or a file-based gate (`approval_request.json` /
`approval.json` in `run_dir`) when non-interactive. `--yes` or
`PIPE_AUTO_APPROVE` SHALL auto-approve. On approval it SHALL run the
configured `then` command and record its output (including the `DEPLOYED AT:`
URL) in the stage event. On rejection the run SHALL end as `aborted`.

#### Scenario: Non-interactive approval via file gate

- **WHEN** the pipeline runs without a TTY (dashboard/CI) and reaches deploy
- **THEN** the adapter writes `approval_request.json` and polls for
  `approval.json`, proceeding on `{"approved": true}`
