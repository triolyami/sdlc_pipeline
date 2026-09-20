import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import PipelineGraph from "./components/PipelineGraph.jsx";
import Composer from "./components/Composer.jsx";
import RunList from "./components/RunList.jsx";
import EventLog from "./components/EventLog.jsx";
import ApprovalCard from "./components/ApprovalCard.jsx";
import {
  FlowArrow, ArrowClockwise, Octagon, WarningCircle,
} from "@phosphor-icons/react";

const PILL = {
  running:     "text-[var(--color-accent)] border-[var(--color-accent)]/40",
  waiting:     "text-[var(--color-wait)] border-[var(--color-wait)]/40",
  completed:   "text-[var(--color-ok)] border-[var(--color-ok)]/40",
  failed:      "text-[var(--color-bad)] border-[var(--color-bad)]/40",
  aborted:     "text-[var(--color-mut)] border-[var(--color-line2)]",
  interrupted: "text-[var(--color-mut)] border-[var(--color-line2)]",
};

export default function App() {
  const [pipeline, setPipeline] = useState(null);
  const [runs, setRuns] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.pipeline().then(setPipeline).catch((e) => setErr(e.message));
  }, []);

  const refreshRuns = useCallback(() => {
    api.runs().then((r) => setRuns(r.runs)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshRuns();
    const t = setInterval(refreshRuns, 4000);
    return () => clearInterval(t);
  }, [refreshRuns]);

  useEffect(() => {
    if (!sel && runs.length) setSel(runs[0].id);
  }, [runs, sel]);

  useEffect(() => {
    setDetail(null);
    if (!sel) return;
    let dead = false;
    const same = (a, b) =>
      a && b &&
      a.status === b.status && a.outcome === b.outcome && a.alive === b.alive &&
      a.current === b.current && a.awaiting?.stage === b.awaiting?.stage &&
      a.events.length === b.events.length &&
      JSON.stringify(a.stages) === JSON.stringify(b.stages);
    const tick = () =>
      api.runEvents(sel)
        .then((d) => !dead && setDetail((prev) => (same(prev, d) ? prev : d)))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 900);
    return () => { dead = true; clearInterval(t); };
  }, [sel]);

  const startRun = async (task, mock, workspace) => {
    setStarting(true);
    try {
      const { run_id } = await api.startRun(task, mock, workspace);
      setSel(run_id);
      refreshRuns();
    } catch (e) { setErr(e.message); }
    finally { setStarting(false); }
  };

  const act = (fn) => async (...a) => {
    try { await fn(sel, ...a); refreshRuns(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-[var(--color-line)] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            <FlowArrow size={15} weight="bold" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">pipe</span>
          {pipeline && (
            <span className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--color-mut)]">
              {pipeline.name}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {detail && (
            <>
              <span className="hidden font-mono text-[10.5px] text-[var(--color-dim)] md:block">
                {sel}
              </span>
              <span className={`rounded-md border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider ${PILL[detail.status] || PILL.interrupted}`}>
                {detail.status}
              </span>
              {detail.status === "interrupted" && (
                <button
                  onClick={act(api.resume)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line2)] px-2.5 py-1 text-[12px] text-[var(--color-mut)] transition hover:text-[var(--color-fg)] active:translate-y-[1px]"
                >
                  <ArrowClockwise size={13} /> Resume
                </button>
              )}
              {(detail.alive || detail.status === "running" || detail.status === "waiting") && (
                <button
                  onClick={act(api.stop)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-bad)]/40 px-2.5 py-1 text-[12px] text-[var(--color-bad)] transition hover:bg-[var(--color-bad)]/10 active:translate-y-[1px]"
                >
                  <Octagon size={13} weight="fill" /> Stop
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-[45vh] flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {pipeline ? (
              <PipelineGraph pipeline={pipeline} run={detail} />
            ) : (
              <div className="grid h-full place-items-center font-mono text-[11px] text-[var(--color-dim)]">
                loading pipeline…
              </div>
            )}

            {err && (
              <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--color-bad)]/40 bg-[var(--color-panel)] px-3 py-1.5 text-[12px] text-[var(--color-bad)]">
                <WarningCircle size={14} /> {err}
                <button onClick={() => setErr(null)} className="ml-1 text-[var(--color-dim)] hover:text-[var(--color-fg)]">✕</button>
              </div>
            )}

            <div className="pointer-events-none absolute right-4 top-4 z-10 flex justify-end">
              <ApprovalCard
                awaiting={detail?.status === "waiting" ? detail.awaiting : null}
                onDecide={act(api.approval)}
              />
            </div>
          </div>

          <Composer onRun={startRun} busy={starting} />
        </section>

        <aside className="flex min-h-[40vh] w-full shrink-0 flex-col border-t border-[var(--color-line)] bg-[var(--color-panel)]/40 lg:w-[370px] lg:border-l lg:border-t-0">
          <RunList runs={runs} selected={sel} onSelect={setSel} />
          <EventLog run={sel ? { id: sel } : null} events={detail?.events || []} />
        </aside>
      </main>
    </div>
  );
}
