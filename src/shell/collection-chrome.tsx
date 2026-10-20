"use client";

// 列表页共用 chrome：项目页搜索、Manus「查看选项」、库网格/列表、LeoBay 站点胶囊、
// 滑到底自动接下页。视觉只抄这四处，不另起第三套。不要 import bay 模块。

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../i18n/ui/useUI";
import { APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS } from "./AppPageHeader";

export type CollectionView = "grid" | "list";

export type CollectionViewOption = {
  id: string;
  label: string; // already tt()'d or raw zh for tt()
  checked?: boolean;
  count?: number;
  onSelect: () => void;
};

export type CollectionFilterOption = {
  value: string;
  label: string; // already tt()'d
  icon?: ReactNode;
  count?: number;
};

const SEARCH_INPUT_CLASS =
  "h-9 w-56 rounded-xl border border-neutral-200 bg-white pr-3 text-[13px] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const SEARCH_INPUT_STYLE = { paddingLeft: 36, appearance: "none" } as const;

const FILTER_TRIGGER =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

const PAD = 8;
const MENU_MIN = 208;
const MENU_GAP = 4;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function menuPlace(rect: DOMRect): CSSProperties {
  const maxWidth = Math.max(0, window.innerWidth - PAD * 2);
  const width = Math.min(Math.max(rect.width, MENU_MIN), maxWidth);
  const left = Math.max(PAD, Math.min(rect.left, window.innerWidth - width - PAD));
  const spaceBelow = window.innerHeight - rect.bottom - PAD;
  const spaceAbove = rect.top - PAD;
  const below = spaceBelow >= 160 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(160, below ? spaceBelow : spaceAbove);
  if (below) {
    return { position: "fixed", top: rect.bottom + MENU_GAP, left, width, minWidth: width, maxWidth, maxHeight };
  }
  return { position: "fixed", bottom: window.innerHeight - rect.top + MENU_GAP, left, width, minWidth: width, maxWidth, maxHeight };
}

function wrapIndex(length: number, from: number): number {
  if (!length) return 0;
  return ((from % length) + length) % length;
}

