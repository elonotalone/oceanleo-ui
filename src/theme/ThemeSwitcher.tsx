"use client";

// <ThemeSwitcher>：Light / Dark / Auto 三段切换器（单一事实源）。
// 全家桶顶栏 / 账户页 / 设置页统一放它，各站零实现。切换即写 `.oceanleo.com`
// cookie，跨 28 站同步（决策见 oceanleo-theme-and-17-locales.md）。

import { useTheme } from "./ThemeProvider";
import {
  THEME_MODES,
  PALETTE_META,
  isPaletteTheme,
  type ThemeMode,
} from "./theme-config";

export interface ThemeSwitcherProps {
  // "pill"（默认，全模式图标胶囊）| "compact"（单按钮循环全部模式）。
  variant?: "pill" | "compact";
  className?: string;
  // 可选：自定义模式的可访问标签（i18n 站传入本地化文案）。
  labels?: Partial<Record<ThemeMode, string>>;
}

const BASE_LABELS: Partial<Record<ThemeMode, string>> = {
  light: "Light",
  dark: "Dark",
  cyberpunk: "Cyberpunk",
  auto: "Auto",
};

function labelFor(m: ThemeMode, labels?: Partial<Record<ThemeMode, string>>): string {
  return labels?.[m] ?? BASE_LABELS[m] ?? (isPaletteTheme(m) ? PALETTE_META[m].label : m);
}

function ThemeIcon({ mode, className = "h-3.5 w-3.5" }: { mode: ThemeMode; className?: string }) {
  if (isPaletteTheme(mode)) {
    const meta = PALETTE_META[mode];
    return (
      <span
        className={`${className} inline-block rounded-full ring-1 ring-black/10`}
        style={{ background: `linear-gradient(135deg, ${meta.swatch} 0%, ${meta.swatch2} 100%)` }}
        aria-hidden
      />
    );
  }
  if (mode === "light") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 13.5A8 8 0 1 1 10.5 4a6.2 6.2 0 0 0 9.5 9.5z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (mode === "cyberpunk") {
    // 赛博朋克 = 闪电/霓虹意象。
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  // auto = 半月/半日「跟随系统」
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6v16.8a8.4 8.4 0 0 0 0-16.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ThemeSwitcher({ variant = "pill", className = "", labels }: ThemeSwitcherProps) {
  const { mode, setMode } = useTheme();

  if (variant === "compact") {
    // 循环全部模式（基础 4 + 9 主题盘）。
    const order: ThemeMode[] = [...THEME_MODES];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    const curLabel = labelFor(mode, labels);
    return (
      <button
        type="button"
        onClick={() => setMode(next)}
        aria-label={`Theme: ${curLabel}`}
        title={curLabel}
        className={`inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] font-medium text-neutral-600 transition hover:bg-neutral-100 active:scale-95 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 ${className}`}
      >
        <ThemeIcon mode={mode} />
        {curLabel}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className={`inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-neutral-200 bg-white p-0.5 text-[12px] dark:border-neutral-700 dark:bg-neutral-900 ${className}`}
    >
      {THEME_MODES.map((m) => {
        const on = m === mode;
        const lbl = labelFor(m, labels);
        return (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={on}
            title={lbl}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              on
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            }`}
          >
            <ThemeIcon mode={m} />
            <span className="hidden sm:inline">{lbl}</span>
          </button>
        );
      })}
    </div>
  );
}
