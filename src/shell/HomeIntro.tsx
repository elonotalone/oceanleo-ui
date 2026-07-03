"use client";

// ============================================================================
// @oceanleo/ui — 站点首页 HomeIntro（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 定稿：每个 OceanLeo 产品站「首页」统一长这样：
//   - 站点介绍：2–3 句，不花哨。
//   - 收费说明（固定文案，2026-06-28 改版）：平台仅按用户使用 AI token 的
//     成本价收费（不加价、不抽成）；用户也可自带各平台 API key 免费使用。
//     旧文案「盈利 = token 成本的 30%」已作废（网关 SERVICE_MARKUP=0）。
//   - 一个大输入框（对照主站「我能为你做什么 / 给 OceanLeo 布置一个任务…」）。
//     用户提交 → onStart(prompt) 进入 agent 工作界面（高级任务自动一分为二）。
//
// 2026-07-02 升级（操作员定稿，对照豆包首页）：传 siteId 即在输入框下方渲染两个
// 卡片分区（① 工作内容 prompt 卡片（分类显示）② 选择 agent），并让**输入框吸顶
// 常显**——不管卡片列表怎么往下滑，输入框都看得见（点 prompt 卡片时能立刻看到
// 预设文字进了输入框）。agent 卡片点选后，输入框左下角出现该 agent 图标+名称。
// 两类卡片的第一张都是「新建」，用户自建的卡片持久化（重进网站仍在）。
// ============================================================================

import { useState, type ReactNode } from "react";
import { LeoComposer } from "./LeoComposer";
import { HomePromptCards, HomeAgentCards, type HomeAgentPick } from "./HomeCards";
import { useUI } from "../i18n/ui/useUI";

export interface HomeIntroProps {
  /** 站名（如「LeoImage」）。 */
  siteName: string;
  /** 介绍文案（2–3 句）。 */
  intro: ReactNode;
  /** 大标题，默认「我能为你做什么？」。 */
  heading?: string;
  /** 输入框 placeholder，默认「给 OceanLeo 布置一个任务...」。 */
  placeholder?: string;
  /** 快捷示例（点了填进输入框）。传了 siteId（卡片分区）时不再渲染，避免重复。 */
  suggestions?: string[];
  /** 提交回调：进入 agent 工作界面。opts.agentId = 用户在「agent」分区选中的 agent。 */
  onStart: (prompt: string, opts?: { agentId?: string }) => void;
  /** leftSlot：主站放「对话/Agent/设计」；普通站留空。 */
  leftSlot?: ReactNode;
  accent?: string;
  /**
   * 站点 id（如 "word"）。传了它 → 输入框下方渲染「agent | prompt」并列切换条 +
   * 对应卡片网格，且输入框滚动吸顶常显。 */
  siteId?: string;
  /**
   * 默认打开的分区（操作员 2026-07-03）：
   *   - 专业子站：`"prompt"`（默认显示 prompt 卡片）。
   *   - 主站 oceanleo.com：`"none"`（默认**不**显示任何卡片，需点 agent/prompt 才出）。
   * 缺省 = `"prompt"`。 */
  defaultTab?: "prompt" | "agent" | "none";
  /** @deprecated 旧「30% 分成」文案已作废（网关 SERVICE_MARKUP=0）。保留以兼容旧调用方，不再渲染。 */
  markupPct?: number;
}

// BYOK 支持的平台（与 oceanleo-byok-audit-zerofee.md §5 指导文档一致）。
const BYOK_PROVIDERS = "OpenAI / Anthropic Claude / DeepSeek / 阿里云百炼 / 火山方舟 / OpenRouter";

/**
 * 收费说明卡（单一事实源，2026-07-02 从 HomeIntro 抽出）：
 * 「{siteName} 属于 OceanLeo 系列。平台仅按 …成本价… 收费；自带 API key 免费。」
 * 各站 HomeIntro 底部用它；主站 oceanleo.com 首页也用它（siteName="OceanLeo"
 * 时用主站文案变体——主站不是「属于系列」而是系列本身）。
 */
export function BillingNotice({
  siteName,
  accent = "#4f46e5",
  className = "",
}: {
  siteName: string;
  accent?: string;
  className?: string;
}) {
  const tt = useUI();
  const isMainSite = siteName === "OceanLeo";
  return (
    <div
      className={`max-w-xl rounded-xl border border-stone-200/70 bg-white/60 px-4 py-3 text-center text-[12px] leading-relaxed text-stone-500 ${className}`}
    >
      <span className="font-medium text-stone-600">{siteName}</span>{" "}
      {isMainSite
        ? tt("平台仅按用户在 OceanLeo 平台使用 AI token 的")
        : tt("属于 OceanLeo 系列。平台仅按用户在 OceanLeo 平台使用 AI token 的")}
      <span className="font-semibold" style={{ color: accent }}>
        {tt("成本价")}
      </span>
      {tt("收费。你也可以自带各平台的 API key（{providers}），", { providers: BYOK_PROVIDERS })}
      <span className="font-semibold" style={{ color: accent }}>
        {tt("免费")}
      </span>
      {tt("使用 OceanLeo 的功能。")}
    </div>
  );
}

