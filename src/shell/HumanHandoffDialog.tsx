"use client";

// ============================================================================
// @oceanleo/ui — 「叫真人」弹窗（talent-market-v1 W13，合同 §3.1）
// ----------------------------------------------------------------------------
// 用户在 AI 对话里卡住，按一下就把**这段正在进行的工作**交给真人：不用离开当前
// 场景，不用把 AI 讲过的东西用人话重讲一遍。
//
// 这一屏最要紧的一条是**默认一条上下文都不勾**。授权是白名单，宁可少给：
// 用户逐条挑要给出去的消息与产物，没挑的对方 claim 之后也读不到，事后随时撤回。
// 所以这里没有、也不会有「一键把整个会话给出去」。
// ============================================================================

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Modal } from "../ui";
import { useUI } from "../i18n/ui/useUI";
import {
  HANDOFF_BRIEF_MAX_LENGTH,
  HANDOFF_CONTEXT_MAX_ITEMS,
  createHandoff,
  fenFromYuanInput,
  formatFen,
  listTalentCategories,
  notifyTalentHandoffChanged,
  type Handoff,
  type HandoffMode,
  type HandoffOriginKind,
  type TalentCategory,
} from "../api/talent-handoff";

/** 一条可以被勾选交出去的上下文（由宿主从当前会话摘出来）。 */
export interface HandoffContextCandidate {
  kind: "message" | "artifact";
  /** 消息用消息 id 的字符串，产物用 agent_artifacts 的 id。 */
  ref: string;
  /** 条目标题，如「我说的第 3 句」「产物 · 提案.pptx」。 */
  label: string;
  /** 一行摘要，让用户知道自己正在给出什么。 */
  preview: string;
}

export interface HumanHandoffDialogProps {
  /** 会话 id（合同 §3.1 的 `origin_ref`）。 */
  originRef: string;
  /** 默认 "conversation"：人在对话里自己叫人。agent 自己去请人走 §3.2。 */
  originKind?: HandoffOriginKind;
  /** 当前会话里可授权的消息与产物。**不预勾选任何一条。** */
  candidates?: HandoffContextCandidate[];
  accent?: string;
  onClose: () => void;
  onCreated?: (handoff: Handoff) => void;
}

/**
 * 品类目录（§3.4，W03 供给）拿不到时的兜底。`other` 是 `_COMMON.md` §4 品类清单里
 * 真实存在的 slug，所以兜底不会造出一个后端不认的品类。
 */
const FALLBACK_CATEGORY: TalentCategory = { slug: "other", name_zh: "其他" };

function candidateKey(candidate: HandoffContextCandidate): string {
  return `${candidate.kind}:${candidate.ref}`;
}

