"""Layer 5 — CLI entry point. Thin shell, no logic."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import engine, events

REPO_ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    ap = argparse.ArgumentParser(prog="pipe",
                                 description="SDLC pipeline orchestrator")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="run the pipeline on a task")
    r.add_argument("task", nargs="?", default=None)
    r.add_argument("--mock", action="store_true",
                   help="swap agent CLIs for deterministic mock adapters")
    r.add_argument("--yes", action="store_true",
                   help="auto-approve the human gate (testing)")
    r.add_argument("--resume", metavar="RUN_ID",
                   help="resume an interrupted run")
    r.add_argument("--workspace", metavar="DIR",
                   help="override pipeline.yaml workspace for this run")

    sub.add_parser("list", help="list runs")
    s = sub.add_parser("show", help="dump a run's event log")
    s.add_argument("run_id")

    args = ap.parse_args()
    if args.cmd == "run":
        if not args.resume and not args.task:
            ap.error("task is required unless --resume is given")
        return engine.run(REPO_ROOT, args.task, run_id=args.resume,
                          auto_yes=args.yes, mock=args.mock,
                          workspace=args.workspace)
    if args.cmd == "list":
        runs = sorted((REPO_ROOT / "runs").iterdir()) if (REPO_ROOT / "runs").exists() else []
        for d in runs:
            evts = events.replay(d)
            last = evts[-1]["type"] if evts else "empty"
            task = (d / "task.txt").read_text().strip()[:50] if (d / "task.txt").exists() else ""
            print(f"{d.name}  {last:14}  {task}")
        return 0
    if args.cmd == "show":
        for e in events.replay(REPO_ROOT / "runs" / args.run_id):
            print(e)
        return 0
    return 2
