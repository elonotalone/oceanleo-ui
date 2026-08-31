"use client";

// ============================================================================
// @oceanleo/ui — Button / IconButton 原语（W04，2026-08-31）
// ----------------------------------------------------------------------------
// 为什么这份文件存在（`01-verified-facts.md` §1.6 §2.5 实测）：
//   · 全家桶 823 个裸 `<button>`，`src/ui/index.tsx` 导出了 Modal/Switch/Segmented/
//     Select/EmptyState/Skeleton*，**唯独没有 Button**；
//   · `outline-none` 140 处对 `focus-visible` 61 处 —— 约一半的焦点抑制点没有把
//     焦点环补回来，键盘用户会在页面上丢失位置。
    10|//
// 所以这里有两条**结构性**的规矩，不是约定：
//
//   ① **焦点环内建且没有关掉它的 prop。** 这是本原语存在的主要理由之一。
//      调用方连 `focus-visible:ring-0` 都传不进来（见 `stripFocusRingOptOuts`）——
//      承诺要是只靠「大家别这么写」，140 对 61 这个比例就是它的下场。
//   ② **默认 size 是 `lg`（44px）。** 不去想命中区的人自动拿到合规的命中区；
//      比 44 小必须显式要，且只有登记在 `tests/hit-target-budget.test.mjs`
//      白名单里的密集工具条能要。让对的事成为默认值。
//
    20|// 尺寸与配色对齐 `shell/edit-bar-surface.ts` 的 `EDIT_BAR_BUTTON_CLASS`（既有的
// 44px 样板，本文件不改它、只照它）。动效只从 `--leo-*` token 取，不写裸时长
// （红线 9）；W01 的 token 未落地时 `var(--leo-dur-1)` 计算为 `0s`＝退回今天的
// 瞬时行为，不劣化。
// ============================================================================

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
    30|  type ReactNode,
} from "react";

import { ButtonSpinner } from "./index";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * 三档命中区的**像素事实**。`tests/hit-target-budget.test.mjs` 直接读这张表，
    40| * 所以改这里的数字会立刻反映到预算锁上，不会出现「常量与判据各说各话」。
 * 44 与 `EDIT_BAR_CONTROL_SIZE_PX` 同源同值。
 */
export const BUTTON_SIZE_PX: Record<ButtonSize, number> = {
  sm: 36,
  md: 40,
  lg: 44,
};

/** 默认档。改这一行等于改 31 个站的默认命中区，预算锁会当场拦住。 */
    50|export const BUTTON_DEFAULT_SIZE: ButtonSize = "lg";

/** 十行的类名拼接。不引 clsx / cva / tailwind-merge（红线 6）。 */
function cx(...parts: Array<string | false | null | undefined>): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const token of part.split(/\s+/)) if (token) out.push(token);
  }
  return out.join(" ");
}

    60|/**
 * 调用方可以带布局类名进来，**不可以带焦点环的退出票**。
 * 「不可关闭」如果只写在文档里就不是不可关闭，所以在这里物理拦掉。
 */
const FOCUS_RING_OPT_OUT =
  /^(focus:|focus-visible:)?(ring-0|ring-transparent|outline-none|outline-0|outline-hidden)$/;

function stripFocusRingOptOuts(className: string): string {
  return className
    .split(/\s+/)
    70|    .filter((token) => token && !FOCUS_RING_OPT_OUT.test(token))
    .join(" ");
}

/**
 * 焦点环。`outline-none` 与补偿环**成对出现，永远一起加**——单独的
 * `outline-none` 正是本波要消灭的那 79 个差额。
 * 环色沿用 `EDIT_BAR_BUTTON_CLASS` 的三级兜底（插件主题 → 工作台 → 站点语义）。
 */
const FOCUS_RING =
    80|  "outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45";

/**
 * 按下反馈的时长与曲线。**用内联 style 而不是 Tailwind 的 `duration-[…]`**：
 * 内联值不依赖 CSS 构建期能否生成任意值类，token 一落地就生效，
 * 且 `transition-duration: var(--leo-dur-1)` 在 token 缺席时计算为 `0s`，
 * 退化方向是「不动」而不是「乱动」。
 */
const MOTION_STYLE: CSSProperties = {
    90|  transitionProperty:
    "background-color, border-color, color, box-shadow, opacity, transform",
  transitionDuration: "var(--leo-dur-1)",
  transitionTimingFunction: "var(--leo-ease-standard)",
};

/**
 * 各档的高度与内边距。高度用 `h-*` 钉死，`shrink-0` 防止被 flex 压扁——
 * 命中区被父容器压小和一开始就写小，对用户是同一件事。
 */
   100|const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-9 min-w-9 gap-1.5 px-3 text-[12px]",
  md: "h-10 min-w-10 gap-2 px-3.5 text-[13px]",
  lg: "h-11 min-w-11 gap-2 px-4 text-[13px]",
};

const ICON_SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-11 w-11",
   110|};

