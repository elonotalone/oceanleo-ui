"use client";

// 表单里的下拉（项目页待办编辑、自动化频率、邀请权限等）：一整条选择条，点开是白底圆角清单。
// 2026-10-23 leobay-projects 波：父 agent 先放占位实现定下 props（I-1）；W01 换成正式实现，props 一字不改。
//
// 外观：一整条选择条（宽度随容器、md = h-10 / sm = h-8、圆角、浅灰边、白底），左侧当前值，右侧下箭头。
// 点开的清单和筛选下拉（CollectionFilterSelect）是同一种：白底圆角、选中项前一个勾、portal 到 body，
// 所以在弹窗里也不会被裁掉（菜单的 zIndex 高过项目页的弹窗）。
// 键盘：按键上 ↑ ↓ 打开；清单里 ↑ ↓ Home End 移动、Enter / 空格选中、Esc 关（只关清单，不关外层弹窗）、
// Tab 关并把焦点还给按键、直接打字跳到以该字开头的选项。
// 底下留一个视觉隐藏的原生 <select>（aria-hidden，不进 Tab 顺序）：测试和表单自动化靠它读值 / 改值，
// 它和可见的这条永远同步（值来自同一个 props.value，改它也走同一个 onChange）。
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  COLLECTION_FILTER_MENU_CLASS,
  CollectionFilterCheck,
  CollectionFilterChevron,
  collectionFilterOptionClass,
  collectionMenuPlace,
} from "./collection-chrome";

