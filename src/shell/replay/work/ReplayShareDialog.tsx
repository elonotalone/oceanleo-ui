"use client";

// 分享一段回放：发进某个会话（只有会话成员能看）、或剪辑确认后生成公开链接（契约 §7.1 / §9.12）。
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { imFetch } from "../../../lib/im/client";
import type { ImConversationSummary, ImPage } from "../../../lib/im/types";
import {
  createWorkReplayLink,
  revokeWorkReplayLink,
  shareWorkReplay,
  type PatchWorkReplayInput,
  type WorkReplay,
} from "./replay-work-api";
import { ReplayTrimEditor } from "./ReplayTrimEditor";

export interface ReplayShareDialogProps {
  data: WorkReplay;
  onClose: () => void;
  /** 剪辑/链接改变了回放：交回新的数据（播放器据此刷新）。 */
  onPatch: (patch: PatchWorkReplayInput) => Promise<WorkReplay | null>;
  onRefresh?: () => void;
}

type Tab = "conversation" | "link";

export function ReplayShareDialog({ data, onClose, onPatch, onRefresh }: ReplayShareDialogProps) {
  const tt = useUI();
  const [tab, setTab] = useState<Tab>("conversation");
  const [conversations, setConversations] = useState<ImConversationSummary[] | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(data.replay.share_url);
  const [confirmed, setConfirmed] = useState(Boolean(data.replay.trim?.confirmed));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    imFetch<ImPage<ImConversationSummary>>("/v1/im/conversations?filter=all")
      .then((page) => {
        if (active) setConversations(page.items.filter((item) => !item.dissolved && item.kind !== "talent"));
      })
      .catch(() => {
        if (active) setConversations([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const shareTo = async (conversationId: string) => {
    setBusy(true);
    setError(null);
    const result = await shareWorkReplay(data.replay.id, { conversation_id: conversationId });
    setBusy(false);
    if (result.ok) {
      setSent((current) => [...current, conversationId]);
      onRefresh?.();
    } else {
      setError(result.error || tt("没有发出去，请再试一次。"));
    }
  };

  const makeLink = async () => {
    setBusy(true);
    setError(null);
    const result = await createWorkReplayLink(data.replay.id);
    setBusy(false);
    if (result.ok && result.data) {
      setLink(result.data.share_url);
      onRefresh?.();
    } else {
      setError(result.error || tt("没有生成成功，请再试一次。"));
    }
  };

  const revoke = async () => {
    setBusy(true);
    const result = await revokeWorkReplayLink(data.replay.id);
    setBusy(false);
    if (result.ok) {
      setLink(null);
      onRefresh?.();
    } else {
      setError(result.error || tt("没有撤销成功，请再试一次。"));
    }
  };

  const copy = () => {
    if (link && typeof navigator !== "undefined") void navigator.clipboard?.writeText(link);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tt("分享回放")}
      data-replay-share
      className="fixed inset-0 z-[2147483100] flex items-center justify-center bg-black/30 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-medium text-neutral-900">{tt("分享回放")}</h3>
          <button type="button" onClick={onClose} className="text-[12px] text-stone-500 hover:text-neutral-900">
            {tt("关闭")}
          </button>
        </div>
        <div className="mb-3 flex gap-1" role="tablist">
          {(["conversation", "link"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              data-replay-share-tab={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1 text-[13px] ${tab === key ? "bg-neutral-900 text-white" : "text-stone-500 hover:bg-stone-100"}`}
            >
              {key === "conversation" ? tt("发到会话") : tt("公开链接")}
            </button>
          ))}
        </div>

        {tab === "conversation" ? (
          <div className="space-y-2">
            <p className="text-[12px] text-stone-500">{tt("只有这个会话的成员能看到这段回放。")}</p>
            {conversations === null ? <p className="text-[12px] text-stone-400">{tt("正在加载…")}</p> : null}
            {conversations !== null && conversations.length === 0 ? (
              <p className="text-[12px] text-stone-400">{tt("还没有可以发的会话。")}</p>
            ) : null}
            <ul className="max-h-64 space-y-1 overflow-auto">
              {(conversations ?? []).map((conversation) => (
                <li key={conversation.id} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-neutral-900">
                    {conversation.title || conversation.peer?.display_name || ""}
                  </span>
                  <button
                    type="button"
                    disabled={busy || sent.includes(conversation.id)}
                    data-replay-share-send={conversation.id}
                    onClick={() => void shareTo(conversation.id)}
                    className="rounded-md bg-neutral-900 px-2.5 py-1 text-[12px] text-white hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {sent.includes(conversation.id) ? tt("已发送") : tt("发送")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            {!confirmed ? (
              <ReplayTrimEditor
                data={data}
                onApply={async (patch) => {
                  const next = await onPatch(patch);
                  if (next?.replay.trim?.confirmed) {
                    setConfirmed(true);
                    return true;
                  }
                  return false;
                }}
              />
            ) : link ? (
              <div className="space-y-2">
                <p className="text-[12px] text-stone-500">{tt("拿到链接的人不用登录就能看到你剪辑过的这一段。")}</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    data-replay-share-link
                    value={link}
                    className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-[12px] text-neutral-900"
                  />
                  <button type="button" onClick={copy} className="rounded-lg border border-stone-300 px-3 py-1.5 text-[12px] hover:bg-stone-50">
                    {tt("复制")}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  data-replay-share-revoke
                  onClick={() => void revoke()}
                  className="text-[12px] text-rose-600 hover:underline"
                >
                  {tt("撤销链接")}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-stone-500">{tt("范围已确认，可以生成公开链接了。")}</p>
                <button
                  type="button"
                  disabled={busy}
                  data-replay-share-make-link
                  onClick={() => void makeLink()}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  {tt("生成公开链接")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmed(false)}
                  className="ml-2 text-[12px] text-stone-500 hover:underline"
                >
                  {tt("重新剪辑")}
                </button>
              </div>
            )}
          </div>
        )}
        {error ? <p className="mt-3 text-[12px] text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
}
