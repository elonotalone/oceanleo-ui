"use client";

// ============================================================================
// @oceanleo/ui — 可拖动两栏工作区 SplitWorkspace（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 定稿：OceanLeo 站的「一分为二」工作界面统一长这样：
//   左栏 = AI 推导 / 操控（agent 是聊天流；工作台是固定模板操控）
//   右栏 = 格式化、可编辑结果（地图/画布/小说/PPT/表格/文档/图片…）
//
//   ┌──────────────┊──────────────────────────────┐
//   │ 左（默认 1/3）  ┊ 右（默认 2/3）                 │
//   │  [大屏]        ┊  [大屏]                       │
//   └──────────────┊──────────────────────────────┘
//                  ↑ 中间竖线，左右拖动改比例（localStorage 记忆）
//
// - 默认左 1/3、右 2/3；拖动竖线改比例，按 storageKey 记进 localStorage。
// - 左右各有「大屏」按钮：点击 → 该栏独占全宽（再点恢复）。
// - 移动端（< md）：上下堆叠，竖线/拖动隐藏；大屏按钮改为「只看这栏」切换。
// - 框架无关：左右内容都由消费端传入。
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface SplitWorkspaceProps {
  /** 左栏内容（AI 推导 / 模板操控）。 */
  left: ReactNode;
  /** 右栏内容（格式化结果）。不传 / null → 单栏（只显示左栏，无竖线）。 */
  right?: ReactNode;
  /** 左栏初始占比（0–1），默认 1/3。 */
  defaultRatio?: number;
  /** 比例记忆 key（按站 + 形态区分），如 "ui_agent_split"。不传则不持久化。 */
  storageKey?: string;
  /** 左栏标题（大屏按钮旁的小标签）。 */
  leftLabel?: ReactNode;
  /** 右栏标题。 */
  rightLabel?: ReactNode;
  /** 强调色（拖动条 hover / 大屏激活态），默认 indigo。 */
  accent?: string;
  /** 顶部 header 高度（px），用于算可视高度，默认 56。 */
  headerHeight?: number;
  className?: string;
}

type Maxed = "none" | "left" | "right";

const MIN_RATIO = 0.18;
const MAX_RATIO = 0.82;

export function SplitWorkspace({
  left,
  right,
  defaultRatio = 1 / 3,
  storageKey,
  leftLabel,
  rightLabel,
  accent = "#4f46e5",
  headerHeight = 56,
  className = "",
}: SplitWorkspaceProps) {
  const hasRight = right != null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(defaultRatio);
  const [maxed, setMaxed] = useState<Maxed>("none");
  const [dragging, setDragging] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // restore remembered ratio
  useEffect(() => {
    setHydrated(true);
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    const v = raw ? Number(raw) : NaN;
    if (Number.isFinite(v) && v >= MIN_RATIO && v <= MAX_RATIO) setRatio(v);
  }, [storageKey]);

  const persist = useCallback(
    (v: number) => {
      if (storageKey) localStorage.setItem(storageKey, String(v));
    },
    [storageKey],
  );

  // divider drag
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!hasRight) return;
      e.preventDefault();
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [hasRight],
  );

  useEffect(() => {
    if (!dragging) return;
    function move(e: PointerEvent) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      let r = (e.clientX - rect.left) / rect.width;
      r = Math.max(MIN_RATIO, Math.min(MAX_RATIO, r));
      setRatio(r);
    }
    function up() {
      setDragging(false);
      setRatio((r) => {
        persist(r);
        return r;
      });
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, persist]);

  const toggleMax = (which: "left" | "right") =>
    setMaxed((m) => (m === which ? "none" : which));

  // computed flex-basis per pane (desktop)
  const leftBasis =
    maxed === "left" ? "100%" : maxed === "right" ? "0%" : `${ratio * 100}%`;
  const rightBasis =
    maxed === "right" ? "100%" : maxed === "left" ? "0%" : `${(1 - ratio) * 100}%`;

  function MaxButton({ which }: { which: "left" | "right" }) {
    const on = maxed === which;
    return (
      <button
        type="button"
        onClick={() => toggleMax(which)}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
          on ? "text-white" : "text-stone-500 hover:bg-stone-100"
        }`}
        style={on ? { background: accent } : undefined}
        title={on ? "恢复双栏" : "这一栏切大屏"}
      >
        {on ? <IconCompress /> : <IconExpand />}
        {on ? "恢复" : "大屏"}
      </button>
    );
  }

  // Single-pane mode (no right content): just render left full-width.
  if (!hasRight) {
    return (
      <div
        className={`px-4 py-4 ${className}`}
        style={{ height: `calc(100dvh - ${headerHeight}px)` }}
      >
        <div className="h-full overflow-hidden rounded-2xl border border-stone-200 bg-white/70">
          <div className="h-full overflow-y-auto">{left}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`gap-0 px-4 py-4 ${className} md:flex`}
      style={{ height: `calc(100dvh - ${headerHeight}px)` }}
    >
      {/* 左栏 */}
      <section
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white/70 ${
          maxed === "right" ? "hidden md:flex" : "flex"
        } ${maxed === "left" ? "" : ""}`}
        style={
          hydrated
            ? { flexBasis: leftBasis, flexGrow: 0, flexShrink: 0 }
            : { flexBasis: `${defaultRatio * 100}%`, flexGrow: 0, flexShrink: 0 }
        }
      >
        <PaneHeader label={leftLabel}>
          <MaxButton which="left" />
        </PaneHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{left}</div>
      </section>

      {/* 竖线（拖动条）—— 仅桌面、未大屏时可见 */}
      {maxed === "none" && (
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onPointerDown}
          className="group relative hidden w-3 shrink-0 cursor-col-resize items-center justify-center md:flex"
          title="拖动调整左右比例"
        >
          <div
            className="h-16 w-1 rounded-full bg-stone-300 transition-colors group-hover:bg-stone-400"
            style={dragging ? { background: accent } : undefined}
          />
        </div>
      )}

      {/* 右栏 */}
      <section
        className={`mt-4 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white/70 md:mt-0 ${
          maxed === "left" ? "hidden md:flex" : "flex"
        }`}
        style={
          hydrated
            ? { flexBasis: rightBasis, flexGrow: 1, flexShrink: 1 }
            : { flexBasis: `${(1 - defaultRatio) * 100}%`, flexGrow: 1, flexShrink: 1 }
        }
      >
        <PaneHeader label={rightLabel}>
          <MaxButton which="right" />
        </PaneHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{right}</div>
      </section>
    </div>
  );
}

function PaneHeader({ label, children }: { label?: ReactNode; children?: ReactNode }) {
  if (!label && !children) return null;
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-3 py-2">
      <span className="truncate text-[12px] font-medium text-stone-500">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function IconExpand() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 14v6h6M20 10V4h-6M14 4h6v6M10 20H4v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCompress() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 9H4M9 9V4M15 9h5M15 9V4M9 15H4M9 15v5M15 15h5M15 15v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
