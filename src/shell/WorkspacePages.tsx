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
import type { ShellNavItem, ShellSubNav } from "./AppShell";
import { IconHome, IconWorkspace, IconLibrary, IconHistory, IconSparkles } from "./icons";

export type WorkspacePage = "home" | "workspace" | "library" | "history" | "playground";

export interface WorkspaceNavOptions {
  /** 路由前缀（i18n 站传 "/zh" 之类）。默认 ""。 */
  basePath?: string;
  /** 自定义各页标签。 */
  labels?: Partial<Record<WorkspacePage, string>>;
  /** 工作台是否启用（少数站没有「固定模板工作台」，只有 agent 首页）。默认 true。 */
  withWorkspace?: boolean;
  /** 是否包含 playground 页（主站 oceanleo.com 用）。默认 false。 */
  withPlayground?: boolean;
  /** doctrine v4：为某些页提供覆盖式左栏子栏（master-detail）。 */
  subNav?: Partial<Record<WorkspacePage, ShellSubNav>>;
}

const DEFAULT_LABELS: Record<WorkspacePage, string> = {
  home: "首页",
  workspace: "工作台",
  library: "文件库",
  history: "历史记录",
  playground: "Playground",
};

const HREF: Record<WorkspacePage, string> = {
  home: "/",
  workspace: "/workspace",
  library: "/library",
  history: "/history",
  playground: "/playground",
};

const ICON: Record<WorkspacePage, ReactNode> = {
  home: <IconHome />,
  workspace: <IconWorkspace />,
  library: <IconLibrary />,
  history: <IconHistory />,
  playground: <IconSparkles />,
};

/** 构造 AppShell 的导航。顺序：首页 → 工作台 → 文件库 → 历史记录 (→ playground)。 */
export function workspaceNav(opts: WorkspaceNavOptions = {}): ShellNavItem[] {
  const base = opts.basePath || "";
  const labels = { ...DEFAULT_LABELS, ...(opts.labels || {}) };
  const pages: WorkspacePage[] = [
    "home",
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
  if (p.startsWith("/workspace")) return "workspace";
  if (p.startsWith("/library")) return "library";
  if (p.startsWith("/history")) return "history";
  if (p.startsWith("/playground")) return "playground";
  return "home";
}
