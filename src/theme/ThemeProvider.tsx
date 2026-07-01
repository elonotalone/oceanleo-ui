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

// 写主题 cookie —— 根因修复（操作员 2026-07-01「选深色刷新变亮」）。
//
// 病根不是「没写」，而是「写了但浏览器静默丢弃」：在 https 生产上，
// `domain=.oceanleo.com; secure; samesite=lax` 的【客户端】cookie 在部分浏览器 /
// 隐私模式 / 首次跨子域场景会被拒——写完立刻读 document.cookie 却读不到。于是
// 下次刷新请求头不带 cookie → SSR 回退 light（而 localStorage 同源写成功了 → 出现
// 「卡片高亮深色但整页纯白」的自相矛盾态）。
//
// 修复：写完【读回校验】，跨子域那份没落地就降级为 host-only（无 domain）再写一份，
// 保证「至少本站刷新能读到」。localStorage 永远写（同源兜底 + <ThemeScript> 首帧读它）。
// 返回值：cookie 最终是否成功落地（任一形态可读回即算成功）。
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

  // ① 顶级域 cookie（跨全部 *.oceanleo.com 子站共享）。
  if (onOceanleo) {
    document.cookie = `${base}; domain=.oceanleo.com${secure}`;
  }
  // ② host-only cookie（无 domain）—— 无条件也写一份，作为跨子域那份被拒时的兜底，
  //    保证本站刷新一定能读到。两份同名 cookie，读时以更具体的为准，值相同不冲突。
  document.cookie = `${base}${secure}`;

  // 读回校验：只要能读回正确值就算成功。
  return readCookieMode() === mode;
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

  // 挂载：按用户真实选择（cookie/localStorage）确定性地同步 state + 应用类名 +
  // 【自愈回写 cookie】。这是「选深色刷新变亮」的根因修复闭环（操作员 2026-07-01）：
  //   1. readInitialMode 优先 cookie、再 localStorage —— 若上次 cookie 被浏览器丢弃
  //      但 localStorage 留下了，这里仍能恢复用户真实选择。
  //   2. 若 cookie 里的值与真实选择不一致（含 cookie 缺失），立刻 writeCookie 回写，
  //      让「下一次刷新」的 SSR 请求头一定带上正确 cookie → 首帧就渲染对，不再回退。
  //   3. 确定性地再 applyClass 一次，杜绝水合/RSC 导航后类名回退亮色。
  useEffect(() => {
    const initial = readInitialMode();
    setModeState(initial);
    const r = resolveThemeClass(initial, systemPrefersDark());
    setResolved(r);
    applyClass(r);
    // 自愈：cookie 与真实选择不一致（或缺失）→ 回写，修好下次刷新的 SSR 首帧。
    if (readCookieMode() !== initial) {
      writeCookie(initial);
    }
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
