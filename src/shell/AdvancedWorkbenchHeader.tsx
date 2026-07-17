"use client";

import { useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import {
  ADVANCED_HEADER_ACTION_CLASS,
  ADVANCED_HEADER_ICON_ACTION_CLASS,
  ADVANCED_HEADER_PRIMARY_ACTION_CLASS,
  type AdvancedHistoryActions,
  type AdvancedWorkbenchAction,
} from "./advanced-workbench-chrome";

export function AdvancedWorkbenchHeader({
  item,
  editorLabel,
  status,
  actions,
  accent,
  history,
  startingNew,
  autoSaveState,
  mobileActionsOpen,
  onToggleMobileActions,
  onOpenPanel,
  onStartNew,
  onAutoSave,
  onRenameTitle,
  onClose,
}: {
  item: LibraryItem;
  editorLabel: string;
  status: string;
  actions?: readonly AdvancedWorkbenchAction[];
  accent: string;
  history?: AdvancedHistoryActions;
  startingNew: boolean;
  autoSaveState: "saved" | "saving" | "error";
  mobileActionsOpen: boolean;
  onToggleMobileActions: () => void;
  onOpenPanel: (panelId: string) => void;
  onStartNew: () => void;
  onAutoSave: () => void;
  onRenameTitle: (title: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const tt = useUI();
  const [title, setTitle] = useState(item.title);
  useEffect(() => setTitle(item.title), [item.title]);

  const commitTitle = () => {
    const next = title.trim() || tt("未命名项目");
    setTitle(next);
    if (next !== item.title) void onRenameTitle(next);
  };
  const autoSaveLabel =
    autoSaveState === "saving"
      ? tt("正在自动保存…")
      : autoSaveState === "error"
        ? tt("同步失败，点击重试")
        : tt("已自动保存");
  const autoSaveTone =
    autoSaveState === "error"
      ? "border-amber-300/70 bg-amber-50 text-amber-800"
      : "border-transparent bg-transparent text-[var(--muted,#78716c)]";
  const renderActions = () =>
    actions?.map((action) => {
      const label = tt(action.busy && action.busyLabel ? action.busyLabel : action.label);
      const variant = action.variant || "default";
      const className =
        variant === "icon"
          ? ADVANCED_HEADER_ICON_ACTION_CLASS
          : variant === "primary" || variant === "danger"
            ? ADVANCED_HEADER_PRIMARY_ACTION_CLASS
            : ADVANCED_HEADER_ACTION_CLASS;
      return (
        <button
          key={action.id}
          type="button"
          disabled={action.disabled || action.busy}
          onClick={() => {
            if (action.panelId) onOpenPanel(action.panelId);
            else void action.onTrigger?.();
          }}
          className={className}
          style={
            variant === "primary"
              ? { background: "var(--awb-accent,#6d5dfc)" }
              : variant === "danger"
                ? { background: "var(--awb-danger,#dc2626)" }
                : undefined
          }
          aria-label={tt(action.label)}
          title={tt(action.label)}
        >
          {action.icon && (
            <AdvancedEditorIcon name={action.icon} className="h-4 w-4" />
          )}
          {variant !== "icon" && label}
        </button>
      );
    });

  return (
    <header className="relative grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_minmax(6rem,16rem)_minmax(0,1fr)] items-center gap-2 border-b border-[var(--awb-border,var(--border,#e7e5e4))] bg-[var(--awb-chrome-bg,var(--card,#fff))] px-2.5 text-[var(--awb-text,var(--fg,#292524))] md:px-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,28rem)_minmax(0,1fr)]">
      <div
        data-advanced-topbar-left
        className="flex min-w-0 items-center gap-1.5 overflow-hidden md:gap-2"
      >
      <button
        type="button"
        onClick={onClose}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] hover:text-[var(--fg,#292524)]"
        aria-label={tt("返回高级功能")}
        title={tt("返回高级功能")}
      >
        <span className="text-lg" aria-hidden="true">←</span>
      </button>
      <div className="hidden min-w-0 max-w-44 px-1 md:block">
        <p className="truncate text-[12px] font-semibold text-[var(--fg-2,#57534e)]">
          {tt(editorLabel)}
        </p>
      </div>
      <span className="hidden h-6 w-px bg-[var(--divider,#e7e5e4)] md:block" />
      <button
        type="button"
        onClick={onStartNew}
        disabled={startingNew}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition hover:brightness-95 disabled:opacity-45"
        style={{
          borderColor: `color-mix(in srgb, ${accent} 24%, transparent)`,
          background: `color-mix(in srgb, ${accent} 8%, var(--card,#fff))`,
          color: accent,
        }}
      >
        <AdvancedEditorIcon name="add" className="h-4 w-4" />
        <span className="hidden sm:inline">
          {startingNew ? tt("正在创建…") : tt("新建任务")}
        </span>
      </button>
      <button
        type="button"
        onClick={history?.undo}
        disabled={!history?.canUndo}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] hover:text-[var(--fg,#292524)] disabled:opacity-30"
        aria-label={tt("撤销")}
        title={tt("撤销")}
      >
        <AdvancedEditorIcon name="undo" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={history?.redo}
        disabled={!history?.canRedo}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] hover:text-[var(--fg,#292524)] disabled:opacity-30"
        aria-label={tt("重做")}
        title={tt("重做")}
      >
        <AdvancedEditorIcon name="redo" className="h-4 w-4" />
      </button>
      </div>

      <div
        data-advanced-topbar-title
        className="pointer-events-none flex min-w-0 items-center justify-center"
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setTitle(item.title);
              event.currentTarget.blur();
            }
          }}
          maxLength={160}
          className="pointer-events-auto h-9 w-full rounded-xl border border-transparent bg-transparent px-3 text-center text-[12px] font-semibold text-[var(--fg,#292524)] outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] focus:border-[var(--border-strong,#d6d3d1)] focus:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
          aria-label={tt("项目名称")}
          title={tt("点击编辑项目名称")}
        />
      </div>

      <div
        data-advanced-topbar-right
        className="flex min-w-0 items-center justify-end gap-1.5 overflow-hidden"
      >
      {status && (
        <span className="hidden max-w-56 truncate rounded-full bg-[var(--surface,#fafaf9)] px-3 py-1.5 text-[10px] text-[var(--muted,#78716c)] xl:block">
          {status}
        </span>
      )}
      {autoSaveState === "error" ? (
        <button
          type="button"
          onClick={onAutoSave}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition hover:bg-amber-100 ${autoSaveTone}`}
          aria-label={autoSaveLabel}
          title={autoSaveLabel}
        >
          <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[9px] font-bold" aria-hidden="true">
            !
          </span>
          <span className="hidden lg:inline">{tt("同步失败 · 重试")}</span>
        </button>
      ) : (
        <div
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[10px] ${autoSaveTone}`}
          aria-live="polite"
          title={autoSaveLabel}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 ${autoSaveState === "saving" ? "animate-pulse" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6.7 18h11.1a3.7 3.7 0 0 0 .6-7.35A6 6 0 0 0 6.85 8.8 4.55 4.55 0 0 0 6.7 18Z" />
            {autoSaveState === "saved" && <path d="m9.2 12.4 2 2 4.1-4.2" />}
          </svg>
          <span className="hidden xl:inline">
            {autoSaveState === "saving" ? tt("正在保存") : tt("已保存")}
          </span>
        </div>
      )}
      {actions && (
        <div className="hidden min-w-0 shrink items-center gap-1 overflow-hidden md:flex">
          {renderActions()}
        </div>
      )}
      {actions && (
        <button
          type="button"
          onClick={onToggleMobileActions}
          aria-expanded={mobileActionsOpen}
          aria-label={tt("文件操作")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] md:hidden"
        >
          •••
        </button>
      )}
      {actions && mobileActionsOpen && (
        <div
          className="absolute right-3 top-[calc(100%+8px)] z-[2147483700] flex max-w-[calc(100vw-24px)] flex-wrap items-center justify-end gap-1 rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]/95 p-2 shadow-2xl backdrop-blur md:hidden"
          onClick={onToggleMobileActions}
        >
          {renderActions()}
        </div>
      )}
      </div>
    </header>
  );
}