/**
 * 四个变体。全部走 CSS 变量的三级兜底，所以同一枚按钮在插件主题内、工作台 chrome 上
 * 与租户站正文里各自取到对的颜色，不需要调用方分辨自己在哪。
 *
 * `hover:` 在 Tailwind 下编译为 `@media (hover: hover)`，触摸设备不会粘住 hover 态；
 * 本原语也**不把任何内容藏在 hover 后面**（图标与文案始终渲染），
 * 这就是任务书「`@media (hover: none)` 下不依赖 hover 才出现的内容」的落法。
 */
   120|const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))] " +
    "text-white hover:brightness-110",
  secondary:
    "border border-[var(--pchrome-line,var(--awb-border,var(--border,#e7e5e4)))] " +
    "bg-[var(--pchrome-surface,var(--awb-popover-bg,var(--card,#ffffff)))] " +
    "text-[var(--pchrome-ink,var(--awb-text,var(--fg,#292524)))] " +
    "hover:bg-[var(--pchrome-muted,var(--awb-hover,rgba(0,0,0,.06)))]",
  ghost:
   130|    "text-[var(--pchrome-ink-mid,var(--awb-muted,var(--fg-2,#57534e)))] " +
    "hover:bg-[var(--pchrome-muted,var(--awb-hover,rgba(0,0,0,.06)))] " +
    "hover:text-[var(--pchrome-ink,var(--awb-text,var(--fg,#292524)))]",
  danger:
    "text-[var(--awb-danger,#dc2626)] " +
    "hover:bg-[color-mix(in_srgb,var(--awb-danger,#dc2626)_12%,transparent)]",
};

const BASE_CLASS =
  "inline-flex shrink-0 select-none items-center justify-center rounded-lg " +
   140|  "font-medium leading-none active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-40 " +
  "aria-disabled:cursor-default aria-disabled:opacity-60";

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * 载入中。**不设 `disabled` 属性**：禁用元素不可聚焦，正在等待的那一刻把焦点
   * 从用户脚下抽走，屏幕阅读器会丢失上下文。这里用 `aria-disabled` + 拦截激活，
   150|   * 按钮保持可聚焦、`aria-busy` 为真，读屏能念出「忙」。
   */
  loading?: boolean;
  /** 载入中替换的文案（已翻译）。图标按钮不传，只出转圈。 */
  loadingLabel?: string;
  /** 撑满父容器宽度。 */
  block?: boolean;
}

export type ButtonProps = ButtonOwnProps &
   160|  ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * 有文案的按钮。默认 `lg`(44) + `secondary`。
 *
 * 注意**没有** `disableFocusRing` / `noRing` / `unstyled` 这类 prop，
 * 也永远不会有：`tests/button-primitive.test.mjs` 会 AST 扫本文件的 props 面，
 * 出现任何形似关环的 prop 名当场判红。
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
   170|  function Button(
    {
      variant = "secondary",
      size = BUTTON_DEFAULT_SIZE,
      loading = false,
      loadingLabel,
      block = false,
      className = "",
      style,
      children,
   180|      onClick,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        {...rest}
        ref={ref}
   190|        type={type}
        onClick={loading ? undefined : onClick}
        aria-busy={loading || undefined}
        aria-disabled={loading || rest["aria-disabled"]}
        data-leo-button={variant}
        data-leo-button-size={size}
        style={{ ...MOTION_STYLE, ...style }}
        className={cx(
          BASE_CLASS,
          SIZE_CLASS[size],
   200|          VARIANT_CLASS[variant],
          block && "w-full",
          stripFocusRingOptOuts(className),
          FOCUS_RING,
        )}
      >
        {loading ? <ButtonSpinner label={loadingLabel ?? ""} /> : children}
      </button>
    );
  },
);
   210|
export interface IconButtonProps extends ButtonOwnProps,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /**
   * 无障碍名，**必填**。图标按钮没有可见文案，缺了它读屏只会念「按钮」。
   * 传进来的是已翻译的字符串——翻译留在调用点，`tt()` 的字面量才扫得到
   * （`tests/i18n-tt-key-coverage.test.mjs` 的模型依赖这一点）。
   */
  label: string;
  /** 图标节点。始终渲染，不藏在 hover 后面。 */
   220|  icon: ReactNode;
}

/**
 * 纯图标按钮：正方形，默认 44×44。
 * `title` 默认取 `label`，所以鼠标用户也拿得到同一句话。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
   230|      label,
      icon,
      variant = "ghost",
      size = BUTTON_DEFAULT_SIZE,
      loading = false,
      loadingLabel,
      block = false,
      className = "",
      style,
      onClick,
   240|      title,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        {...rest}
        ref={ref}
   250|        type={type}
        onClick={loading ? undefined : onClick}
        aria-label={label}
        title={title ?? label}
        aria-busy={loading || undefined}
        aria-disabled={loading || rest["aria-disabled"]}
        data-leo-button={variant}
        data-leo-button-size={size}
        style={{ ...MOTION_STYLE, ...style }}
        className={cx(
   260|          BASE_CLASS,
          "p-0",
          ICON_SIZE_CLASS[size],
          VARIANT_CLASS[variant],
          block && "w-full",
          stripFocusRingOptOuts(className),
          FOCUS_RING,
        )}
      >
        {loading ? <ButtonSpinner label={loadingLabel ?? ""} /> : icon}
   270|      </button>
    );
  },
);
