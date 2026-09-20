"""human adapter — the approval gate.

Interactive (TTY) runs keep the stdin prompt; `--yes` / PIPE_AUTO_APPROVE
auto-approve. Non-interactive runs (dashboard, CI) write
runs/<id>/approval_request.json, emit an `approval_requested` event, then
poll runs/<id>/approval.json for {"decision": "approve"|"reject",
"comment": str} — written by the dashboard API or by hand.

On approval, runs the stage's optional `then` command (the actual deploy).
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import time

from .base import StageCtx, StageResult, tail

_POLL = 0.8


def _emit(run_dir, type: str, stage: str, **data):
    """Append to the run's events.jsonl from inside an adapter.

    Safe: the engine only writes between adapter calls, so appends from the
    currently-running stage never interleave with engine writes.
    """
    rec = {"ts": round(time.time(), 3), "type": type, "stage": stage}
    rec.update(data)
    with open(run_dir / "events.jsonl", "a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _ask_tty(ctx: StageCtx) -> bool:
    try:
        ans = input("Approve and continue? [y/N] ").strip().lower()
    except EOFError:
        ans = ""
    return ans in ("y", "yes")


def _ask_file(ctx: StageCtx) -> tuple[bool, str]:
    """Dashboard gate: publish the request, block until approval.json lands."""
    req = ctx.run_dir / "approval_request.json"
    req.write_text(json.dumps({
        "stage": ctx.stage.name,
        "task": ctx.task,
        "workspace": str(ctx.workspace),
        "run_dir": str(ctx.run_dir),
        "ts": time.time(),
    }, indent=2))
    _emit(ctx.run_dir, "approval_requested", ctx.stage.name, task=ctx.task)
    print("waiting for approval.json (dashboard gate)…")

    path = ctx.run_dir / "approval.json"
    while True:
        try:
            data = json.loads(path.read_text())
            if isinstance(data, dict) and data.get("decision"):
                break
        except (OSError, ValueError):
            pass
        time.sleep(_POLL)

    decision = str(data["decision"]).lower()
    comment = str(data.get("comment") or "")
    _emit(ctx.run_dir, "approval_resolved", ctx.stage.name,
          decision=decision, comment=comment)
    for p in (req, path):
        try:
            p.unlink()
        except OSError:
            pass
    return decision == "approve", comment


def run(ctx: StageCtx) -> StageResult:
    print(f"\n=== HUMAN GATE: {ctx.stage.name} ===")
    print(f"task:      {ctx.task}")
    print(f"workspace: {ctx.workspace}")
    print(f"artifacts: {ctx.run_dir}")

    approved, note = True, ""
    if not (ctx.auto_yes or os.environ.get("PIPE_AUTO_APPROVE")):
        if sys.stdin.isatty():
            approved = _ask_tty(ctx)
        else:
            approved, note = _ask_file(ctx)
        if not approved:
            return StageResult("reject", output=note or "declined by human",
                               feedback=note or "declined by human")

    then = ctx.stage.config.get("then")
    if then:
        cmd = then.format(workspace=shlex.quote(str(ctx.workspace)),
                          run_dir=shlex.quote(str(ctx.run_dir)),
                          repo_root=shlex.quote(str(ctx.repo_root)))
        r = subprocess.run(cmd, shell=True, cwd=ctx.repo_root,
                           capture_output=True, text=True)
        out = tail(r.stdout + r.stderr)
        print(out)
        if r.returncode != 0:
            return StageResult("fail", output=out, feedback=out)
        return StageResult("approve", output=out)
    return StageResult("approve", output=note)
