"use client";

// ============================================================================
// @oceanleo/ui — 站级四页范式帮助器（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 宗旨：每个 OceanLeo 产品站 = 侧边栏 + 四个业务页：
//   首页(home) / 工作台(workspace) / 文件库(library) / 历史记录(history)。
// 本模块把「四页 nav 配置」收敛成一处，各站只需：
//   const nav = workspaceNav({ basePath: "" });           // 给 AppShell
// 高亮、顺序、图标、标签全统一；各站不再各写一套。
// 路由约定（默认）：
//   /            首页
//   /workspace   工作台
//   /library     文件库
//   /history     历史记录
// 也支持用查询参数单页切换（page=home|workspace|library|history），见 §1。
// ============================================================================

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ShellNavItem, ShellSubNav } from "./AppShell";
import { IconHome, IconWorkspace, IconLibrary, IconHistory, IconSparkles, IconExplore } from "./icons";

export type WorkspacePage = "home" | "explore" | "workspace" | "library" | "history" | "playground";

export interface WorkspaceNavOptions {
  /** 路由前缀（i18n 站传 "/zh" 之类）。默认 ""。 */
  basePath?: string;
  /** 自定义各页标签。 */
  labels?: Partial<Record<WorkspacePage, string>>;
  /** 工作台是否启用（少数站没有「固定模板工作台」，只有 agent 首页）。默认 true。 */
  withWorkspace?: boolean;
  /** 「探索」页是否启用（宗旨 v19：全家桶默认有本站相关素材浏览页）。默认 true。 */
  withExplore?: boolean;
  /** 是否包含 playground 页（主站 oceanleo.com 用）。默认 false。 */
  withPlayground?: boolean;
  /** doctrine v4：为某些页提供覆盖式左栏子栏（master-detail）。 */
  subNav?: Partial<Record<WorkspacePage, ShellSubNav>>;
}

const DEFAULT_LABELS: Record<WorkspacePage, string> = {
  home: "首页",
  explore: "探索",
  workspace: "工作台",
  library: "文件库",
  history: "历史记录",
  playground: "Playground",
};

const HREF: Record<WorkspacePage, string> = {
  home: "/",
  explore: "/explore",
  workspace: "/workspace",
  library: "/library",
  history: "/history",
  playground: "/playground",
};

const ICON: Record<WorkspacePage, ReactNode> = {
  home: <IconHome />,
  explore: <IconExplore />,
  workspace: <IconWorkspace />,
  library: <IconLibrary />,
  history: <IconHistory />,
  playground: <IconSparkles />,
};

/**
 * 全家桶子站四页 nav 的 i18n 标签（操作员 2026-07-01：一旦语言设置改了全局跟随）。
 * 各站 SiteShell 里：`const labels = useWorkspaceNavLabels();
 *   const nav = useMemo(() => workspaceNav({ labels, subNav }), [labels]);`
 * 从共享 `nav` namespace 读（home/workspace/library/history/playground）——17 语言全覆盖。
 * ⚠ 必须在 <I18nProvider> 内调用（client 组件）。
 */
export function useWorkspaceNavLabels(): Record<WorkspacePage, string> {
  const t = useTranslations("nav");
  // 「探索」的 i18n key 可能在旧翻译包里缺失（新加页）——用 try/兜底避免 next-intl 抛
  // MISSING_MESSAGE。缺失时回退中文「探索」（DEFAULT_LABELS 也是它）。
  let explore = "探索";
  try {
    const v = t("explore");
    if (v && v !== "explore") explore = v;
  } catch {
    /* 旧翻译包无 nav.explore，用中文兜底 */
  }
  return {
    home: t("home"),
    explore,
    workspace: t("workspace"),
    library: t("library"),
    history: t("history"),
    playground: t("playground"),
  };
}

/** 构造 AppShell 的导航。顺序：首页 → 探索 → 工作台 → 文件库 → 历史记录 (→ playground)。 */
export function workspaceNav(opts: WorkspaceNavOptions = {}): ShellNavItem[] {
  const base = opts.basePath || "";
  const labels = { ...DEFAULT_LABELS, ...(opts.labels || {}) };
  const pages: WorkspacePage[] = [
    "home",
    // 宗旨 v19（操作员 2026-07-08）：「探索」恒在首页与工作台之间。默认开启（全家桶
    // 每站都有本站相关素材浏览页）；个别站可传 withExplore:false 关闭。
    ...(opts.withExplore === false ? [] : (["explore"] as WorkspacePage[])),
    ...(opts.withWorkspace === false ? [] : (["workspace"] as WorkspacePage[])),
    "library",
    "history",
    ...(opts.withPlayground ? (["playground"] as WorkspacePage[]) : []),
  ];
  return pages.map((p) => ({
    label: labels[p],
    href: `${base}${HREF[p]}`,
    icon: ICON[p],
    exact: p === "home",
    subNav: opts.subNav?.[p],
  }));
}

/** 从路径解析当前是哪一页（消费端可用来在单页模式下切换内容）。 */
export function pageFromPath(pathname: string, basePath = ""): WorkspacePage {
  const p = (pathname || "/").slice(basePath.length) || "/";
  if (p.startsWith("/explore")) return "explore";
  if (p.startsWith("/workspace")) return "workspace";
  if (p.startsWith("/library")) return "library";
  if (p.startsWith("/history")) return "history";
  if (p.startsWith("/playground")) return "playground";
  return "home";
}