export interface MenuSelectOption {
  value: string;
  /** 已经过 tt() 的显示文字。 */
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface MenuSelectProps {
  value: string;
  options: readonly MenuSelectOption[];
  onChange: (value: string) => void;
  /** 读屏名字（字段名，已 tt()）。 */
  ariaLabel: string;
  /** 值不在选项里时显示。 */
  placeholder?: string;
  disabled?: boolean;
  /** 写到 data-menu-select，测试用。 */
  name?: string;
  /** 加在最外层容器上（定宽、外边距、flex-1 这类版面类）；选择条本身总是铺满它。 */
  className?: string;
  size?: "md" | "sm";
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** 清单最窄也要这么宽，窄选择条（sm）点开才放得下选项文字。 */
const MENU_MIN_WIDTH = 160;
const TYPE_AHEAD_MS = 700;

const TRIGGER_BASE =
  "flex w-full items-center justify-between gap-2 border bg-white text-left outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-50";
const TRIGGER_SIZE = {
  md: "h-10 rounded-xl px-3 text-[13px]",
  sm: "h-8 rounded-lg px-2.5 text-[12px]",
} as const;

/** 调用方自己给了宽度类就不再默认 w-full，免得两条宽度类互相打架。 */
const OWN_WIDTH = /(^|\s)(w-|min-w-|max-w-|flex-|basis-|grow|shrink)/;

/** 从 `from` 起往 `step` 方向找第一个没禁用的选项；全禁用就原地不动。 */
function firstEnabled(rows: readonly MenuSelectOption[], from: number, step: number): number {
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

export function MenuSelect(props: MenuSelectProps): ReactElement {
  const { value, options, onChange, ariaLabel, placeholder, disabled, name, className, size = "md" } = props;
  const listId = useId();
  const valueId = `${listId}-value`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const highlightedRef = useRef<HTMLButtonElement | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const current = options.find((option) => option.value === value);
  const activeId = options[highlight] ? `${listId}-opt-${highlight}` : undefined;

  const close = useCallback(() => setOpen(false), []);

  const pick = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  useIsoLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setPlace(collectionMenuPlace(triggerRef.current.getBoundingClientRect(), MENU_MIN_WIDTH));
  }, [open, options.length]);

  useIsoLayoutEffect(() => {
    if (!open) return;
    const row = highlightedRef.current;
    if (row && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
    menuRef.current?.focus();
  }, [open, highlight, place]);

  // 打开时高亮对准当前选中项；没有选中项就落在第一个没禁用的上。
  useEffect(() => {
    if (!open) return;
    const selected = options.findIndex((option) => option.value === value && !option.disabled);
    setHighlight(selected >= 0 ? selected : firstEnabled(options, 0, 1));
    typed.current = { text: "", at: 0 };
    // 只在刚打开时对一次；之后高亮由键盘 / 鼠标说了算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // 鼠标按在清单和按键之外 → 关。用捕获阶段，外层弹窗拦了冒泡也照样能关。
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      close();
    };
    // Esc 只关清单：捕获阶段拦下，外层弹窗（原生监听）就不会跟着一起关。
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
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

  const typeAhead = (char: string) => {
    const now = Date.now();
    const text = (now - typed.current.at > TYPE_AHEAD_MS ? "" : typed.current.text) + char.toLowerCase();
    typed.current = { text, at: now };
    // 第一个字从下一项找起（连按同一个字母轮着跳）；字多了就从当前项起，越打越准。
    const start = text.length === 1 ? highlight + 1 : highlight;
    for (let k = 0; k < options.length; k += 1) {
      const index = (start + k) % options.length;
      const option = options[index];
      if (option && !option.disabled && option.label.toLowerCase().startsWith(text)) {
        setHighlight(index);
        return;
      }
    }
  };

  const onMenuKeyDown = (event: {
    key: string;
    preventDefault: () => void;
    stopPropagation: () => void;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
  }) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      setHighlight((index) => firstEnabled(options, index + 1, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setHighlight((index) => firstEnabled(options, index - 1, -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      setHighlight(firstEnabled(options, 0, 1));
    } else if (event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      setHighlight(firstEnabled(options, options.length - 1, -1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const option = options[highlight];
      if (option && !option.disabled) pick(option.value);
    } else if (event.key === "Tab") {
      // 不拦默认动作：先把焦点还给按键，浏览器接着从按键往下一个控件走。
      close();
      triggerRef.current?.focus();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.stopPropagation();
      typeAhead(event.key);
    }
  };

  const triggerClass = `${TRIGGER_BASE} ${TRIGGER_SIZE[size]} ${
    open ? "border-neutral-400" : "border-neutral-200 hover:border-neutral-400"
  }`;
  const rootClass = `relative min-w-0 ${className && OWN_WIDTH.test(className) ? "" : "w-full "}${className ?? ""}`.trim();

  return (
    <div className={rootClass} data-menu-select-root={name ?? ""}>
      <select
        aria-hidden="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-menu-select={name ?? ""}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
      >
        {current ? null : <option value={value}>{placeholder ?? ""}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-describedby={valueId}
        data-menu-select-trigger={name ?? ""}
        data-value={value}
        data-size={size}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClass}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {current?.icon}
          <span id={valueId} className={`min-w-0 truncate ${current ? "text-neutral-900" : "text-neutral-500"}`}>
            {current ? current.label : (placeholder ?? "")}
          </span>
        </span>
        <CollectionFilterChevron open={open} />
      </button>
      {open && place && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-activedescendant={activeId}
              data-menu-select-menu={name ?? ""}
              style={place}
              onKeyDown={onMenuKeyDown}
              // 清单 portal 到了 body，但 React 事件仍会顺着组件树冒泡给外层：选一个选项不该同时点中
              // 外面那一行 / 那个遮罩，所以鼠标事件到清单为止。
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              className={COLLECTION_FILTER_MENU_CLASS}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                {options.map((option, index) => {
                  const on = option.value === value;
                  const active = index === highlight;
                  return (
                    <button
                      key={option.value}
                      id={`${listId}-opt-${index}`}
                      ref={active ? highlightedRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={on}
                      aria-disabled={option.disabled || undefined}
                      data-value={option.value}
                      data-highlight={active ? "true" : undefined}
                      onMouseEnter={() => (option.disabled ? undefined : setHighlight(index))}
                      onClick={() => (option.disabled ? undefined : pick(option.value))}
                      className={collectionFilterOptionClass({ active, selected: on, disabled: option.disabled })}
                    >
                      <CollectionFilterCheck on={on} />
                      {option.icon}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.description ? (
                          <span className="mt-0.5 block text-[12px] font-normal text-neutral-500">{option.description}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
