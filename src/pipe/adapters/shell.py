"""shell adapter — deterministic commands, no agent.

`cmd` is formatted with {workspace}, {run_dir}, {repo_root} and run from the
repo root. Exit code 0 -> ok, non-zero -> fail (output becomes feedback).
"""
from __future__ import annotations

import subprocess

from .base import StageCtx, StageResult, tail


def run(ctx: StageCtx) -> StageResult:
    cmd = ctx.stage.config["cmd"].format(
        workspace=ctx.workspace, run_dir=ctx.run_dir, repo_root=ctx.repo_root)
    r = subprocess.run(cmd, shell=True, cwd=ctx.repo_root,
                       capture_output=True, text=True)
    out = tail(r.stdout + r.stderr)
    if r.returncode != 0:
        return StageResult("fail", output=out, feedback=out)
    return StageResult("ok", output=out)
