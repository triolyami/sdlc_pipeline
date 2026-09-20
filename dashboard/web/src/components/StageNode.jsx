import { Handle, Position } from "@xyflow/react";
import {
  CheckCircle, XCircle, SpinnerGap, HandPalm, ArrowUUpLeft,
  Circle, Terminal, Robot, User, FlagCheckered,
} from "@phosphor-icons/react";

const ADAPTER_ICON = { shell: Terminal, human: User, opencode: Robot, devin: Robot, mock: Robot };

const STATE = {
  running:  { ring: "border-[var(--color-accent)]",  icon: SpinnerGap,       ic: "text-[var(--color-accent)] animate-spin [animation-duration:1.4s]", label: "running" },
  waiting:  { ring: "border-[var(--color-wait)]",    icon: HandPalm,         ic: "text-[var(--color-wait)]",   label: "awaiting approval" },
  done:     { ring: "border-[var(--color-ok)]/60",   icon: CheckCircle,      ic: "text-[var(--color-ok)]",     label: "done" },
  ok:       { ring: "border-[var(--color-ok)]/60",   icon: CheckCircle,      ic: "text-[var(--color-ok)]",     label: "ok" },
  approve:  { ring: "border-[var(--color-ok)]/60",   icon: CheckCircle,      ic: "text-[var(--color-ok)]",     label: "approved" },
  fail:     { ring: "border-[var(--color-bad)]/70",  icon: XCircle,          ic: "text-[var(--color-bad)]",    label: "failed" },
  reject:   { ring: "border-[var(--color-bad)]/70",  icon: ArrowUUpLeft,     ic: "text-[var(--color-bad)]",    label: "rejected" },
  idle:     { ring: "border-[var(--color-line)]",    icon: Circle,           ic: "text-[var(--color-dim)]",    label: "idle" },
};

export default function StageNode({ data }) {
  const st = STATE[data.state] || STATE.idle;
  const Icon = st.icon;
  const AdapterIcon = ADAPTER_ICON[data.adapter] || Robot;
  const live = data.state === "running" || data.state === "waiting";
  return (
    <div
      className={`w-[190px] rounded-xl border bg-[var(--color-panel)] px-3.5 py-3 transition-colors ${st.ring} ${live ? "pulse" : ""}`}
      style={{ "--pulse-c": data.state === "waiting" ? "var(--color-wait)" : "var(--color-accent)" }}
    >
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="target" position={Position.Top} id="tt" />
      <Handle type="source" position={Position.Top} id="st" />
      <Handle type="target" position={Position.Bottom} id="tb" />
      <Handle type="source" position={Position.Bottom} id="sb" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[15px] font-medium tracking-tight">{data.label}</span>
        <Icon size={16} weight="bold" className={st.ic} />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-line)] bg-[var(--color-panel2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-mut)]">
          <AdapterIcon size={11} /> {data.adapter}
        </span>
        {data.attempts > 1 && (
          <span className="font-mono text-[10px] text-[var(--color-wait)]">×{data.attempts}</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-dim)]">{st.label}</span>
      </div>
      <Handle type="source" position={Position.Right} id="r" />
    </div>
  );
}

export function EndNode({ data }) {
  const color =
    data.state === "completed" ? "var(--color-ok)" :
    data.state === "failed"    ? "var(--color-bad)" :
    "var(--color-dim)";
  return (
    <div
      className="flex h-[46px] w-[110px] items-center justify-center gap-1.5 rounded-full border font-mono text-[11px] uppercase tracking-[0.14em]"
      style={{ borderColor: color, color, background: "var(--color-panel)" }}
    >
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="target" position={Position.Top} id="tt" />
      <FlagCheckered size={13} weight="bold" />
      {data.label}
    </div>
  );
}
