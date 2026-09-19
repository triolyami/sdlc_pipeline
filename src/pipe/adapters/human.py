"""human adapter — the approval gate.

v1: stdin prompt (or auto-approve via --yes / PIPE_AUTO_APPROVE).
Phase 2: the dashboard writes runs/<id>/approval.json and this adapter
polls it — same interface, no engine change.

On approval, runs the stage's optional `then` command (the actual deploy).
"""
from __future__ import annotations

import os
import subprocess

from .base import StageCtx, StageResult, tail


def run(ctx: StageCtx) -> StageResult:
    print(f"\n=== HUMAN GATE: {ctx.stage.name} ===")
    print(f"task:      {ctx.task}")
    print(f"workspace: {ctx.workspace}")
    print(f"artifacts: {ctx.run_dir}")

    if not (ctx.auto_yes or os.environ.get("PIPE_AUTO_APPROVE")):
        try:
            ans = input("Approve and continue? [y/N] ").strip().lower()
        except EOFError:
            ans = ""
        if ans not in ("y", "yes"):
            return StageResult("reject", output="declined by human")

    then = ctx.stage.config.get("then")
    if then:
        cmd = then.format(workspace=ctx.workspace, run_dir=ctx.run_dir,
                          repo_root=ctx.repo_root)
        r = subprocess.run(cmd, shell=True, cwd=ctx.repo_root,
                           capture_output=True, text=True)
        out = tail(r.stdout + r.stderr)
        if r.returncode != 0:
            return StageResult("fail", output=out, feedback=out)
        return StageResult("approve", output=out)
    return StageResult("approve")
