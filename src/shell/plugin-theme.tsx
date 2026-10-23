"use client";

/**
 * 插件内主题（契约：oceandino docs/architecture/oceanleo-plugin-theme-contract.md）。
 *
 * 2026-10-23 操作员裁定 D7：所有编辑器自动跟随网站主题。不再有各插件的「本命默认」、
 * 不存 localStorage、没有切换键（PluginThemeToggle 已删）。
 *   - 站点外观的事实源是 <html> 上的主题类：SSR 由 getThemeClass 按 cookie 写好，首帧前
 *     ThemeScript 同步校正，之后 ThemeProvider.setMode / auto 跟系统时由 applyClass 同步改写。
 *     含 `dark`（dark 与暗色特色主题 "dark <slug>"）= dark；其余（light 与浅色特色主题）= light。
 *   - 为什么客户端不以 useTheme().resolved 为准：Provider 的 resolved 初值恒为 "light"
 *     （useState 初值），挂载 effect 之后才校正；html 类在首帧前就是对的。编辑器若与 Provider
 *     同一次提交挂载，读 resolved 会先画一帧浅色再跳暗色。所以读 html 类 + MutationObserver；
 *     useTheme() 只用来在 Provider 改档时同一批重渲染。
 *   - SSR / hydration 读不到 DOM：快照为 null，消费方据此走站点语义变量别名
 *     （advancedWorkbenchStyle / pluginChromeStyle(null)），那套变量由 html.dark 翻转，
 *     首帧与站点一致，不会先闪一档再跳。
 *   - 主题仍以 CSS 变量作用在插件根节点（data-plugin-theme），不污染 document/body。
 *   - accent 身份色表保留，两档各一个值。
 */

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTheme } from "../theme/ThemeProvider";

export type PluginThemeMode = "dark" | "light";

export type PluginThemeId =
  | "richdoc"
  | "grid"
  | "deck"
  | "image"
  | "pdf"
  | "audio"
  | "video-timeline"
  | "threed"
  | "game"
  // 2026-08-30：三件 extracted 插件并入同一套主题。此前它们走站点主题别名，
  // 于是同一个陈列馆里并存三套 token（--awb-* / --wb-* / 站点语义变量），
  // 切插件会跳色。统一外壳要求 13 件同源，所以补进本表。
  | "website"
  | "video-canvas";

export interface PluginThemeSpec {
  /** accent 身份色，两档各一个值（dark 档亮一档以保证近黑底对比度）。 */
  accent: Record<PluginThemeMode, string>;
}

/**
 * 每件插件的 accent 身份色（结构统一、风格各表）。明暗不在这里定：一律跟随站点（D7）。
 * website 两档抄 website 仓 globals.css 的 --wb-accent。
 */
export const PLUGIN_THEME_SPECS: Record<PluginThemeId, PluginThemeSpec> = {
  richdoc: { accent: { light: "#4f46e5", dark: "#818cf8" } },
  grid: { accent: { light: "#059669", dark: "#34d399" } },
  deck: { accent: { light: "#ea580c", dark: "#fb923c" } },
  image: { accent: { light: "#9333ea", dark: "#c084fc" } },
  pdf: { accent: { light: "#dc2626", dark: "#f87171" } },
  audio: { accent: { light: "#db2777", dark: "#f472b6" } },
  "video-timeline": { accent: { light: "#0891b2", dark: "#22d3ee" } },
  threed: { accent: { light: "#ea580c", dark: "#fdba74" } },
  game: { accent: { light: "#16a34a", dark: "#4ade80" } },
  website: { accent: { light: "#ea580c", dark: "#f97316" } },
  "video-canvas": { accent: { light: "#0d9488", dark: "#2dd4bf" } },
};

/**
 * 认不出的 pluginId 一律退到这一档，**不抛异常**。
 *
 * 主题查表是装修，不是地基：查不到只该长得普通一点，不该把整个插件白屏。
 * 2026-08-31 就是这么炸的——`PLUGIN_THEME_SPECS[pluginId].accent[theme]` 里
 * 那次下标返回了 undefined（开发机上是 Turbopack 留了一份旧的 specs，
 * 里面还没有新并进来的三件 extracted 插件），一个取色动作把整页掀了，
 * 控制台只留下一句 `Cannot read properties of undefined (reading 'accent')`，
 * 看不出跟主题有任何关系。
 *
 * 真正没登记的 id 也不该悄悄混过去，所以开发环境下点名警告一次。
 */
const FALLBACK_THEME_SPEC: PluginThemeSpec = {
  accent: { light: "#4f46e5", dark: "#818cf8" },
};

const warnedUnknownPluginIds = new Set<string>();

function themeSpec(pluginId: PluginThemeId): PluginThemeSpec {
  const spec = PLUGIN_THEME_SPECS[pluginId];
  if (spec) return spec;
  if (
    process.env.NODE_ENV !== "production" &&
    !warnedUnknownPluginIds.has(pluginId)
  ) {
    warnedUnknownPluginIds.add(pluginId);
    console.warn(
      `[plugin-theme] 认不出的 pluginId "${pluginId}"，本次用默认配色。` +
        `要么把它登记进 PLUGIN_THEME_SPECS，要么传 null。`,
    );
  }
  return FALLBACK_THEME_SPEC;
}

