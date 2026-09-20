"""Layer 2 — the engine: a generic state-machine interpreter.

Owns current state, edge resolution, status counters and run lifecycle.
Contains ZERO pipeline-specific knowledge — it can execute any valid
pipeline.yaml. Pipeline state persists only via events.jsonl.
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

from . import definition, events, store
from .adapters import REGISTRY, MOCK_OVERRIDES
from .adapters.base import StageCtx, StageResult


def _resolve_workspace(repo_root: Path, ws: str) -> Path:
    p = Path(ws)
    return (p if p.is_absolute() else repo_root / p).resolve()


def run(repo_root: Path, task: str, run_id: str | None = None,
        auto_yes: bool = False, mock: bool = False,
        workspace: str | None = None) -> int:
    defn = definition.load(repo_root)
    resumed = run_id is not None

    if run_id:
        run_dir = repo_root / "runs" / run_id
        if not run_dir.is_dir():
            print(f"no such run: {run_id}", file=sys.stderr)
            return 2
        task = (run_dir / "task.txt").read_text().strip()
        ws_file = run_dir / "workspace.txt"
        if ws_file.exists():
            defn.workspace = _resolve_workspace(repo_root, ws_file.read_text().strip())
        recovered = _recover(defn, run_dir)
        if recovered is None:
            print(f"run {run_id} already finished", file=sys.stderr)
            return 2
        state, counts, rounds, feedback = recovered
    else:
        run_id, run_dir = store.new_run(repo_root, task)
        if workspace:
            defn.workspace = _resolve_workspace(repo_root, workspace)
            (run_dir / "workspace.txt").write_text(str(defn.workspace))
        state, counts, rounds, feedback = defn.start, Counter(), Counter(), None

    defn.workspace.mkdir(parents=True, exist_ok=True)

    log = events.EventLog(run_dir)
    log.emit("run_started", run_id=run_id, task=task, resumed=resumed)
    outcome = "failed"
    try:
        while state != definition.END:
            stage = defn.stages[state]
            name = stage.adapter
            if mock:
                name = MOCK_OVERRIDES.get(name, name)
            adapter = REGISTRY[name]
            log.emit("stage_started", stage=state, adapter=name,
                     round=rounds[state])
            ctx = StageCtx(repo_root=repo_root, workspace=defn.workspace,
                           run_dir=run_dir, run_id=run_id, task=task,
                           stage=stage, feedback=feedback,
                           round=rounds[state], auto_yes=auto_yes)
            try:
                result = adapter(ctx)
            except Exception as e:
                result = StageResult("fail", feedback=f"adapter crashed: {e}")
            log.emit("stage_finished", stage=state, status=result.status,
                     output=result.output[:2000],
                     feedback=result.feedback[:2000])
            counts[result.status] += 1
            rounds[state] += 1

            limit = defn.limits.get(result.status)
            if limit and counts[result.status] > limit:
                log.emit("run_failed", detail=f"limit hit: {result.status} "
                         f"count {counts[result.status]} > {limit}")
                return 1

            nxt = stage.on.get(result.status) or stage.on.get("default")
            if nxt is None:
                log.emit("run_failed", detail=f"stage {state}: no edge "
                         f"for status {result.status!r}")
                return 2

            log.emit("transition", stage=state, status=result.status, to=nxt)

            # feedback flows only into a stage we're revisiting
            feedback = (result.feedback or result.output) if rounds[nxt] else None
            outcome = {"approve": "completed", "done": "completed",
                       "ok": "completed"}.get(result.status, result.status)
            state = nxt

        outcome = "aborted" if outcome == "reject" else outcome
        log.emit("run_finished", outcome=outcome)
        return 0 if outcome == "completed" else 1
    finally:
        log.close()


def _recover(defn, run_dir: Path):
    """Rebuild (state, counts, rounds, feedback) by replaying events."""
    evts = events.replay(run_dir)
    finished = [e for e in evts if e["type"] == "stage_finished"]
    if not finished or evts[-1]["type"] in ("run_finished", "run_failed"):
        return None
    counts = Counter(e["status"] for e in finished)
    rounds = Counter(e["stage"] for e in finished)
    last = finished[-1]
    stage = defn.stages[last["stage"]]
    nxt = stage.on.get(last["status"]) or stage.on.get("default")
    if nxt is None:
        return None
    fb = last.get("feedback") or last.get("output") or ""
    return nxt, counts, rounds, fb if rounds[nxt] else None
