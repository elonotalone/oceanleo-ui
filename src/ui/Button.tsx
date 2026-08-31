"use client";

// ============================================================================
// @oceanleo/ui — Button / IconButton 原语（W04，2026-08-31）
// ----------------------------------------------------------------------------
// 为什么这份文件存在（`01-verified-facts.md` §1.6 §2.5 实测）：
//   · 全家桶 823 个裸 `<button>`，`src/ui/index.tsx` 导出了 Modal/Switch/Segmented/
//     Select/EmptyState/Skeleton*，**唯独没有 Button**；
//   · `outline-none` 140 处对 `focus-visible` 61 处 —— 约一半的焦点抑制点没有把
//     焦点环补回来，键盘用户会在页面上丢失位置。
//
// 所以这里有两条**结构性**的规矩，不是约定：
//
//   ① **焦点环内建且没有关掉它的 prop。** 这是本原语存在的主要理由之一。
//      调用方连 `focus-visible:ring-0` 都传不进来（见 `stripFocusRingOptOuts`）——
//      承诺要是只靠「大家别这么写」，140 对 61 这个比例就是它的下场。
//   ② **默认 size 是 `lg`（44px）。** 不去想命中区的人自动拿到合规的命中区；
//      比 44 小必须显式要，且只有登记在 `tests/hit-target-budget.test.mjs`
//      白名单里的密集工具条能要。让对的事成为默认值。
//
// 尺寸与配色对齐 `shell/edit-bar-surface.ts` 的 `EDIT_BAR_BUTTON_CLASS`（既有的
// 44px 样板，本文件不改它、只照它）。动效只从 `--leo-*` token 取，不写裸时长
// （红线 9）。W01 的 token 已于 `c201f1d` 落地（`globals.css` 30 处命中，实测），
// 所以下面的 `var(--leo-dur-1)` 现在取到的是真值；即便日后被摘掉，它也只会算成
// `0s`＝退回瞬时，退化方向是「不动」而不是「乱动」。
//
// R3（`02-arbitration-log.md`）：焦点陷阱与滚动锁定的共享原语住在
// `shell/anchored-popover`，经 `ui/index.tsx` 转出。**本文件一个都不需要**——
// 按钮不是浮层，既不困焦点也不锁滚动。所以这里没有、也不该有自己的一份。
// ============================================================================

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * 载入中的转圈。**刻意不从 `./index` 取那份 `ButtonSpinner`**，尽管它就在那儿。
 *
 * `[实测]` 2026-08-31：`W03` 已把 `Button`/`IconButton` 并进 `ui/index.tsx`
 * （`:30-36`）。于是 `Button.tsx → ./index → Button.tsx` 成了环。运行期它是安全的
 * （函数声明提升），**但测试台过不去**：`tests/helpers/module-bench.mjs:397` 用
 * `data:` 模块编译，`data:` 表达不了环，直接抛 `ModuleBenchError`。实测因此红了
 * 三份既有测试（`app-capability-bar-placement`、`advanced-editor-v8-shared-edit-bar`、
 * `plugin-module-hosting`）——而且是**传染性**的：今后任何测试只要编译到一个
 * 间接 import 了本文件的组件，就得在桩表里加替身才能跑。
 *
 * 方向本身也是错的：叶子原语不该反过来 import 那个把自己转出去的 barrel。
 * 所以这里就地渲染同一段结构，共享的那个东西——`v-spinner` 这条 CSS 动画——照旧复用，
 * 没有重写任何动效。代价是 `loadingLabel` 要求传**已翻译**的字符串，
 * 与 `IconButton.label` 的约定一致；换来的是本文件零内部依赖，谁都不用为它加桩。
 *
 * 想收回这份重复：请 `W03` 把 `ButtonSpinner` 挪进它自己的模块，
 * 本文件即可直接 import 那一份。已写进 `signals/W04-request.md`。
 */
function LoadingSpinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="v-spinner text-[10px]" aria-hidden="true" />
      {label}
    </span>
  );
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonAlign = "center" | "start";

/**
 * 三档命中区的**像素事实**。`tests/hit-target-budget.test.mjs` 直接读这张表，
 * 所以改这里的数字会立刻反映到预算锁上，不会出现「常量与判据各说各话」。
 * 44 与 `EDIT_BAR_CONTROL_SIZE_PX` 同源同值。
 */
export const BUTTON_SIZE_PX: Record<ButtonSize, number> = {
  sm: 36,
  md: 40,
  lg: 44,
};

/** 默认档。改这一行等于改 31 个站的默认命中区，预算锁会当场拦住。 */
export const BUTTON_DEFAULT_SIZE: ButtonSize = "lg";

/** 十行的类名拼接。不引 clsx / cva / tailwind-merge（红线 6）。 */
function cx(...parts: Array<string | false | null | undefined>): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const token of part.split(/\s+/)) if (token) out.push(token);
  }
  return out.join(" ");
}

