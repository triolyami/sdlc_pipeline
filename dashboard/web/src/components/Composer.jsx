import { useState } from "react";
import { Play, Flask, FolderOpen } from "@phosphor-icons/react";

export default function Composer({ onRun, busy }) {
  const [task, setTask] = useState("");
  const [mock, setMock] = useState(false);
  const [dir, setDir] = useState("../site");

  const submit = () => {
    const t = task.trim();
    if (!t || busy) return;
    onRun(t, mock, dir.trim() || "../site");
    setTask("");
  };

  return (
    <div className="shrink-0 border-t border-[var(--color-line)] px-3 py-3">
      <div className="mx-auto w-full max-w-2xl">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={2}
          placeholder="Describe a task for the pipeline…"
          className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-panel2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-dim)] focus:border-[var(--color-line2)] focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <label
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel2)] px-2 py-1 text-[var(--color-dim)] focus-within:border-[var(--color-line2)] focus-within:text-[var(--color-mut)]"
            title="Directory the agents build in — relative to sdlc_pipeline/ or absolute. Default ../site = /home/tolik/work/site. Deploy copies it into deployed/."
          >
            <FolderOpen size={12} />
            <input
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              spellCheck={false}
              placeholder="../site"
              className="w-24 bg-transparent font-mono text-[11px] text-[var(--color-fg)] placeholder:text-[var(--color-dim)] focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setMock((m) => !m)}
            title="pipe run --mock: swap devin/opencode for deterministic mock adapters"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10.5px] transition-colors ${
              mock
                ? "border-[var(--color-wait)]/50 text-[var(--color-wait)]"
                : "border-[var(--color-line)] text-[var(--color-dim)] hover:text-[var(--color-mut)]"
            }`}
          >
            <Flask size={12} weight={mock ? "fill" : "regular"} /> mock agents
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!task.trim() || busy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-fg)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-ink)] transition enabled:hover:bg-white enabled:active:translate-y-[1px] disabled:opacity-30"
          >
            <Play size={13} weight="fill" /> Run
          </button>
        </div>
      </div>
    </div>
  );
}
