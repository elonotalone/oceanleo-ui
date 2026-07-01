"use client";

// <LanguageSwitcher>：17 语言选择器（单一事实源）。无 URL 前缀路由（决策见
// oceanleo-i18n.md），故切换 = 写 `.oceanleo.com` 顶级域 NEXT_LOCALE cookie
// （跨全部子站同步）+ router.refresh() 让 RSC 用新 locale 重渲染。
//
// 17 语言胶囊放不下 → 默认用下拉菜单（零依赖、可访问、SSR 友好）。
// 仍保留 compact 变体（globe 图标 + 当前语言名，点开同一下拉）。

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  normalizeLocale,
  type Locale,
} from "./config";

export interface LanguageSwitcherProps {
  // "dropdown"（默认，下拉菜单）| "compact"（globe + 语言名，点开同一下拉）。
  // 旧值 "pill" 兼容为 dropdown（17 语言不再用分段胶囊）。
  variant?: "dropdown" | "compact" | "pill";
  className?: string;
  // 下拉展开对齐，默认右对齐（顶栏右上角常见）。
  align?: "start" | "end";
}

function setLocaleCookie(locale: Locale) {
  // 顶级域 cookie，和 SSO / 主题一样跨 *.oceanleo.com 子域共享语言选择。本地/预览域名
  // (localhost / *.vercel.app) 不写 domain，避免无效 cookie。
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const domainAttr =
    host.endsWith(".oceanleo.com") || host === "oceanleo.com" ? "; domain=.oceanleo.com" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${domainAttr}`;
}

export function LanguageSwitcher({
  variant = "dropdown",
  className = "",
  align = "end",
}: LanguageSwitcherProps) {
  const router = useRouter();
  const active = normalizeLocale(useLocale());
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function switchTo(next: Locale) {
    setOpen(false);
    if (next === active) return;
    setLocaleCookie(next);
    startTransition(() => {
      router.refresh();
    });
  }

  const compact = variant === "compact";

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch language / 切换语言"
        title="切换语言 / Switch language"
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-600 transition hover:bg-neutral-100 active:scale-95 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <GlobeIcon />
        {compact ? (
          <span className="max-w-[120px] truncate">{LOCALE_LABELS[active]}</span>
        ) : (
          <>
            <span className="max-w-[140px] truncate">{LOCALE_LABELS[active]}</span>
            <ChevronIcon open={open} />
          </>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute z-50 mt-1 max-h-[60vh] w-52 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {LOCALES.map((loc) => {
            const on = loc === active;
            return (
              <button
                key={loc}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => switchTo(loc)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] transition ${
                  on
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                <span className="truncate">{LOCALE_LABELS[loc]}</span>
                {on && <CheckIcon />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
