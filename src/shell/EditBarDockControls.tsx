"use client";

// 左右两个 ⠿ 拖拽手柄已移除：它们占掉两个控件位，且把「怎么移动这条」变成
// 需要瞄准的操作。展开胶囊：双击条上任意位置（含按键）并按住拖、松手落下；
// 第一次单击仍立即触发按键，不延迟。选中后按空白也能直接跟手。
// 见 edit-bar-dock-controller。这里只剩两个常驻控件：固定、以及收起后的圆。
// 「收起编辑栏」按钮已删（规范 v2 §4：编辑栏里只放编辑）；收起走 Ctrl/⌘+. 。

import type {
  KeyboardEventHandler,
  PointerEventHandler,
  MouseEventHandler,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { AdvancedEditorIcon, type WorkbenchIconName } from "./AdvancedEditorIcon";
import type { EditBarDockMode } from "./edit-bar-dock-state";
import {
  EDIT_BAR_BUTTON_CLASS,
  editBarCollapsedStyle,
} from "./edit-bar-surface";

/**
 * 撤销 / 重做，编辑栏最左段。
 *
 * 它们原先在顶栏最左（返回箭头旁边），那是位置放错了：顶栏管的是**这份文档**
 * ——回到库、素材、保存、导出、全屏；编辑栏管的是**这次改动**。撤销重做显然是
 * 后者，放在顶栏意味着用户的视线要在「改内容的地方」和「撤销的地方」之间来回
 * 跳，而且十三件插件里只有带 history 的那几件顶栏才多出两个按钮，顶栏因此长得
 * 各不一样。搬进编辑栏之后，顶栏在所有插件里一致，撤销就在手边。
 */
export function EditBarHistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const tt = useUI();
  return (
    <div
      data-edit-bar-history
      className="flex shrink-0 items-center gap-0.5"
    >
      <button
        type="button"
        data-edit-bar-interactive
        data-edit-bar-history-undo
        onClick={onUndo}
        disabled={!canUndo}
        className={`${EDIT_BAR_BUTTON_CLASS} disabled:pointer-events-none disabled:opacity-35`}
        aria-label={tt("撤销")}
        title={tt("撤销")}
      >
        <AdvancedEditorIcon name="undo" className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        data-edit-bar-interactive
        data-edit-bar-history-redo
        onClick={onRedo}
        disabled={!canRedo}
        className={`${EDIT_BAR_BUTTON_CLASS} disabled:pointer-events-none disabled:opacity-35`}
        aria-label={tt("重做")}
        title={tt("重做")}
      >
        <AdvancedEditorIcon name="redo" className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

export function EditBarPinButton({
  mode,
  onToggle,
}: {
  mode: EditBarDockMode;
  onToggle: () => void;
}) {
  const tt = useUI();
  const label = tt(mode === "docked" ? "取消固定编辑栏" : "固定编辑栏到库");
  return (
    <button
      type="button"
      data-edit-bar-pin
      data-edit-bar-interactive
      data-edit-bar-mode={mode}
      onClick={onToggle}
      className={EDIT_BAR_BUTTON_CLASS}
      aria-label={label}
      aria-pressed={mode === "docked"}
      title={label}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill={mode === "docked" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path
          d="m8 4 8 0-1 6 3 3H6l3-3-1-6Zm4 9v7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * 收起态的圆。刻意不做成纯色圆点——它是收起后唯一的常驻元素，
 * 浪费掉就等于让用户失去状态感知。这里显示当前上下文图标，
 * 并在有未保存改动 / agent 运行时点一个徽标。
 */
export function EditBarCollapsedPill({
  icon = "panel",
  contextLabel,
  busy = false,
  dirty = false,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onClick,
  onKeyDown,
}: {
  icon?: WorkbenchIconName;
  contextLabel?: string;
  busy?: boolean;
  dirty?: boolean;
  dragging: boolean;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerMove: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onLostPointerCapture: PointerEventHandler<HTMLButtonElement>;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const tt = useUI();
  const label = contextLabel
    ? `${tt("展开编辑栏")} · ${contextLabel}`
    : tt("展开编辑栏");
  return (
    <button
      type="button"
      data-edit-bar-collapsed-pill
      data-edit-bar-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={editBarCollapsedStyle(dragging)}
      className={`relative grid shrink-0 touch-none select-none place-items-center outline-none transition-shadow duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/40 ${
 dragging ? "cursor-grabbing" : "cursor-grab"
 }`}
      aria-label={label}
      aria-expanded={false}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
      title={tt("展开编辑栏；按住可拖动")}
    >
      <AdvancedEditorIcon
        name={icon}
        className="h-[18px] w-[18px] text-[var(--pchrome-ink,var(--awb-text,#292524))]"
      />
      {busy && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[3px] animate-spin rounded-full border-2 border-transparent border-t-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]"
        />
      )}
      {!busy && dirty && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[10px] top-[10px] h-[6px] w-[6px] rounded-full bg-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]"
        />
      )}
    </button>
  );
}
