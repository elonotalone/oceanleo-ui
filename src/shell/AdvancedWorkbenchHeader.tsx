"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import type { AdvancedHistoryActions } from "./advanced-workbench-chrome";

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
  onStartNew,
  onAutoSave,
  onRenameTitle,
  onClose,
}: {
  item: LibraryItem;
  editorLabel: string;
  status: string;
  actions?: ReactNode;
  accent: string;
  history?: AdvancedHistoryActions;
  startingNew: boolean;
  autoSaveState: "saved" | "saving" | "error";
  mobileActionsOpen: boolean;
  onToggleMobileActions: () => void;
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
        ? tt("自动保存失败，点击重试")
        : tt("已自动保存");

  return (
    <header
      className="relative flex h-[60px] shrink-0 items-center gap-1.5 px-2.5 text-white shadow-sm md:gap-2 md:px-3"
      style={{
        background: `linear-gradient(100deg, color-mix(in srgb, ${accent} 82%, #06b6d4), color-mix(in srgb, ${accent} 78%, #7c3aed))`,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/90 transition hover:bg-white/15 hover:text-white"
        aria-label={tt("返回高级功能")}
        title={tt("返回高级功能")}
      >
        <span className="text-lg" aria-hidden="true">←</span>
      </button>
      <div className="hidden min-w-0 max-w-44 px-1 md:block">
        <p className="truncate text-[13px] font-semibold">{tt(editorLabel)}</p>
      </div>
      <span className="hidden h-6 w-px bg-white/20 md:block" />
      <button
        type="button"
        onClick={onStartNew}
        disabled={startingNew}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white/12 px-2.5 text-[11px] font-semibold text-white transition hover:bg-white/20 disabled:opacity-45"
      >
        <AdvancedEditorIcon name="add" className="h-4 w-4" />
        <span className="hidden sm:inline">
          {startingNew ? tt("保存中…") : tt("新建任务")}
        </span>
      </button>
      <div className="group relative shrink-0">
        <button
          type="button"
          onClick={onAutoSave}
          className={`grid h-10 w-12 place-items-center rounded-2xl transition ${
            autoSaveState === "error"
              ? "bg-rose-500/25 text-rose-100 hover:bg-rose-500/35"
              : "bg-white/10 text-white hover:bg-white/18"
          }`}
          aria-label={autoSaveLabel}
          title={autoSaveLabel}
        >
          <svg
            viewBox="0 0 32 24"
            className={`h-6 w-8 ${
              autoSaveState === "saving" ? "animate-pulse" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9.2 20H25a5 5 0 0 0 .8-9.93A8 8 0 0 0 10.4 7.4 6.1 6.1 0 0 0 9.2 20Z" />
            {autoSaveState === "saved" ? (
              <path d="m12.2 13.2 3 3 6.3-6.4" />
            ) : autoSaveState === "error" ? (
              <>
                <path d="M16 10v5" />
                <path d="M16 18h.01" />
              </>
            ) : (
              <path d="M13 15a4.5 4.5 0 0 1 6.8-5.2M20 8v3h-3" />
            )}
          </svg>
        </button>
        <span className="pointer-events-none absolute left-1/2 top-[calc(100%+9px)] z-[2147483800] hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#202124] px-3 py-2 text-[11px] font-semibold text-white shadow-xl group-hover:block group-focus-within:block">
          {autoSaveLabel}
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[#202124]" />
        </span>
      </div>
      <button
        type="button"
        onClick={history?.undo}
        disabled={!history?.canUndo}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/90 transition hover:bg-white/15 disabled:opacity-30"
        aria-label={tt("撤销")}
        title={tt("撤销")}
      >
        <AdvancedEditorIcon name="undo" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={history?.redo}
        disabled={!history?.canRedo}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/90 transition hover:bg-white/15 disabled:opacity-30"
        aria-label={tt("重做")}
        title={tt("重做")}
      >
        <AdvancedEditorIcon name="redo" className="h-4 w-4" />
      </button>

      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[min(30vw,28rem)] -translate-x-1/2 items-center justify-center lg:flex">
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
          className="pointer-events-auto h-9 w-full rounded-xl border border-transparent bg-white/10 px-3 text-center text-[12px] font-semibold text-white outline-none transition placeholder:text-white/50 hover:bg-white/15 focus:border-white/25 focus:bg-white/18"
          aria-label={tt("项目名称")}
          title={tt("点击编辑项目名称")}
        />
      </div>

      <div className="min-w-0 flex-1" />
      {status && (
        <span className="hidden max-w-56 truncate rounded-full bg-black/10 px-3 py-1.5 text-[10px] text-white/80 xl:block">
          {status}
        </span>
      )}
      {actions && (
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          {actions}
        </div>
      )}
      {actions && (
        <button
          type="button"
          onClick={onToggleMobileActions}
          aria-expanded={mobileActionsOpen}
          aria-label={tt("文件操作")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-lg text-white transition hover:bg-white/20 md:hidden"
        >
          •••
        </button>
      )}
      {actions && mobileActionsOpen && (
        <div
          className="absolute right-3 top-[calc(100%+8px)] z-[2147483700] flex max-w-[calc(100vw-24px)] flex-wrap items-center justify-end gap-1 rounded-2xl border border-white/15 bg-[#18181b]/95 p-2 shadow-2xl backdrop-blur md:hidden"
          onClick={onToggleMobileActions}
        >
          {actions}
        </div>
      )}
    </header>
  );
}
