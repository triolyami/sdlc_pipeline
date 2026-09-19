"""opencode CLI adapter: `opencode run <prompt>` first round,
`opencode run -c <feedback>` on feedback rounds.

Stages with `verdict: true` in config parse `VERDICT: APPROVE|REJECT`
from stdout — the machine-readable review contract.
"""
from __future__ import annotations

import re
import subprocess

from .. import store
from .base import StageCtx, StageResult, tail

_VERDICT = re.compile(r"VERDICT:\s*(APPROVE|REJECT)", re.IGNORECASE)


def run(ctx: StageCtx) -> StageResult:
    if ctx.feedback and ctx.round > 0:
        cmd = ["opencode", "run", "-c", store.feedback_message(ctx)]
    else:
        prompt_text = store.render_prompt(ctx.repo_root, ctx).read_text()
        cmd = ["opencode", "run", prompt_text]
    r = subprocess.run(cmd, cwd=ctx.workspace, capture_output=True, text=True)
    out = tail(r.stdout + r.stderr)
    if r.returncode != 0:
        return StageResult("fail", output=out, feedback=out)
    if ctx.stage.config.get("verdict"):
        m = _VERDICT.search(r.stdout)
        if not m:
            return StageResult("fail", output=out,
                               feedback="Reviewer produced no VERDICT line.")
        status = m.group(1).lower()
        fb = r.stdout if status == "reject" else ""
        return StageResult(status, output=out, feedback=fb)
    return StageResult("done", output=out)