export function HomeIntro({
  siteName,
  intro,
  heading: headingProp,
  placeholder: placeholderProp,
  suggestions = [],
  onStart,
  leftSlot,
  accent = "#4f46e5",
  siteId,
  defaultTab = "prompt",
  // markupPct 已作废，仅为兼容旧调用方保留，不再使用。
  markupPct: _markupPct,
}: HomeIntroProps) {
  void _markupPct;
  const tt = useUI();
  const heading = headingProp ?? tt("我能为你做什么？");
  const placeholder = placeholderProp ?? tt("给 OceanLeo 布置一个任务...");
  const [value, setValue] = useState("");
  // 「agent」分区选中的 agent：输入框左下角显示其图标+名称，提交时带 agentId。
  const [agent, setAgent] = useState<HomeAgentPick | null>(null);
  // 输入框下方并列切换条当前打开的分区：agent | prompt | none（都收起）。
  // 点已打开的分区 → 收起（回到 none）；专业子站默认展开 prompt，主站默认 none。
  const [tab, setTab] = useState<"prompt" | "agent" | "none">(defaultTab);
  const submit = () => {
    const p = value.trim();
    if (p) onStart(p, agent ? { agentId: agent.agentId } : undefined);
  };

  const withCards = Boolean(siteId);

  // 选中 agent 后，输入框左下角的「agent 图标 + 名称」芯片（再点 × 取消绑定）。
  const agentChip = agent ? (
    <span
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
      style={{ borderColor: accent, color: accent, background: `${accent}14` }}
    >
      <span className="text-[13px] leading-none">{agent.icon || "🤖"}</span>
      <span className="truncate">{agent.name}</span>
      <button
        type="button"
        onClick={() => setAgent(null)}
        aria-label={tt("取消选择该 agent")}
        className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full transition hover:bg-black/10"
      >
        ×
      </button>
    </span>
  ) : null;

  // 并列切换键（agent 左、prompt 右——操作员 2026-07-03）。点已选的键则收起。
  const TabButton = ({ id, label }: { id: "agent" | "prompt"; label: string }) => {
    const on = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(on ? "none" : id)}
        className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
          on ? "text-white shadow-sm" : "text-stone-600 hover:bg-stone-100"
        }`}
        style={on ? { background: accent } : undefined}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className={`mx-auto flex w-full max-w-3xl flex-col items-center px-6 ${
        withCards ? "min-h-[calc(100dvh-56px)] pt-[7vh]" : "min-h-[calc(100dvh-56px)] pt-[12vh]"
      }`}
    >
      <h1 className="text-center text-[32px] font-semibold tracking-tight text-stone-900">
        {heading}
      </h1>
      <p className="mt-4 max-w-xl text-center text-[14px] leading-relaxed text-stone-500">
        {intro}
      </p>

      {/* 输入框：有卡片分区时吸顶常显——往下滑卡片列表时它一直看得见（操作员
          2026-07-02）。2026-07-03：吸顶到【触顶】（top-0，去掉 8px 缝隙）。 */}
      <div className={`mt-8 w-full ${withCards ? "sticky top-0 z-30 pt-2" : ""}`}>
        <LeoComposer
          value={value}
          onChange={setValue}
          onSubmit={submit}
          leoSuggest
          leftSlot={
            leftSlot || agentChip ? (
              <>
                {leftSlot}
                {agentChip}
              </>
            ) : undefined
          }
          placeholder={placeholder}
          autoFocus
          rows={2}
          className={withCards ? "shadow-md" : ""}
        />

        {/* 输入框正下方：agent | prompt 并列切换条（操作员 2026-07-03）。
            点某键 → 下面一行显示对应目录 + 卡片；再点同键收起。 */}
        {withCards && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <TabButton id="agent" label={tt("agent")} />
            <TabButton id="prompt" label={tt("prompt")} />
          </div>
        )}
      </div>

      {/* 旧快捷示例 pill（未接卡片分区的站保留原样） */}
      {!withCards && suggestions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setValue(s);
              }}
              className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-[13px] text-stone-600 transition hover:border-stone-300 hover:text-stone-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 卡片区（2026-07-03）：由上方切换键决定显示哪个分区——
          prompt = 分类 prompt 卡片（点了填输入框）；agent = agent 卡片（点了挂芯片）。 */}
      {withCards && tab === "prompt" && (
        <div className="mt-6 w-full pb-6">
          <HomePromptCards siteId={siteId!} accent={accent} onPick={(p) => setValue(p)} />
        </div>
      )}
      {withCards && tab === "agent" && (
        <div className="mt-6 w-full pb-6">
          <p className="mb-2 text-[12px] text-stone-400">
            {tt("选一个 agent 来回答（点卡片选中/取消）；不选则由本站默认 agent 处理。")}
          </p>
          <HomeAgentCards siteId={siteId!} accent={accent} selected={agent} onSelect={setAgent} />
        </div>
      )}

      <BillingNotice siteName={siteName} accent={accent} className={withCards ? "mb-8 mt-4" : "mt-10"} />
    </div>
  );
}
