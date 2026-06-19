"use client";

// ============================================================================
// @oceanleo/ui — 站点首页 HomeIntro（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 定稿：每个 OceanLeo 产品站「首页」统一长这样：
//   - 站点介绍：2–3 句，不花哨。
//   - 盈利说明（固定文案）：OceanLeo 系列网站的盈利 = 用户在 OceanLeo 平台
//     使用 AI token 成本的 30%。
//   - 一个大输入框（对照主站「我能为你做什么 / 给 OceanLeo 布置一个任务…」）。
//     用户提交 → onStart(prompt) 进入 agent 工作界面（高级任务自动一分为二）。
// ============================================================================

import { useState, type ReactNode } from "react";
import { LeoComposer } from "./LeoComposer";

export interface HomeIntroProps {
  /** 站名（如「LeoImage」）。 */
  siteName: string;
  /** 介绍文案（2–3 句）。 */
  intro: ReactNode;
  /** 大标题，默认「我能为你做什么？」。 */
  heading?: string;
  /** 输入框 placeholder，默认「给 OceanLeo 布置一个任务...」。 */
  placeholder?: string;
  /** 快捷示例（点了填进输入框）。 */
  suggestions?: string[];
  /** 提交回调：进入 agent 工作界面。 */
  onStart: (prompt: string) => void;
  /** leftSlot：主站放「对话/Agent/设计」；普通站留空。 */
  leftSlot?: ReactNode;
  accent?: string;
  /** 盈利说明分成比例（%），默认 30（= 网关 markup_pct，单一事实源）。 */
  markupPct?: number;
}

export function HomeIntro({
  siteName,
  intro,
  heading = "我能为你做什么？",
  placeholder = "给 OceanLeo 布置一个任务...",
  suggestions = [],
  onStart,
  leftSlot,
  accent = "#4f46e5",
  markupPct = 30,
}: HomeIntroProps) {
  const [value, setValue] = useState("");
  const submit = () => {
    const p = value.trim();
    if (p) onStart(p);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-3xl flex-col items-center px-6 pt-[12vh]">
      <h1 className="text-center text-[32px] font-semibold tracking-tight text-stone-900">
        {heading}
      </h1>
      <p className="mt-4 max-w-xl text-center text-[14px] leading-relaxed text-stone-500">
        {intro}
      </p>

      <div className="mt-8 w-full">
        <LeoComposer
          value={value}
          onChange={setValue}
          onSubmit={submit}
          leoSuggest
          leftSlot={leftSlot}
          placeholder={placeholder}
          autoFocus
          rows={2}
        />
      </div>

      {suggestions.length > 0 && (
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

      <div className="mt-10 max-w-xl rounded-xl border border-stone-200/70 bg-white/60 px-4 py-3 text-center text-[12px] leading-relaxed text-stone-500">
        <span className="font-medium text-stone-600">{siteName}</span> 属于 OceanLeo 系列。
        本系列网站的盈利 = 用户在 OceanLeo 平台使用 AI token 成本的{" "}
        <span className="font-semibold" style={{ color: accent }}>
          {markupPct}%
        </span>
        。
      </div>
    </div>
  );
}
