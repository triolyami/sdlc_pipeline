"""Layer 3 — adapter contract.

Every stage type conforms to: run(ctx) -> StageResult. The engine knows
nothing about how a stage executes; adapters know nothing about the graph.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable


@dataclass
class StageCtx:
    repo_root: Path
    workspace: Path        # agents' cwd — the site project
    run_dir: Path          # per-run artifacts dir
    run_id: str
    task: str
    stage: object          # definition.Stage
    feedback: str | None   # findings from a previous reject/fail
    round: int             # how many times this stage ran this run
    auto_yes: bool

    @property
    def artifacts_dir(self) -> Path:
        """Agent-facing artifacts dir — inside the workspace, since agents
        sandboxed to cwd can't touch run_dir without permission prompts."""
        return self.workspace / ".pipeline"


@dataclass
class StageResult:
    status: str            # done | ok | fail | approve | reject
    output: str = ""       # output tail, for the event log
    feedback: str = ""     # forwarded to the looped-back stage


Adapter = Callable[[StageCtx], StageResult]


def tail(s: str, n: int = 4000) -> str:
    return s if len(s) <= n else "…" + s[-n:]
