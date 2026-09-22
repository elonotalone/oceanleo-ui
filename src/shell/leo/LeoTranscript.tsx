"use client";

// ============================================================================
// @oceanleo/ui — leo 对话记录（合同 §2.1：面板主体就是记录，紧凑态也显示）
// ----------------------------------------------------------------------------
// 记录存服务器（合同 I4），跨页面跨设备同一份；本地不再持久化。
//   · 打开面板 → leoTranscript(100)；entries 合并去重按 id；
//   · 未登录：显示「登录后 leo 才能记住对话」，动词（leo board）不受影响；
//   · leo 建了任务的那一句带任务卡片（标题 + 「打开任务」链接）；
//   · 「清空记录」走 DELETE，清不动就说清不动。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { currentDomainProfile } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import {
  leoClear,
  leoTranscript,
  type LeoApiError,
  type LeoTranscriptEntry,
} from "./leo-api";

export type LeoTranscriptStatus =
  | "idle"
  | "loading"
  | "ready"
  | "anonymous"
  | "error";

export interface LeoTranscriptState {
  entries: LeoTranscriptEntry[];
  status: LeoTranscriptStatus;
  /** 清空进行中（防重复点）。 */
  clearing: boolean;
  reload: () => void;
  clear: () => void;
  /** 发送前乐观追加用户句，返回临时 id；响应到了用 applyTurn 换掉。 */
  appendOptimistic: (text: string) => string;
  /** 用服务端这一轮的两条（用户 + leo）替换乐观条目，按 id 合并去重。 */
  applyTurn: (tempId: string, entries: LeoTranscriptEntry[]) => void;
  /** 这一轮没说成：撤掉乐观条目；401 时把记录区切成未登录提示。 */
  dropOptimistic: (tempId: string, error: LeoApiError) => void;
}

let optimisticSeq = 0;

/** 按 id 合并去重（先来后到，重复的以新数据为准），保持升序。 */
export function mergeLeoEntries(
  base: LeoTranscriptEntry[],
  incoming: LeoTranscriptEntry[],
): LeoTranscriptEntry[] {
  const seen = new Map<string, number>();
  const merged: LeoTranscriptEntry[] = [];
  for (const entry of [...base, ...incoming]) {
    const at = seen.get(entry.id);
    if (at === undefined) {
      seen.set(entry.id, merged.length);
      merged.push(entry);
    } else {
      merged[at] = entry;
    }
  }
  return merged;
}

/**
 * 任务卡片链接：门户内 href 原样（/history?task=…），非门户页面前缀门户 origin
 * （沿用域家族工具 currentDomainProfile）。
 */
export function leoTaskLink(href: string, currentOrigin: string | null): string {
  if (/^https?:\/\//i.test(href)) return href;
  const portal = currentDomainProfile().portalOrigin;
  if (currentOrigin && currentOrigin === portal) return href;
  return `${portal}${href.startsWith("/") ? href : `/${href}`}`;
}

export function useLeoTranscript({ open }: { open: boolean }): LeoTranscriptState {
  const [entries, setEntries] = useState<LeoTranscriptEntry[]>([]);
  const [status, setStatus] = useState<LeoTranscriptStatus>("idle");
  const [clearing, setClearing] = useState(false);
  const loadSeq = useRef(0);

  const reload = useCallback(() => {
    loadSeq.current += 1;
    const seq = loadSeq.current;
    setStatus((s) => (s === "ready" ? s : "loading"));
    void leoTranscript(100).then((res) => {
      if (seq !== loadSeq.current) return; // 又开了一次，旧响应作废
      if (res.ok) {
        setEntries((prev) => mergeLeoEntries(prev, res.data.entries));
        setStatus("ready");
      } else {
        setStatus(res.error === "anonymous" ? "anonymous" : "error");
      }
    });
  }, []);

  // 打开面板 → 拉服务端记录（合同 I4；每次打开都拉，跨设备才一致）。
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const clear = useCallback(() => {
    setClearing(true);
    void leoClear().then((res) => {
      setClearing(false);
      if (res.ok) {
        setEntries([]);
        setStatus("ready");
      } else {
        setStatus(res.error === "anonymous" ? "anonymous" : "error");
      }
    });
  }, []);

  const appendOptimistic = useCallback((text: string): string => {
    optimisticSeq += 1;
    const tempId = `leo-optimistic-${optimisticSeq}`;
    setEntries((prev) => [...prev, { id: tempId, role: "user", text }]);
    return tempId;
  }, []);

  const applyTurn = useCallback((tempId: string, incoming: LeoTranscriptEntry[]) => {
    setEntries((prev) =>
      mergeLeoEntries(prev.filter((entry) => entry.id !== tempId), incoming),
    );
    setStatus("ready");
  }, []);

  const dropOptimistic = useCallback((tempId: string, error: LeoApiError) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== tempId));
    if (error === "anonymous") setStatus("anonymous");
  }, []);

  return {
    entries,
    status,
    clearing,
    reload,
    clear,
    appendOptimistic,
    applyTurn,
    dropOptimistic,
  };
}

/** 对话记录列表 + 状态行 + 「清空记录」。紧凑态与放大态都是这一块。 */
export function LeoTranscript({ state }: { state: LeoTranscriptState }) {
  const tt = useUI();
  const bodyRef = useRef<HTMLDivElement>(null);
  const count = state.entries.length;

  // 新条目到底就粘底（用户往上翻时不硬拽——只在本就在底部附近时自动滚）。
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-2">
        <span className="text-[11px] font-medium text-slate-400">{tt("对话记录")}</span>
        {state.status === "ready" && count > 0 && (
          <button
            type="button"
            onClick={state.clear}
            disabled={state.clearing}
            className="rounded-md px-1.5 text-[11px] text-slate-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tt("清空记录")}
          </button>
        )}
      </div>
      <div
        ref={bodyRef}
        data-leo-transcript
        className="v-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-3"
      >
        {state.status === "loading" && count === 0 && (
          <p className="py-6 text-center text-xs text-slate-400">{tt("正在加载记录…")}</p>
        )}
        {state.status === "anonymous" && (
          <p
            data-leo-transcript-anonymous
            className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs leading-relaxed text-slate-500"
          >
            {tt("登录后 leo 才能记住对话")}
          </p>
        )}
        {state.status === "error" && count === 0 && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs leading-relaxed text-rose-600">
            {tt("记录暂时不可用，稍后再试。")}{" "}
            <button type="button" onClick={state.reload} className="underline">
              {tt("重试")}
            </button>
          </p>
        )}
        {state.status === "ready" && count === 0 && (
          <p className="py-6 text-center text-xs text-slate-400">
            {tt("还没有对话，开始第一句吧。")}
          </p>
        )}
        {state.entries.map((entry) => (
          <TranscriptEntryView key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function TranscriptEntryView({ entry }: { entry: LeoTranscriptEntry }) {
  const tt = useUI();
  const isUser = entry.role === "user";
  const task = entry.role === "leo" ? entry.task : null;
  const origin = typeof window !== "undefined" ? window.location.origin : null;
  return (
    <div
      data-leo-turn={entry.role}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] space-y-1 rounded-2xl px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-slate-50 text-slate-800"
        }`}
      >
        <p className="whitespace-pre-wrap">{entry.text}</p>
        {task?.task_id && task.href ? (
          <div
            data-leo-task-card
            className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white px-2.5 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700">
              {task.title || task.task_id}
            </span>
            <a
              href={leoTaskLink(task.href, origin)}
              className="shrink-0 text-[11px] font-medium text-indigo-600 underline"
            >
              {tt("打开任务")}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
