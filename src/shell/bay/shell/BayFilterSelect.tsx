"use client";

// LeoBay 工具条上的下拉筛选：一个按键，上面只写当前值（「全部类型 ⌄」），点开是一张选项单。
// 服务 / 需求的「站点」，素材的「类型」「来源」「目录」都用这一个件，所以筛选只占一行，不再叠成几排小标签。
// 外观（按键、选项单、勾）与库 / 工作台用的 CollectionFilterSelect 是同一份，类名与取值逻辑都来自 collection-chrome。
//
// 另有一对「槽」：`BayToolbarFilterSlot` 摆在工具条里，`BayToolbarFilters` 把自己的子节点送进那个槽。
// 素材库的筛选状态在素材库自己手里，靠这对槽把下拉画到页面那一行工具条上；没有槽时（右侧栏、境内只剩素材的页）就地画成一行。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import {
  COLLECTION_FILTER_MENU_CLASS,
  CollectionFilterCheck,
  CollectionFilterTriggerFace,
  CollectionMenuSearchField,
  collectionFilterOptionClass,
  collectionFilterState,
  collectionFilterTriggerClass,
  collectionMenuPlace,
} from "../../collection-chrome";

export interface BayFilterOption {
  value: string;
  /** 已经过 `tt()` 的显示文字。 */
  label: string;
  /** 件数；给了就画在右边。 */
  count?: number;
  disabled?: boolean;
  /** 点不动时的说明（如「此类型没有实时开源上游。」）。 */
  hint?: string;
  icon?: ReactNode;
}