/**
 * 调用方可以带布局类名进来，**不可以带焦点环的退出票**。
 * 「不可关闭」如果只写在文档里就不是不可关闭，所以在这里物理拦掉。
 */
const FOCUS_RING_OPT_OUT =
  /^(focus:|focus-visible:)?(ring-0|ring-transparent|outline-none|outline-0|outline-hidden)$/;

function stripFocusRingOptOuts(className: string): string {
  return className
    .split(/\s+/)
    .filter((token) => token && !FOCUS_RING_OPT_OUT.test(token))
    .join(" ");
}

/**
 * 焦点环。`outline-none` 与补偿环**成对出现，永远一起加**——单独的
 * `outline-none` 正是本波要消灭的那 79 个差额。
 * 环色沿用 `EDIT_BAR_BUTTON_CLASS` 的三级兜底（插件主题 → 工作台 → 站点语义）。
 */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45";

/**
 * 按下反馈的时长与曲线。**用内联 style 而不是 Tailwind 的 `duration-[…]`**：
 * 内联值不依赖 CSS 构建期能否生成任意值类，token 一落地就生效，
 * 且 `transition-duration: var(--leo-dur-1)` 在 token 缺席时计算为 `0s`，
 * 退化方向是「不动」而不是「乱动」。
 */
const MOTION_STYLE: CSSProperties = {
  transitionProperty:
    "background-color, border-color, color, box-shadow, opacity, transform",
  transitionDuration: "var(--leo-dur-1)",
  transitionTimingFunction: "var(--leo-ease-standard)",
};

/**
 * 各档的高度与内边距。高度用 `h-*` 钉死，`shrink-0` 防止被 flex 压扁——
 * 命中区被父容器压小和一开始就写小，对用户是同一件事。
 */
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-9 min-w-9 gap-1.5 px-3 text-[12px]",
  md: "h-10 min-w-10 gap-2 px-3.5 text-[13px]",
  lg: "h-11 min-w-11 gap-2 px-4 text-[13px]",
};

const ICON_SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-11 w-11",
};

/**
 * 四个变体。全部走 CSS 变量的三级兜底，所以同一枚按钮在插件主题内、工作台 chrome 上
 * 与租户站正文里各自取到对的颜色，不需要调用方分辨自己在哪。
 *
 * `hover:` 在 Tailwind 下编译为 `@media (hover: hover)`，触摸设备不会粘住 hover 态；
 * 本原语也**不把任何内容藏在 hover 后面**（图标与文案始终渲染），
 * 这就是任务书「`@media (hover: none)` 下不依赖 hover 才出现的内容」的落法。
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent " +
    "bg-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))] " +
    "text-white hover:brightness-110",
  secondary:
    "border border-[var(--pchrome-line,var(--awb-border,var(--border,#e7e5e4)))] " +
    "bg-[var(--pchrome-surface,var(--awb-popover-bg,var(--card,#ffffff)))] " +
    "text-[var(--pchrome-ink,var(--awb-text,var(--fg,#292524)))] " +
    "hover:bg-[var(--pchrome-muted,var(--awb-hover,rgba(0,0,0,.06)))]",
  ghost:
    "border border-transparent " +
    "text-[var(--pchrome-ink-mid,var(--awb-muted,var(--fg-2,#57534e)))] " +
    "hover:bg-[var(--pchrome-muted,var(--awb-hover,rgba(0,0,0,.06)))] " +
    "hover:text-[var(--pchrome-ink,var(--awb-text,var(--fg,#292524)))]",
  danger:
    "border border-transparent " +
    "text-[var(--awb-danger,#dc2626)] " +
    "hover:bg-[color-mix(in_srgb,var(--awb-danger,#dc2626)_12%,transparent)]",
};

/**
 * 每个变体都**显式声明自己的边框颜色**（没有边框的写 `border-transparent`）。
 * 这不是冗余：选中态要加实色边框，未选中态若干脆没有 `border`，一选中就多出 1px，
 * 整条工具条会跟着抖一下。统一声明之后，切换只换颜色，几何不变。
 */

/**
 * 选中态（`aria-pressed` / `aria-expanded` 为真时该长的样子）。
 *
 * 它**整体替换**变体配色，而不是叠在它上面。这条是本波最实在的一个工程教训：
 * 同类 Tailwind 工具类（两个 `text-*`、两个 `bg-*`）谁赢由样式表里的先后决定，
 * **不是**由调用方写在 `className` 里的顺序决定，而 `tailwind-merge` 被红线 6 挡着。
 * 所以「选中」必须是一个 prop、一次换掉一整套配色，不能留给调用方去盖。
 */
const SELECTED_CLASS =
  "border border-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))] " +
  "bg-[var(--pchrome-accent-soft,var(--awb-accent-soft,color-mix(in_srgb,var(--accent,#7c3aed)_12%,transparent)))] " +
  "text-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]";

