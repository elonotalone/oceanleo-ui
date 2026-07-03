"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../i18n/ui/useUI";

/* ---------- Modal: scale+fade in, Escape + backdrop close, focus trap ---------- */

export function Modal({
  onClose,
  children,
  className = "max-w-md",
  labelledBy,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  // 挂载到 document.body（portal）：让遮罩层脱离 <main> 的 transform 栈上下文，
  // 从而**盖住整个视口，包括左侧侧边栏**（操作员 2026-07-03：点卡片时侧栏也要
  // 变灰）。SSR 阶段 document 不存在 → 先不渲染，mount 后再 portal。
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 140);
  }, [onClose]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // focus first focusable element in the panel
    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (first || panel).focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key === "Tab" && panel) {
        const els = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled"));
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [requestClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 transition-opacity duration-150 ${
        closing ? "opacity-0" : "v-fade-in"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`w-full rounded-2xl border border-neutral-200 bg-white shadow-xl outline-none transition-all duration-150 ${
          closing ? "scale-95 opacity-0" : "v-scale-in"
        } ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- ConfirmDialog: replaces window.confirm ---------- */

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onCancel} className="max-w-sm">
      <div className="p-5">
        <h3 className="text-[15px] font-semibold text-neutral-900">{tt(title)}</h3>
        {body && <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">{tt(body)}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.98]"
          >
            {tt(cancelLabel)}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-white transition active:scale-[0.98] disabled:opacity-60 ${
              danger ? "bg-red-600 hover:bg-red-500" : "bg-neutral-900 hover:bg-neutral-800"
            }`}
          >
            {busy && <span className="v-spinner text-[10px]" />}
            {tt(confirmLabel)}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Switch: animated toggle ---------- */

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50 ${
        checked ? "bg-neutral-900" : "bg-neutral-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const tt = useUI();
  return (
    <div
      className={`inline-flex items-center rounded-lg bg-neutral-100 p-0.5 ${
        size === "sm" ? "text-[12px]" : "text-[13px]"
      }`}
      role="tablist"
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-2.5 py-1 transition-all duration-150 ${
            value === opt.id
              ? "bg-white font-medium text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {tt(opt.label)}
        </button>
      ))}
    </div>
  );
}

/* ---------- Dropdown select (custom, not raw <select>) ---------- */

export function Select<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { id: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.id === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-[13px] text-neutral-800 transition hover:border-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
      >
        <span className="truncate">{current?.label ? tt(current.label) : tt("请选择")}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="v-scale-in absolute left-0 top-full z-30 mt-1 max-h-64 w-full min-w-[180px] overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={value === opt.id}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition hover:bg-neutral-50 ${
                value === opt.id ? "font-medium text-neutral-900" : "text-neutral-600"
              }`}
            >
              <span>
                {tt(opt.label)}
                {opt.desc && <span className="ml-1.5 text-[11px] text-neutral-400">{tt(opt.desc)}</span>}
              </span>
              {value === opt.id && (
                <svg className="h-3.5 w-3.5 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Skeleton primitives ---------- */

export function SkeletonLine({ className = "h-3 w-full" }: { className?: string }) {
  return <div className={`v-skeleton rounded ${className}`} />;
}

export function SkeletonCard({ className = "h-32" }: { className?: string }) {
  return <div className={`v-skeleton rounded-xl ${className}`} />;
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  const tt = useUI();
  return (
    <div className="v-fade-up flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-4 text-neutral-300">{icon}</div>}
      <p className="text-[15px] font-medium text-neutral-700">{tt(title)}</p>
      {desc && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-neutral-400">{tt(desc)}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- Spinner button content helper ---------- */

export function ButtonSpinner({ label }: { label: string }) {
  const tt = useUI();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="v-spinner text-[10px]" />
      {tt(label)}
    </span>
  );
}

/* ---------- relative time ---------- */

/** 相对时间。传 tt（useUI() 的翻译函数）→ 按当前语言输出；不传 → 中文。 */
export function timeAgo(
  iso: string,
  tt?: (zh: string, vars?: Record<string, string | number>) => string,
): string {
  const t = tt ?? ((zh: string, vars?: Record<string, string | number>) =>
    zh.replace(/\{(\w+)\}/g, (mm, k) => (vars && k in vars ? String(vars[k]) : mm)));
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("刚刚");
  if (m < 60) return t("{m} 分钟前", { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("{h} 小时前", { h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("{d} 天前", { d });
  const mo = Math.floor(d / 30);
  if (mo < 12) return t("{mo} 个月前", { mo });
  return t("{y} 年前", { y: Math.floor(mo / 12) });
}
