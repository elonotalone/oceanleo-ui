"use client";

// 输入框「+」→ 分享工作回放（W09 挂，契约 §8.2）：列出我的回放 + 新建，选中后把回放卡交给输入框。
// 传了 `conversationId` 时，选中会先给这个会话授权（`post_card: false`：卡片由输入框自己作为消息发出），
// 这样会话成员点开卡片才有权限看；没传就只回调，授权要由调用方负责。
import { useCallback, useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImCard } from "../../../lib/im/types";
import {
  createWorkReplay,
  listMyWorkReplays,
  replayCard,
  shareWorkReplay,
  type WorkReplaySummary,
} from "./replay-work-api";

export interface ReplayPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onPick: (card: ImCard) => void;
  /** 要发进的会话（可选，见文件头）。 */
  conversationId?: string | null;
}

export function ReplayPickerDialog({ open, onClose, onPick, conversationId }: ReplayPickerDialogProps) {
  const tt = useUI();
  const [items, setItems] = useState<WorkReplaySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setItems(null);
    setError(null);
    void listMyWorkReplays().then((result) => {
      if (active) setItems(result.ok && result.data ? result.data.items : []);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const pick = useCallback(
    async (summary: WorkReplaySummary) => {
      setBusy(true);
      setError(null);
      if (conversationId) {
        const shared = await shareWorkReplay(summary.id, { conversation_id: conversationId, post_card: false });
        if (!shared.ok) {
          setBusy(false);
          setError(
            shared.status === 409
              ? tt("这段回放还不能分享：项目成员还没都同意。")
              : tt("没有分享成功，请再试一次。"),
          );
          return;
        }
      }
      setBusy(false);
      onPick(replayCard(summary));
      onClose();
    },
    [conversationId, onClose, onPick, tt],
  );

  const createNew = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await createWorkReplay({ scope: "personal" });
    setBusy(false);
    if (result.ok && result.data) {
      await pick({
        id: result.data.replay.id,
        title: result.data.replay.title,
        scope: result.data.replay.scope,
        visibility: result.data.replay.visibility,
        sources: result.data.sources.map((source) => ({ key: source.key, editor_kind: source.editor_kind, title: source.title })),
        range_from: null,
        range_to: null,
        created_at: result.data.replay.created_at,
      });
    } else if (result.status === 422) {
      setError(tt("最近 7 天里没有找到可以回放的工作。"));
    } else {
      setError(tt("没有生成成功，请再试一次。"));
    }
  }, [pick, tt]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tt("分享工作回放")}
      data-replay-picker
      className="fixed inset-0 z-[2147483100] flex items-center justify-center bg-black/30 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-medium text-neutral-900">{tt("分享工作回放")}</h3>
          <button type="button" onClick={onClose} className="text-[12px] text-stone-500 hover:text-neutral-900">
            {tt("关闭")}
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          data-replay-picker-new
          onClick={() => void createNew()}
          className="mb-3 w-full rounded-lg border border-dashed border-stone-300 px-3 py-2 text-[13px] text-neutral-900 hover:bg-stone-50 disabled:opacity-50"
        >
          {tt("用我最近 7 天的工作生成新回放")}
        </button>
        {items === null ? <p className="text-[12px] text-stone-400">{tt("正在加载…")}</p> : null}
        {items !== null && items.length === 0 ? <p className="text-[12px] text-stone-400">{tt("你还没有生成过回放。")}</p> : null}
        <ul className="max-h-72 space-y-1 overflow-auto">
          {(items ?? []).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                data-replay-picker-item={item.id}
                onClick={() => void pick(item)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-stone-100 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate text-neutral-900">{item.title || tt("工作回放")}</span>
                <span className="shrink-0 text-[11px] text-stone-400">
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error ? <p className="mt-3 text-[12px] text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
}
