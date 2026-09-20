#!/usr/bin/env python3
"""Deterministic verification for the static site — no agent.

Checks (exit 1 on any FAIL):
  - index.html exists, non-empty, parses, has <html
  - every local src/href reference resolves to a file
  - no TODO/FIXME/XXX/PLACEHOLDER/lorem markers in text files
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REF_ATTRS = ("src", "href")
SKIP_SCHEMES = ("http:", "https:", "mailto:", "tel:", "data:", "#", "//")
MARKERS = re.compile(r"TODO|FIXME|XXX|PLACEHOLDER|lorem ipsum", re.I)


class RefParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for k, v in attrs:
            if k in REF_ATTRS and v:
                self.refs.append(v)


def main() -> int:
    site = Path(sys.argv[1] if len(sys.argv) > 1 else "site")
    failures = 0

    def check(ok, label):
        nonlocal failures
        print(f"{'PASS' if ok else 'FAIL'}  {label}")
        if not ok:
            failures += 1

    index = site / "index.html"
    check(index.is_file() and index.stat().st_size > 0,
          "index.html exists and is non-empty")
    if not index.is_file():
        print(f"FAIL  {index} missing — nothing else to check")
        return 1

    html = index.read_text()
    check("<html" in html.lower(), "index.html contains <html>")

    p = RefParser()
    p.feed(html)
    for ref in p.refs:
        if ref.startswith(SKIP_SCHEMES):
            continue
        target = (site / ref.split("#")[0].split("?")[0])
        check(target.exists(), f"reference resolves: {ref}")

    for f in site.rglob("*"):
        hidden = any(p.startswith(".") for p in f.relative_to(site).parts)
        if (f.is_file() and not hidden
                and f.suffix in (".html", ".css", ".js", ".md", ".txt")):
            m = MARKERS.search(f.read_text(errors="replace"))
            check(not m, f"no unfinished markers in {f.name}"
                  + (f" (found {m.group(0)!r})" if m else ""))

    print(f"\n{'PASS' if failures == 0 else 'FAIL'}: {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