function SearchMagnifier(): ReactElement {
  return (
    <svg
      className="pointer-events-none text-neutral-400"
      style={{
        position: "absolute",
        left: 12,
        top: "50%",
        width: 16,
        height: 16,
        transform: "translateY(-50%)",
      }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function SlidersIcon(): ReactElement {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
      <circle cx="9" cy="6" r="2" fill="currentColor" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <circle cx="8" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 胶囊右侧箭头：收起朝下，打开朝上。LeoBay / 工作台 / 项目 / 我的库共用。 */
export function CollectionFilterChevron({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      data-collection-filter-chevron={open ? "up" : "down"}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 页头下一行：和 LeoBay 种类 / 站点同一位置、同一只横滑胶囊行。 */
export const COLLECTION_FILTER_ROW_CLASS =
  "mt-5 flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto";

export function CollectionFilterRow({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">): ReactElement {
  return (
    <div
      className={className ? `${COLLECTION_FILTER_ROW_CLASS} ${className}` : COLLECTION_FILTER_ROW_CLASS}
      data-collection-filter-row=""
      {...rest}
    >
      {children}
    </div>
  );
}

const MENU_SEARCH_INPUT_CLASS =
  "h-9 w-full rounded-xl border border-neutral-200 bg-white pr-3 text-[13px] outline-none placeholder:text-neutral-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export function CollectionSearchField(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onCommit?: (value: string) => void;
  id?: string;
  "data-testid"?: string;
}): ReactElement {
  const generatedId = useId();
  const searchId = props.id ?? generatedId;
  return (
    <div className="relative">
      <SearchMagnifier />
      <input
        id={searchId}
        type="search"
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        data-collection-search=""
        data-testid={props["data-testid"]}
        className={SEARCH_INPUT_CLASS}
        style={SEARCH_INPUT_STYLE}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") props.onCommit?.(event.currentTarget.value);
        }}
      />
    </div>
  );
}

/** 下拉菜单里的搜索：和页头搜索同一只白框、同一只放大镜，宽度铺满菜单。 */
export function CollectionMenuSearchField(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
  id?: string;
  "aria-label"?: string;
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
}): ReactElement {
  return (
    <div className="relative mb-1" data-collection-menu-search="">
      <SearchMagnifier />
      <input
        id={props.id}
        type="search"
        autoFocus={props.autoFocus}
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props["aria-label"] ?? props.placeholder}
        aria-controls={props["aria-controls"]}
        aria-activedescendant={props["aria-activedescendant"]}
        className={MENU_SEARCH_INPUT_CLASS}
        style={SEARCH_INPUT_STYLE}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
    </div>
  );
}

export function CollectionViewOptions(props: {
  options: CollectionViewOption[];
  label?: string; // default tt("查看选项")
}): ReactElement {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonLabel = props.label ?? tt("查看选项");

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
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
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        data-collection-view-options=""
        onClick={() => setOpen((current) => !current)}
        className="rounded-md p-1.5 text-[var(--muted,#a3a3a3)] transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-[var(--fg-2,#525252)]"
      >
        <SlidersIcon />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[12rem] rounded-xl border bg-white p-1 shadow-lg"
        >
          {props.options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={Boolean(option.checked)}
              data-collection-view-option={option.id}
              onClick={() => {
                option.onSelect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-800 hover:bg-neutral-50"
            >
              <span className="min-w-0 flex-1 truncate">{tt(option.label)}</span>
              {typeof option.count === "number" ? (
                <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">{option.count}</span>
              ) : null}
              {option.checked ? <CheckIcon /> : <span className="inline-block h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CollectionViewToggle(props: {
  view: CollectionView;
  onChange: (view: CollectionView) => void;
}): ReactElement {
  const tt = useUI();
  const buttonClass = (on: boolean) =>
    `rounded-md p-1.5 transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
      on
        ? "bg-[var(--card,#fff)] text-[var(--fg,#404040)] shadow-sm"
        : "text-[var(--muted,#a3a3a3)] hover:text-[var(--fg-2,#525252)]"
    }`;
  return (
    <div
      className="flex shrink-0 items-center rounded-lg bg-[var(--surface,#f5f5f5)] p-0.5"
      role="group"
      aria-label={tt("素材视图")}
    >
      <button
        type="button"
        onClick={() => props.onChange("grid")}
        className={buttonClass(props.view === "grid")}
        title={tt("网格视图")}
        aria-label={tt("网格视图")}
        aria-pressed={props.view === "grid"}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => props.onChange("list")}
        className={buttonClass(props.view === "list")}
        title={tt("列表视图")}
        aria-label={tt("列表视图")}
        aria-pressed={props.view === "list"}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function CollectionPageToolbar(props: {
  title: ReactNode;
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  onSearchCommit?: (value: string) => void;
  view: CollectionView;
  onViewChange: (view: CollectionView) => void;
  hideView?: boolean;
  viewOptions: CollectionViewOption[];
  extraActions?: ReactNode;
}): ReactElement {
  const tt = useUI();
  const title =
    typeof props.title === "string" ? (
      <h1 className={APP_PAGE_TITLE_CLASS}>{tt(props.title)}</h1>
    ) : (
      props.title
    );
  return (
    <header className={APP_PAGE_HEADER_ROW_CLASS} data-collection-toolbar="">
      {title}
      <div className="flex min-w-0 items-center justify-end gap-2" data-collection-toolbar-chrome="">
        <CollectionSearchField
          value={props.search}
          onChange={props.onSearch}
          placeholder={props.searchPlaceholder}
          onCommit={props.onSearchCommit}
        />
        <CollectionViewOptions options={props.viewOptions} />
        {props.hideView ? null : <CollectionViewToggle view={props.view} onChange={props.onViewChange} />}
        {props.extraActions}
      </div>
    </header>
  );
}

/** 四页货架同一行：永远四列等宽铺满，不再按 12rem 自动加列、右边留空。 */
export const COLLECTION_CARD_GRID_COLUMNS = 4;
export const COLLECTION_CARD_GRID_CLASS = "grid gap-2.5";
export const COLLECTION_CARD_GRID_STYLE = {
  gridTemplateColumns: `repeat(${COLLECTION_CARD_GRID_COLUMNS}, minmax(0, 1fr))`,
} as const;

/** 页头动作：LeoBay「我的 / 发布」、我的库「上传文件」同一只圆胶囊。 */
export const COLLECTION_ACTION_BTN =
  "inline-flex shrink-0 items-center justify-center rounded-full px-4 py-2 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:cursor-not-allowed disabled:opacity-50";
export const COLLECTION_ACTION_BTN_GHOST = `${COLLECTION_ACTION_BTN} border border-neutral-900 bg-white text-neutral-900`;
export const COLLECTION_ACTION_BTN_PRIMARY = `${COLLECTION_ACTION_BTN} bg-neutral-900 text-white`;

export function CollectionCardGrid({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<"div">, "className" | "style">): ReactElement {
  return (
    <div
      className={className ? `${COLLECTION_CARD_GRID_CLASS} ${className}` : COLLECTION_CARD_GRID_CLASS}
      data-collection-card-grid=""
      style={COLLECTION_CARD_GRID_STYLE}
      {...rest}
    >
      {children}
    </div>
  );
}

function nearestScrollRoot(el: Element | null): Element | null {
  if (typeof window === "undefined" || !el) return null;
  let node: Element | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** 列表底部哨兵：滑近底部就接下页。没有 IntersectionObserver 时留下读屏用的「继续加载」。 */
export function CollectionInfiniteSentinel(props: {
  active: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  rootRef?: RefObject<Element | null>;
}): ReactElement | null {
  const tt = useUI();
  const ref = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(props.onLoadMore);
  onLoadMoreRef.current = props.onLoadMore;
  const { active, loading = false, rootRef } = props;

  useEffect(() => {
    if (!active || loading) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current();
      },
      {
        root: rootRef?.current ?? nearestScrollRoot(el),
        rootMargin: "240px 0px",
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, loading, rootRef]);

  if (!active && !loading) return null;

  return (
    <div
      ref={ref}
      data-collection-infinite-sentinel=""
      className="flex min-h-8 items-center justify-center py-3"
    >
      {loading ? (
        <span className="text-[12px] text-neutral-400">{tt("正在加载…")}</span>
      ) : (
        <button
          type="button"
          data-collection-load-more=""
          onClick={() => onLoadMoreRef.current()}
          className="sr-only"
        >
          {tt("继续加载")}
        </button>
      )}
    </div>
  );
}

export function CollectionFilterSelect(props: {
  label: string;
  name: string;
  value: string;
  options: readonly CollectionFilterOption[];
  onChange: (value: string) => void;
  allLabel?: string;
  searchable?: boolean;
  accent?: string;
}): ReactElement {
  const tt = useUI();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const highlightedRef = useRef<HTMLButtonElement | null>(null);

  const current = props.options.find((option) => option.value === props.value);
  const picked = Boolean(current && props.value !== "");
  const shown = useMemo(() => {
    const text = needle.trim().toLowerCase();
    return text ? props.options.filter((option) => option.label.toLowerCase().includes(text)) : props.options;
  }, [needle, props.options]);
  const items = useMemo(() => {
    const rows: CollectionFilterOption[] = [];
    if (props.allLabel && !needle.trim()) rows.push({ value: "", label: props.allLabel });
    rows.push(...shown);
    return rows;
  }, [props.allLabel, needle, shown]);
  const activeId = items[highlight] ? `${listId}-opt-${highlight}` : undefined;
  const shownValue = picked ? current?.label : props.allLabel;

  const close = useCallback(() => {
    setOpen(false);
    setNeedle("");
  }, []);

  const pick = useCallback(
    (next: string) => {
      props.onChange(next);
      close();
      triggerRef.current?.focus();
    },
    [props, close],
  );

  const move = useCallback(
    (step: number) => {
      setHighlight((currentIndex) => wrapIndex(items.length, currentIndex + step));
    },
    [items.length],
  );

  useIsoLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setPlace(menuPlace(triggerRef.current.getBoundingClientRect()));
  }, [open, items.length]);

  useIsoLayoutEffect(() => {
    if (!open) return;
    const row = highlightedRef.current;
    if (row && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
    if (!props.searchable) menuRef.current?.focus();
  }, [open, highlight, place, props.searchable]);

  const openedForHighlight = useRef(false);
  useEffect(() => {
    if (!open) {
      openedForHighlight.current = false;
      return;
    }
    if (!openedForHighlight.current) {
      openedForHighlight.current = true;
      const selected = items.findIndex((option) => option.value === props.value);
      setHighlight(selected >= 0 ? selected : wrapIndex(items.length, 0));
      return;
    }
    setHighlight(wrapIndex(items.length, 0));
    // 打开时对准当前选中项；之后只有过滤字变了才把高亮拨回第一条。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needle]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  const onMenuKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlight(wrapIndex(items.length, 0));
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlight(wrapIndex(items.length, items.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = items[highlight];
      if (option) pick(option.value);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-collection-filter={props.name}
        data-value={props.value}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (!open) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === "Home" || event.key === "End") {
            onMenuKeyDown(event);
          }
        }}
        className={`${FILTER_TRIGGER} ${picked ? "border-neutral-900 bg-white font-medium text-neutral-900" : "border-neutral-900 bg-white text-neutral-700 hover:text-neutral-900"}`}
      >
        <span className={picked ? "opacity-70" : undefined}>{props.label}</span>
        {shownValue != null && shownValue !== "" ? <span className="max-w-[10rem] truncate">{shownValue}</span> : null}
        <CollectionFilterChevron open={open} />
      </button>
      {open && place && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={props.label}
              aria-activedescendant={activeId}
              data-collection-filter-menu={props.name}
              style={place}
              onKeyDown={onMenuKeyDown}
              className="z-50 flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
            >
              {props.searchable ? (
                <CollectionMenuSearchField
                  autoFocus
                  value={needle}
                  placeholder={tt("搜索")}
                  aria-label={tt("搜索")}
                  aria-controls={listId}
                  aria-activedescendant={activeId}
                  onChange={setNeedle}
                  onKeyDown={onMenuKeyDown}
                />
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {items.map((option, index) => {
                  const on = option.value === props.value;
                  const active = index === highlight;
                  return (
                    <button
                      key={`${option.value || "__all"}-${index}`}
                      id={`${listId}-opt-${index}`}
                      ref={active ? highlightedRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-value={option.value}
                      data-highlight={active ? "true" : undefined}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pick(option.value)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${
                        active
                          ? "bg-stone-100 font-medium text-stone-900"
                          : on
                            ? "font-medium text-stone-900"
                            : "text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      {option.icon}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {typeof option.count === "number" ? (
                        <span className="shrink-0 text-[12px] tabular-nums text-stone-400">{option.count}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
