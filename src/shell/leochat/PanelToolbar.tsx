"use client";

// 小窗三栏共用的第一行：搜索框 + 一个 + 号（0 项不画、1 项直接执行、多项弹出菜单）。
import { useEffect, useRef, useState, type JSX } from "react";

export interface PanelToolbarAction {
  id: string;
  /** 已翻译的文字 */
  label: string;
  onSelect: () => void;
}

export interface PanelToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  /** 回车时调（可选） */
  onSearchCommit?: (value: string) => void;
  /** 已翻译的占位文字，同时作为搜索框的 aria-label */
  placeholder: string;
  /** + 号的动作：1 项 → 点 + 直接执行；2 项及以上 → 点 + 弹出菜单；0 项 → 不画 + 号 */
  actions: PanelToolbarAction[];
  /** + 号的 aria-label 与 title（已翻译） */
  plusLabel: string;
  maxLength?: number;
}

function PlusGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function PanelToolbar(props: PanelToolbarProps): JSX.Element {
  const { search, onSearch, onSearchCommit, placeholder, actions, plusLabel, maxLength } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const many = actions.length >= 2;
  const showPlus = actions.length > 0;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onMouseDown = (event: MouseEvent) => {
      if (menuRootRef.current && !menuRootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  const plusButton = showPlus ? (
    <button
      type="button"
      data-leochat-plus
      aria-label={plusLabel}
      title={plusLabel}
      aria-haspopup={many ? "menu" : undefined}
      aria-expanded={many ? menuOpen : undefined}
      onClick={() => {
        if (many) {
          setMenuOpen((open) => !open);
          return;
        }
        actions[0]?.onSelect();
      }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-neutral-100/80 p-2 text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/70 dark:bg-white/10 dark:text-white/80"
    >
      <PlusGlyph />
    </button>
  ) : null;

  return (
    <div data-leochat-toolbar className="flex shrink-0 items-center gap-1.5 px-1.5 pt-1.5">
      <input
        type="search"
        data-leochat-search
        value={search}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) onSearchCommit?.(event.currentTarget.value);
        }}
        className="min-w-0 flex-1 rounded-xl border-0 bg-neutral-100/80 px-3 py-2 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:bg-white/10"
      />
      {many ? (
        <div ref={menuRootRef} className="relative shrink-0">
          {plusButton}
          {menuOpen ? (
            <div
              role="menu"
              data-leochat-plus-menu
              className="absolute right-0 top-full z-30 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
            >
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  data-leochat-action={action.id}
                  onClick={() => {
                    setMenuOpen(false);
                    action.onSelect();
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[13px] text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        plusButton
      )}
    </div>
  );
}
