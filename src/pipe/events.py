"""Layer 4 (minimal) — append-only event log.

events.jsonl IS the persisted pipeline state: resume replays it, the future
dashboard tails it, Langfuse will be a subscriber alongside it. The engine
never imports concrete sinks — it just calls emit().
"""
from __future__ import annotations

import json
import time
from pathlib import Path


class EventLog:
    def __init__(self, run_dir: Path):
        self.path = run_dir / "events.jsonl"
        self._f = open(self.path, "a", buffering=1)

    def emit(self, type: str, stage: str | None = None, **data):
        rec = {"ts": round(time.time(), 3), "type": type}
        if stage:
            rec["stage"] = stage
        rec.update(data)
        self._f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        # console visibility for v1
        extra = f" {data.get('status') or data.get('detail') or ''}".rstrip()
        print(f"[{type}]{f' {stage}' if stage else ''}{extra}")

    def close(self):
        self._f.close()


def replay(run_dir: Path) -> list[dict]:
    path = run_dir / "events.jsonl"
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
