// @oceanleo/ui/theme — 全家桶统一主题（Light/Dark/Auto）单一事实源【client-safe barrel】。
// 决策见 oceandino repo docs/architecture/oceanleo-theme-and-17-locales.md：
//   class 策略（html.dark）+ 顶级域 cookie 跨子域同步 + <head> 内联脚本防闪。
//
// ⚠ 服务端专用 API（getThemeClass，用 next/headers）在 `@oceanleo/ui/theme/server`，
//   避免被 client 组件误引（next/headers 是 server-only，混进 client 图会报错）。
//
// 各站接入（root layout，server 组件）：
//   import { getThemeClass } from "@oceanleo/ui/theme/server";
//   import { ThemeScript, ThemeProvider } from "@oceanleo/ui/theme";
//   const { htmlClass } = await getThemeClass();
//   <html className={htmlClass} suppressHydrationWarning>
//     <head><ThemeScript/></head>
//     <body><ThemeProvider>{children}</ThemeProvider></body>
//   </html>
//
// 顶栏/账户页/设置页放 <ThemeSwitcher/>；组件里读主题 const { resolved } = useTheme()。

export {
  THEME_MODES,
  DEFAULT_THEME_MODE,
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  THEME_COOKIE_MAX_AGE,
  isThemeMode,
  normalizeThemeMode,
  resolveThemeClass,
} from "./theme-config";
export type { ThemeMode, ThemeAppearance } from "./theme-config";

export { ThemeScript } from "./ThemeScript";
export { ThemeProvider, useTheme } from "./ThemeProvider";
export type { ThemeProviderProps } from "./ThemeProvider";
export { ThemeSwitcher } from "./ThemeSwitcher";
export type { ThemeSwitcherProps } from "./ThemeSwitcher";
