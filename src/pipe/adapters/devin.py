"""devin CLI adapter: `devin -p --prompt-file` first round, `devin -c -p` on
feedback rounds (resumes the session in the workspace, keeping context).

NOTE: `-c` resumes the most recent devin session in cwd. This assumes one
devin role per workspace — v1 uses devin only for `implement`.
"""
from __future__ import annotations

import subprocess

from .. import store
from .base import StageCtx, StageResult, tail


def run(ctx: StageCtx) -> StageResult:
    if ctx.feedback and ctx.round > 0:
        cmd = ["devin", "-c", "-p", store.feedback_message(ctx)]
    else:
        prompt_file = store.render_prompt(ctx.repo_root, ctx)
        cmd = [
            "devin", "-p",
            "--prompt-file", str(prompt_file),
            "--permission-mode", ctx.stage.config.get("permission_mode", "normal"),
            "--respect-workspace-trust", "false",
        ]
    r = subprocess.run(cmd, cwd=ctx.workspace, capture_output=True, text=True)
    out = tail(r.stdout + r.stderr)
    if r.returncode != 0:
        return StageResult("fail", output=out, feedback=out)
    return StageResult("done", output=out)
