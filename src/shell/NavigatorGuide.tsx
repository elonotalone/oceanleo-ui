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
  /**
   * 卡片正文（操作员 2026-07-05）：一句话概括这张示例是做什么的（展示用）。
   * 与 `prompt` 分离——卡片上只显示这句话，点击后填进左栏的是完整的 `prompt`。
   * 不给则回退显示 `prompt`（向后兼容）。
   */
  hint?: string;
  /** 可选：示例配图缩略图 URL（宗旨 v15：图示卡片顶部大图，AI 风格素材）。 */
  thumb?: string;
  /** 可选：右上角小角标文案（如「热」「新」），对照稿定式图示目录。 */
  badge?: string;
  /** 可选：点击时一并放进左栏的图片 URL（如参考图）。左栏支持图片输入的功能用。 */
  imageUrl?: string;
  /** 可选：卡片左侧 emoji / 图标（无 thumb 时的回退图示）。 */
  icon?: ReactNode;
  /**
   * 升级版 prompt（宗旨 v15 决策 C）：点这张卡时，除了把 prompt 灌进主输入字段，还把
   * 这里的参数一并 patch 进左侧操作台（如 image 的 ratio/genMode、word 的 style/words）。
   * 即「导航卡片不光填文字，还填/选左边各项参数」。
   */
  set?: Record<string, unknown>;
  /**
   * 可选：任意业务负载，随填充事件透传给左栏的 onGuideExample（如 image 站把 sceneId
   * 放这里，点示例即套用整套场景预设，而不只是填文本）。
   */
  data?: unknown;
}

/**
 * 导航区「一个板块」= 一组模板示例 + 板块标题（操作员 2026-07-05）。
 * 每个成品 app 的库→导航区固定放【三个板块】，每板块几张模板卡，点一张即把该模板
 * 灌进左侧操作台。板块让「专门针对海报的几份 prompt」有清晰的归类（如
 * 「行业模板 / 风格模板 / 快速起手」）。
 */
export interface GuideSection {
  /** 板块标题（如「行业模板」「风格方向」「快速起手」）。 */
  title: string;
  /** 该板块下的模板卡（点一张 → 填进左栏操作台）。 */
  examples: GuideExample[];
}

/** 一个功能页的「使用指南」内容配置。 */
export interface FunctionGuide {
  /** 顶部一句话标题（默认用功能名 + “使用指南”）。 */
  title?: string;
  /** 教学正文（支持多段；纯文本或自定义节点）。 */
  intro?: ReactNode;
  /** 可选：教学配图 URL（展示在正文上方，如效果对比图）。 */
  heroImage?: string;
  /**
   * 分板块的模板区（操作员 2026-07-05 强制：每个成品 app 库→导航固定三个板块）。
   * 给了 sections → 导航区按板块渲染（板块标题 + 该板块模板卡）。与旧 `examples`
   * 二选一：给 sections 时忽略 examples；两者都不给则无模板区。
   */
  sections?: GuideSection[];
  /** 示例列表（点一个 → 填进左栏）。旧扁平模式；`sections` 存在时忽略它。 */
  examples?: GuideExample[];
  /** 扁平示例区标题（仅旧 `examples` 模式用），默认「试试这些示例」。 */
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
  // 板块模式（操作员 2026-07-05）优先：给了 sections 就按板块渲染；否则回退旧扁平 examples。
  const sections = (guide.sections ?? []).filter((s) => (s.examples?.length ?? 0) > 0);
  const flatExamples = guide.examples ?? [];
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

      {/* 板块模式：三个板块各自「标题 + 模板卡网格」，点一张 → 填进左栏操作台 */}
      {sections.length > 0
        ? sections.map((sec, si) => (
            <div key={si} className="space-y-2.5">
              <p className="text-[12px] font-semibold text-neutral-500">{tt(sec.title)}</p>
              <ExampleGrid examples={sec.examples} accent={accent} onUseExample={onUseExample} />
            </div>
          ))
        : flatExamples.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[12px] font-medium text-neutral-500">
                {tt(guide.examplesLabel ?? "试试这些示例")}
              </p>
              <ExampleGrid examples={flatExamples} accent={accent} onUseExample={onUseExample} />
            </div>
          )}
    </div>
  );
}

/**
 * 一组模板卡网格（板块内部 / 旧扁平模式共用）。点一张 → 填进左栏操作台。
 * 宗旨 v15：图示卡片版式（对照稿定式图示目录截图）——顶部 AI 风格大图（有 thumb 时）+
 * 右上角角标 +（悬浮）「填入」蒙层，底部标题 + 一句话。无 thumb 回退 emoji tint 图示。
 */
function ExampleGrid({
  examples,
  accent,
  onUseExample,
}: {
  examples: GuideExample[];
  accent: string;
  onUseExample?: (ex: GuideExample) => void;
}) {
  const tt = useUI();
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {examples.map((ex, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onUseExample?.(ex)}
          className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
        >
          {/* 图示区（16:10）。有 thumb 用图，无 thumb 用 emoji tint 底。悬浮盖「填入」。 */}
          <span
            className="relative block w-full overflow-hidden"
            style={{ aspectRatio: "16 / 10", background: tintColor(accent) }}
          >
            {ex.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ex.thumb}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-3xl"
                style={{ color: accent }}
              >
                {ex.icon ?? "✦"}
              </span>
            )}
            {ex.badge && (
              <span
                className="absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                style={{ background: accent }}
              >
                {tt(ex.badge)}
              </span>
            )}
            <span className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/25 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
              <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-medium" style={{ color: accent }}>
                {tt("填入 →")}
              </span>
            </span>
          </span>
          {/* 文案区：标题 + 一句话概括（hint）。点击填进左栏的才是完整 prompt。 */}
          <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
            <span className="truncate text-[13px] font-medium text-neutral-800">{tt(ex.label)}</span>
            <span className="line-clamp-1 text-[11px] leading-relaxed text-neutral-500">
              {tt(ex.hint ?? ex.prompt)}
            </span>
          </span>
        </button>
      ))}
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
