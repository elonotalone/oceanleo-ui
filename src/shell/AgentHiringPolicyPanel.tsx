"use client";

// ============================================================================
// @oceanleo/ui — agent 雇人的闸门面板（talent-market-v1 W13 P5，合同 §3.2）
// ----------------------------------------------------------------------------
// 用户的 agent 干不动时可以自己去请真人。那就必须有一屏能回答三个问题：
//   1. agent 现在被允许做什么？（总开关 / 单笔上限 / 每日上限 / 允许的品类 / 每次是否要我确认）
//   2. agent 到目前为止想做过什么、又被什么挡住了？（时间线，每条都带 decision 与理由）
//   3. 我能不能改它的决定？（`pending_confirmation` 上的「同意 / 拒绝」）
//
// 这一屏**不是可选功能**：欧盟平台工作指令 (EU) 2024/2831 的算法管理条款要求自动化
// 决策必须透明、可被人类复核（转化截止 2026-12-02）。所以被挡住的请求也必须看得见，
// 而不是静静消失。
//
// 默认必须是最保守的：总开关关、两个上限都是 0、每次都要我确认。读策略失败时界面
// 回落到 DEFAULT_AGENT_HIRING_POLICY，**绝不把开关画成开着的**。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  DEFAULT_AGENT_HIRING_POLICY,
  fenFromYuanInput,
  formatFen,
  getAgentHiringPolicy,
  listAgentHiringEvents,
  listTalentCategories,
  normalizeAgentHiringPolicy,
  overrideAgentHiringEvent,
  putAgentHiringPolicy,
  type AgentHiringDecision,
  type AgentHiringEvent,
  type AgentHiringPolicy,
  type TalentCategory,
} from "../api/talent-handoff";

export interface AgentHiringPolicyPanelProps {
  accent?: string;
  className?: string;
  /** 时间线一次取多少条。 */
  eventLimit?: number;
}

const EVENT_LIMIT_DEFAULT = 30;

