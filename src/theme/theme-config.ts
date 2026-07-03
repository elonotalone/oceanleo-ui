// @oceanleo/ui — 主题（Light/Dark/Auto/Cyberpunk + 9 预设主题盘）基础配置（单一事实源）。
// 全家桶共用 cookie 名 / localStorage key / 模式类型。
// 决策见 oceandino repo docs/architecture/oceanleo-theme-and-17-locales.md：
//   class 策略（html.dark / html.cyberpunk / html.dark.theme-*）+ 顶级域 cookie
//   跨子域同步 + <head> 内联脚本防闪。
//
// 2026-07-03（操作员）：
//   ① 新增 cyberpunk 模式 —— 深蓝背景 + 黄/粉发光按键的霓虹赛博朋克外观。
//      它是【显式】主题（不随系统偏好变），生效类名为 `html.dark.cyberpunk`
//      （本质是暗的，复用 html.dark 的排版规则，再叠加霓虹配色/发光）。
//   ② 新增 9 个「预设主题盘」（PALETTE_THEMES）—— 均为暗底彩色变体：ocean/forest/
//      sunset/grape/rose/mocha/slate/gold/mint。每个生效类名 = `html.dark.theme-<name>`
//      （复用整套 html.dark 覆盖层，只覆盖 --leo-d-* 配色令牌 + 主按钮强调色）。
//      这样「加一个主题盘」= globals.css 里加十几行令牌覆盖 + 本文件登记一项。

// 预设主题盘 key（顺序即 UI 展示顺序）。均为暗底彩色变体。
export const PALETTE_THEMES = [
  "ocean",
  "forest",
  "sunset",
  "grape",
  "rose",
  "mocha",
  "slate",
  "gold",
  "mint",
] as const;

export type PaletteTheme = (typeof PALETTE_THEMES)[number];

// 每个主题盘的展示元数据：中文名（i18n key，"中文原文即 key" 体系）+ 代表色（用于
// UI 里的圆点色板预览，取该盘主按钮渐变的主色）。GeneralPage / ThemeSwitcher 共用。
export const PALETTE_META: Record<
  PaletteTheme,
  { label: string; swatch: string; swatch2: string }
> = {
  ocean: { label: "深海蓝", swatch: "#2563eb", swatch2: "#0ea5e9" },
  forest: { label: "翡翠绿", swatch: "#059669", swatch2: "#10b981" },
  sunset: { label: "日落橙", swatch: "#ea580c", swatch2: "#f59e0b" },
  grape: { label: "葡萄紫", swatch: "#7c3aed", swatch2: "#a855f7" },
  rose: { label: "玫瑰粉", swatch: "#e11d48", swatch2: "#f43f5e" },
  mocha: { label: "摩卡褐", swatch: "#b45309", swatch2: "#d97706" },
  slate: { label: "石墨蓝", swatch: "#475569", swatch2: "#64748b" },
  gold: { label: "鎏金金", swatch: "#ca8a04", swatch2: "#eab308" },
  mint: { label: "薄荷青", swatch: "#0d9488", swatch2: "#14b8a6" },
};

export type ThemeMode = "light" | "dark" | "cyberpunk" | "auto" | PaletteTheme;

export const THEME_MODES: readonly ThemeMode[] = [
  "light",
  "dark",
  "auto",
  "cyberpunk",
  ...PALETTE_THEMES,
] as const;

export const DEFAULT_THEME_MODE: ThemeMode = "auto";

// 实际生效的外观。palette 主题本质是暗底 → resolved 归一为其 palette key（用于
// 应用 `dark theme-<key>` 类名）；light/dark/cyberpunk 同名。
export type ThemeAppearance = "light" | "dark" | "cyberpunk" | PaletteTheme;

// 与语言 cookie（NEXT_LOCALE）同款机制：写在 `.oceanleo.com` 顶级域，跨全部
// *.oceanleo.com 子站共享主题选择。浏览器与服务端读写同一个 cookie。
export const THEME_COOKIE = "oceanleo-theme";

// 同源快速兜底（cookie 尚未回传时的同站二次访问）。跨子域不通，仅辅助。
export const THEME_STORAGE_KEY = "oceanleo-theme";

// 一年，主题选择长期生效。
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isPaletteTheme(value: unknown): value is PaletteTheme {
  return typeof value === "string" && (PALETTE_THEMES as readonly string[]).includes(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

// 把「模式 + 系统偏好」解析成实际生效的外观。
// 显式 light/dark/cyberpunk/palette 直接返回；auto 模式下 systemPrefersDark=true →
// dark，否则 light（auto 永不解析成 cyberpunk / palette —— 它们必须用户显式选择）。
export function resolveThemeClass(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ThemeAppearance {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (mode === "cyberpunk") return "cyberpunk";
  if (isPaletteTheme(mode)) return mode;
  return systemPrefersDark ? "dark" : "light";
}

// 外观 → <html> 类名字符串（首帧/客户端共用的单一事实源）。
//   light            → "light"
//   dark             → "dark"
//   cyberpunk        → "dark cyberpunk"（复用 html.dark 基础规则 + 叠加霓虹）
//   <palette>        → "dark theme-<palette>"（复用 html.dark 基础规则 + 覆盖配色令牌）
export function appearanceToHtmlClass(appearance: ThemeAppearance): string {
  if (appearance === "cyberpunk") return "dark cyberpunk";
  if (isPaletteTheme(appearance)) return `dark theme-${appearance}`;
  return appearance;
}

// 应用/清除类名时要移除的全部主题类（防止切换残留）。
export function allThemeClassNames(): string[] {
  return ["light", "dark", "cyberpunk", ...PALETTE_THEMES.map((p) => `theme-${p}`)];
}
