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
} from "./theme-config";

interface ThemeContextValue {
  /** 用户选择的模式（light/dark/auto）。 */
  mode: ThemeMode;
  /** 实际生效的外观（auto 已解析成 light/dark）。 */
  resolved: "light" | "dark";
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

function writeCookie(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const host = window.location.hostname;
  const onOceanleo = host.endsWith(".oceanleo.com") || host === "oceanleo.com";
  // https 页面必须带 Secure，否则部分浏览器（尤其配合 domain= 的跨子域 cookie）会
  // 静默丢弃写入 → 刷新后 SSR 读不到 → 主题回退默认（操作员 2026-07-01「选深色刷新变亮」根因）。
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  // 顶级域 cookie（跨全部 *.oceanleo.com 子站共享）。
  if (onOceanleo) {
    document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax; domain=.oceanleo.com${secure}`;
    // 兜底：某些环境（预览域 / localhost 端口）domain=.oceanleo.com 不匹配当前 host 会被拒，
    // 再无 domain 属性写一份同源 cookie，保证至少本站能读到。
  }
  document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${secure}`;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function applyClass(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.remove("dark", "light");
  el.classList.add(resolved);
  el.style.colorScheme = resolved;
}

export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // 初值只在挂载时读一次；SSR 阶段返回 DEFAULT（不影响首帧，首帧类名由 ThemeScript 定）。
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // 挂载：同步 state 到 ThemeScript 已应用的真实状态（读 cookie/ls），并【兜底再
  // applyClass 一次】。原因（操作员 2026-07-01「选深色刷新变亮」）：ThemeScript 首帧
  // 会加 .dark，但若首帧因 cookie 写入失败而缺失、或 React 水合/RSC 导航后 <html>
  // 类被某处重置，这里按用户真实选择（cookie/ls）再确定性地应用一次，杜绝回退亮色。
  useEffect(() => {
    const initial = readInitialMode();
    setModeState(initial);
    const r = resolveThemeClass(initial, systemPrefersDark());
    setResolved(r);
    applyClass(r);
  }, []);

  // Auto 模式下跟随系统偏好实时切换。
  useEffect(() => {
    if (mode !== "auto" || typeof window === "undefined") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => {
      const r = resolveThemeClass("auto", mql.matches);
      setResolved(r);
      applyClass(r);
    };
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    const norm = normalizeThemeMode(next);
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
