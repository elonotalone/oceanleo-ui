"use client";

// ============================================================================
// @oceanleo/ui — app 卡片外壳（首页与工作台共用**同一份**版式）
// ----------------------------------------------------------------------------
// 合同 2026-07-27 §0.3 / §3.1（决策 D3）：操作员要求工作台卡片与首页卡片是「完完全全
// 一样的格式」。让两边各写一遍 CSS 必然漂移，所以版式在全仓只有这一份实现：
//   · 尺寸（`min-h-[100px]` + 96px 见方图块）、圆角、边框、阴影
//   · hover 整卡放大（`hover:scale-105` + `hover:z-10` 防被 DOM 靠后的邻卡盖住）
//   · hover 时功能图淡入铺满整卡（无图的 app 用 emoji tint 铺满，同样不留白）
//   · 触屏常驻主按钮（`[@media(hover:none)]`，触屏没有 hover）
//   · 栅格 `APP_CARD_GRID_CLASS`（两侧引同一个常量，不许各写一串）
//
// 两个 variant 的差别**只有落点与主按钮文案，且两者都由调用方给**：
//   home      → 点卡主体 = 打开大卡片；主按钮 = `prompt`（灌进首页输入框）
//   workspace → 点卡主体 = 直接进该 app 操作台；主按钮 = `打开`（同落点，触屏常驻）
// `variant` 自身**不改任何一条几何 class**，只切换 `data-home-app-card*` 这组既有验收
// 钩子（V1 与 30 站回归都在扫它们，抽壳后必须逐字保留）。两个 variant 渲染出的 DOM 除
// 这组钩子与文案外逐字符相同，这一点由 `tests/app-card-shell.test.mjs` 直接比对钉死。
// ============================================================================

import type { ReactNode } from "react";
import type { GoalApp } from "./app-catalog";
import { brandColorFor, tintOf } from "../lib/brand-color";
import { useUI } from "../i18n/ui/useUI";

/** 首页与工作台共用的卡片栅格（合同 §0.2 第 5 条：更宽，不是更多列）。 */
export const APP_CARD_GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

/** 卡片根的全部几何/描边/hover class。两个 variant 共用，不得按 variant 分叉。 */
export const APP_CARD_FRAME_CLASS =
  "group relative flex min-h-[100px] overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-sm transition duration-200 hover:z-10 hover:scale-105 hover:border-stone-300 hover:shadow-lg";

/** 落点语义：首页开大卡片 / 工作台直接进操作台。见文件头。 */
export type AppCardVariant = "home" | "workspace";

/** 卡片下缘那颗常驻主按钮（home = `prompt`，workspace = `打开`）。 */
export interface AppCardPrimaryAction {
  label: string;
  onClick: () => void;
}

export interface AppCardShellProps {
  /** 本站 catalog 里的这一个 app（名称/tagline/角标/图标/取色都从它来）。 */
  app: GoalApp;
  /**
   * **已经拼好的 `<img src>`，不是 OSS key**。取图路径全站唯一一条：
   * `capabilityImageThumbSrc(capabilityImageOf(app))`。直接把裸 key 塞进来会被浏览器
   * 当相对路径请求，30 个站的卡片图全部 404。
   */
  image?: string;
  /**
   * 主按钮。`null` / 不给 = 不渲染按钮条：music 站那 22 个没有代表 prompt 的 app 属于
   * 正常数据形态，**绝不允许灌空串**，卡片主体照常可点（不是死卡）。
   */
  primaryAction?: AppCardPrimaryAction | null;
  /** 点卡片主体（未命中主按钮）。home = 开大卡片；workspace = 进操作台。 */
  onCardClick: () => void;
  variant: AppCardVariant;
  /** 主按钮底色，默认站点 accent。 */
  accent?: string;
  /** 覆盖式主按钮的无障碍名，默认「查看 <app 名>」。 */
  cardActionLabel?: string;
  /** 主按钮之外的可点元素（如工作台的「加入」）。必须自带 `pointer-events-auto`。 */
  extraActions?: ReactNode;
}

/**
 * `data-home-app-card*` 这组钩子是首页既有的验收面。抽壳后 workspace 变体只带通用的
 * `data-app-card*`，首页那组逐字保留 —— 否则 V1 的对照与 30 站回归会集体假红。
 */
function homeHook(variant: AppCardVariant): true | undefined {
  return variant === "home" ? true : undefined;
}

/**
 * 卡片根：左图右文 + 覆盖式主动作按钮。首页自建 prompt 卡（不是 GoalApp）也用这一层，
 * 这样「自建卡与 app 卡混排时版式一致」不靠抄，靠同一份代码。
 */
export function AppCardFrame({
  variant,
  actionLabel,
  onAction,
  children,
  fill,
  actions,
}: {
  variant: AppCardVariant;
  /** 覆盖式主动作按钮的无障碍名。 */
  actionLabel: string;
  /** 卡片主体的唯一主动作。 */
  onAction: () => void;
  children: ReactNode;
  /** 主动作按钮**下方**的装饰层（hover 铺满的功能图），必须 `pointer-events-none`。 */
  fill?: ReactNode;
  /** 主动作按钮**上方**的可点元素（主按钮条、自建卡右上角的笔）。 */
  actions?: ReactNode;
}) {
  return (
    <div
      data-app-card
      data-app-card-variant={variant}
      data-home-app-card={homeHook(variant)}
      className={APP_CARD_FRAME_CLASS}
    >
      {children}
      {fill}
      {/* 卡片根不是 `role="button"`：它嵌着 <button>，而 role=button 的祖先里放可交互
          后代是 ARIA 违规（button 的 allowed content 不含 interactive descendant）。主
          动作改由这一枚覆盖式原生 <button> 承担，一次解决三件事：
            ① 嵌套违规消失（覆盖按钮与主按钮是兄弟，不是祖孙）；
            ② Enter/Space 由原生按钮处理，不再需要手写 onKeyDown —— 也就不会再因为
               keydown 从内部按钮冒泡上来而把整卡动作**多触发一次**（这条守卫上一轮才
               补上，抽壳时最容易弄丢，别再写回 onKeyDown）；
            ③ 焦点顺序与焦点环由浏览器给，无障碍名单独可控。
          它排在 `fill` 之后、`actions` 之前：同为定位元素时后画的在上，所以铺满层被它
          盖住（本来就 pointer-events-none），而主按钮盖在它上面、照常可点。 */}
      <button
        type="button"
        data-app-card-main
        data-home-app-card-main={homeHook(variant)}
        onClick={onAction}
        aria-label={actionLabel}
        className="absolute inset-0 cursor-pointer rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-500"
      />
      {actions}
    </div>
  );
}

