#!/usr/bin/env python3
"""Local deploy — no agent, no external deps.

1. Mirror <workspace> -> deployed/ (excluding .pipeline artifacts)
2. Ensure a persistent static server is up on the deploy port:
   - already serving our content   -> reuse it
   - held by a leftover http.server -> kill it, take the port
   - held by anything else          -> next free port (never kill
                                     someone else's service)
3. Print the URL — lands in the stage output, shown by the dashboard

Usage: deploy_site.py <workspace> [port]
"""
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEPLOYED = REPO_ROOT / "deployed"
PIDFILE = REPO_ROOT / "runs" / "deploy-server.json"


def fetch(port: int) -> bytes | None:
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1).read()
    except Exception:
        return None


def owner_pid(port: int) -> int | None:
    out = subprocess.run(["ss", "-tlnpH", f"sport = :{port}"],
                         capture_output=True, text=True).stdout
    m = re.search(r"pid=(\d+)", out)
    return int(m.group(1)) if m else None


def is_http_server(pid: int) -> bool:
    try:
        cmdline = Path(f"/proc/{pid}/cmdline").read_bytes().decode(errors="replace")
    except OSError:
        return False
    return "http.server" in cmdline


def free(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        try:
            return s.connect_ex(("127.0.0.1", port)) != 0
        except OSError:
            return False            # connect timed out — something's there


def spawn(port: int) -> None:
    log = open(REPO_ROOT / "runs" / "deploy-server.log", "ab")
    p = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1",
         "--directory", str(DEPLOYED)],
        stdin=subprocess.DEVNULL, stdout=log, stderr=log,
        start_new_session=True,          # outlive the pipeline process
    )
    PIDFILE.write_text(json.dumps({"pid": p.pid, "port": port}))
    for _ in range(50):
        if fetch(port) is not None:
            return
        time.sleep(0.1)
    raise SystemExit(f"server failed to start on :{port}")


def ensure_server(port: int) -> int:
    index = DEPLOYED / "index.html"
    if index.is_file() and fetch(port) == index.read_bytes():
        print(f":{port} already serving this site — reusing")
        return port
    pid = owner_pid(port)
    if pid is None:                     # port free
        spawn(port)
        return port
    if is_http_server(pid):             # leftover static server — take the port
        print(f":{port} held by stale http.server (pid {pid}) — replacing")
        os.kill(pid, signal.SIGTERM)
        for _ in range(30):
            if free(port):
                break
            time.sleep(0.1)
        spawn(port)
        return port
    print(f":{port} held by another service (pid {pid}) — not touching it")
    while not free(port):
        port += 1
    spawn(port)
    return port


def main() -> int:
    workspace = Path(sys.argv[1])
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

    DEPLOYED.mkdir(exist_ok=True)
    for f in DEPLOYED.iterdir():        # mirror: clear stale files
        if f.is_dir():
            shutil.rmtree(f)
        else:
            f.unlink()
    shutil.copytree(workspace, DEPLOYED, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns(".pipeline"))
    print(f"synced {workspace} -> {DEPLOYED}")

    port = ensure_server(port)
    print(f"DEPLOYED AT: http://localhost:{port}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
