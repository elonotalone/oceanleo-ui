"use client";

// ============================================================================
// @oceanleo/ui — 求助状态条（talent-market-v1 W13 P4，合同 §3.1）
// ----------------------------------------------------------------------------
// 叫完人之后，用户不该被丢回一个「什么都没发生」的对话。这条状态就地长在对话流里：
// 还没人接 / 已经有人接住了 / 已经谈成合同，各是一句人话；真人接住的那一刻，
// 对话流里出现一条系统气泡——**用户看得见「人进来了」**。
//
// 授权是白名单，撤回必须同样好按：这里的「撤回授权」拿的是**服务端认账的授权面**
// （`GET /handoffs/{id}/context`），不是弹窗里那份本地勾选状态。撤到空也合法，
// 那就是「我全收回」。
// ============================================================================

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Modal } from "../ui";
import { useUI } from "../i18n/ui/useUI";
import {
  cancelHandoff,
  formatFen,
  getHandoffContext,
  listMyHandoffs,
  onTalentHandoffChanged,
  revokeHandoffContext,
  type Handoff,
  type HandoffContextItem,
} from "../api/talent-handoff";

/** 还「活着」的求助才值得占对话流里的位置；过期/取消的不再显示。 */
const LIVE_STATES: ReadonlySet<Handoff["state"]> = new Set([
  "draft",
  "open",
  "claimed",
  "contracted",
]);

const POLL_INTERVAL_MS = 20_000;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

export interface HumanHandoffStatusProps {
  /** 会话 id（合同 §3.1 的 `origin_ref`）。空 = 无会话，不渲染。 */
  originRef: string;
  accent?: string;
  className?: string;
}

/**
 * `claimed_by` 是 user id。把一段 uuid 摆给用户看没有意义，也不该假装那是名字：
 * 认不出来就说「有真人」，认得出（后端给了 handle）就直接叫他的名字。
 */
function claimantLabel(handoff: Handoff): string | null {
  const who = (handoff.claimed_by || "").trim();
  if (!who || UUID_LIKE.test(who)) return null;
  return who;
}