/** 左侧 1:1 图块：有图放图，无图放 emoji tint（同尺寸，绝不留白）。 */
export function AppCardThumb({
  image,
  icon,
  color,
  alt,
}: {
  image?: string;
  icon: ReactNode;
  color: string;
  alt: string;
}) {
  return (
    <span className="relative block aspect-square w-[96px] shrink-0 overflow-hidden bg-stone-100">
      {image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={image} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span
          className="grid h-full w-full place-items-center text-[26px] leading-none"
          style={{ background: tintOf(color, 0.14), color }}
        >
          {icon}
        </span>
      )}
    </span>
  );
}

/** 右侧文字：上深色 15px 半粗名字，下浅色 13px tagline（两行截断）。 */
export function AppCardText({
  name,
  tagline,
  badge,
  touchActionSpace,
}: {
  name: string;
  tagline?: string;
  badge?: ReactNode;
  /** 触屏上主按钮常驻在卡片下缘：给它让出一条，别压住 tagline。 */
  touchActionSpace?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col justify-between px-3 py-2.5 ${
        touchActionSpace ? "[@media(hover:none)]:pb-8" : ""
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-stone-800">{name}</span>
        {badge}
      </div>
      {tagline ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-stone-500">{tagline}</p>
      ) : null}
    </div>
  );
}

/** hover 时淡入铺满整卡的装饰层（整卡放大在根 class 上，这层只负责「铺满」）。 */
function AppCardFill({
  image,
  icon,
  color,
  variant,
}: {
  image?: string;
  icon: ReactNode;
  color: string;
  variant: AppCardVariant;
}) {
  return (
    <span
      data-app-card-fill
      data-home-app-card-fill={homeHook(variant)}
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    >
      {image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span
          className="grid h-full w-full place-items-center text-[40px] leading-none"
          style={{ background: tintOf(color, 0.18), color }}
        >
          {icon}
        </span>
      )}
      <span className="absolute inset-0 bg-stone-900/25" />
    </span>
  );
}

/**
 * 卡片下缘的主按钮条。鼠标端从卡外浮进来；触屏没有 hover，`@media (hover: none)` 让它
 * **常驻可见**，并把压暗渐变去掉（触屏上铺满层不出现，深色渐变会糊住白底卡的文字）。
 */
function AppCardActionBar({
  action,
  accent,
  variant,
}: {
  action: AppCardPrimaryAction;
  accent: string;
  variant: AppCardVariant;
}) {
  return (
    <span
      data-app-card-actions
      data-home-app-card-actions={homeHook(variant)}
      className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1.5 bg-gradient-to-t from-stone-900/70 to-transparent px-2 pb-2 pt-4 transition-transform duration-200 group-hover:translate-y-0 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:justify-end [@media(hover:none)]:bg-none [@media(hover:none)]:pt-0"
    >
      <button
        type="button"
        data-app-card-primary
        onClick={action.onClick}
        className="pointer-events-auto rounded-lg px-3 py-1 text-[12px] font-medium text-white shadow-sm transition hover:opacity-90"
        style={{ background: accent }}
      >
        {action.label}
      </button>
    </span>
  );
}

/**
 * 一个 app 一张卡。首页与工作台唯一的卡片实现（合同 §0.3）。
 *
 * 文案一律由本组件经 `tt()` 翻译（`app.name` / `app.tagline` / `app.badge`），调用方不要
 * 先翻一遍再传进来 —— 那会在两侧翻出两套。
 */
export function AppCardShell({
  app,
  image,
  primaryAction,
  onCardClick,
  variant,
  accent = "#4f46e5",
  cardActionLabel,
  extraActions,
}: AppCardShellProps) {
  const tt = useUI();
  const color = app.logoColor || brandColorFor(app.id);
  const name = tt(app.name);
  const icon = app.icon ?? "✨";

  return (
    <AppCardFrame
      variant={variant}
      actionLabel={cardActionLabel ?? `${tt("查看")} ${name}`}
      onAction={onCardClick}
      fill={<AppCardFill image={image} icon={icon} color={color} variant={variant} />}
      actions={
        primaryAction || extraActions ? (
          <>
            {primaryAction ? (
              <AppCardActionBar action={primaryAction} accent={accent} variant={variant} />
            ) : null}
            {extraActions}
          </>
        ) : undefined
      }
    >
      <AppCardThumb image={image} icon={icon} color={color} alt={name} />
      <AppCardText
        name={name}
        tagline={app.tagline ? tt(app.tagline) : undefined}
        touchActionSpace={Boolean(primaryAction)}
        badge={
          app.badge ? (
            <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-500">
              {tt(app.badge)}
            </span>
          ) : undefined
        }
      />
    </AppCardFrame>
  );
}
