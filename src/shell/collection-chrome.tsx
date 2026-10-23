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
export type CollectionSort = {
  by: "none" | "favorite" | "time" | "size";
  direction: "asc" | "desc";
};

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

// ---- 筛选下拉的外观（CollectionFilterSelect 与 LeoBay 的 BayFilterSelect 共用同一份） ----------
// 参考 Slack 搜索筛选（「All channels ⌄」）：白底、浅灰细边、圆角矩形、粗体；按键上只写当前值，
// 筛选的名称（label）不再画在按键上，只作读屏名。所有取值都使用同一条浅灰边框。
// 只用 src/theme/ui.css 产物里已有的类：新类要先重编产物，而产物不归本文件管。

/** 触发键：高度字号对齐页头搜索框（SEARCH_INPUT_CLASS 的 h-9 / 13px）。键盘焦点用内圈，不会被横滑的筛选行剪掉。 */
export const COLLECTION_FILTER_TRIGGER_CLASS =
  "inline-flex h-9 max-w-xs shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border bg-white px-3 text-[13px] font-semibold outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400";

/** 取值不改变边框；展开时仅用中灰边反馈焦点。 */
export function collectionFilterTriggerClass(state: { filtered: boolean; open?: boolean }): string {
  const tone = state.open
    ? "border-neutral-400 text-neutral-900"
    : "border-neutral-200 text-neutral-800 hover:border-neutral-400";
  return `${COLLECTION_FILTER_TRIGGER_CLASS} ${tone}`;
}

/** 选项单：白底圆角清单，和触发键同一条浅灰边。清单本身可聚焦（tabIndex -1，键盘在它上面），不抑制轮廓——焦点环预算锁不许新增没补环的 outline-none。 */
export const COLLECTION_FILTER_MENU_CLASS =
  "z-50 flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg";

/** 选项单里的一行：高亮 = 浅灰底；选中 = 加粗（前面还有勾）；点不动 = 灰字。 */
export function collectionFilterOptionClass(state: {
  active: boolean;
  selected: boolean;
  disabled?: boolean;
}): string {
  const base = "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]";
  if (state.disabled) return `${base} cursor-not-allowed text-neutral-400`;
  if (state.active) return `${base} bg-neutral-100 font-semibold text-neutral-900`;
  if (state.selected) return `${base} font-semibold text-neutral-900 hover:bg-neutral-50`;
  return `${base} text-neutral-700 hover:bg-neutral-50`;
}

/**
 * 按键显示值与筛选状态。纯函数，两份下拉共用。
 * - 值是某个选项 → 写那个选项的 label；没选（值为「未筛选」的值）→ 写 allLabel；都没有才退回 label。
 * - 「未筛选」的值默认是 ""；用 "all" 当全部的调用方传 defaultValue="all"。
 * - 只有值落在某个选项上、且不等于「未筛选」的值，才算筛了。
 */
export function collectionFilterState<T extends { value: string; label: string }>(input: {
  label: string;
  value: string;
  options: readonly T[];
  allLabel?: string;
  defaultValue?: string;
}): { current: T | undefined; filtered: boolean; shown: string; unfilteredValue: string } {
  const unfilteredValue = input.defaultValue ?? "";
  const current = input.options.find((option) => option.value === input.value);
  return {
    current,
    filtered: Boolean(current) && input.value !== unfilteredValue,
    shown: current?.label || input.allLabel || input.label,
    unfilteredValue,
  };
}