export function HumanHandoffStatus({
  originRef,
  accent = "#4f46e5",
  className,
}: HumanHandoffStatusProps) {
  const tt = useUI();
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [revoking, setRevoking] = useState<Handoff | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!originRef) return;
    const result = await listMyHandoffs({ limit: 50 });
    if (!result.ok) return;
    const mine = (result.data?.items || []).filter(
      (item) =>
        item?.id && item.origin_ref === originRef && LIVE_STATES.has(item.state),
    );
    setHandoffs(mine);
  }, [originRef]);

  useEffect(() => {
    void reload();
    return onTalentHandoffChanged(() => void reload());
  }, [reload]);

  // 「有人接住了」必须自己浮出来，不能等用户刷新页面。只在真有在飞的求助时轮询，
  // 且页面在后台时跳过——这条状态不值得把别人的电池烧掉。
  const hasPending = handoffs.some(
    (item) => item.state === "open" || item.state === "draft",
  );
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void reload();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending, reload]);

  const cancel = useCallback(
    async (handoff: Handoff) => {
      setBusyId(handoff.id);
      await cancelHandoff(handoff.id);
      setBusyId(null);
      void reload();
    },
    [reload],
  );

  if (!originRef || handoffs.length === 0) return null;

  return (
    <div className={className ?? "space-y-2"}>
      {handoffs.map((handoff) => {
        const claimant = claimantLabel(handoff);
        const waiting = handoff.state === "draft" || handoff.state === "open";
        return (
          <div
            key={handoff.id}
            className={`rounded-2xl border px-3 py-2.5 text-[13px] leading-5 ${
              waiting
                ? "border-stone-200 bg-stone-50 text-stone-600"
                : "border-indigo-100 bg-indigo-50/70 text-indigo-900"
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white"
                style={{ background: waiting ? "#a8a29e" : accent }}
                aria-hidden="true"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <circle cx="12" cy="8" r="3.4" />
                  <path
                    d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">
                  {handoff.state === "contracted"
                    ? tt("这段工作已经和真人谈成合同了。")
                    : handoff.state === "claimed"
                      ? claimant
                        ? tt("{who} 接住了这段工作，人已经进来了。", {
                            who: claimant,
                          })
                        : tt("有真人接住了这段工作，人已经进来了。")
                      : tt("已经发出求助，正在等真人接手。")}
                </p>
                <p className="text-[12px] text-current opacity-70">
                  {handoff.brief}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-current opacity-60">
                  <span>
                    {handoff.mode === "invited"
                      ? tt("指定邀请")
                      : tt("公开求助")}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {handoff.budget_fen > 0
                      ? formatFen(handoff.budget_fen)
                      : tt("预算面议")}
                  </span>
                  {waiting && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        disabled={busyId === handoff.id}
                        onClick={() => void cancel(handoff)}
                        className="font-medium underline underline-offset-2 disabled:opacity-50"
                      >
                        {tt("撤回这次求助")}
                      </button>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setRevoking(handoff)}
                    className="font-medium underline underline-offset-2"
                  >
                    {tt("管理已给出的内容")}
                  </button>
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {revoking && (
        <HandoffContextRevokeDialog
          handoff={revoking}
          accent={accent}
          onClose={() => setRevoking(null)}
        />
      )}
    </div>
  );
}

function itemKey(item: HandoffContextItem): string {
  return `${item.kind}:${item.ref}`;
}

/**
 * 撤回授权。这一屏与发起弹窗刻意相反：那边默认全不选（少给），这边勾中的是**要收回的**，
 * 同样默认全不选（不替用户做减法）。「全部收回」是一次显式点击。
 */
function HandoffContextRevokeDialog({
  handoff,
  accent,
  onClose,
}: {
  handoff: Handoff;
  accent: string;
  onClose: () => void;
}) {
  const tt = useUI();
  const titleId = useId();
  const [items, setItems] = useState<HandoffContextItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokedCount, setRevokedCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const result = await getHandoffContext(handoff.id);
    if (!result.ok) {
      setItems([]);
      setError(result.error || tt("读取已给出的内容失败。"));
      return;
    }
    setItems((result.data?.items || []).filter((item) => item?.ref));
    setSelected(new Set());
  }, [handoff.id, tt]);

  useEffect(() => {
    void load();
  }, [load]);

  const grant = useMemo(() => {
    const chosen = (items || []).filter((item) => selected.has(itemKey(item)));
    return {
      messages: chosen
        .filter((item) => item.kind === "message")
        .map((item) => item.ref),
      artifacts: chosen
        .filter((item) => item.kind === "artifact")
        .map((item) => item.ref),
    };
  }, [items, selected]);

  const revoke = useCallback(
    async (all: boolean) => {
      const target = all
        ? {
            messages: (items || [])
              .filter((item) => item.kind === "message")
              .map((item) => item.ref),
            artifacts: (items || [])
              .filter((item) => item.kind === "artifact")
              .map((item) => item.ref),
          }
        : grant;
      if (target.messages.length + target.artifacts.length === 0) return;
      setBusy(true);
      setError(null);
      const result = await revokeHandoffContext(handoff.id, target);
      setBusy(false);
      if (!result.ok) {
        setError(result.error || tt("撤回失败，请稍后重试。"));
        return;
      }
      setRevokedCount(result.data?.revoked ?? 0);
      await load();
    },
    [grant, handoff.id, items, load, tt],
  );

  const selectedCount = grant.messages.length + grant.artifacts.length;

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="max-w-lg">
      <div className="flex max-h-[min(40rem,calc(100dvh-2rem))] min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-5 py-4">
          <h2
            id={titleId}
            className="min-w-0 flex-1 text-[15px] font-semibold text-stone-800"
          >
            {tt("对方现在能看到的内容")}
          </h2>
          <button
            type="button"
            aria-label={tt("关闭")}
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xl leading-none text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p className="rounded-xl bg-stone-100 px-3 py-2 text-[12px] leading-5 text-stone-600">
            {tt("撤回立即生效：收回之后，对方就再也读不到这一条。")}
          </p>
          {items === null ? (
            <p className="py-6 text-center text-[13px] text-stone-400">
              {tt("加载…")}
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 px-3 py-5 text-center text-[12px] text-stone-400">
              {tt("对方现在看不到这段对话里的任何内容。")}
            </p>
          ) : (
            <div className="space-y-1 rounded-xl border border-stone-200 p-1.5">
              {items.map((item) => {
                const key = itemKey(item);
                const checked = selected.has(key);
                return (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition ${
                      checked ? "bg-rose-50" : "hover:bg-stone-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      style={{ accentColor: accent }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-stone-700">
                          {item.kind === "artifact" ? tt("产物") : tt("消息")}
                        </span>
                        <span className="shrink-0 text-[11px] text-stone-400">
                          {item.granted_at}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-stone-500">
                        {item.preview}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {revokedCount !== null && (
            <p className="text-[12px] text-emerald-600">
              {tt("已收回 {n} 条。", { n: revokedCount })}
            </p>
          )}
          {error && <p className="text-[13px] text-rose-500">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-5 py-3">
          <button
            type="button"
            disabled={busy || !items || items.length === 0}
            onClick={() => void revoke(true)}
            className="rounded-xl border border-rose-200 px-3 py-1.5 text-[13px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {tt("全部收回")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-50"
            >
              {tt("关闭")}
            </button>
            <button
              type="button"
              disabled={busy || selectedCount === 0}
              onClick={() => void revoke(false)}
              className="rounded-xl px-3.5 py-1.5 text-[13px] font-semibold text-white transition disabled:opacity-50"
              style={{ background: accent }}
            >
              {busy
                ? tt("正在收回…")
                : tt("收回所选 {n} 条", { n: selectedCount })}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}
