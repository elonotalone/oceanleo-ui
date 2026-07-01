// @oceanleo/ui/theme/server — 主题的【服务端专用】导出（用 next/headers）。
// 与 client-safe 的 `@oceanleo/ui/theme` 隔离，防止被 client 组件误引而报错。
//
//   各站 root layout（server 组件）：
//     import { getThemeClass } from "@oceanleo/ui/theme/server";
//     const { htmlClass } = await getThemeClass();
//     <html className={htmlClass} suppressHydrationWarning>

import { cookies } from "next/headers";
import {
  THEME_COOKIE,
  normalizeThemeMode,
  resolveThemeClass,
} from "./theme-config";

// 服务端：从 cookie 解析首帧应用的 html 类名。
// 无 cookie（首访）时默认 auto —— 服务端无从得知系统偏好，故 SSR 首帧给 "light"
// （安全默认），<ThemeScript> 会在首帧前按系统偏好即时校正，杜绝可见闪屏。
export async function getThemeClass(): Promise<{ htmlClass: "dark" | "light" }> {
  try {
    const store = await cookies();
    const raw = store.get(THEME_COOKIE)?.value;
    if (raw) {
      const mode = normalizeThemeMode(raw);
      return { htmlClass: resolveThemeClass(mode, false) };
    }
  } catch {
    /* cookies() 仅在请求作用域可用 */
  }
  return { htmlClass: "light" };
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
