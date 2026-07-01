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
  const domainAttr =
    host.endsWith(".oceanleo.com") || host === "oceanleo.com" ? "; domain=.oceanleo.com" : "";
  document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${domainAttr}`;
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

  // 挂载：同步 state 到 ThemeScript 已应用的真实状态（读 cookie/ls）。
  useEffect(() => {
    const initial = readInitialMode();
    setModeState(initial);
    setResolved(resolveThemeClass(initial, systemPrefersDark()));
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
