"use client";

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";
import { libraryKindLabel } from "./library-viewers";

export function AdvancedWorkbenchHeader({
  item,
  editorLabel,
  status,
  actions,
  accent,
  fullscreen,
  mobileActionsOpen,
  onToggleMobileActions,
  onToggleFullscreen,
  onClose,
}: {
  item: LibraryItem;
  editorLabel: string;
  status: string;
  actions?: ReactNode;
  accent: string;
  fullscreen: boolean;
  mobileActionsOpen: boolean;
  onToggleMobileActions: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}) {
  const tt = useUI();
  return (
    <header
      className="relative flex h-14 shrink-0 items-center gap-2 px-3 text-white shadow-sm md:gap-3"
      style={{
        background: `linear-gradient(100deg, color-mix(in srgb, ${accent} 82%, #06b6d4), color-mix(in srgb, ${accent} 78%, #7c3aed))`,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-white/90 transition hover:bg-white/15 hover:text-white"
      >
        <span aria-hidden="true">←</span> {tt("返回")}
      </button>
      <div className="min-w-0">
        <p className="max-w-72 truncate text-[13px] font-semibold">
          {item.title}
        </p>
        <p className="truncate text-[10px] text-white/65">
          {tt("高级功能")} · {tt(libraryKindLabel(item.kind))}
        </p>
      </div>
      <span className="hidden h-6 w-px bg-white/20 md:block" />
      <span className="hidden max-w-48 truncate text-[11px] font-medium text-white/75 md:block">
        {tt(editorLabel)}
      </span>
      <div className="min-w-0 flex-1" />
      {status && (
        <span className="hidden max-w-[28rem] truncate rounded-full bg-black/10 px-3 py-1.5 text-[11px] text-white/80 md:block">
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
      <button
        type="button"
        onClick={onToggleFullscreen}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 px-0 text-[16px] font-medium text-white transition hover:bg-white/20 md:w-auto md:px-3 md:text-[11px]"
        aria-label={fullscreen ? tt("退出全屏") : tt("浏览器全屏")}
      >
        <span className="md:hidden">⛶</span>
        <span className="hidden md:inline">
          {fullscreen ? tt("退出全屏") : tt("浏览器全屏")}
        </span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={tt("关闭")}
        className="grid h-9 w-9 place-items-center rounded-lg text-xl text-white/75 transition hover:bg-white/15 hover:text-white"
      >
        ×
      </button>
    </header>
  );
}
