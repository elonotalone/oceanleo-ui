"use client";

/**
 * 插件内主题（契约：oceandino docs/architecture/oceanleo-plugin-theme-contract.md）。
 *
 * 10 件共享高级编辑器的主题与站点主题（html.dark）完全解耦：
 *   - 持久化 localStorage["oceanleo.plugin-theme.<pluginId>"]，取值 "dark" | "light"；
 *     没有存值时用该插件的本命默认。
 *   - 主题以 CSS 变量作用在插件根节点（data-plugin-theme），不污染 document/body。
 *   - light = 真纯白（主面 #ffffff）；dark = 近黑深面。
 *
 * 解耦为何靠「内联变量遮蔽」：站点暗色是 html.dark 下的全局工具类翻转
 * （globals.css 的 `html.dark .bg-white {…} !important` + 语义变量重定义）。
 * 内联 style 里的同名变量在子树内胜过 html 上的定义，因此这里把 --awb-*、
 * 站点语义 token（--bg/--card/--fg…）以及 html.dark 规则引用的 --leo-d-* 一并
 * 显式赋值——站点亮插件暗、站点暗插件亮都不串色。
 */

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";

export type PluginThemeMode = "dark" | "light";

export type PluginThemeId =
  | "richdoc"
  | "grid"
  | "chart-editor"
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
  | "design-canvas"
  | "website"
  | "video-canvas";

export interface PluginThemeSpec {
  /** 本命默认：原本暗的默认 dark，原本亮的默认 light。 */
  defaultTheme: PluginThemeMode;
  /** accent 身份色，两档各一个值（dark 档亮一档以保证近黑底对比度）。 */
  accent: Record<PluginThemeMode, string>;
}

/**
 * 每件插件的本命默认与 accent 身份色（结构统一、风格各表）。
 * 默认档裁定见任务书：dark = threed / video-timeline / game / audio；
 * light = richdoc / grid / chart-editor / deck / image / pdf。
 */
export const PLUGIN_THEME_SPECS: Record<PluginThemeId, PluginThemeSpec> = {
  richdoc: {
    defaultTheme: "light",
    accent: { light: "#4f46e5", dark: "#818cf8" },
  },
  grid: {
    defaultTheme: "light",
    accent: { light: "#059669", dark: "#34d399" },
  },
  "chart-editor": {
    defaultTheme: "light",
    accent: { light: "#0284c7", dark: "#38bdf8" },
  },
  deck: {
    defaultTheme: "light",
    accent: { light: "#ea580c", dark: "#fb923c" },
  },
  image: {
    defaultTheme: "light",
    accent: { light: "#9333ea", dark: "#c084fc" },
  },
  pdf: {
    defaultTheme: "light",
    accent: { light: "#dc2626", dark: "#f87171" },
  },
  audio: {
    defaultTheme: "dark",
    accent: { light: "#db2777", dark: "#f472b6" },
  },
  "video-timeline": {
    defaultTheme: "dark",
    accent: { light: "#0891b2", dark: "#22d3ee" },
  },
  threed: {
    defaultTheme: "dark",
    accent: { light: "#ea580c", dark: "#fdba74" },
  },
  game: {
    defaultTheme: "dark",
    accent: { light: "#16a34a", dark: "#4ade80" },
  },
  "design-canvas": {
    defaultTheme: "light",
    accent: { light: "#7c3aed", dark: "#a78bfa" },
  },
  website: {
    // 本命默认 dark，两档 accent 抄 website 仓 globals.css 的 --wb-accent。
    // 并入时这里一度写成 light + #fb923c，两处都是错的：工作台 v1 主题迁移的
    // 交付就是「dark 本命默认」，而 #fb923c 是 dark 档的 --wb-accent-strong，
    // 不是 accent 本身。两套值又共用同一个 localStorage key，于是同一页里
    // 陈列馆插件与站点编辑器会各自认一个默认，切换还互不通知。
    defaultTheme: "dark",
    accent: { light: "#ea580c", dark: "#f97316" },
  },
  "video-canvas": {
    defaultTheme: "dark",
    accent: { light: "#0d9488", dark: "#2dd4bf" },
  },
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
  defaultTheme: "light",
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
 * adapter id → pluginId 归一化：注册表里 chart 的 adapter 是 "chart-editor@1"，
 * 契约 pluginId 用不带版本的 "chart-editor"。其余（website / design-canvas /
 * video-canvas / office 遗留）不属于本 10 件，返回 null 走原站点主题别名。
 */
export function pluginThemeIdForAdapter(
  adapterId: string,
): PluginThemeId | null {
  const bare = adapterId.split("@")[0];
  return Object.prototype.hasOwnProperty.call(PLUGIN_THEME_SPECS, bare)
    ? (bare as PluginThemeId)
    : null;
}

export function pluginThemeStorageKey(pluginId: PluginThemeId): string {
  return `oceanleo.plugin-theme.${pluginId}`;
}

function parseMode(value: string | null): PluginThemeMode | null {
  return value === "dark" || value === "light" ? value : null;
}

/* ---------------------------------------------------------------------------
 * 跨实例同步的小仓：同一 pluginId 的所有 hook（外壳根、工具栏切换器、抽屉/弹层
 * 作用域）读同一份值；setPluginTheme 写 localStorage 并通知本页监听者；其他
 * 标签页经 storage 事件收敛。SSR 无 window 时始终回本命默认。
 * ------------------------------------------------------------------------- */
const themeCache = new Map<PluginThemeId, PluginThemeMode>();
const themeListeners = new Map<PluginThemeId, Set<() => void>>();
let storageListenerInstalled = false;

function notify(pluginId: PluginThemeId) {
  themeListeners.get(pluginId)?.forEach((listener) => listener());
}

function ensureStorageListener() {
  if (storageListenerInstalled || typeof window === "undefined") return;
  storageListenerInstalled = true;
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith("oceanleo.plugin-theme.")) return;
    const pluginId = event.key.slice("oceanleo.plugin-theme.".length);
    if (!Object.prototype.hasOwnProperty.call(PLUGIN_THEME_SPECS, pluginId)) {
      return;
    }
    const id = pluginId as PluginThemeId;
    const next = parseMode(event.newValue) || themeSpec(id).defaultTheme;
    if (themeCache.get(id) === next) return;
    themeCache.set(id, next);
    notify(id);
  });
}