/**
 * adapter id → pluginId 归一化（去掉 `@版本`）。设计画布已并入图片编辑器，
 * 旧的 "design-canvas" adapter id 读时别名到 "image"（不改写存量）。
 * office 遗留等不在表里的返回 null，走原站点主题别名。
 */
export function pluginThemeIdForAdapter(
  adapterId: string,
): PluginThemeId | null {
  const raw = adapterId.split("@")[0];
  const bare = raw === "design-canvas" ? "image" : raw;
  return Object.prototype.hasOwnProperty.call(PLUGIN_THEME_SPECS, bare)
    ? (bare as PluginThemeId)
    : null;
}

/** 站点外观 → 两档。读不到 DOM（SSR）时为 null。 */
export function readSiteThemeMode(): PluginThemeMode | null {
  if (typeof document === "undefined" || !document.documentElement) return null;
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/* ---------------------------------------------------------------------------
 * 跟随 <html> 主题类的小仓：一个 MutationObserver 喂全部 hook；最后一个订阅者走时断开，
 * 下一次订阅重新挂到当时的 document 上。
 * ------------------------------------------------------------------------- */
const siteThemeListeners = new Set<() => void>();
let siteThemeObserver: MutationObserver | null = null;
let lastSiteTheme: PluginThemeMode | null = null;

function ensureSiteThemeObserver() {
  if (
    siteThemeObserver ||
    typeof document === "undefined" ||
    typeof MutationObserver === "undefined"
  ) {
    return;
  }
  lastSiteTheme = readSiteThemeMode();
  siteThemeObserver = new MutationObserver(() => {
    const next = readSiteThemeMode();
    if (next === lastSiteTheme) return;
    lastSiteTheme = next;
    siteThemeListeners.forEach((listener) => listener());
  });
  siteThemeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

function subscribeSiteTheme(listener: () => void) {
  ensureSiteThemeObserver();
  siteThemeListeners.add(listener);
  return () => {
    siteThemeListeners.delete(listener);
    if (siteThemeListeners.size === 0 && siteThemeObserver) {
      siteThemeObserver.disconnect();
      siteThemeObserver = null;
    }
  };
}

/** 当前档 = 站点档。pluginId 只为保持签名，主题不再按插件区分。 */
export function currentPluginTheme(pluginId?: PluginThemeId): PluginThemeMode {
  void pluginId;
  return readSiteThemeMode() ?? "light";
}

export interface PluginThemeHandle {
  /**
   * null = 该 adapter 不属于 11 件插件（走站点主题别名），或 SSR / hydration 那一帧
   * 读不到站点档（同样走别名，别名本身跟着 html.dark 走）。
   */
  theme: PluginThemeMode | null;
  /** 当前档的 accent 身份色；theme 为 null 时为 null。 */
  accent: string | null;
}

export function usePluginTheme(
  pluginId: PluginThemeId | null,
): PluginThemeHandle {
  // Provider 改档时 applyClass 已经同步改好 html 类；订阅 context 让这里同一批重渲染。
  useTheme();
  const theme = useSyncExternalStore(
    subscribeSiteTheme,
    () => (pluginId ? readSiteThemeMode() : null),
    () => null,
  );
  return useMemo(
    () => ({
      theme,
      accent: pluginId && theme ? themeSpec(pluginId).accent[theme] : null,
    }),
    [pluginId, theme],
  );
}

/* ---------------------------------------------------------------------------
 * token 注入：pluginWorkbenchStyle(theme, accent) 给插件根 / portal 作用域
 * 一次性注入全部 --awb-* + 站点语义 token + --leo-d-* 遮蔽值。
 * ------------------------------------------------------------------------- */
export function pluginWorkbenchStyle(
  theme: PluginThemeMode,
  accent: string,
): CSSProperties {
  const soft = `color-mix(in srgb, ${accent} ${theme === "dark" ? 16 : 12}%, transparent)`;
  const ring = `color-mix(in srgb, ${accent} 45%, transparent)`;
  if (theme === "light") {
    // 契约：light 主面必须 #ffffff 真纯白，不许灰底充当。
    return {
      colorScheme: "light",
      "--awb-shell-bg": "#ffffff",
      "--awb-chrome-bg": "#ffffff",
      "--awb-stage-bg": "#f3f4f6",
      "--advanced-stage-bg": "var(--awb-stage-bg)",
      "--awb-popover-bg": "#ffffff",
      "--awb-border": "#e4e4e7",
      "--awb-text": "#18181b",
      "--awb-muted": "#71717a",
      "--awb-hover": "rgba(0,0,0,.05)",
      "--awb-accent": accent,
      "--awb-accent-soft": soft,
      // 实心 accent 底上的字色：light 档 accent 深 → 白字；dark 档 accent 亮 → 近黑字。
      "--awb-on-accent": "#ffffff",
      "--awb-danger": "#dc2626",
      "--awb-danger-soft": "color-mix(in srgb, #dc2626 10%, transparent)",
      "--awb-warn": "#d97706",
      "--awb-ok": "#059669",
      "--awb-shadow-floating": "0 8px 28px rgba(15,23,42,.12)",
      "--bg": "#ffffff",
      "--bg-2": "#f6f7f9",
      "--card": "#ffffff",
      "--card-2": "#f4f4f5",
      "--panel": "#ffffff",
      "--surface": "#f6f7f9",
      "--surface-hover": "rgba(0,0,0,.04)",
      "--fg": "#18181b",
      "--fg-2": "#52525b",
      "--muted": "#71717a",
      "--border": "#e4e4e7",
      "--border-strong": "#d4d4d8",
      "--divider": "#e9e9ec",
      "--ring": ring,
      "--danger": "#dc2626",
      "--leo-d-bg": "#ffffff",
      "--leo-d-sidebar": "#ffffff",
      "--leo-d-surface": "#f6f7f9",
      "--leo-d-card": "#ffffff",
      "--leo-d-card-2": "#f4f4f5",
      "--leo-d-border": "#e4e4e7",
      "--leo-d-border-s": "#e9e9ec",
      "--leo-d-fg": "#18181b",
      "--leo-d-fg-2": "#52525b",
      "--leo-d-muted": "#71717a",
      "--leo-d-faint": "#a1a1aa",
    } as CSSProperties;
  }
  return {
    colorScheme: "dark",
    "--awb-shell-bg": "#121215",
    "--awb-chrome-bg": "#1b1b1f",
    "--awb-stage-bg": "#0e0e11",
    "--advanced-stage-bg": "var(--awb-stage-bg)",
    "--awb-popover-bg": "#202025",
    "--awb-border": "rgba(255,255,255,.08)",
    "--awb-text": "#ededf0",
    "--awb-muted": "#9b9ba4",
    "--awb-hover": "rgba(255,255,255,.07)",
    "--awb-accent": accent,
    "--awb-accent-soft": soft,
    "--awb-on-accent": "#151518",
    "--awb-danger": "#f87171",
    "--awb-danger-soft": "color-mix(in srgb, #f87171 16%, transparent)",
    "--awb-warn": "#fbbf24",
    "--awb-ok": "#34d399",
    "--awb-shadow-floating": "0 8px 28px rgba(0,0,0,.5)",
    "--bg": "#121215",
    "--bg-2": "#17171b",
    "--card": "#1b1b1f",
    "--card-2": "#26262c",
    "--panel": "#17171b",
    "--surface": "#17171b",
    "--surface-hover": "rgba(255,255,255,.07)",
    "--fg": "#ededf0",
    "--fg-2": "#c2c2cb",
    "--muted": "#9b9ba4",
    "--border": "rgba(255,255,255,.08)",
    "--border-strong": "rgba(255,255,255,.16)",
    "--divider": "rgba(255,255,255,.06)",
    "--ring": ring,
    "--danger": "#f87171",
    "--leo-d-bg": "#121215",
    "--leo-d-sidebar": "#17171b",
    "--leo-d-surface": "#17171b",
    "--leo-d-card": "#1b1b1f",
    "--leo-d-card-2": "#26262c",
    "--leo-d-border": "rgba(255,255,255,.08)",
    "--leo-d-border-s": "rgba(255,255,255,.06)",
    "--leo-d-fg": "#ededf0",
    "--leo-d-fg-2": "#c2c2cb",
    "--leo-d-muted": "#9b9ba4",
    "--leo-d-faint": "#6c6c75",
  } as CSSProperties;
}

/**
 * React context 能穿透 createPortal（按渲染树而非 DOM 树传递）：外壳根与
 * PluginThemeScope 提供，AnchoredPopover 消费——插件内任何 portal 弹层自动
 * 重建 token 作用域，无需逐调用点接线。
 */
export const PluginThemePortalContext = createContext<PluginThemeId | null>(
  null,
);

export function usePluginThemePortal(): PluginThemeId | null {
  return useContext(PluginThemePortalContext);
}

/**
 * portal 内容（抽屉面板 / 弹层）DOM 在插件根之外，token 不继承——用本组件
 * 重建作用域。painted=false 时只下发变量不铺底（弹层面板自己画底时用）。
 */
export function PluginThemeScope({
  pluginId,
  painted = true,
  className = "",
  children,
}: {
  pluginId: PluginThemeId;
  painted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { theme, accent } = usePluginTheme(pluginId);
  if (!theme || !accent) return <>{children}</>;
  return (
    <PluginThemePortalContext.Provider value={pluginId}>
      <div
        data-plugin-theme={theme}
        data-plugin-theme-scope={pluginId}
        className={`${
          painted
            ? "bg-[var(--awb-chrome-bg)] text-[var(--awb-text)]"
            : ""
        } ${className}`.trim()}
        style={pluginWorkbenchStyle(theme, accent)}
      >
        {children}
      </div>
    </PluginThemePortalContext.Provider>
  );
}
