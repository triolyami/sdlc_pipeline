import { Scroll } from "@phosphor-icons/react";

const DOT = {
  running: "bg-[var(--color-accent)]",
  waiting: "bg-[var(--color-wait)]",
  completed: "bg-[var(--color-ok)]",
  failed: "bg-[var(--color-bad)]",
  aborted: "bg-[var(--color-dim)]",
  interrupted: "bg-[var(--color-dim)]",
};

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function RunList({ runs, selected, onSelect }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <Scroll size={13} className="text-[var(--color-dim)]" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-dim)]">
          runs
        </span>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-dim)]">{runs.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {runs.length === 0 && (
          <p className="px-2 py-6 text-[12.5px] leading-relaxed text-[var(--color-dim)]">
            No runs yet. Describe a task below and hit Run.
          </p>
        )}
        {runs.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
              selected === r.id ? "bg-[var(--color-panel2)]" : "hover:bg-[var(--color-panel2)]/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[r.status] || DOT.interrupted} ${
                  r.status === "running" || r.status === "waiting" ? "pulse" : ""
                }`}
                style={{
                  "--pulse-c":
                    r.status === "waiting" ? "var(--color-wait)" : "var(--color-accent)",
                }}
              />
              <span className="truncate font-mono text-[10.5px] text-[var(--color-dim)]">
                {r.id.slice(9)}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--color-dim)]">
                {fmtTime(r.ts)}
              </span>
            </span>
            <span className="mt-0.5 block truncate pl-3.5 text-[12.5px] text-[var(--color-mut)]">
              {r.task || "—"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
