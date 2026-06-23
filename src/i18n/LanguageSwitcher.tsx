"use client";

// <LanguageSwitcher>：中 / EN 切换胶囊。无 URL 前缀路由（决策见 oceanleo-i18n.md），
// 故切换 = 写 NEXT_LOCALE cookie + router.refresh() 让 RSC 用新 locale 重渲染。
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
  // "pill"（默认，胶囊分段）| "compact"（单按钮在两语言间切换）。
  variant?: "pill" | "compact";
  className?: string;
}

function setLocaleCookie(locale: Locale) {
  // 顶级域 cookie，和 SSO 一样跨 *.oceanleo.com 子域共享语言选择。本地/预览域名
  // (localhost / *.vercel.app) 不写 domain，避免无效 cookie。
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const domainAttr = host.endsWith(".oceanleo.com") || host === "oceanleo.com"
    ? "; domain=.oceanleo.com"
    : "";
  document.cookie =
    `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${domainAttr}`;
}

export function LanguageSwitcher({ variant = "pill", className = "" }: LanguageSwitcherProps) {
  const router = useRouter();
  const active = normalizeLocale(useLocale());
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === active) return;
    setLocaleCookie(next);
    startTransition(() => {
      router.refresh();
    });
  }

  if (variant === "compact") {
    const next = active === "zh" ? "en" : "zh";
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => switchTo(next)}
        aria-label="Switch language"
        title="切换语言 / Switch language"
        className={`inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] font-medium text-neutral-600 transition hover:bg-neutral-100 active:scale-95 disabled:opacity-50 ${className}`}
      >
        <GlobeIcon />
        {LOCALE_LABELS[active]}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-lg border border-neutral-200 bg-white p-0.5 text-[12px] ${className}`}
    >
      {LOCALES.map((loc) => {
        const on = loc === active;
        return (
          <button
            key={loc}
            type="button"
            disabled={pending}
            onClick={() => switchTo(loc)}
            className={`rounded-md px-2 py-1 font-medium transition disabled:opacity-50 ${
              on
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            }`}
          >
            {LOCALE_LABELS[loc]}
          </button>
        );
      })}
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
