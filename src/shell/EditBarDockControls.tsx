"use client";

// 左右两个 ⠿ 拖拽手柄已移除：它们占掉两个控件位，且把「怎么移动这条」变成
// 需要瞄准的操作。展开胶囊：先单击一下，再按住拖动；收起成圆时按住即可拖。
// 见 edit-bar-dock-controller。固定不再有常驻按钮；这里只保留收起后的圆。
// 「收起编辑栏」按钮已删（规范 v2 §4：编辑栏里只放编辑）；收起走 Ctrl/⌘+. 。

import type {
  KeyboardEventHandler,
  PointerEventHandler,
  MouseEventHandler,
} from "react";
import { useEffect } from "react";
import { useUI } from "../i18n/ui/useUI";
import { IconButton } from "../ui/Button";
import {
  editBarHistoryShortcut,
  isTypingTarget,
} from "./edit-bar-selection-preserve";
import { AdvancedEditorIcon, type WorkbenchIconName } from "./AdvancedEditorIcon";
import {
  EDIT_BAR_COLLAPSED_TOUCH_EXTEND_CLASS,
  editBarCollapsedStyle,
} from "./edit-bar-surface";

/**
 * 撤销 / 重做，第一行右侧簇最左（保存 / 下载 / 分享 / 收藏左边）。
 *
 * 2026-10-21 操作员改口：不再放编辑栏。十三件插件共用这一处，快捷键在画布上
 * 就能用；输入框 / textarea / contenteditable 里不抢原生撤销。
 */
export function GlobalRowHistoryControls({
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
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = editBarHistoryShortcut(event);
      if (!action || isTypingTarget(event.target)) return;
      if (action === "undo") {
        if (!canUndo) return;
        event.preventDefault();
        event.stopPropagation();
        onUndo();
        return;
      }
      if (!canRedo) return;
      event.preventDefault();
      event.stopPropagation();
      onRedo();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [canRedo, canUndo, onRedo, onUndo]);
  return (
    <div
      data-global-row-slot="history"
      className="flex shrink-0 items-center gap-0.5"
    >
      <IconButton
        data-global-history-undo
        onClick={onUndo}
        disabled={!canUndo}
        label={tt("撤销")}
        icon={<AdvancedEditorIcon name="undo" className="h-4 w-4" />}
      />
      <IconButton
        data-global-history-redo
        onClick={onRedo}
        disabled={!canRedo}
        label={tt("重做")}
        icon={<AdvancedEditorIcon name="redo" className="h-4 w-4" />}
      />
    </div>
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
      className={`${EDIT_BAR_COLLAPSED_TOUCH_EXTEND_CLASS} grid shrink-0 touch-none select-none place-items-center outline-none transition-shadow duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/40 ${
 dragging ? "cursor-grabbing" : "cursor-grab"
 }`}
      aria-label={label}
      aria-expanded={false}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
      title={tt("展开编辑栏；按住可拖动")}
    >
      <AdvancedEditorIcon
        name={icon}
        className="h-4 w-4 text-[var(--pchrome-ink,var(--awb-text,#292524))]"
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
          className="pointer-events-none absolute right-[6px] top-[6px] h-[6px] w-[6px] rounded-full bg-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]"
        />
      )}
    </button>
  );
}