export function HumanHandoffDialog({
  originRef,
  originKind = "conversation",
  candidates = [],
  accent = "#4f46e5",
  onClose,
  onCreated,
}: HumanHandoffDialogProps) {
  const tt = useUI();
  const titleId = useId();
  // 默认全不选：这个空 Set 就是本屏的产品判据，任何「顺手先帮用户勾上」都是回归。
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<TalentCategory[]>([
    FALLBACK_CATEGORY,
  ]);
  const [category, setCategory] = useState(FALLBACK_CATEGORY.slug);
  const [brief, setBrief] = useState("");
  const [budgetYuan, setBudgetYuan] = useState("");
  const [mode, setMode] = useState<HandoffMode>("open");
  const [invitedHandle, setInvitedHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listTalentCategories().then((result) => {
      if (cancelled) return;
      const items = (result.data?.items || []).filter((item) => item?.slug);
      if (!result.ok || items.length === 0) return;
      setCategories(items);
      setCategory((current) =>
        items.some((item) => item.slug === current) ? current : items[0].slug,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const messageCandidates = useMemo(
    () => candidates.filter((item) => item.kind === "message"),
    [candidates],
  );
  const artifactCandidates = useMemo(
    () => candidates.filter((item) => item.kind === "artifact"),
    [candidates],
  );
  const selectedMessages = useMemo(
    () =>
      messageCandidates
        .filter((item) => selected.has(candidateKey(item)))
        .map((item) => item.ref),
    [messageCandidates, selected],
  );
  const selectedArtifacts = useMemo(
    () =>
      artifactCandidates
        .filter((item) => selected.has(candidateKey(item)))
        .map((item) => item.ref),
    [artifactCandidates, selected],
  );

  const toggle = useCallback((candidate: HandoffContextCandidate) => {
    const key = candidateKey(candidate);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      const sameKind = [...next].filter((entry) =>
        entry.startsWith(`${candidate.kind}:`),
      );
      // 合同 §3.1：每类 ≤50 条。挡在这里，而不是让服务端替我们截断。
      if (sameKind.length >= HANDOFF_CONTEXT_MAX_ITEMS) return current;
      next.add(key);
      return next;
    });
  }, []);

  const budgetFen = fenFromYuanInput(budgetYuan);
  const canSubmit =
    Boolean(brief.trim()) &&
    !busy &&
    (mode === "open" || Boolean(invitedHandle.trim()));

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await createHandoff({
      origin_kind: originKind,
      origin_ref: originRef,
      category,
      brief,
      budget_fen: budgetFen,
      mode,
      invited_handle: mode === "invited" ? invitedHandle : null,
      context: { messages: selectedMessages, artifacts: selectedArtifacts },
    });
    setBusy(false);
    if (!result.ok || !result.data?.handoff) {
      setError(
        result.status === 401
          ? tt("登录后即可请真人来接手。")
          : result.error || tt("发起求助失败，请稍后重试。"),
      );
      return;
    }
    notifyTalentHandoffChanged();
    onCreated?.(result.data.handoff);
    onClose();
  }, [
    brief,
    budgetFen,
    canSubmit,
    category,
    invitedHandle,
    mode,
    onClose,
    onCreated,
    originKind,
    originRef,
    selectedArtifacts,
    selectedMessages,
    tt,
  ]);

  const selectedCount = selectedMessages.length + selectedArtifacts.length;

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="max-w-xl">
      <div className="flex max-h-[min(46rem,calc(100dvh-2rem))] min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-5 py-4">
          <h2
            id={titleId}
            className="min-w-0 flex-1 text-[15px] font-semibold text-stone-800"
          >
            {tt("请真人来接手这段工作")}
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
            {tt(
              "只有你勾选的内容会给对方看到，之后随时可以撤回。默认一条都不给。",
            )}
          </p>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-medium text-stone-700">
                {tt("要给对方看的内容")}
              </h3>
              <span className="text-[12px] text-stone-400">
                {tt("已选 {n} 条", { n: selectedCount })}
              </span>
            </div>
            {candidates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-200 px-3 py-4 text-center text-[12px] text-stone-400">
                {tt("这段对话还没有可以交出去的内容；你也可以只写一句话请人来。")}
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-stone-200 p-1.5">
                {[...messageCandidates, ...artifactCandidates].map(
                  (candidate) => {
                    const key = candidateKey(candidate);
                    const checked = selected.has(key);
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition ${
                          checked ? "bg-stone-100" : "hover:bg-stone-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(candidate)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          style={{ accentColor: accent }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-stone-700">
                              {candidate.label}
                            </span>
                            {candidate.kind === "artifact" && (
                              <span className="shrink-0 rounded bg-stone-200/70 px-1 text-[10px] text-stone-600">
                                {tt("产物")}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-stone-500">
                            {candidate.preview}
                          </span>
                        </span>
                      </label>
                    );
                  },
                )}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-[13px] font-medium text-stone-700">
              {tt("请什么样的人")}
            </h3>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-stone-400"
            >
              {categories.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name_zh || item.slug}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-2">
            <h3 className="text-[13px] font-medium text-stone-700">
              {tt("一句话说清你卡在哪")}
            </h3>
            <textarea
              value={brief}
              onChange={(event) =>
                setBrief(event.target.value.slice(0, HANDOFF_BRIEF_MAX_LENGTH))
              }
              rows={3}
              placeholder={tt("例：这份方案的落地排期我自己判断不了，想请人过一遍。")}
              className="w-full resize-none rounded-xl border border-stone-200 px-3 py-2 text-[13px] leading-5 text-stone-700 outline-none focus:border-stone-400"
            />
            <p className="text-right text-[11px] text-stone-400">
              {brief.length}/{HANDOFF_BRIEF_MAX_LENGTH}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-[13px] font-medium text-stone-700">
              {tt("预算")}
            </h3>
            <div className="flex items-center gap-2">
              <input
                value={budgetYuan}
                onChange={(event) => setBudgetYuan(event.target.value)}
                inputMode="decimal"
                placeholder={tt("留空 = 先谈")}
                className="w-40 rounded-xl border border-stone-200 px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-stone-400"
              />
              <span className="text-[12px] text-stone-400">
                {budgetFen > 0
                  ? tt("即 {amount}", { amount: formatFen(budgetFen) })
                  : tt("不填就是面议，接手的人可以跟你谈。")}
              </span>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[13px] font-medium text-stone-700">
              {tt("找谁")}
            </h3>
            <div className="flex gap-2">
              {(
                [
                  ["open", tt("公开求助")],
                  ["invited", tt("指定某个人")],
                ] as [HandoffMode, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded-xl border px-3 py-1.5 text-[13px] font-medium transition ${
                    mode === value
                      ? "border-transparent text-white"
                      : "border-stone-200 text-stone-600 hover:bg-stone-50"
                  }`}
                  style={mode === value ? { background: accent } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "invited" && (
              <input
                value={invitedHandle}
                onChange={(event) => setInvitedHandle(event.target.value)}
                placeholder={tt("对方的用户名（handle）")}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-stone-400"
              />
            )}
            <p className="text-[12px] leading-5 text-stone-400">
              {mode === "open"
                ? tt("公开求助会出现在公开池里，愿意接的人可以接手。")
                : tt("只有你指定的这个人能看到这次求助。")}
            </p>
          </section>

          {error && <p className="text-[13px] text-rose-500">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-stone-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-200 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-50"
          >
            {tt("取消")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-xl px-3.5 py-1.5 text-[13px] font-semibold text-white transition disabled:opacity-50"
            style={{ background: accent }}
          >
            {busy ? tt("正在发起…") : tt("请真人接手")}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
