"use client";

// @oceanleo/ui — <ThemeProvider> + useTheme()（单一事实源）。
// 管理主题状态（light/dark/auto），写 cookie（跨子域）+ localStorage（同源兜底），
// 并在 Auto 模式下监听系统 prefers-color-scheme 变化实时切换。
// 首帧防闪由 <ThemeScript> 负责（先于 React 挂载），本 Provider 只接管其后的动态切换。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_MODE,
  normalizeThemeMode,
  resolveThemeClass,
  type ThemeMode,
  type ThemeAppearance,
} from "./theme-config";

interface ThemeContextValue {
  /** 用户选择的模式（light/dark/cyberpunk/auto）。 */
  mode: ThemeMode;
  /** 实际生效的外观（auto 已解析成 light/dark；cyberpunk 独立）。 */
  resolved: ThemeAppearance;
  /** 切换到指定模式（写 cookie + localStorage + 应用类名）。 */
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function readInitialMode(): ThemeMode {
  if (typeof document === "undefined") return DEFAULT_THEME_MODE;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
    if (m) return normalizeThemeMode(decodeURIComponent(m[1]));
  } catch {
    /* ignore */
  }
  try {
    const ls = localStorage.getItem(THEME_STORAGE_KEY);
    if (ls) return normalizeThemeMode(ls);
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_MODE;
}

// 读当前 document.cookie 里的主题值（写回校验用）。
function readCookieMode(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

// 写主题 cookie —— 跨站跟随的根因修复（操作员 2026-07-02「一个站改了其他站不跟随」）。
//
// 历史教训：v0.68 曾在正式站上【无条件多写一份 host-only cookie】当兜底。这正是
// 跨站不同步的病根——用户在站 A 切过主题后，站 A 留下 host-only「影子」；之后在
// 站 B 改主题只更新 `.oceanleo.com` 域 cookie，回到站 A 时浏览器把创建更早的影子
// 排在 Cookie 请求头前面（RFC 6265 同 path 按创建时间序），SSR `cookies().get()`
// 与客户端正则都取第一个 → 站 A 永远读到旧值、不跟随；站 A 的自愈回写还会把旧值
// 写回 domain cookie，反向污染全家桶。
//
// 现在：*.oceanleo.com 上【只写 domain cookie】（单一跨站事实源），并主动清除
// host-only 影子（含 v0.67/v0.68 用户浏览器里的存量）；host-only 仅在非 oceanleo
// 域（localhost / *.vercel.app 预览）使用。localStorage 永远写（同源兜底）。
// 返回值：cookie 是否成功落地（读回校验）。
function writeCookie(mode: ThemeMode): boolean {
  if (typeof document === "undefined") return false;
  const host = window.location.hostname;
  const onOceanleo = host.endsWith(".oceanleo.com") || host === "oceanleo.com";
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  const base = `${THEME_COOKIE}=${mode}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;

  // localStorage 先写（同源，几乎不会失败；<ThemeScript> 首帧会读它兜底）。
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }

  if (onOceanleo) {
    // 顶级域 cookie = 唯一跨站事实源；同时清掉本站 host-only 影子（若有）。
    clearHostOnlyThemeCookie();
    document.cookie = `${base}; domain=.oceanleo.com${secure}`;
  } else {
    // 本地 / 预览域：domain=.oceanleo.com 不匹配会被拒，写 host-only。
    document.cookie = `${base}${secure}`;
  }

  // 读回校验：只要能读回正确值就算成功。
  return readCookieMode() === mode;
}

// 清除 host-only 主题 cookie（无 domain 属性 = 只匹配 host-only 那份，domain 份不受影响）。
function clearHostOnlyThemeCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

function applyClass(resolved: ThemeAppearance) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.remove("dark", "light", "cyberpunk");
  // cyberpunk 本质是暗底霓虹 → 同时挂 `dark`（复用全部 html.dark 基础规则）+
  // `cyberpunk`（叠加霓虹配色/发光）。这样无需给几千条 html.dark 规则再复制一份。
  if (resolved === "cyberpunk") {
    el.classList.add("dark", "cyberpunk");
  } else {
    el.classList.add(resolved);
  }
  // cyberpunk 本质是暗底 → color-scheme 用 dark（表单控件/滚动条走暗色 UA 样式）。
  el.style.colorScheme = resolved === "light" ? "light" : "dark";
}

export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // 初值只在挂载时读一次；SSR 阶段返回 DEFAULT（不影响首帧，首帧类名由 ThemeScript 定）。
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [resolved, setResolved] = useState<ThemeAppearance>("light");
  // 真实模式的同步镜像。挂载首个 commit 里 state 还是初始值 auto（setState 下一次
  // 渲染才生效），任何在该窗口执行的回调都必须读这个 ref 而不是 state，否则会拿
  // 陈旧的 auto 把用户选的 dark/light 覆盖掉 —— 2026-07-02「深色刷新变亮」的根因
  // 正是旧版 auto-effect 挂载即按陈旧 mode=auto 主动 applyClass(系统亮色)。
  const modeRef = useRef<ThemeMode>(DEFAULT_THEME_MODE);

  // 挂载：按用户真实选择（cookie/localStorage）确定性地同步 state + 应用类名 +
  // 【自愈回写 cookie】：
  //   1. readInitialMode 优先 cookie、再 localStorage —— 若上次 cookie 被浏览器丢弃
  //      但 localStorage 留下了，这里仍能恢复用户真实选择。
  //   2. 若 cookie 里的值与真实选择不一致（含 cookie 缺失），立刻 writeCookie 回写，
  //      让「下一次刷新」的 SSR 请求头一定带上正确 cookie → 首帧就渲染对，不再回退。
  //   3. 确定性地再 applyClass 一次，杜绝水合/RSC 导航后类名回退亮色。
  useEffect(() => {
    const initial = readInitialMode();
    modeRef.current = initial;
    setModeState(initial);
    const r = resolveThemeClass(initial, systemPrefersDark());
    setResolved(r);
    applyClass(r);
    // 自愈：cookie 与真实选择不一致（或缺失）→ 回写，修好下次刷新的 SSR 首帧。
    if (readCookieMode() !== initial) {
      writeCookie(initial);
    }
  }, []);

  // Auto 模式下跟随系统偏好实时切换 —— 只【监听变化】，绝不在挂载时主动改类。
  // 根因修复（操作员 2026-07-02「深色刷新一瞬间暗色随后变亮」）：旧版此 effect 依赖
  // [mode] 且挂载即调 onChange()。挂载首个 commit 里 mode 闭包值仍是初始 auto（上面
  // 那个 effect 的 setModeState 尚未生效），守卫 `mode !== "auto"` 失效 → 按系统亮色
  // 偏好 applyClass("light")，把 SSR/ThemeScript 已正确应用的 dark 覆盖掉；随后
  // mode 变成 dark 时此 effect 又提前 return，没有代码把 dark 写回 → 页面停在亮色。
  // 现在：监听器常驻、回调里用 modeRef 读真实模式，非 auto 直接忽略系统变化。
  useEffect(() => {
    if (typeof window === "undefined") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => {
      if (modeRef.current !== "auto") return;
      const r = resolveThemeClass("auto", mql.matches);
      setResolved(r);
      applyClass(r);
    };
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    const norm = normalizeThemeMode(next);
    modeRef.current = norm;
    setModeState(norm);
    writeCookie(norm);
    const r = resolveThemeClass(norm, systemPrefersDark());
    setResolved(r);
    applyClass(r);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
  );
}

/** 取当前主题。无 Provider 时安全降级（返回 auto/light，setMode 无操作）。 */
export function useTheme(): ThemeContextValue {
  return (
    useContext(ThemeContext) ?? {
      mode: DEFAULT_THEME_MODE,
      resolved: "light",
      setMode: () => {},
    }
  );
}
