"use client";

// Skills overhaul 2026-10-24 — W09A：Manus 式「+ 添加 ▾」下拉（UI-DESIGN「Add ▾ 下拉」）。
// 宽约 420、圆角 16、阴影；每项 = 线性图标 + 15px 标题 + 13px 灰说明。
// 键盘：按钮上 ↓ / Enter / Space 打开并聚焦第一项；菜单内 ↑↓ / Home / End 移动（跳过禁用项），
// Enter / Space 选中，Esc 关闭并把焦点还给按钮（不连带关掉外层大弹窗），Tab 关闭；点外面关闭。

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import { KitIconChevronDown, KitIconPlus } from "./kit-icons";
import { CONFIG_PRIMARY_BUTTON_CLASS, CONFIG_TOOLBAR_BUTTON_CLASS } from "./ConfigToolbar";

export interface AddMenuItem {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** 在这一项之前画一条分组细线（可选扩展，不影响合同形状）。 */
  separatorBefore?: boolean;
}

export interface AddMenuProps {
  label?: ReactNode;
  items: AddMenuItem[];
  variant?: "primary" | "secondary";
}

const MENU_WIDTH = 420;
const GAP = 8;
const EDGE = 12;

/** 下一个可用项（循环，跳过禁用）。全禁用返回 -1。 */
export function nextEnabledIndex(
  items: readonly { disabled?: boolean }[],
  from: number,
  step: 1 | -1,
): number {
  const n = items.length;
  if (!n) return -1;
  for (let k = 1; k <= n; k += 1) {
    const i = (((from + step * k) % n) + n) % n;
    if (!items[i].disabled) return i;
  }
  return -1;
}

export function AddMenu({ label, items, variant = "primary" }: AddMenuProps) {
  const tt = useUI();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn || typeof window === "undefined") return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(MENU_WIDTH, vw - EDGE * 2);
    let left = r.right - width; // 右对齐按钮
    left = Math.max(EDGE, Math.min(left, vw - width - EDGE));
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const menuH = menuRef.current?.scrollHeight ?? 360;
    if (below >= Math.min(menuH, 240) || below >= above) {
      setPos({ top: r.bottom + GAP, left, width, maxHeight: Math.max(160, below) });
    } else {
      const h = Math.min(menuH, above);
      setPos({ top: r.top - GAP - h, left, width, maxHeight: Math.max(160, above) });
    }
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setActive(-1);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const openAt = useCallback(
    (index: number) => {
      setOpen(true);
      setActive(index);
    },
    [],
  );

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      const t = event.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close(false);
    };
    const onReflow = () => place();
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, close, place]);

  useEffect(() => {
    if (open && active >= 0) itemRefs.current[active]?.focus({ preventScroll: false });
  }, [open, active, pos]);

  const select = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    close(true);
    item.onSelect();
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAt(nextEnabledIndex(items, -1, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(nextEnabledIndex(items, 0, -1));
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => nextEnabledIndex(items, i, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => nextEnabledIndex(items, i < 0 ? 0 : i, -1));
        break;
      case "Home":
        event.preventDefault();
        setActive(nextEnabledIndex(items, -1, 1));
        break;
      case "End":
        event.preventDefault();
        setActive(nextEnabledIndex(items, 0, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(active);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      default:
        break;
    }
  };

  const buttonClass = variant === "primary" ? CONFIG_PRIMARY_BUTTON_CLASS : CONFIG_TOOLBAR_BUTTON_CLASS;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-add-menu-trigger=""
        className={buttonClass}
        onClick={() => (open ? close(false) : openAt(-1))}
        onKeyDown={onButtonKey}
      >
        <KitIconPlus className="h-4 w-4" />
        <span>{label ?? tt("添加")}</span>
        <KitIconChevronDown
          className={`h-4 w-4 transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-orientation="vertical"
              data-add-menu=""
              onKeyDown={onMenuKey}
              style={
                pos
                  ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
                  : { visibility: "hidden", top: 0, left: 0, width: MENU_WIDTH }
              }
              className="fixed z-[1010] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1.5 text-neutral-900 shadow-[0_12px_40px_rgba(0,0,0,0.14)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {items.map((item, index) => (
                <Fragment key={item.id}>
                  {item.separatorBefore && index > 0 ? (
                    <div role="separator" className="mx-2 my-1.5 h-px bg-neutral-200 dark:bg-neutral-800" />
                  ) : null}
                  <button
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={index === active ? 0 : -1}
                    aria-disabled={item.disabled || undefined}
                    data-add-menu-item={item.id}
                    onMouseEnter={() => !item.disabled && setActive(index)}
                    onClick={() => select(index)}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                      item.disabled
                        ? "cursor-not-allowed opacity-45"
                        : index === active
                          ? "bg-neutral-100 dark:bg-neutral-800"
                          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-neutral-700 dark:text-neutral-300">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-snug">{item.title}</span>
                      {item.description ? (
                        <span className="mt-0.5 block text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </Fragment>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
