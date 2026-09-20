import { useEffect, useRef, useState } from "react";
import { Terminal, CaretRight } from "@phosphor-icons/react";

const STATUS_C = {
  done: "text-[var(--color-ok)]",
  ok: "text-[var(--color-ok)]",
  approve: "text-[var(--color-ok)]",
  approved: "text-[var(--color-ok)]",
  completed: "text-[var(--color-ok)]",
  fail: "text-[var(--color-bad)]",
  failed: "text-[var(--color-bad)]",
  reject: "text-[var(--color-bad)]",
  rejected: "text-[var(--color-bad)]",
  aborted: "text-[var(--color-mut)]",
};

function line(e) {
  switch (e.type) {
    case "run_started":
      return [`run ${e.resumed ? "resumed" : "started"}`, e.task, "text-[var(--color-fg)]"];
    case "stage_started":
      return [`${e.stage} started`, `${e.adapter}${e.round ? ` · round ${e.round + 1}` : ""}`, "text-[var(--color-accent)]"];
    case "stage_finished":
      return [`${e.stage} → ${e.status}`, "", STATUS_C[e.status] || ""];
    case "transition":
      return [`${e.stage} ──${e.status}──▶ ${e.to}`, "", "text-[var(--color-mut)]"];
    case "approval_requested":
      return [`${e.stage} is waiting for approval`, "", "text-[var(--color-wait)]"];
    case "approval_resolved":
      return [`gate ${e.decision}${e.comment ? ` — ${e.comment}` : ""}`, "",
              e.decision === "approve" ? "text-[var(--color-ok)]" : "text-[var(--color-bad)]"];
    case "run_finished":
      return [`run ${e.outcome}`, "", STATUS_C[e.outcome] || "text-[var(--color-mut)]"];
    case "run_failed":
      return [`run failed`, e.detail, "text-[var(--color-bad)]"];
    default:
      return [e.type, "", "text-[var(--color-mut)]"];
  }
}

export default function EventLog({ run, events }) {
  const box = useRef(null);
  const stick = useRef(true);
  const [open, setOpen] = useState(new Set());

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const toggle = (i) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--color-line)]">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Terminal size={13} className="text-[var(--color-dim)]" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-dim)]">
          event log
        </span>
        {run && (
          <span className="ml-auto truncate font-mono text-[10px] text-[var(--color-dim)]">
            {run.id}
          </span>
        )}
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 font-mono text-[11px] leading-[1.7]"
      >
        {!run && (
          <p className="px-1 py-4 font-sans text-[12.5px] text-[var(--color-dim)]">
            Select a run to inspect its event stream.
          </p>
        )}
        {events.map((e, i) => {
          const [head, tail, cls] = line(e);
          const detail = e.output || e.feedback || e.detail;
          const t = new Date(e.ts * 1000).toLocaleTimeString([], { hour12: false });
          return (
            <div key={i}>
              <button
                onClick={() => detail && toggle(i)}
                className={`flex w-full items-baseline gap-2 rounded px-1 text-left ${detail ? "cursor-pointer hover:bg-[var(--color-panel2)]" : "cursor-default"}`}
              >
                <span className="shrink-0 text-[var(--color-dim)]">{t}</span>
                <CaretRight
                  size={9}
                  className={`shrink-0 self-center text-[var(--color-dim)] transition-transform ${detail ? "" : "invisible"} ${open.has(i) ? "rotate-90" : ""}`}
                />
                <span className={`min-w-0 break-words ${cls}`}>
                  {head}
                  {tail && <span className="text-[var(--color-dim)]"> · {tail}</span>}
                </span>
              </button>
              {open.has(i) && detail && (
                <pre className="mt-0.5 mb-1.5 ml-14 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--color-line)] bg-[var(--color-panel2)] p-2 text-[10.5px] leading-relaxed text-[var(--color-mut)]">
                  {detail}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
