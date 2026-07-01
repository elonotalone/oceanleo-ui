// @oceanleo/ui — 主题（Light/Dark/Auto）基础配置（单一事实源）。
// 全家桶共用 cookie 名 / localStorage key / 模式类型。
// 决策见 oceandino repo docs/architecture/oceanleo-theme-and-17-locales.md：
//   class 策略（html.dark）+ 顶级域 cookie 跨子域同步 + <head> 内联脚本防闪。

export type ThemeMode = "light" | "dark" | "auto";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "auto"] as const;

export const DEFAULT_THEME_MODE: ThemeMode = "auto";

// 与语言 cookie（NEXT_LOCALE）同款机制：写在 `.oceanleo.com` 顶级域，跨全部
// *.oceanleo.com 子站共享主题选择。浏览器与服务端读写同一个 cookie。
export const THEME_COOKIE = "oceanleo-theme";

// 同源快速兜底（cookie 尚未回传时的同站二次访问）。跨子域不通，仅辅助。
export const THEME_STORAGE_KEY = "oceanleo-theme";

// 一年，主题选择长期生效。
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

// 把「模式 + 系统偏好」解析成实际生效的类名（"dark" | "light"）。
// Auto 模式下：systemPrefersDark=true → dark，否则 light。
export function resolveThemeClass(mode: ThemeMode, systemPrefersDark: boolean): "dark" | "light" {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return systemPrefersDark ? "dark" : "light";
}
