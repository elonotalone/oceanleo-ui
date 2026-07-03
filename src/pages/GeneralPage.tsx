"use client";

// ============================================================================
// @oceanleo/ui — 统一「通用」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 与账户中心并列的独立页（/general）：外观设置 = 语言 + 主题（浅色/深色/自动）。
// 语言 / 主题切换器从此不再放在侧栏左下角，统一收进这一页（操作员 2026-07-01）。
// 风格对齐操作员给的参考图：标题「通用」→「外观」小节 →「语言」下拉 +「主题」
// 三段卡片（浅色 / 深色 / 自动，当前项高亮描边）。
//
// 依赖：react + next-intl（useLocale）+ @oceanleo/ui theme/i18n。⚠ 站点必须已包
// <I18nProvider>（NextIntlClientProvider）与 <ThemeProvider> 才能用本页。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { PageHeader } from "./PageHeader";
import { useUI } from "../i18n/ui/useUI";
import { useTheme } from "../theme/ThemeProvider";
import {
  PALETTE_THEMES,
  PALETTE_META,
  type ThemeMode,
} from "../theme/theme-config";
import { setLeoEnabled, useLeoEnabled } from "../shell/LeoAssistant";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  normalizeLocale,
  type Locale,
} from "../i18n/config";

export interface GeneralPageProps {
  /** 页面标题，默认「通用」。 */
  title?: string;
  /** 三个主题模式的本地化文案（不传用中文默认）。 */
  themeLabels?: Partial<Record<ThemeMode, string>>;
  /** 小节 / 字段标题的本地化文案（不传用中文默认）。 */
  labels?: {
    appearance?: string; // 「外观」
    language?: string; // 「语言」
    theme?: string; // 「主题」
  };
}

function setLocaleCookie(locale: Locale) {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const domainAttr =
    host.endsWith(".oceanleo.com") || host === "oceanleo.com"
      ? "; domain=.oceanleo.com"
      : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${domainAttr}`;
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4.2" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 13.5A8 8 0 1 1 10.5 4a6.2 6.2 0 0 0 9.5 9.5z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (mode === "cyberpunk") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  // auto = 半月/半日「跟随系统」
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6v16.8a8.4 8.4 0 0 0 0-16.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GeneralPage({ title, themeLabels, labels }: GeneralPageProps) {
  const router = useRouter();
  const tt = useUI();
  const active = normalizeLocale(useLocale());
  const { mode, setMode } = useTheme();
  const [langOpen, setLangOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const leoOn = useLeoEnabled();

  // 基础四模式（浅色 / 深色 / 自动 / 赛博朋克）走带图标的大卡片。
  const BASE_MODES: ThemeMode[] = ["light", "dark", "auto", "cyberpunk"];
  const baseLabel = (m: ThemeMode): string => {
    if (m === "light") return themeLabels?.light ?? tt("浅色");
    if (m === "dark") return themeLabels?.dark ?? tt("深色");
    if (m === "auto") return themeLabels?.auto ?? tt("自动");
    if (m === "cyberpunk") return themeLabels?.cyberpunk ?? tt("赛博朋克");
    return m;
  };
  const L = {
    appearance: labels?.appearance ?? tt("外观"),
    language: labels?.language ?? tt("语言"),
    theme: labels?.theme ?? tt("主题"),
  };
  const pageTitle = title ?? tt("通用");

  useEffect(() => {
    if (!langOpen) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [langOpen]);

  function switchLang(next: Locale) {
    setLangOpen(false);
    if (next === active) return;
    setLocaleCookie(next);
    router.refresh();
  }

  return (
    <div className="px-8 py-6">
      <PageHeader title={pageTitle} />

      <div className="mx-auto mt-8 max-w-xl">
        <section className="v-fade-up">
          <h2 className="mb-4 text-[15px] font-semibold text-neutral-900">{L.appearance}</h2>

          {/* 语言 */}
          <div className="mb-6">
            <label className="mb-2 block text-[13px] text-neutral-700">{L.language}</label>
            <div ref={wrapRef} className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-left text-[14px] text-neutral-900 transition hover:border-neutral-300"
              >
                <span className="truncate">{LOCALE_LABELS[active]}</span>
                <svg
                  className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${langOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {langOpen && (
                <div
                  role="listbox"
                  className="absolute z-50 mt-1 max-h-[50vh] w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
                >
                  {LOCALES.map((loc) => {
                    const on = loc === active;
                    return (
                      <button
                        key={loc}
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => switchLang(loc)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                          on
                            ? "bg-neutral-900 text-white"
                            : "text-neutral-700 hover:bg-neutral-100"
                        }`}
                      >
                        <span className="truncate">{LOCALE_LABELS[loc]}</span>
                        {on && (
                          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 主题：基础四模式（图标大卡片） */}
          <div>
            <label className="mb-2 block text-[13px] text-neutral-700">{L.theme}</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BASE_MODES.map((m) => {
                const on = m === mode;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={on}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-5 text-[13px] font-medium transition ${
                      on
                        ? "border-neutral-900 text-neutral-900 ring-1 ring-neutral-900"
                        : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
                    }`}
                  >
                    <ThemeIcon mode={m} />
                    {baseLabel(m)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 主题盘（9 套暗底彩色变体，色板圆点预览 + 中文名） */}
          <div className="mt-5">
            <label className="mb-2 block text-[13px] text-neutral-700">{tt("主题盘")}</label>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
              {PALETTE_THEMES.map((p) => {
                const on = p === mode;
                const meta = PALETTE_META[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setMode(p)}
                    aria-pressed={on}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-[13px] font-medium transition ${
                      on
                        ? "border-neutral-900 text-neutral-900 ring-1 ring-neutral-900"
                        : "border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-800"
                    }`}
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ background: `linear-gradient(135deg, ${meta.swatch} 0%, ${meta.swatch2} 100%)` }}
                    />
                    <span className="min-w-0 flex-1 truncate">{tt(meta.label)}</span>
                    {on && (
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* leo 助手总开关（宗旨 v12，2026-07-02）：默认开启；关闭后输入框旁的
            「leo」按钮与页面划词气泡都不再出现。localStorage 持久化（按站点域名）。 */}
        <section className="v-fade-up mt-10">
          <h2 className="mb-4 text-[15px] font-semibold text-neutral-900">{tt("leo 助手")}</h2>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-neutral-900">{tt("启用 leo")}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-500">
                {tt("在输入框旁与划词时提供 leo 入口，帮你扩充、精简、总结、翻译内容。")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={leoOn}
              onClick={() => setLeoEnabled(!leoOn)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                leoOn ? "bg-neutral-900" : "bg-neutral-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  leoOn ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
