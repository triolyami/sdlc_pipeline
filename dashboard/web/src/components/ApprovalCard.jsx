import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HandPalm, Check, X } from "@phosphor-icons/react";

export default function ApprovalCard({ awaiting, onDecide }) {
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const decide = async (decision) => {
    setSending(true);
    try { await onDecide(decision, comment.trim()); }
    finally { setSending(false); setComment(""); }
  };

  return (
    <AnimatePresence>
      {awaiting && (
        <motion.div
          key={awaiting.stage}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="pointer-events-auto w-[min(440px,92%)] rounded-2xl border border-[var(--color-wait)]/40 bg-[var(--color-panel)] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        >
          <div className="flex items-center gap-2.5 px-4 pt-3.5">
            <span className="pulse rounded-full p-1.5 text-[var(--color-wait)]" style={{ "--pulse-c": "var(--color-wait)" }}>
              <HandPalm size={15} weight="bold" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium tracking-tight">
                Approval required at <span className="font-mono text-[var(--color-wait)]">{awaiting.stage}</span>
              </p>
              <p className="truncate text-[11.5px] text-[var(--color-mut)]">{awaiting.task}</p>
            </div>
          </div>
          <div className="px-4 pt-3">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Note or clarification for the pipeline (optional)"
              className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-panel2)] px-3 py-2 text-[12.5px] text-[var(--color-fg)] placeholder:text-[var(--color-dim)] focus:border-[var(--color-line2)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={() => decide("reject")}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-bad)]/40 px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-bad)] transition hover:bg-[var(--color-bad)]/10 active:translate-y-[1px] disabled:opacity-40"
            >
              <X size={13} weight="bold" /> Reject
            </button>
            <button
              onClick={() => decide("approve")}
              disabled={sending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-ok)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--color-ink)] transition hover:brightness-110 active:translate-y-[1px] disabled:opacity-40"
            >
              <Check size={13} weight="bold" /> Approve
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
