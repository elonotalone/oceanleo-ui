"use client";

// @oceanleo/ui — 高级内容工作台「编辑器 chrome」原子组件（单一事实源）。
// ---------------------------------------------------------------------------
// 目标：所有 12 个高级功能的工具栏 / 侧栏 / 按钮共用同一套视觉，一次改动全站
// 同步；且天然跟随深/浅双主题（全部走语义 CSS 变量 var(--card/--fg/--border/…)，
// 不写死 bg-white / text-stone）。设计语言对齐 Canva：图标化、去重边框、留白、
// 分组竖线、hover 柔和底、active 用站点 accent。
//
// 用法分层：
//   ToolbarShell   —— 一条工具栏的外壳（浮动在对象上方，或固定在顶部）。
//   ToolGroup      —— 一组功能，组间用 ToolDivider 分隔。
//   ToolButton     —— 单个按钮（icon-only / icon+label / label），带 tooltip。
//   ToolSelect / ToolColor / ToolNumber / ToolRange / ToolText —— 表单型控件。
//   EditorPanel    —— overlay 侧栏容器（由顶栏按钮触发，浮在画布上，非挤压）。
//   PanelSection   —— 侧栏内分节。
// ---------------------------------------------------------------------------

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EditorIcon } from "./editor-icons";

// ---------------------------------------------------------------------------
// 主题令牌快捷类。语义变量在 globals.css 里已按 light / dark / 各特色主题定义。
// ---------------------------------------------------------------------------
export const CHROME = {
  bar: "bg-[var(--card,#ffffff)]/95 border border-[var(--border,#e7e5e4)] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.28)] backdrop-blur-md",
  surface: "bg-[var(--card,#ffffff)]",
  subtle: "bg-[var(--surface,#fafaf9)]",
  fg: "text-[var(--fg,#292524)]",
  fg2: "text-[var(--fg-2,#57534e)]",
  muted: "text-[var(--muted,#78716c)]",
  border: "border-[var(--border,#e7e5e4)]",
  divider: "bg-[var(--divider,#e7e5e4)]",
  hover: "hover:bg-[var(--surface-hover,rgba(0,0,0,0.05))]",
} as const;

