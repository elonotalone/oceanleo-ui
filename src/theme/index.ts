// @oceanleo/ui/theme — 全家桶统一主题（Light/Dark/Auto）单一事实源【client-safe barrel】。
// 决策见 oceandino repo docs/architecture/oceanleo-theme-and-17-locales.md：
//   class 策略（html.dark）+ 顶级域 cookie 跨子域同步 + <head> 内联脚本防闪。
//
// ⚠ 服务端专用 API（getThemeClass，用 next/headers）在 `@oceanleo/ui/theme/server`，
//   避免被 client 组件误引（next/headers 是 server-only，混进 client 图会报错）。
//
// 各站接入（root layout，server 组件）：
//   import { getThemeClass, ThemeScript } from "@oceanleo/ui/theme/server";
//   import { ThemeProvider } from "@oceanleo/ui/theme";
//   const { htmlClass } = await getThemeClass();
//   <html className={htmlClass} suppressHydrationWarning>
//     <head><ThemeScript/></head>
//     <body><ThemeProvider>{children}</ThemeProvider></body>
//   </html>
// ThemeScript 必须从 `@oceanleo/ui/theme/server` 进 layout：和 ThemeProvider
// 绑在同一个 client barrel 时，Next 16 会把它当客户端组件渲染，React 19
// 对 <script> 报「Scripts inside React components are never executed」。
//
// 顶栏/账户页/设置页放 <ThemeSwitcher/>；组件里读主题 const { resolved } = useTheme()。

export {
  THEME_MODES,
  DARK_VARIANT_THEMES,
  LIGHT_VARIANT_THEMES,
  VARIANT_THEMES,
  VARIANT_META,
  DEFAULT_THEME_MODE,
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  THEME_COOKIE_MAX_AGE,
  isThemeMode,
  isVariantTheme,
  isDarkVariant,
  isLightVariant,
  isLightAppearance,
  normalizeThemeMode,
  resolveThemeClass,
  appearanceToHtmlClass,
  allThemeClassNames,
} from "./theme-config";
export type {
  ThemeMode,
  ThemeAppearance,
  VariantTheme,
  DarkVariantTheme,
  LightVariantTheme,
} from "./theme-config";

export { ThemeProvider, useTheme } from "./ThemeProvider";
export type { ThemeProviderProps } from "./ThemeProvider";
export { ThemeSwitcher } from "./ThemeSwitcher";
export type { ThemeSwitcherProps } from "./ThemeSwitcher";
// Compat only. Root layouts must import ThemeScript from
// `@oceanleo/ui/theme/server` — this re-export sits next to client
// ThemeProvider and Next 16 will treat a mixed import as a client <script>.
export { ThemeScript } from "./ThemeScript";
