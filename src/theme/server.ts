// @oceanleo/ui/theme/server — 主题的【服务端专用】导出（用 next/headers）。
// 与 client-safe 的 `@oceanleo/ui/theme` 隔离，防止被 client 组件误引而报错。
//
//   各站 root layout（server 组件）：
//     import { getThemeClass } from "@oceanleo/ui/theme/server";
//     const { htmlClass } = await getThemeClass();
//     <html className={htmlClass} suppressHydrationWarning>

import { cookies, headers } from "next/headers";
import {
  THEME_COOKIE,
  DEFAULT_THEME_MODE,
  normalizeThemeMode,
  resolveThemeClass,
  type ThemeMode,
} from "./theme-config";

// 服务端：从 cookie + Client Hint 解析首帧应用的 html 类名。
//
// 关键（2026-07-01 修「每次打开先闪一下亮色」）：
//   主题 = auto（默认）时，服务端过去无从得知系统偏好，只能先给 "light"，靠
//   <ThemeScript> 首帧后用 matchMedia 校正 —— 但 Next App Router 强制把 CSS <link>
//   提到 <head> 最前、内联脚本排在其后，所以浅色 CSS 会先绘制一帧 → 系统暗色的用户
//   每次打开都闪一下亮色。
//   修复：读浏览器带上来的 `Sec-CH-Prefers-Color-Scheme` Client Hint（由共享
//   middleware 的 Accept-CH / Critical-CH 头触发，首访也会即刻重发带上），auto 时
//   据此在 SSR 首帧就精确输出 dark/light，从源头消除闪屏。
export async function getThemeClass(): Promise<{ htmlClass: "dark" | "light" }> {
  let mode: ThemeMode = DEFAULT_THEME_MODE;
  try {
    const store = await cookies();
    const raw = store.get(THEME_COOKIE)?.value;
    if (raw) mode = normalizeThemeMode(raw);
  } catch {
    /* cookies() 仅在请求作用域可用 */
  }

  // 显式 light / dark：直接定，与系统偏好无关。
  if (mode === "light" || mode === "dark") {
    return { htmlClass: resolveThemeClass(mode, false) };
  }

  // auto：读 Client Hint 的系统偏好；拿不到（首访且浏览器尚未支持/未回带）时退回
  // light（与 ThemeScript 的兜底一致，Critical-CH 会促使支持的浏览器即刻重发带上）。
  let systemPrefersDark = false;
  try {
    const h = await headers();
    systemPrefersDark = h.get("sec-ch-prefers-color-scheme") === "dark";
  } catch {
    /* headers() 仅在请求作用域可用 */
  }
  return { htmlClass: resolveThemeClass("auto", systemPrefersDark) };
}

export {
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
  THEME_MODES,
  normalizeThemeMode,
  resolveThemeClass,
} from "./theme-config";
export type { ThemeMode } from "./theme-config";