/**
 * 圆角与内容对齐是同一类「同类工具类相撞」的重灾区
 * （`rounded-lg` 对 `rounded-full`、`justify-center` 对 `justify-start`），
 * 所以一并做成 prop 而不是让调用方覆盖。
 * `IconButton` 默认胶囊：`edit-bar-surface.ts` 的 44px 样板就是 `rounded-full`。
 */
function radiusClass(pill: boolean): string {
  return pill ? "rounded-full" : "rounded-lg";
}

function alignClass(align: ButtonAlign): string {
  return align === "start" ? "justify-start text-left" : "justify-center";
}

const BASE_CLASS =
  "inline-flex shrink-0 select-none items-center " +
  "font-medium leading-none active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-40 " +
  "aria-disabled:cursor-default aria-disabled:opacity-60";

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * 载入中。**不设 `disabled` 属性**：禁用元素不可聚焦，正在等待的那一刻把焦点
   * 从用户脚下抽走，屏幕阅读器会丢失上下文。这里用 `aria-disabled` + 拦截激活，
   * 按钮保持可聚焦、`aria-busy` 为真，读屏能念出「忙」。
   */
  loading?: boolean;
  /** 载入中替换的文案（已翻译）。图标按钮不传，只出转圈。 */
  loadingLabel?: string;
  /** 撑满父容器宽度。 */
  block?: boolean;
  /** 胶囊形。`Button` 默认方角，`IconButton` 默认胶囊。 */
  pill?: boolean;
  /**
   * 选中态的**样子**。刻意**不**替你写 `aria-pressed` / `aria-expanded`：
   * 两者语义不同、不可互换（一个是开关按下，一个是它控制的区域展开了），
   * 该用哪个只有调用点知道。这里只管让它看起来是选中的。
   */
  selected?: boolean;
  /** 内容对齐。菜单项这类整行按钮要 `start`。 */
  align?: ButtonAlign;
}

export type ButtonProps = ButtonOwnProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * 有文案的按钮。默认 `lg`(44) + `secondary`。
 *
 * 注意**没有** `disableFocusRing` / `noRing` / `unstyled` 这类 prop，
 * 也永远不会有：`tests/button-primitive.test.mjs` 会 AST 扫本文件的 props 面，
 * 出现任何形似关环的 prop 名当场判红。
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = BUTTON_DEFAULT_SIZE,
      loading = false,
      loadingLabel,
      block = false,
      pill = false,
      selected = false,
      align = "center",
      className = "",
      style,
      children,
      onClick,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        {...rest}
        ref={ref}
        type={type}
        onClick={loading ? undefined : onClick}
        aria-busy={loading || rest["aria-busy"] || undefined}
        aria-disabled={loading || rest["aria-disabled"] || undefined}
        data-leo-button={variant}
        data-leo-button-size={size}
        data-leo-button-selected={selected || undefined}
        style={{ ...MOTION_STYLE, ...style }}
        className={cx(
          BASE_CLASS,
          radiusClass(pill),
          alignClass(align),
          SIZE_CLASS[size],
          selected ? SELECTED_CLASS : VARIANT_CLASS[variant],
          block && "w-full",
          stripFocusRingOptOuts(className),
          FOCUS_RING,
        )}
      >
        {loading ? <LoadingSpinner label={loadingLabel ?? ""} /> : children}
      </button>
    );
  },
);

export interface IconButtonProps extends ButtonOwnProps,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /**
   * 无障碍名，**必填**。图标按钮没有可见文案，缺了它读屏只会念「按钮」。
   * 传进来的是已翻译的字符串——翻译留在调用点，`tt()` 的字面量才扫得到
   * （`tests/i18n-tt-key-coverage.test.mjs` 的模型依赖这一点）。
   */
  label: string;
  /** 图标节点。始终渲染，不藏在 hover 后面。 */
  icon: ReactNode;
}

/**
 * 纯图标按钮：正方形，默认 44×44。
 * `title` 默认取 `label`，所以鼠标用户也拿得到同一句话。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      icon,
      variant = "ghost",
      size = BUTTON_DEFAULT_SIZE,
      loading = false,
      loadingLabel,
      block = false,
      pill = true,
      selected = false,
      align = "center",
      className = "",
      style,
      onClick,
      title,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        {...rest}
        ref={ref}
        type={type}
        onClick={loading ? undefined : onClick}
        aria-label={label}
        title={title ?? label}
        aria-busy={loading || rest["aria-busy"] || undefined}
        aria-disabled={loading || rest["aria-disabled"] || undefined}
        data-leo-button={variant}
        data-leo-button-size={size}
        data-leo-button-selected={selected || undefined}
        style={{ ...MOTION_STYLE, ...style }}
        className={cx(
          BASE_CLASS,
          "p-0",
          radiusClass(pill),
          alignClass(align),
          ICON_SIZE_CLASS[size],
          selected ? SELECTED_CLASS : VARIANT_CLASS[variant],
          block && "w-full",
          stripFocusRingOptOuts(className),
          FOCUS_RING,
        )}
      >
        {loading ? <LoadingSpinner label={loadingLabel ?? ""} /> : icon}
      </button>
    );
  },
);
