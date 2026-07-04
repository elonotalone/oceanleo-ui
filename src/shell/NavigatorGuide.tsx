"use client";

// ============================================================================
// @oceanleo/ui — NavigatorGuide（功能页「使用指南」导航页，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v12.1（操作员 2026-07-04，对照七色米 AI「AI 商品海报」右侧教学页）：
//
//   每个功能 app 的**右栏（库）第一个标签 = 使用指南（navigator）**：
//     · 上方：文字（可含图片）教用户「这个功能是干什么的、怎么用」；
//     · 下方：几个**示例**卡片，点一下就把示例内容**填进左侧操作台/输入框**
//       （示例可带图片——因为左栏支持图片输入，如 image 站的参考图）。
//
//   右版面默认展开（SplitWorkspace internalOpen=true），首屏落在本指南上，用户
//   一眼看清操作方式，不必自己去翻库。
//
// 数据来源：`ConsoleFunction.guide`（各站传自己的教学文案 + 示例）。渲染与「填进
// 左栏」的动作由 OperatorConsole 统一接线（GuideFillContext）——各站零额外代码即获
// 得统一的 navigator 体验。示例点击 → OperatorConsole 把内容灌进当前功能的左栏。
// ============================================================================

import { type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";

/** 一个示例「prompt」（可带图片，对应左栏图片输入）。 */
export interface GuideExample {
  /** 卡片标题（一句话点题）。 */
  label: string;
  /** 点击后灌进左栏输入框的文案（可含 `[占位]` 提示——进输入框后作为幽灵占位）。 */
  prompt: string;
  /** 可选：示例配图缩略图 URL（展示用）。 */
  thumb?: string;
  /** 可选：点击时一并放进左栏的图片 URL（如参考图）。左栏支持图片输入的功能用。 */
  imageUrl?: string;
  /** 可选：卡片左侧 emoji / 图标。 */
  icon?: ReactNode;
  /**
   * 可选：任意业务负载，随填充事件透传给左栏的 onGuideExample（如 image 站把 sceneId
   * 放这里，点示例即套用整套场景预设，而不只是填文本）。
   */
  data?: unknown;
}

/** 一个功能页的「使用指南」内容配置。 */
export interface FunctionGuide {
  /** 顶部一句话标题（默认用功能名 + “使用指南”）。 */
  title?: string;
  /** 教学正文（支持多段；纯文本或自定义节点）。 */
  intro?: ReactNode;
  /** 可选：教学配图 URL（展示在正文上方，如效果对比图）。 */
  heroImage?: string;
  /** 示例列表（点一个 → 填进左栏）。 */
  examples?: GuideExample[];
  /** 示例区标题，默认「试试这些示例」。 */
  examplesLabel?: string;
}

export interface NavigatorGuideProps {
  guide: FunctionGuide;
  accent?: string;
  /** 点击某个示例 → 把它灌进左栏（由 OperatorConsole 提供实现）。 */
  onUseExample?: (ex: GuideExample) => void;
}

export function NavigatorGuide({ guide, accent = "#4f46e5", onUseExample }: NavigatorGuideProps) {
  const tt = useUI();
  const examples = guide.examples ?? [];
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* 顶部教学区 */}
      <div className="space-y-3">
        {guide.title && (
          <h2 className="text-[17px] font-semibold tracking-tight text-neutral-900">
            {tt(guide.title)}
          </h2>
        )}
        {guide.heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guide.heroImage}
            alt=""
            className="w-full rounded-xl border border-neutral-200 object-cover"
          />
        )}
        {guide.intro != null && (
          <div className="text-[14px] leading-relaxed text-neutral-600">
            {typeof guide.intro === "string" ? tt(guide.intro) : guide.intro}
          </div>
        )}
      </div>

      {/* 示例区：点一个 → 填进左栏输入框 */}
      {examples.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[12px] font-medium text-neutral-500">
            {tt(guide.examplesLabel ?? "试试这些示例")}
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {examples.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onUseExample?.(ex)}
                className="group flex items-start gap-3 rounded-xl border border-neutral-200 bg-white/80 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
              >
                {ex.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ex.thumb}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-neutral-200"
                  />
                ) : (
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg"
                    style={{ background: tintColor(accent), color: accent }}
                  >
                    {ex.icon ?? "✦"}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-neutral-800">
                    {tt(ex.label)}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-neutral-500">
                    {tt(ex.prompt)}
                  </span>
                </span>
                <span
                  className="mt-0.5 shrink-0 text-[11px] font-medium opacity-0 transition group-hover:opacity-100"
                  style={{ color: accent }}
                >
                  {tt("填入 →")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function tintColor(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return "rgba(79,70,229,0.12)";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},0.12)`;
}