function yuanFromFen(fen: number): string {
  if (!Number.isFinite(fen) || fen <= 0) return "";
  const yuan = fen / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

/** 每个 decision 都要能用人话说清「发生了什么」。未知码兜底成原样，不吞掉。 */
function decisionCopy(
  decision: AgentHiringDecision,
  tt: (zh: string, vars?: Record<string, string | number>) => string,
): { label: string; tone: string } {
  switch (decision) {
    case "auto_allowed":
      return {
        label: tt("已自动放行"),
        tone: "bg-emerald-50 text-emerald-700",
      };
    case "pending_confirmation":
      return { label: tt("等你确认"), tone: "bg-amber-50 text-amber-700" };
    case "blocked_by_cap":
      return { label: tt("被金额上限挡住"), tone: "bg-rose-50 text-rose-700" };
    case "blocked_by_category":
      return { label: tt("被品类白名单挡住"), tone: "bg-rose-50 text-rose-700" };
    case "blocked_by_policy_off":
      return { label: tt("总开关是关的"), tone: "bg-stone-100 text-stone-600" };
    default:
      return { label: String(decision), tone: "bg-stone-100 text-stone-600" };
  }
}

export function AgentHiringPolicyPanel({
  accent = "#4f46e5",
  className,
  eventLimit = EVENT_LIMIT_DEFAULT,
}: AgentHiringPolicyPanelProps) {
  const tt = useUI();
  // 挂载读取那条 effect 只能跑一次，所以它不能把 `tt` 写进依赖：`tt` 是 locale
  // provider 所有的函数，切一次语言就换一次身份，effect 重跑会拿服务端值把用户
  // 刚填进去的额度和白名单冲掉（而且一旦有站不记忆化 messages，它就是自锁循环）。
  // 形状照 `doc-editors/use-grid-editor.ts:415-422`：身份走 ref，调用点恒定。
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  const translate = useCallback(
    (zh: string, vars?: Record<string, string | number>) =>
      translateRef.current(zh, vars),
    [],
  );
  // 起点就是最保守的那一份：读取失败也停在这里。
  const [policy, setPolicy] = useState<AgentHiringPolicy>({
    ...DEFAULT_AGENT_HIRING_POLICY,
  });
  const [loaded, setLoaded] = useState(false);
  const [categories, setCategories] = useState<TalentCategory[]>([]);
  const [perRequestYuan, setPerRequestYuan] = useState("");
  const [dailyYuan, setDailyYuan] = useState("");
  const [events, setEvents] = useState<AgentHiringEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAgentHiringPolicy().then((result) => {
      if (cancelled) return;
      setLoaded(true);
      if (!result.ok || !result.data?.policy) {
        if (result.status !== 401) {
          setError(
            result.error ||
              translate("读取 agent 雇人设置失败，界面显示的是最保守的默认值。"),
          );
        }
        return;
      }
      const normalized = normalizeAgentHiringPolicy(result.data.policy);
      setPolicy(normalized);
      setPerRequestYuan(yuanFromFen(normalized.per_request_cap_fen));
      setDailyYuan(yuanFromFen(normalized.daily_cap_fen));
    });
    void listTalentCategories().then((result) => {
      if (cancelled) return;
      setCategories((result.data?.items || []).filter((item) => item?.slug));
    });
    return () => {
      cancelled = true;
    };
  }, [translate]);

  const reloadEvents = useCallback(async () => {
    const result = await listAgentHiringEvents({ limit: eventLimit });
    if (!result.ok) return;
    setEvents((result.data?.items || []).filter((item) => item?.id));
  }, [eventLimit]);

  useEffect(() => {
    void reloadEvents();
  }, [reloadEvents]);

  const draft = useMemo<AgentHiringPolicy>(
    () =>
      normalizeAgentHiringPolicy({
        ...policy,
        per_request_cap_fen: fenFromYuanInput(perRequestYuan),
        daily_cap_fen: fenFromYuanInput(dailyYuan),
      }),
    [policy, perRequestYuan, dailyYuan],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const result = await putAgentHiringPolicy(draft);
    setSaving(false);
    if (!result.ok || !result.data?.policy) {
      setError(
        result.status === 401
          ? tt("登录后才能设置 agent 能不能替你请人。")
          : result.error || tt("保存失败，请稍后重试。"),
      );
      return;
    }
    const normalized = normalizeAgentHiringPolicy(result.data.policy);
    setPolicy(normalized);
    setPerRequestYuan(yuanFromFen(normalized.per_request_cap_fen));
    setDailyYuan(yuanFromFen(normalized.daily_cap_fen));
    setSavedAt(Date.now());
  }, [draft, tt]);

  const override = useCallback(
    async (event: AgentHiringEvent, action: "approve" | "reject") => {
      setBusyEventId(event.id);
      const result = await overrideAgentHiringEvent(event.id, action);
      setBusyEventId(null);
      if (!result.ok) {
        setError(result.error || tt("操作失败，请稍后重试。"));
        return;
      }
      await reloadEvents();
    },
    [reloadEvents, tt],
  );

  const toggleCategory = useCallback((slug: string) => {
    setPolicy((current) => {
      const allowed = new Set(current.allowed_categories);
      if (allowed.has(slug)) allowed.delete(slug);
      else allowed.add(slug);
      return { ...current, allowed_categories: [...allowed] };
    });
  }, []);

  const pendingCount = events.filter(
    (event) => event.decision === "pending_confirmation" && !event.reviewed_at,
  ).length;

  return (
    <div className={className ?? "space-y-5"}>
      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-stone-800">
              {tt("让 agent 替我请真人")}
            </h3>
            <p className="mt-0.5 text-[12px] leading-5 text-stone-500">
              {tt(
                "关着的时候，agent 一个人都请不动。打开之后它也只能在你划的额度和品类里动手。",
              )}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={policy.enabled}
            aria-label={tt("让 agent 替我请真人")}
            onClick={() =>
              setPolicy((current) => ({ ...current, enabled: !current.enabled }))
            }
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
              policy.enabled ? "" : "bg-stone-300"
            }`}
            style={policy.enabled ? { background: accent } : undefined}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                policy.enabled ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-[13px] font-medium text-stone-700">
              {tt("单笔最多花多少")}
            </span>
            <input
              value={perRequestYuan}
              onChange={(event) => setPerRequestYuan(event.target.value)}
              inputMode="decimal"
              placeholder={tt("0 = 一分都不许花")}
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-stone-400"
            />
            <span className="block text-[11px] text-stone-400">
              {draft.per_request_cap_fen > 0
                ? tt("即 {amount}", {
                    amount: formatFen(draft.per_request_cap_fen),
                  })
                : tt("留空或 0 = agent 请不动任何要花钱的人。")}
            </span>
          </label>
          <label className="space-y-1">
            <span className="block text-[13px] font-medium text-stone-700">
              {tt("每天最多花多少")}
            </span>
            <input
              value={dailyYuan}
              onChange={(event) => setDailyYuan(event.target.value)}
              inputMode="decimal"
              placeholder={tt("0 = 一分都不许花")}
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-[13px] text-stone-700 outline-none focus:border-stone-400"
            />
            <span className="block text-[11px] text-stone-400">
              {draft.daily_cap_fen > 0
                ? tt("即 {amount}", { amount: formatFen(draft.daily_cap_fen) })
                : tt("留空或 0 = 今天一次都不许自动请人。")}
            </span>
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="block text-[13px] font-medium text-stone-700">
            {tt("只许在这些品类里请人")}
          </span>
          {categories.length === 0 ? (
            <p className="text-[12px] text-stone-400">
              {tt("品类目录暂时读不到；没勾任何品类时 agent 请不动人。")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((item) => {
                const on = policy.allowed_categories.includes(item.slug);
                return (
                  <button
                    key={item.slug}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCategory(item.slug)}
                    className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${
                      on
                        ? "border-transparent text-white"
                        : "border-stone-200 text-stone-600 hover:bg-stone-50"
                    }`}
                    style={on ? { background: accent } : undefined}
                  >
                    {item.name_zh || item.slug}
                  </button>
                );
              })}
            </div>
          )}
          {policy.allowed_categories.length === 0 && (
            <p className="text-[11px] text-stone-400">
              {tt("一个都没勾 = 哪个品类都不许，这是默认状态。")}
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-stone-50 px-3 py-2">
          <input
            type="checkbox"
            checked={policy.require_confirmation}
            onChange={(event) =>
              setPolicy((current) => ({
                ...current,
                require_confirmation: event.target.checked,
              }))
            }
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ accentColor: accent }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-stone-700">
              {tt("每次请人都先问我")}
            </span>
            <span className="mt-0.5 block text-[12px] leading-5 text-stone-500">
              {tt(
                "关掉之后，额度内的请求 agent 会直接发出去；但每一次都仍然会记在下面的时间线里。",
              )}
            </span>
          </span>
        </label>

        {error && <p className="text-[13px] text-rose-500">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          {savedAt !== null && !saving && (
            <span className="text-[12px] text-emerald-600">
              {tt("已保存")}
            </span>
          )}
          <button
            type="button"
            disabled={saving || !loaded}
            onClick={() => void save()}
            className="rounded-xl px-3.5 py-1.5 text-[13px] font-semibold text-white transition disabled:opacity-50"
            style={{ background: accent }}
          >
            {saving ? tt("正在保存…") : tt("保存设置")}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-stone-800">
            {tt("agent 做过什么")}
          </h3>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              {tt("{n} 条等你确认", { n: pendingCount })}
            </span>
          )}
        </div>
        <p className="text-[12px] leading-5 text-stone-500">
          {tt(
            "每一次 agent 想请人都会记在这里，包括被挡住的。你可以推翻它的任何一个决定。",
          )}
        </p>
        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 px-3 py-5 text-center text-[12px] text-stone-400">
            {tt("agent 还没有请过人。")}
          </p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => {
              const copy = decisionCopy(event.decision, tt);
              const actionable =
                event.decision === "pending_confirmation" && !event.reviewed_at;
              return (
                <li
                  key={event.id}
                  className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${copy.tone}`}
                    >
                      {copy.label}
                    </span>
                    <span className="text-[12px] text-stone-500">
                      {event.action}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {event.created_at}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-stone-700">
                    {event.reason || tt("（没有给出理由）")}
                  </p>
                  <p className="mt-1 text-[11px] text-stone-400">
                    {tt("发起方 agent：{ref}", { ref: event.agent_ref || "—" })}
                    {event.reviewed_at
                      ? ` · ${tt("已由人复核于 {at}", { at: event.reviewed_at })}`
                      : ""}
                  </p>
                  {actionable && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyEventId === event.id}
                        onClick={() => void override(event, "approve")}
                        className="rounded-xl px-3 py-1 text-[12px] font-semibold text-white transition disabled:opacity-50"
                        style={{ background: accent }}
                      >
                        {tt("同意这次请人")}
                      </button>
                      <button
                        type="button"
                        disabled={busyEventId === event.id}
                        onClick={() => void override(event, "reject")}
                        className="rounded-xl border border-stone-200 px-3 py-1 text-[12px] font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
                      >
                        {tt("拒绝")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
