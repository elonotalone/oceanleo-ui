"use client";

import { useRef, useState } from "react";
import { officialNotificationPermission, sendOfficialNotification } from "../../../api/notifications";
import { useUI } from "../../../i18n/ui/useUI";
import { noticesChanged, useNoticeResource } from "./use-notice-resource";

export function OfficialNoticeForm({ onSent }: { onSent: () => void }) {
  const tt = useUI();
  const permission = useNoticeResource(true, officialNotificationPermission);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const sending = useRef(false);
  if (permission?.data?.can_send !== true) return null;
  return (
    <form data-official-compose className="flex flex-col gap-2 border-b border-stone-200 p-3"
      onSubmit={async event => {
        event.preventDefault();
        if (sending.current || !title.trim() || !body.trim()) return;
        sending.current = true;
        setPhase("sending");
        let ok = false;
        try {
          const result = await sendOfficialNotification({ title: title.trim(), body: body.trim(), ...(link.trim() ? { link: link.trim() } : {}) });
          ok = result.ok;
        } catch { /* Keep the draft and show the failed state. */ }
        sending.current = false;
        setPhase(ok ? "sent" : "error");
        if (ok) { setTitle(""); setBody(""); setLink(""); noticesChanged(); onSent(); }
      }}>
      <p className="text-sm font-semibold">{tt("发布官方通知")}</p>
      <label className="text-sm">{tt("标题")}<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} disabled={phase === "sending"}
        className="block w-full rounded-lg border border-stone-200 bg-transparent px-3 py-2" name="title" /></label>
      <label className="text-sm">{tt("正文")}<textarea required maxLength={2000} value={body} onChange={event => setBody(event.target.value)} disabled={phase === "sending"}
        className="block w-full rounded-lg border border-stone-200 bg-transparent px-3 py-2" name="body" /></label>
      <label className="text-sm">{tt("链接（可选）")}<input maxLength={1024} value={link} onChange={event => setLink(event.target.value)} disabled={phase === "sending"}
        className="block w-full rounded-lg border border-stone-200 bg-transparent px-3 py-2" name="link" /></label>
      <button type="submit" disabled={phase === "sending" || !title.trim() || !body.trim()} className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        {tt(phase === "sending" ? "正在发布…" : "发布通知")}
      </button>
      {phase === "error" ? <p role="alert" className="text-sm">{tt("通知未发布，草稿已保留")}</p> : null}
      {phase === "sent" ? <p role="status" className="text-sm">{tt("通知已发布")}</p> : null}
    </form>
  );
}