const PAD = 8;
const MENU_MIN = 208;
const MENU_GAP = 4;
/** 菜单要盖过项目页里的弹窗（z-[80]～z-[2147483100]），所以不靠 z-50 这个类，直接写行内 zIndex。 */
const MENU_Z_INDEX = 2147483500;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** 菜单贴着触发键放：下面放得下就放下面，否则放上面；宽度不小于触发键，也不小于 MENU_MIN。 */
export function collectionMenuPlace(rect: DOMRect, minWidth = MENU_MIN): CSSProperties {
  const maxWidth = Math.max(0, window.innerWidth - PAD * 2);
  const width = Math.min(Math.max(rect.width, minWidth), maxWidth);
  const left = Math.max(PAD, Math.min(rect.left, window.innerWidth - width - PAD));
  const spaceBelow = window.innerHeight - rect.bottom - PAD;
  const spaceAbove = rect.top - PAD;
  const below = spaceBelow >= 160 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(160, below ? spaceBelow : spaceAbove);
  if (below) {
    return { position: "fixed", top: rect.bottom + MENU_GAP, left, width, minWidth: width, maxWidth, maxHeight, zIndex: MENU_Z_INDEX };
  }
  return { position: "fixed", bottom: window.innerHeight - rect.top + MENU_GAP, left, width, minWidth: width, maxWidth, maxHeight, zIndex: MENU_Z_INDEX };
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

/** 选项前的勾位：选中画勾，没选留同宽空位，各行文字对得齐。两份下拉共用。 */
export function CollectionFilterCheck({ on }: { on: boolean }): ReactElement {
  return on ? (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      data-collection-filter-check=""
    >
      <path d="M5 12l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden="true" />
  );
}

/** 触发键里面：当前值（太长就省略）+ 下箭头。读屏靠 id 把当前值接到按键的 aria-describedby 上。 */
export function CollectionFilterTriggerFace({
  id,
  text,
  open,
}: {
  id: string;
  text: string;
  open: boolean;
}): ReactElement {
  return (
    <>
      <span id={id} data-collection-filter-value="" className="min-w-0 truncate">
        {text}
      </span>
      <CollectionFilterChevron open={open} />
    </>
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
  sort?: CollectionSort;
  onSortChange?: (sort: CollectionSort) => void;
  sortBusy?: boolean;
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
      if (target instanceof Element && target.closest("[data-collection-filter-menu]")) return;
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
          {props.sort && props.onSortChange ? (
            <div
              className="mt-1 border-t border-neutral-100 px-2.5 py-2"
              role="group"
              aria-label={tt("排序")}
              data-collection-sort-controls=""
            >
              <div className="relative flex flex-col gap-1.5 text-[12px] text-neutral-500">
                <span>{tt("排序")}</span>
                <CollectionFilterSelect
                  name="sort"
                  label={tt("排序方式")}
                  value={props.sort.by}
                  defaultValue="none"
                  disabled={props.sortBusy}
                  options={[
                    { value: "none", label: tt("默认顺序") },
                    { value: "favorite", label: tt("收藏") },
                    { value: "time", label: tt("时间") },
                    { value: "size", label: tt("大小") },
                  ]}
                  onChange={(by) => props.onSortChange?.({ ...props.sort!, by: by as CollectionSort["by"] })}
                />
                <select
                  aria-hidden="true"
                  tabIndex={-1}
                  data-collection-sort=""
                  value={props.sort.by}
                  disabled={props.sortBusy}
                  onChange={(event) =>
                    props.onSortChange?.({
                      ...props.sort!,
                      by: event.currentTarget.value as CollectionSort["by"],
                    })
                  }
                  className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
                >
                  <option value="none">{tt("默认顺序")}</option>
                  <option value="favorite">{tt("收藏")}</option>
                  <option value="time">{tt("时间")}</option>
                  <option value="size">{tt("大小")}</option>
                </select>
              </div>
              {props.sort.by !== "none" ? (
                <button
                  type="button"
                  data-collection-sort-direction=""
                  aria-label={tt("切换排序方向")}
                  disabled={props.sortBusy}
                  onClick={() =>
                    props.onSortChange?.({
                      ...props.sort!,
                      direction:
                        props.sort!.direction === "asc" ? "desc" : "asc",
                    })
                  }
                  className="mt-1.5 w-full rounded-md px-2 py-1 text-left text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {tt(props.sort.direction === "asc" ? "升序" : "降序")}
                </button>
              ) : null}
              {props.sortBusy ? (
                <span role="status" className="mt-1 block text-[11px] text-neutral-500">
                  {tt("正在加载完整列表以排序…")}
                </span>
              ) : null}
            </div>
          ) : null}
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

/**
 * 筛选下拉。按键上只写当前值（「全部类型 ⌄」「图片 ⌄」），不再画「名称：值」两截；
 * 名称 `label` 只作按键的 aria-label 和菜单的读屏名。所有取值保持浅灰边框。
 */
export function CollectionFilterSelect(props: {
  /** 这个筛选叫什么（已 tt()）：类型 / 分区 / 站点。不画在按键上，只给读屏。 */
  label: string;
  name: string;
  value: string;
  options: readonly CollectionFilterOption[];
  onChange: (value: string) => void;
  /** 「全部」那一项（值为 defaultValue，默认 ""）。必须自带名词：「全部类型」，不许光秃秃的「全部」。 */
  allLabel?: string;
  /** 值等于它时视作「未筛选」。用 "all" 当全部的调用方传 "all"；不传以 "" 为未筛选。 */
  defaultValue?: string;
  searchable?: boolean;
  accent?: string;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  const listId = useId();
  const valueId = `${listId}-value`;
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const highlightedRef = useRef<HTMLButtonElement | null>(null);

  const { filtered, shown: shownValue, unfilteredValue } = collectionFilterState({
    label: props.label,
    value: props.value,
    options: props.options,
    allLabel: props.allLabel,
    defaultValue: props.defaultValue,
  });
  const shown = useMemo(() => {
    const text = needle.trim().toLowerCase();
    return text ? props.options.filter((option) => option.label.toLowerCase().includes(text)) : props.options;
  }, [needle, props.options]);
  const items = useMemo(() => {
    const rows: CollectionFilterOption[] = [];
    if (props.allLabel && !needle.trim() && !props.options.some((option) => option.value === unfilteredValue)) {
      rows.push({ value: unfilteredValue, label: props.allLabel });
    }
    rows.push(...shown);
    return rows;
  }, [props.allLabel, props.options, needle, shown, unfilteredValue]);
  const activeId = items[highlight] ? `${listId}-opt-${highlight}` : undefined;

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
    setPlace(collectionMenuPlace(triggerRef.current.getBoundingClientRect()));
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
    // Esc 只关菜单：捕获阶段拦下，菜单开在弹窗（Modal 在 document 上听 Esc）里时不会连弹窗一起关掉。
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
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
        aria-label={props.label}
        aria-describedby={valueId}
        data-collection-filter={props.name}
        data-value={props.value}
        data-filtered={filtered ? "true" : undefined}
        disabled={props.disabled}
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
        className={collectionFilterTriggerClass({ filtered, open })}
      >
        <CollectionFilterTriggerFace id={valueId} text={shownValue} open={open} />
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
              className={COLLECTION_FILTER_MENU_CLASS}
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
                      className={collectionFilterOptionClass({ active, selected: on })}
                    >
                      <CollectionFilterCheck on={on} />
                      {option.icon}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {typeof option.count === "number" ? (
                        <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">{option.count}</span>
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