export function currentPluginTheme(pluginId: PluginThemeId): PluginThemeMode {
  const cached = themeCache.get(pluginId);
  if (cached) return cached;
  let stored: PluginThemeMode | null = null;
  if (typeof window !== "undefined") {
    try {
      stored = parseMode(
        window.localStorage.getItem(pluginThemeStorageKey(pluginId)),
      );
    } catch {
      stored = null;
    }
  }
  const value = stored || themeSpec(pluginId).defaultTheme;
  themeCache.set(pluginId, value);
  return value;
}

export function setPluginTheme(
  pluginId: PluginThemeId,
  mode: PluginThemeMode,
) {
  themeCache.set(pluginId, mode);
  try {
    window.localStorage.setItem(pluginThemeStorageKey(pluginId), mode);
  } catch {
    /* 私密模式等存储不可用时主题仍即时生效，只是不持久。 */
  }
  notify(pluginId);
}

function subscribePluginTheme(pluginId: PluginThemeId, listener: () => void) {
  ensureStorageListener();
  let set = themeListeners.get(pluginId);
  if (!set) {
    set = new Set();
    themeListeners.set(pluginId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export interface PluginThemeHandle {
  /** null = 该 adapter 不属于 10 件插件（走原站点主题别名，无切换器）。 */
  theme: PluginThemeMode | null;
  /** 当前档的 accent 身份色；theme 为 null 时为 null。 */
  accent: string | null;
  setTheme: (mode: PluginThemeMode) => void;
  toggle: () => void;
}

export function usePluginTheme(
  pluginId: PluginThemeId | null,
): PluginThemeHandle {
  const subscribe = useCallback(
    (listener: () => void) =>
      pluginId ? subscribePluginTheme(pluginId, listener) : () => {},
    [pluginId],
  );
  const theme = useSyncExternalStore(
    subscribe,
    () => (pluginId ? currentPluginTheme(pluginId) : null),
    () => (pluginId ? themeSpec(pluginId).defaultTheme : null),
  );
  const setTheme = useCallback(
    (mode: PluginThemeMode) => {
      if (pluginId) setPluginTheme(pluginId, mode);
    },
    [pluginId],
  );
  const toggle = useCallback(() => {
    if (!pluginId) return;
    setPluginTheme(
      pluginId,
      currentPluginTheme(pluginId) === "dark" ? "light" : "dark",
    );
  }, [pluginId]);
  return {
    theme,
    accent: pluginId && theme ? themeSpec(pluginId).accent[theme] : null,
    setTheme,
    toggle,
  };
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
            ? "min-h-full bg-[var(--awb-chrome-bg)] text-[var(--awb-text)]"
            : ""
        } ${className}`.trim()}
        style={pluginWorkbenchStyle(theme, accent)}
      >
        {children}
      </div>
    </PluginThemePortalContext.Provider>
  );
}

/** 插件工具栏里的两档切换器（图标按钮）：dark 显太阳（点了变亮），light 显月亮。 */
export function PluginThemeToggle({ pluginId }: { pluginId: PluginThemeId }) {
  const tt = useUI();
  const { theme, toggle } = usePluginTheme(pluginId);
  if (!theme) return null;
  const dark = theme === "dark";
  return (
    <button
      type="button"
      data-plugin-theme-toggle={pluginId}
      onClick={toggle}
      aria-pressed={dark}
      aria-label={tt(dark ? "切换到纯白主题" : "切换到暗黑主题")}
      title={tt(dark ? "切换到纯白主题" : "切换到暗黑主题")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--awb-muted)] transition hover:bg-[var(--awb-hover)] hover:text-[var(--awb-accent)]"
    >
      {dark ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
