"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { lineDiff, wordDiff, type DiffOp } from "./diff";
import {
  hostReviewSession,
  type ItemDecision,
  type ReviewSession,
  type ReviewSnapshot,
} from "./session";

function opClass(type: DiffOp["type"]): string {
  if (type === "add") return "bg-emerald-50 text-emerald-900";
  if (type === "remove") return "bg-rose-50 text-rose-900";
  return "text-stone-600";
}

function DiffLines({ before, after }: { before: string; after: string }) {
  const ops = lineDiff(before, after);
  return (
    <pre data-agent-review-diff="lines" className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed">
      {ops.map((op, index) => (
        <span key={`${op.type}-${index}`} data-diff-op={op.type} className={`block ${opClass(op.type)}`}>
          {op.type === "add" ? "+" : op.type === "remove" ? "-" : " "}
          {op.text}
        </span>
      ))}
    </pre>
  );
}

export function ReviewPanelView({
  snap,
  onAcceptItem,
  onRejectItem,
  onAccept,
  onReject,
  onRollback,
  busy,
  labels,
}: {
  snap: ReviewSnapshot;
  onAcceptItem: (id: string) => void;
  onRejectItem: (id: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRollback: () => void;
  busy: boolean;
  labels: {
    title: string;
    accept: string;
    reject: string;
    rollback: string;
    stale: string;
    empty: string;
    itemAccept: string;
    itemReject: string;
  };
}) {
  if (snap.status === "idle" || !snap.parked) {
    if (snap.history.length === 0) return null;
    return (
      <div
        data-agent-review
        data-agent-review-status="applied"
        className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[13px] text-stone-600"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-stone-800">{labels.title}</p>
          <button
            type="button"
            data-agent-review-action="rollback"
            disabled={busy || snap.history.length === 0}
            onClick={onRollback}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-50 disabled:opacity-60"
          >
            {labels.rollback}
          </button>
        </div>
      </div>
    );
  }

  const proposal = snap.parked.proposal;
  const isText = typeof proposal.diff === "string";
  const objects = proposal.objects || [];

  return (
    <div
      data-agent-review
      data-agent-review-status={snap.status}
      data-proposal-id={proposal.proposalId}
      className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2.5 text-[13px] text-stone-700"
    >
      <p className="font-medium text-indigo-950">{labels.title}</p>
      <p className="mt-1 text-stone-600">
        {proposal.summary.before} → {proposal.summary.after}
      </p>
      {snap.status === "stale" && (
        <p data-agent-review-stale className="mt-1 text-rose-700">
          {snap.staleReason || labels.stale}
        </p>
      )}
      {isText ? (
        <div className="mt-2 rounded-lg bg-white/80 p-2">
          <DiffLines before={proposal.summary.before} after={proposal.summary.after} />
          {wordDiff(proposal.summary.before, proposal.summary.after).length > 0 ? (
            <p className="sr-only" data-agent-review-diff="words">
              {proposal.diff}
            </p>
          ) : null}
        </div>
      ) : (
        <ul data-agent-review-objects className="mt-2 space-y-1.5">
          {objects.map((item) => {
            const decision = snap.itemDecisions[item.id] || "pending";
            return (
              <li
                key={item.id}
                data-review-object={item.id}
                data-review-op={item.op}
                data-review-decision={decision}
                className="rounded-lg bg-white/80 px-2 py-1.5"
              >
                <p className="font-medium text-stone-800">
                  {item.label}（{item.op}）
                </p>
                <p className="text-[12px] text-stone-500">
                  {item.before || "—"} → {item.after || "—"}
                </p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    data-agent-review-item="accept"
                    disabled={busy || snap.status !== "open"}
                    onClick={() => onAcceptItem(item.id)}
                    className="rounded-md border border-emerald-300 px-2 py-1 text-[12px] text-emerald-800 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-emerald-50 disabled:opacity-60"
                  >
                    {labels.itemAccept}
                  </button>
                  <button
                    type="button"
                    data-agent-review-item="reject"
                    disabled={busy || snap.status !== "open"}
                    onClick={() => onRejectItem(item.id)}
                    className="rounded-md border border-rose-300 px-2 py-1 text-[12px] text-rose-800 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-rose-50 disabled:opacity-60"
                  >
                    {labels.itemReject}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-agent-review-action="accept"
          disabled={busy || snap.status !== "open"}
          onClick={onAccept}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-indigo-700 disabled:opacity-60"
        >
          {labels.accept}
        </button>
        <button
          type="button"
          data-agent-review-action="reject"
          disabled={busy || snap.status !== "open"}
          onClick={onReject}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-white disabled:opacity-60"
        >
          {labels.reject}
        </button>
        <button
          type="button"
          data-agent-review-action="rollback"
          disabled={busy || snap.history.length === 0}
          onClick={onRollback}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-white disabled:opacity-60"
        >
          {labels.rollback}
        </button>
      </div>
    </div>
  );
}

export function AgentReviewPanel({
  session = hostReviewSession,
  busy = false,
  onAccept,
  onReject,
  onRollback,
}: {
  session?: ReviewSession;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onRollback: () => void;
}) {
  const tt = useUI();
  const [snap, setSnap] = useState<ReviewSnapshot>(() => session.snapshot());
  useEffect(() => session.subscribe(() => setSnap(session.snapshot())), [session]);

  const decide = (id: string, decision: ItemDecision) => {
    session.decideItem(id, decision);
  };

  return (
    <ReviewPanelView
      snap={snap}
      busy={busy}
      onAcceptItem={(id) => decide(id, "accept")}
      onRejectItem={(id) => decide(id, "reject")}
      onAccept={() => {
        session.acceptAll();
        onAccept();
      }}
      onReject={() => {
        session.rejectAll();
        onReject();
      }}
      onRollback={onRollback}
      labels={{
        title: tt("审阅改动"),
        accept: tt("接受"),
        reject: tt("拒绝"),
        rollback: tt("回滚到上一版"),
        stale: tt("文档已经变了，这条改动不能接受。"),
        empty: tt("没有待审阅的改动。"),
        itemAccept: tt("接受这条"),
        itemReject: tt("拒绝这条"),
      }}
    />
  );
}