// ---------------------------------------------------------------------------
// Tooltip：hover / focus 出现，纯 CSS 定位，避免额外依赖。
// ---------------------------------------------------------------------------
export function Tip({
  label,
  children,
  side = "bottom",
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  disabled?: boolean;
}) {
  if (disabled || !label) return <>{children}</>;
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--fg,#1c1917)] px-2 py-1 text-[11px] font-medium text-[var(--card,#ffffff)] opacity-0 shadow-lg transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// ToolButton：工具栏 / 顶栏通用按钮。
// ---------------------------------------------------------------------------
export interface ToolButtonProps {
  label: string;
  icon?: string;
  /** 只显示图标（图标解析失败时自动退回文字）。 */
  iconOnly?: boolean;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  accent?: string;
  /** 右侧显示一个下拉小箭头（表示点击会展开更多）。 */
  hasCaret?: boolean;
  tipSide?: "top" | "bottom";
  title?: string;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(
  function ToolButton(
    {
      label,
      icon,
      iconOnly = false,
      active = false,
      disabled = false,
      danger = false,
      accent = "#4f46e5",
      hasCaret = false,
      tipSide = "bottom",
      ariaLabel,
      ariaExpanded,
      onClick,
      children,
    },
    ref,
  ) {
    const showIconOnly = iconOnly && Boolean(icon);
    const base =
      "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring,rgba(0,0,0,0.25))] disabled:pointer-events-none disabled:opacity-40";
    const shape = showIconOnly ? "w-8" : "px-2.5";
    const tone = active
      ? "text-white"
      : danger
        ? "text-rose-500 hover:bg-rose-500/10"
        : `${CHROME.fg2} ${CHROME.hover} hover:text-[var(--fg,#1c1917)]`;
    const button = (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || label}
        aria-pressed={active || undefined}
        aria-expanded={ariaExpanded}
        onClick={onClick}
        className={`${base} ${shape} ${tone}`}
        style={active ? { background: accent } : undefined}
      >
        {icon ? <EditorIcon name={icon} className="h-4 w-4" /> : null}
        {children}
        {!showIconOnly && <span className="max-w-[9rem] truncate">{label}</span>}
        {hasCaret && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className="h-3 w-3 opacity-60"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    );
    return showIconOnly ? (
      <Tip label={label} side={tipSide}>
        {button}
      </Tip>
    ) : (
      button
    );
  },
);

// ---------------------------------------------------------------------------
// ToolGroup + ToolDivider：功能分组。
// ---------------------------------------------------------------------------
export function ToolDivider() {
  return <span className={`mx-0.5 h-5 w-px shrink-0 ${CHROME.divider}`} aria-hidden="true" />;
}

export function ToolGroup({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-0.5">{children}</div>;
}

// ---------------------------------------------------------------------------
// ToolbarShell：一条工具栏外壳。variant=floating 浮在对象上方；variant=bar 固定条。
// ---------------------------------------------------------------------------
export function ToolbarShell({
  children,
  variant = "floating",
  label,
  className = "",
}: {
  children: ReactNode;
  variant?: "floating" | "bar";
  label?: string;
  className?: string;
}) {
  if (variant === "bar") {
    return (
      <div
        role="toolbar"
        aria-label={label}
        className={`flex h-12 w-full items-center gap-1 border-b ${CHROME.border} ${CHROME.surface} px-2 ${className}`}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={`pointer-events-auto flex max-w-[min(94vw,72rem)] items-center gap-1 rounded-2xl p-1.5 ${CHROME.bar} ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表单型控件：统一外观（浅底、无重边框、聚焦环）。
// ---------------------------------------------------------------------------
const FIELD =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] transition " +
  `${CHROME.subtle} ${CHROME.fg2} border border-transparent hover:border-[var(--border,#e7e5e4)]`;

export function ToolSelect({
  label,
  icon,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  icon?: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={FIELD} title={label}>
      {icon ? (
        <EditorIcon name={icon} className="h-3.5 w-3.5 opacity-70" />
      ) : (
        <span className="text-[var(--muted,#78716c)]">{label}</span>
      )}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-full max-w-[9rem] cursor-pointer border-0 bg-transparent pr-1 text-[11px] font-medium text-[var(--fg,#1c1917)] outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToolColor({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <Tip label={label}>
      <label
        className={`relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition ${CHROME.hover}`}
        title={label}
      >
        <span
          className="h-4 w-4 rounded-full border border-black/10 shadow-inner"
          style={{ background: safe }}
        />
        <input
          type="color"
          value={safe}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </Tip>
  );
}

export function ToolNumber({
  label,
  icon,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  icon?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={FIELD} title={label}>
      {icon ? (
        <EditorIcon name={icon} className="h-3.5 w-3.5 opacity-70" />
      ) : (
        <span className="text-[var(--muted,#78716c)]">{label}</span>
      )}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-full w-14 border-0 bg-transparent text-[11px] font-medium text-[var(--fg,#1c1917)] outline-none"
      />
    </label>
  );
}

export function ToolRange({
  label,
  value,
  min,
  max,
  step,
  disabled,
  accent = "#4f46e5",
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  accent?: string;
  onChange: (value: number) => void;
}) {
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <label className={`${FIELD} min-w-[8.5rem]`} title={label}>
      <span className="text-[var(--muted,#78716c)]">{label}</span>
      <input
        type="range"
        value={safe}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-20 cursor-pointer"
        style={{ accentColor: accent }}
      />
      <span className="min-w-7 text-right tabular-nums text-[var(--fg,#1c1917)]">
        {Math.round(safe * 100) / 100}
      </span>
    </label>
  );
}

export function ToolText({
  label,
  value,
  disabled,
  placeholder,
  wide = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`${FIELD} ${wide ? "min-w-[12rem]" : "min-w-[9rem]"}`} title={label}>
      <span className="shrink-0 text-[var(--muted,#78716c)]">{label}</span>
      <input
        value={value}
        disabled={disabled}
        maxLength={2000}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-[11px] font-medium text-[var(--fg,#1c1917)] outline-none placeholder:text-[var(--faint,#a8a29e)]"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Overflow「更多」下拉。
// ---------------------------------------------------------------------------
export function ToolOverflow({
  children,
  label = "更多",
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <ToolButton
        label={label}
        icon="adjust"
        ariaExpanded={open}
        onClick={() => setOpen((value) => !value)}
        hasCaret
      />
      {open && (
        <div
          className={`absolute right-0 top-full z-[60] mt-2 flex max-h-[min(60vh,32rem)] w-[min(24rem,86vw)] flex-wrap gap-1.5 overflow-auto rounded-2xl p-2 ${CHROME.bar}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditorPanel：overlay 侧栏（Canva 风格，浮在画布上、不挤压画布）。
// 由顶栏「opensPanel」按钮触发，只能通过顶栏打开，不能从左边直接开。
// ---------------------------------------------------------------------------
export function EditorPanel({
  title,
  onClose,
  children,
  width = 320,
  side = "left",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  side?: "left" | "right";
}) {
  const headingId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      className={`absolute inset-y-0 z-30 flex w-[var(--panel-w)] max-w-[86vw] flex-col ${CHROME.surface} shadow-2xl ${
        side === "left"
          ? `left-0 border-r ${CHROME.border}`
          : `right-0 border-l ${CHROME.border}`
      }`}
      style={{ ["--panel-w" as string]: `${width}px` }}
    >
      <div className={`flex h-11 shrink-0 items-center gap-2 border-b ${CHROME.border} px-3`}>
        <span id={headingId} className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${CHROME.fg}`}>
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className={`grid h-7 w-7 place-items-center rounded-lg ${CHROME.muted} ${CHROME.hover}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  );
}

export function PanelSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className={`border-b ${CHROME.border} pb-2 last:border-0`}>
      <summary className={`cursor-pointer list-none py-2 text-[11px] font-semibold ${CHROME.fg2}`}>
        {title}
      </summary>
      <div className="space-y-2 pb-1">{children}</div>
    </details>
  );
}
