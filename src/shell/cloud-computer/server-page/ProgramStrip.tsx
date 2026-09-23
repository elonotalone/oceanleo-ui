"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { IconSettings } from "./chrome-icons";
import { tone } from "./tone";

export type ProgramStripItem = {
  id: string;
  label: string;
  dot?: "green" | "yellow" | "gray" | "none";
  running?: boolean;
  disabled?: boolean;
  title?: string;
};

export type ProgramStripProps = {
  items: ProgramStripItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** Shows a settings button after each item. */
  onSettings?: (id: string) => void;
  /** Already translated, e.g. tt("设置"). */
  settingsLabel?: string;
  /** Extra controls on the right, before the row expand/collapse buttons. */
  trailing?: ReactNode;
  /** localStorage key that remembers whether the wrapped rows are collapsed. */
  storageKey?: string;
  ariaLabel?: string;
};

export function ProgramStrip({
  items,
  selected,
  onSelect,
  onSettings,
  settingsLabel = "",
  trailing,
  ariaLabel,
  storageKey,
}: ProgramStripProps) {
  const tt = useUI();
  const rows = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return !!storageKey && localStorage.getItem(storageKey) === "collapsed"; }
    catch { return false; }
  });
  const [wrapped, setWrapped] = useState(false);
  const [firstHeight, setFirstHeight] = useState(40);
  const [visible, setVisible] = useState<string[]>([]);
  useLayoutEffect(() => {
    const node = rows.current;
    if (!node) return;
    const measure = () => {
      const children = Array.from(node.children) as HTMLElement[];
      const top = Math.min(...children.map((child) => child.offsetTop));
      const first = children.filter((child) => child.offsetTop === top);
      setWrapped(children.some((child) => child.offsetTop > top));
      setFirstHeight(first[0]?.offsetHeight || 40);
      const ids = first.map((child) => child.dataset.programId || "");
      setVisible((previous) => previous.join("|") === ids.join("|") ? previous : ids);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    for (const child of Array.from(node.children)) observer?.observe(child);
    return () => observer?.disconnect();
  }, [items, selected, collapsed, wrapped]);
  const collapse = (next: boolean) => {
    setCollapsed(next);
    try { if (storageKey) localStorage.setItem(storageKey, next ? "collapsed" : "expanded"); }
    catch { /* Storage is optional. */ }
  };
  return (
    <div
      className="flex w-full min-w-0 items-start gap-2"
      role="tablist"
      aria-label={ariaLabel}
      data-oceanleo-program-strip=""
    >
      <div ref={rows} className="relative flex min-w-0 flex-1 flex-wrap items-center gap-x-4 overflow-hidden"
        style={{ maxHeight: collapsed && wrapped ? firstHeight : undefined }}
        data-program-strip-rows data-collapsed={collapsed && wrapped}>
        {items.map((item) => (
          <span key={item.id} data-program-id={item.id} className="inline-flex h-10 max-w-full items-center gap-1"
            style={{ order: collapsed && item.id === selected ? -1 : undefined }}
            inert={collapsed && wrapped && !visible.includes(item.id)}
            aria-hidden={collapsed && wrapped && !visible.includes(item.id) ? true : undefined}>
            <button
              type="button"
              role="tab"
              aria-selected={selected === item.id}
              disabled={item.disabled}
              title={item.title}
              onClick={() => onSelect(item.id)}
              className={`inline-flex min-w-0 items-center gap-1 truncate text-sm ${selected === item.id ? tone.tabActive : tone.tab}`}
              data-oceanleo-program-strip-item={item.id}
            >
              {item.dot && item.dot !== "none" ? <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${item.dot === "green" ? "bg-emerald-500" : item.dot === "yellow" ? "bg-amber-500" : "bg-zinc-400"}`} /> : null}
              {item.running ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-500" /> : null}
              {item.label}
            </button>
            {onSettings ? (
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => onSettings(item.id)}
                className={`${tone.iconBtn} size-7`}
                aria-label={`${item.label} · ${settingsLabel || tt("设置")}`}
                title={settingsLabel || tt("设置")}
                data-oceanleo-program-strip-settings={item.id}
              >
                <IconSettings className="size-3.5" />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      <div className="flex min-h-10 shrink-0 items-center gap-1">
        {trailing}
        {wrapped ? <>
          <button type="button" aria-label={tt("上移")} disabled={collapsed} onClick={() => collapse(true)} className={`${tone.iconBtn} text-xs disabled:opacity-40`}>{tt("上移")}</button>
          <button type="button" aria-label={tt("下移")} disabled={!collapsed} onClick={() => collapse(false)} className={`${tone.iconBtn} text-xs disabled:opacity-40`}>{tt("下移")}</button>
        </> : null}
      </div>
    </div>
  );
}
