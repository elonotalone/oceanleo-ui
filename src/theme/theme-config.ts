// @oceanleo/ui — 主题（Light/Dark/Auto + 7 个「特色主题」）基础配置（单一事实源）。
// 全家桶共用 cookie 名 / localStorage key / 模式类型。
// 决策见 oceandino repo docs/architecture/oceanleo-theme-and-17-locales.md：
//   class 策略（html.dark / html.<variant> / html.dark.<variant>）+ 顶级域 cookie
//   跨子域同步 + <head> 内联脚本防闪。
//
// 2026-07-03（操作员）历经三版收敛为当前形态：
//   ① 早先加过 cyberpunk + 9 个「主题盘」（ocean/forest/…/mint）。9 个主题盘只是
//      「同一暗底换个色相」的低质量滤镜，观感廉价 → 【已整体删除】。
//   ② 现在的主题体系 = 3 个基础模式（light / dark / auto）+ 7 个【特色主题】：
//        cyberpunk 霓虹赛博朋克（深蓝 + 粉/黄发光）
//        warm       暖褐（温暖低饱和的暖陶土暗色，柔和护眼）
//        night      极夜（Nord 式冷静蓝灰暗色，专业克制）
//        lilac      薰紫（Catppuccin 式薰衣草粉彩暗色，柔和潮流）
//        teal       墨青（Solarized 式深青墨暗色，复古高辨识）
//        oled       曜黑（纯黑高对比暗色，OLED 省电 / 极简）
//        paper      宣纸（暖米黄纸感【浅色】，长时间阅读友好）
//   ③ 每个特色主题都是【显式】主题（不随系统偏好变，auto 只在 light/dark 间解析）。
//      6 个暗色特色主题（cyberpunk/warm/night/lilac/teal/oled）生效类名 =
//        `html.dark.<slug>`（复用整套 html.dark 覆盖层，只重定义 --leo-d-* 配色令牌 +
//        主按钮强调），所以「加一个暗色特色主题」= globals.css 里加一段令牌覆盖 +
//        本文件登记一项。唯一的浅色特色主题 paper 生效类名 = `html.paper`（不带 .dark，
//        走浅色基座，单独覆盖浅色底渐变 + 令牌）。

// ---------------------------------------------------------------------------
// 特色主题登记（顺序即 UI 展示顺序）。分「暗色系」与「浅色系」两组，因为二者
// 生成的 <html> 类名不同（暗色系带 .dark 基座、浅色系不带）。
// ---------------------------------------------------------------------------

// 暗色特色主题：生效类名 `dark <slug>`，复用 html.dark 基础覆盖层。
export const DARK_VARIANT_THEMES = [
  "cyberpunk",
  "warm",
  "night",
  "lilac",
  "teal",
  "oled",
] as const;

// 浅色特色主题：生效类名 `<slug>`（浅色基座，不带 .dark）。
export const LIGHT_VARIANT_THEMES = ["paper"] as const;

// 全部特色主题（登记 + 迭代用）。UI 展示顺序 = 暗色组在前、浅色组在后。
export const VARIANT_THEMES = [
  ...DARK_VARIANT_THEMES,
  ...LIGHT_VARIANT_THEMES,
] as const;

export type DarkVariantTheme = (typeof DARK_VARIANT_THEMES)[number];
export type LightVariantTheme = (typeof LIGHT_VARIANT_THEMES)[number];
export type VariantTheme = (typeof VARIANT_THEMES)[number];

// 每个特色主题的展示元数据：
//   label   中文名（i18n key，"中文原文即 key" 体系）
//   swatch/swatch2  代表色（UI 圆点/预览用；取该主题主按钮或强调渐变的两端）
//   base    "dark" | "light"（决定生成的类名与 color-scheme），迭代时无需再查两个数组
export const VARIANT_META: Record<
  VariantTheme,
  { label: string; swatch: string; swatch2: string; base: "dark" | "light" }
> = {
  cyberpunk: { label: "赛博朋克", swatch: "#ff3d9a", swatch2: "#ffd23f", base: "dark" },
  warm: { label: "暖褐", swatch: "#c8a27a", swatch2: "#a8785a", base: "dark" },
  night: { label: "极夜", swatch: "#88c0d0", swatch2: "#5e81ac", base: "dark" },
  lilac: { label: "薰紫", swatch: "#cba6f7", swatch2: "#f5c2e7", base: "dark" },
  teal: { label: "墨青", swatch: "#2aa198", swatch2: "#268bd2", base: "dark" },
  oled: { label: "曜黑", swatch: "#e5e7eb", swatch2: "#6b7280", base: "dark" },
  paper: { label: "宣纸", swatch: "#c8a15a", swatch2: "#a9743a", base: "light" },
};

export type ThemeMode = "light" | "dark" | "auto" | VariantTheme;

export const THEME_MODES: readonly ThemeMode[] = [
  "light",
  "dark",
  "auto",
  ...VARIANT_THEMES,
] as const;

export const DEFAULT_THEME_MODE: ThemeMode = "auto";

// 实际生效的外观。light/dark 与各特色主题同名；auto 解析成 light/dark。
export type ThemeAppearance = "light" | "dark" | VariantTheme;

// 与语言 cookie（NEXT_LOCALE）同款机制：写在 `.oceanleo.com` 顶级域，跨全部
// *.oceanleo.com 子站共享主题选择。浏览器与服务端读写同一个 cookie。
export const THEME_COOKIE = "oceanleo-theme";

// 同源快速兜底（cookie 尚未回传时的同站二次访问）。跨子域不通，仅辅助。
export const THEME_STORAGE_KEY = "oceanleo-theme";

// 一年，主题选择长期生效。
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isDarkVariant(value: unknown): value is DarkVariantTheme {
  return typeof value === "string" && (DARK_VARIANT_THEMES as readonly string[]).includes(value);
}

export function isLightVariant(value: unknown): value is LightVariantTheme {
  return typeof value === "string" && (LIGHT_VARIANT_THEMES as readonly string[]).includes(value);
}

export function isVariantTheme(value: unknown): value is VariantTheme {
  return typeof value === "string" && (VARIANT_THEMES as readonly string[]).includes(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

// 把「模式 + 系统偏好」解析成实际生效的外观。
// 显式 light/dark/特色主题直接返回；auto 模式下 systemPrefersDark=true → dark，
// 否则 light（auto 永不解析成任何特色主题 —— 它们必须由用户显式选择）。
export function resolveThemeClass(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ThemeAppearance {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (isVariantTheme(mode)) return mode;
  return systemPrefersDark ? "dark" : "light";
}

// 外观 → <html> 类名字符串（首帧/客户端共用的单一事实源）。
//   light             → "light"
//   dark              → "dark"
//   <暗色特色主题>     → "dark <slug>"（复用 html.dark 基础规则 + 覆盖配色令牌）
//   <浅色特色主题>     → "<slug>"（浅色基座 + 覆盖浅色底/令牌）
export function appearanceToHtmlClass(appearance: ThemeAppearance): string {
  if (isDarkVariant(appearance)) return `dark ${appearance}`;
  if (isLightVariant(appearance)) return appearance;
  return appearance;
}

// 某外观是否走浅色基座（供 color-scheme 判定：light + 浅色特色主题 = light UA 样式）。
export function isLightAppearance(appearance: ThemeAppearance): boolean {
  return appearance === "light" || isLightVariant(appearance);
}

// 应用/清除类名时要移除的全部主题类（防止切换残留）。
export function allThemeClassNames(): string[] {
  return ["light", "dark", ...VARIANT_THEMES];
}
