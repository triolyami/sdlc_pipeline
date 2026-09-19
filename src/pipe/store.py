"""Run directories, rendered prompts, artifacts."""
from __future__ import annotations

import time
import uuid
from pathlib import Path


def new_run(repo_root: Path, task: str) -> tuple[str, Path]:
    run_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    run_dir = repo_root / "runs" / run_id
    run_dir.mkdir(parents=True)
    (run_dir / "task.txt").write_text(task)
    return run_id, run_dir


def render_prompt(repo_root: Path, ctx) -> Path:
    """Render stage prompt + uniform run context into runs/<id>/<stage>.prompt.md.

    This is the one place prompts meet runtime state — prompts stay generic,
    context is injected mechanically.
    """
    body = (repo_root / ctx.stage.config["prompt"]).read_text()
    ctx_block = [
        "---\n## Run context",
        f"- TASK: {ctx.task}",
        f"- WORKSPACE: {ctx.workspace}  (your working directory — the site project)",
        f"- ARTIFACTS_DIR: {ctx.run_dir}  (write plan.md here)",
    ]
    if ctx.feedback:
        ctx_block.append(f"- FEEDBACK from previous stage:\n{ctx.feedback}")
    out = ctx.run_dir / f"{ctx.stage.name}.prompt.md"
    out.write_text(body + "\n\n" + "\n".join(ctx_block) + "\n")
    return out


def feedback_message(ctx) -> str:
    return (
        "The pipeline sent this back for rework. Findings:\n\n"
        f"{ctx.feedback}\n\n"
        "Fix the findings, then finish any remaining work."
    )