export interface BayFilterSelectProps {
  /** 这个筛选叫什么（已 `tt()`）：站点 / 类型 / 来源 / 目录 / 行业。不画在按键上，只作按键的 aria-label 和选项单的读屏名。 */
  label: string;
  /** 当前值；`""`（或 `defaultValue`）表示没选（显示 `allLabel`）。 */
  value: string;
  options: readonly BayFilterOption[];
  onChange: (value: string) => void;
  /** 给了就在选项单顶上多一条「全部」（值为 `defaultValue`，默认 `""`）。必须自带名词：「全部站点」，不许光秃秃的「全部」。 */
  allLabel?: string;
  /** 值等于它时视作「未筛选」、不加深边框。用 `"all"` 当全部的调用方传 `"all"`；不传以 `""` 为未筛选。 */
  defaultValue?: string;
  /** 选项多时（站点有 33 个）在单子顶上放一个可打字的过滤框。 */
  searchable?: boolean;
  accent?: string;
  /** 写到按键上的 `data-bay-filter`，测试与埋点用。 */
  name: string;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function firstEnabled(rows: readonly BayFilterOption[], from: number, step: number): number {
  const n = rows.length;
  if (!n) return 0;
  let i = from;
  for (let k = 0; k < n; k += 1) {
    i = ((i % n) + n) % n;
    if (!rows[i]?.disabled) return i;
    i += step;
  }
  return from;
}

export function BayFilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
  defaultValue,
  searchable,
  name,
}: BayFilterSelectProps): ReactElement {
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
    label,
    value,
    options,
    allLabel,
    defaultValue,
  });
  const shown = useMemo(() => {
    const text = needle.trim().toLowerCase();
    return text ? options.filter((option) => option.label.toLowerCase().includes(text)) : options;
  }, [needle, options]);
  const items = useMemo(() => {
    const rows: BayFilterOption[] = [];
    if (allLabel && !needle.trim() && !options.some((option) => option.value === unfilteredValue)) {
      rows.push({ value: unfilteredValue, label: allLabel });
    }
    rows.push(...shown);
    return rows;
  }, [allLabel, options, needle, shown, unfilteredValue]);
  const activeId = items[highlight] ? `${listId}-opt-${highlight}` : undefined;

  const close = useCallback(() => {
    setOpen(false);
    setNeedle("");
  }, []);

  const pick = useCallback(
    (next: string) => {
      onChange(next);
      close();
      triggerRef.current?.focus();
    },
    [onChange, close],
  );

  const move = useCallback(
    (step: number) => {
      setHighlight((currentIndex) => firstEnabled(items, currentIndex + step, step));
    },
    [items],
  );

  useIsoLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setPlace(collectionMenuPlace(triggerRef.current.getBoundingClientRect()));
  }, [open, items.length]);

  useIsoLayoutEffect(() => {
    if (!open) return;
    const row = highlightedRef.current;
    if (row && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
    if (!searchable) menuRef.current?.focus();
  }, [open, highlight, place, searchable]);

  const openedForHighlight = useRef(false);
  useEffect(() => {
    if (!open) {
      openedForHighlight.current = false;
      return;
    }
    if (!openedForHighlight.current) {
      openedForHighlight.current = true;
      const selected = items.findIndex((option) => option.value === value);
      setHighlight(selected >= 0 ? selected : firstEnabled(items, 0, 1));
      return;
    }
    setHighlight(firstEnabled(items, 0, 1));
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
    // Esc 只关菜单：捕获阶段拦下，不连带关掉外层弹窗。
    const onKey = (event: KeyboardEvent) => {
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
      setHighlight(firstEnabled(items, 0, 1));
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlight(firstEnabled(items, items.length - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = items[highlight];
      if (option && !option.disabled) pick(option.value);
    }
  };

  const row = (option: BayFilterOption, index: number) => {
    const on = option.value === value;
    const active = index === highlight;
    return (
      <button
        key={`${option.value || "__all"}-${index}`}
        id={`${listId}-opt-${index}`}
        ref={active ? highlightedRef : undefined}
        type="button"
        role="option"
        aria-selected={on}
        aria-disabled={option.disabled || undefined}
        title={option.disabled ? option.hint : undefined}
        data-value={option.value}
        data-view={option.value}
        data-highlight={active ? "true" : undefined}
        onMouseEnter={() => setHighlight(index)}
        onClick={() => (option.disabled ? undefined : pick(option.value))}
        className={collectionFilterOptionClass({ active, selected: on, disabled: option.disabled })}
      >
        <CollectionFilterCheck on={on} />
        {option.icon}
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {typeof option.count === "number" ? <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">{option.count}</span> : null}
      </button>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        aria-describedby={valueId}
        data-bay-filter={name}
        data-value={value}
        data-filtered={filtered ? "true" : undefined}
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
              aria-label={label}
              aria-activedescendant={activeId}
              data-bay-filter-menu={name}
              style={place}
              onKeyDown={onMenuKeyDown}
              className={COLLECTION_FILTER_MENU_CLASS}
            >
              {searchable ? (
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
                {items.map((option, index) => row(option, index))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ---- 工具条上的筛选槽 -----------------------------------------------------------

const SlotElementContext = createContext<HTMLElement | null>(null);
const SlotSetterContext = createContext<((element: HTMLElement | null) => void) | null>(null);

/** 包住「工具条 + 下面的内容」：两者靠它对上同一个槽。 */
export function BayToolbarSlotProvider({ children }: { children: ReactNode }): ReactElement {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return (
    <SlotSetterContext.Provider value={setElement}>
      <SlotElementContext.Provider value={element}>{children}</SlotElementContext.Provider>
    </SlotSetterContext.Provider>
  );
}

/** 工具条里留给内容区送筛选进来的位置。自己不占版面（`display: contents`）。 */
export function BayToolbarFilterSlot(): ReactElement {
  const setElement = useContext(SlotSetterContext);
  return <div ref={setElement ?? undefined} data-bay-toolbar-slot className="contents" />;
}

/** 内容区把自己的下拉送进工具条；没有槽时就地排成不换行的一行。 */
export function BayToolbarFilters({ children }: { children: ReactNode }): ReactElement {
  const element = useContext(SlotElementContext);
  const hasProvider = useContext(SlotSetterContext) !== null;
  if (element) return createPortal(children, element);
  if (hasProvider) return <></>;
  return (
    <div data-bay-toolbar-inline className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
      {children}
    </div>
  );
}
