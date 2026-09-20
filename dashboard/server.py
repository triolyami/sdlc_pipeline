"""Dashboard server — stdlib-only HTTP API + static host for the web UI.

Routes:
  GET  /api/pipeline              parsed pipeline.yaml (stages, edges, limits)
  GET  /api/runs                  run list with derived state
  POST /api/runs                  {task, mock?} -> spawn `./pipe run`
  GET  /api/runs/<id>/events      {events, state} — poll-friendly (after=<n>)
  POST /api/runs/<id>/approval    {decision, comment?} -> writes approval.json
  POST /api/runs/<id>/resume      resume an interrupted run
  POST /api/runs/<id>/stop        SIGTERM the runner (run stays resumable)
  GET  /*                         dashboard/web/dist static files

Run from anywhere:  python3 dashboard/server.py [--port 7890]
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

REPO_ROOT = Path(__file__).resolve().parents[1]
DIST = Path(__file__).resolve().parent / "web" / "dist"
RUNS = REPO_ROOT / "runs"

sys.path.insert(0, str(REPO_ROOT / "src"))
from pipe import definition, events  # noqa: E402

PROCS: dict[str, subprocess.Popen] = {}
PROCS_LOCK = threading.Lock()


# ---------- run state derivation ----------

def derive_state(run_dir: Path) -> dict:
    """Fold events.jsonl into per-stage status + run-level status."""
    evts = events.replay(run_dir)
    stages: dict[str, dict] = {}
    current = None
    awaiting = None
    outcome = None
    for e in evts:
        t = e["type"]
        if t == "stage_started":
            current = e["stage"]
            stages[e["stage"]] = {"status": "running", "round": e.get("round", 0)}
        elif t == "stage_finished":
            stages[e["stage"]] = {"status": e["status"], "round": None}
            current = None
        elif t == "approval_requested":
            awaiting = {"stage": e["stage"], "task": e.get("task")}
        elif t == "approval_resolved":
            awaiting = None
        elif t == "run_finished":
            outcome = e.get("outcome")
            current = None
        elif t == "run_failed":
            outcome = "failed"
            current = None
    proc = PROCS.get(run_dir.name)
    alive = bool(proc and proc.poll() is None)
    if outcome:
        status = outcome
    elif alive:
        status = "waiting" if awaiting else "running"
    else:
        # runner is dead but left no run_finished/run_failed — covers dying
        # mid-stage (stage_started), at the gate (approval_requested) and
        # between engine writes. Resumable via `pipe run --resume`.
        status = "interrupted"
    return {
        "events": evts,
        "stages": stages,
        "current": current,
        "awaiting": awaiting,
        "outcome": outcome,
        "status": status,
        "alive": alive,
    }


def run_summary(run_dir: Path) -> dict:
    st = derive_state(run_dir)
    task = ""
    tpath = run_dir / "task.txt"
    if tpath.exists():
        task = tpath.read_text().strip()
    last_ts = st["events"][-1]["ts"] if st["events"] else run_dir.stat().st_mtime
    return {
        "id": run_dir.name,
        "task": task,
        "status": st["status"],
        "awaiting": st["awaiting"],
        "current": st["current"],
        "ts": last_ts,
    }


def wait_for_new_run(before: set[str], timeout: float = 15.0) -> str | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        now = {d.name for d in RUNS.iterdir() if d.is_dir()} if RUNS.exists() else set()
        new = now - before
        if new:
            return sorted(new)[-1]
        time.sleep(0.1)
    return None


def spawn_run(task: str, mock: bool = False, resume: str | None = None,
              workspace: str | None = None) -> str | None:
    before = {d.name for d in RUNS.iterdir() if d.is_dir()} if RUNS.exists() else set()
    cmd = [str(REPO_ROOT / "pipe"), "run"]
    if resume:
        cmd += ["--resume", resume]
        run_id = resume
    else:
        if mock:
            cmd += ["--mock"]
        if workspace:
            cmd += ["--workspace", workspace]
        cmd += [task]
        run_id = None
    proc = subprocess.Popen(
        cmd, cwd=REPO_ROOT,
        stdin=subprocess.DEVNULL,       # non-tty -> human adapter uses file gate
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
        close_fds=True,
        start_new_session=True,         # own pgid so /stop can kill the
    )                                   # runner AND its in-flight agent child
    if resume:
        with PROCS_LOCK:
            PROCS[run_id] = proc
        return run_id
    run_id = wait_for_new_run(before)
    if run_id:
        with PROCS_LOCK:
            PROCS[run_id] = proc
    else:
        proc.kill()
    return run_id


# ---------- HTTP handler ----------

class Handler(BaseHTTPRequestHandler):
    server_version = "pipe-dashboard/1.0"

    def _json(self, code: int, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n))
        except ValueError:
            return {}

    def _static(self, path: str):
        rel = path.lstrip("/") or "index.html"
        f = (DIST / rel).resolve()
        if not str(f).startswith(str(DIST.resolve())) or not f.is_file():
            f = DIST / "index.html"          # SPA fallback
        if not f.is_file():
            self._json(503, {"error": "dashboard not built — run `npm run build` in dashboard/web"})
            return
        ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        body = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # -- routing --

    def do_GET(self):
        u = urlparse(self.path)
        p = u.path.rstrip("/") or "/"
        if p == "/api/pipeline":
            defn = definition.load(REPO_ROOT)
            return self._json(200, {
                "name": defn.name,
                "start": defn.start,
                "limits": defn.limits,
                "stages": {n: {"adapter": s.adapter, "on": s.on,
                               "config": {k: v for k, v in s.config.items()
                                          if k in ("prompt", "cmd", "verdict",
                                                   "then", "artifact")}}
                           for n, s in defn.stages.items()},
                "transitions": defn.transitions,
            })
        if p == "/api/runs":
            runs = sorted((d for d in RUNS.iterdir() if d.is_dir()),
                          reverse=True) if RUNS.exists() else []
            return self._json(200, {"runs": [run_summary(d) for d in runs]})
        if p.startswith("/api/runs/") and p.endswith("/events"):
            run_id = p.split("/")[3]
            run_dir = RUNS / run_id
            if not run_dir.is_dir():
                return self._json(404, {"error": "no such run"})
            st = derive_state(run_dir)
            q = parse_qs(u.query)
            after = int(q.get("after", ["0"])[0])
            st["events"] = st["events"][after:]
            st["total"] = len(events.replay(run_dir))
            return self._json(200, st)
        return self._static(u.path)

    def do_POST(self):
        u = urlparse(self.path)
        p = u.path.rstrip("/")
        parts = p.split("/")
        if p == "/api/runs":
            body = self._body()
            task = (body.get("task") or "").strip()
            if not task:
                return self._json(400, {"error": "task required"})
            ws = (body.get("workspace") or "").strip() or None
            run_id = spawn_run(task, mock=bool(body.get("mock")), workspace=ws)
            if not run_id:
                return self._json(500, {"error": "run failed to start"})
            return self._json(201, {"run_id": run_id})
        if len(parts) == 5 and parts[1] == "api" and parts[2] == "runs":
            run_id, action = parts[3], parts[4]
            run_dir = RUNS / run_id
            if not run_dir.is_dir():
                return self._json(404, {"error": "no such run"})
            if action == "approval":
                body = self._body()
                decision = (body.get("decision") or "").lower()
                if decision not in ("approve", "reject"):
                    return self._json(400, {"error": "decision must be approve|reject"})
                if not (run_dir / "approval_request.json").exists():
                    return self._json(409, {"error": "run is not waiting for approval"})
                payload = {"decision": decision,
                           "comment": str(body.get("comment") or "")}
                tmp = run_dir / "approval.json.tmp"
                tmp.write_text(json.dumps(payload))
                os.replace(tmp, run_dir / "approval.json")
                return self._json(200, {"ok": True})
            if action == "resume":
                st = derive_state(run_dir)
                if st["alive"]:
                    return self._json(409, {"error": "run is active"})
                if st["outcome"]:
                    return self._json(409, {"error": "run already finished"})
                return self._json(200, {"run_id": spawn_run("", resume=run_id)})
            if action == "stop":
                proc = PROCS.get(run_id)
                if not proc or proc.poll() is not None:
                    return self._json(409, {"error": "run is not active"})
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except (ProcessLookupError, PermissionError):
                    proc.terminate()
                return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[http] {fmt % args}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 7890)))
    ap.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    args = ap.parse_args()
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"dashboard on http://{args.host}:{args.port}  (dist: {DIST})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
