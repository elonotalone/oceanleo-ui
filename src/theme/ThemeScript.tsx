// @oceanleo/ui — 主题防闪（FOUC）内联脚本组件（client-safe，无 next/headers）。
// 单一事实源：暗色主题「先白后黑」闪屏的根治点。放在各站 <head> 里，同步执行、
// 先于任何绘制运行，读 cookie/localStorage/系统偏好，即时给 <html> 加 .dark/.light。
//
// ⚠ SSR 读 cookie 的 server helper `getThemeClass()` 在 `@oceanleo/ui/theme/server`
//   （用了 next/headers，server-only，与本 client-safe 组件隔离）。

import {
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
} from "./theme-config";

// 客户端内联脚本源码。同步执行（无 async），在 <head> 里先于任何绘制运行：
//   0. *.oceanleo.com 上先清掉 host-only「影子」cookie（v0.67/v0.68 存量）：影子创建
//      更早会排在请求头/document.cookie 最前，遮住跨站共享的 `.oceanleo.com` 域 cookie，
//      导致「站 B 改了主题、站 A 不跟随」。清掉后 domain cookie 成为唯一事实源，
//      本次即按它应用类名，下次请求头也干净了（SSR 首帧同步跟随）。
//   1. 读 cookie → 没有则读 localStorage → 都没有则用默认（auto）。
//   2. auto 时用 matchMedia 取系统偏好。
//   3. 在 documentElement 上加 .dark / .light（class 策略，配合 @custom-variant）。
// 之后 <ThemeProvider> 挂载再接管动态切换（含 auto 的系统变化监听）。
const INLINE = `(function(){try{
var C=${JSON.stringify(THEME_COOKIE)},L=${JSON.stringify(THEME_STORAGE_KEY)},D=${JSON.stringify(DEFAULT_THEME_MODE)};
var h=location.hostname;
if(h==="oceanleo.com"||h.slice(-13)===".oceanleo.com"){try{document.cookie=C+"=; path=/; max-age=0; samesite=lax";}catch(e){}}
var m=null;
try{var mt=document.cookie.match(new RegExp("(?:^|; )"+C+"=([^;]*)"));if(mt)m=decodeURIComponent(mt[1]);}catch(e){}
if(!m){try{m=localStorage.getItem(L);}catch(e){}}
if(m!=="light"&&m!=="dark"&&m!=="auto")m=D;
var dark=m==="dark";
if(m==="auto"){try{dark=window.matchMedia("(prefers-color-scheme: dark)").matches;}catch(e){dark=false;}}
var el=document.documentElement;
el.classList.remove("dark","light");
el.classList.add(dark?"dark":"light");
el.style.colorScheme=dark?"dark":"light";
}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: INLINE }} suppressHydrationWarning />;
}
