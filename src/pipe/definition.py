"""Layer 1 — pipeline definition.

Loads pipeline.yaml into dataclasses. The definition is pure data: it
declares states, transitions, guards and limits. It contains zero logic
about how stages execute.
"""
from __future__ import annotations

import yaml
from dataclasses import dataclass, field
from pathlib import Path

END = "END"


@dataclass
class Stage:
    name: str
    adapter: str
    config: dict = field(default_factory=dict)
    on: dict = field(default_factory=dict)  # status -> next stage | "END"


@dataclass
class Pipeline:
    name: str
    start: str
    workspace: Path
    limits: dict
    stages: dict[str, Stage]


def load(repo_root: Path, path: Path | None = None) -> Pipeline:
    path = path or repo_root / "pipeline.yaml"
    raw = yaml.safe_load(path.read_text())

    stages = {}
    for name, s in (raw.get("stages") or {}).items():
        if "adapter" not in s:
            raise ValueError(f"stage {name!r}: missing 'adapter'")
        stages[name] = Stage(
            name=name,
            adapter=s["adapter"],
            config={k: v for k, v in s.items() if k not in ("adapter", "on")},
            on=s.get("on") or {},
        )

    start = raw.get("start")
    if start not in stages:
        raise ValueError(f"start stage {start!r} not defined")
    for st in stages.values():
        for status, nxt in st.on.items():
            if nxt != END and nxt not in stages:
                raise ValueError(
                    f"stage {st.name!r}: edge {status!r} -> unknown stage {nxt!r}")

    return Pipeline(
        name=raw.get("name", "pipeline"),
        start=start,
        workspace=(repo_root / raw.get("workspace", "site")).resolve(),
        limits=raw.get("limits") or {},
        stages=stages,
    )
