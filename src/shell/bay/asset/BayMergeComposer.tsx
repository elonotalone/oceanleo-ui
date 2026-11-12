"use client";

import { lazy, Suspense, useId, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { createTask } from "../../../lib/agent";
import { Modal } from "../../../ui";
const LeoComposer = lazy(() => import("../../LeoComposer").then((m) => ({ default: m.LeoComposer })));

export function bayMergePrompt(tt: (key: string, vars?: Record<string, string | number>) => string, listingId: string, title: string, copyId: string, revisionId: string): string {
  return tt("请把 LeoBay 商品「{title}」（{listingId}）的新版本 {revisionId} 合并到我改过的库中副本 {copyId}。保留我的修改；遇到冲突先说明并让我决定。", { title, listingId, copyId, revisionId });
}

/** Opening this dialog only fills a draft. The user must press Send to create a task. */
export function BayMergeComposer({ listingId, title, copyId, revisionId, onClose }: {
  listingId: string; title: string; copyId: string; revisionId: string; onClose: () => void;
}) {
  const tt = useUI();
  const titleId = useId();
  const [value, setValue] = useState(() => bayMergePrompt(tt, listingId, title, copyId, revisionId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal onClose={onClose} className="max-w-2xl" labelledBy={titleId}>
    <div className="p-4" data-bay-merge-composer>
      <h2 id={titleId}>{tt("让 agent 合并到我改过的版本")}</h2>
      <Suspense fallback={null}><LeoComposer value={value} onChange={setValue} loading={busy} onSubmit={async (prompt, _payer, context) => {
        if (busy || !prompt?.trim()) return;
        setBusy(true); setError("");
        try {
          const result = await createTask({ prompt, mode: "agent", executionTarget: context?.executionTarget });
          if (!result.ok || !result.data?.task_id) throw new Error(result.error || tt("发送失败"));
          window.location.assign(`/tasks/${encodeURIComponent(result.data.task_id)}`);
        } catch (reason) { setError(reason instanceof Error ? reason.message : tt("发送失败")); }
        finally { setBusy(false); }
      }} /></Suspense>
      {error ? <p role="alert">{tt(error)}</p> : null}
    </div>
  </Modal>;
}
