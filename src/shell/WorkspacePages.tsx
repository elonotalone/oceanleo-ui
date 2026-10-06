"use client";

// ============================================================================
// @oceanleo/ui — 站级四页范式帮助器（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 宗旨：每个 OceanLeo 产品站 = 侧边栏 + 四个业务页：
//   首页(home) / 工作台(workspace) / 我的库(library) / 我的任务(history)。
// 本模块把「四页 nav 配置」收敛成一处，各站只需：
//   const nav = workspaceNav({ basePath: "" });           // 给 AppShell
// 高亮、顺序、图标、标签全统一；各站不再各写一套。
// 路由约定（默认）：
//   /            首页
//   /workspace   工作台
//   /library     我的库
//   /history     我的任务（路径保留 history 兼容旧链接）
// 也支持用查询参数单页切换（page=home|workspace|library|history），见 §1。
// ----------------------------------------------------------------------------
// W24 2026-08-31：本文件**不再自己持有那张表**。哪几页、什么次序、什么路由、
// 什么图标、受哪个开关控制，全部来自 `./nav-source`——门户 `CloneShell` 与本文件
// 派生自同一份数据，这是治「两套手写导航不同步」的唯一办法（`/explore` 页
// 2026-07-27 上线、门户侧栏一个月没有入口，就是那个病的一次真实发作）。
// **不要在本文件里再写第二张页面表。** 加一页请改 `nav-source/index.ts`。
// ============================================================================

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useUI } from "../i18n/ui/useUI";
import { imEnabledHere, useImEnabled } from "../lib/im/client";
import { openMessages } from "./messages/host-state";
import { MessagesNavIcon } from "./messages/MessagesNavIcon";
import type {
  ShellNavDisclosure,
  ShellNavItem,
  ShellSubNav,
} from "./AppShell";
import { IconHome, IconWorkspace, IconLibrary, IconHistory, IconSparkles, IconExplore } from "./icons";
import {
  navEntries,
  type NavIconId,
  type NavPageId,
  type NavResolveOptions,
} from "./nav-source";

export type WorkspacePage = "home" | "explore" | "messages" | "workspace" | "library" | "history" | "playground";

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
  /**
   * 是否包含「消息」（打开消息浮层的动作项，没有页面）。不传 = `imEnabledHere()`：
   * 境内站与未登录自动没有。要在登录后跟着出现，站内请经 `useWorkspaceNavLabels()` 取 labels（它订阅登录态）。
   */
  withMessages?: boolean;
  /** v5：导航项下方原地展开的内容；标准用法是 history → 任务列表。 */
  disclosures?: Partial<Record<WorkspacePage, ShellNavDisclosure>>;
  /**
   * @deprecated v5 删除覆盖式子栏。仅把旧 `history` 配置兼容转换为内联展开；
   * `library` 等其他配置会被忽略。
   */
  subNav?: Partial<Record<WorkspacePage, ShellSubNav>>;
}

/** 缺翻译时兜底的中文源串（**文案**兜底，不是页面表）。 */
const DEFAULT_LABELS: Record<WorkspacePage, string> = {
  home: "新建",
  explore: "探索",
  messages: "消息",
  workspace: "工作台",
  library: "我的库",
  history: "我的任务",
  playground: "Playground",
};

/** 图标 id → 本包的图标节点。`nav-source` 只给 id（它必须零 JSX），节点在这里接。 */
const ICON_BY_ID: Partial<Record<NavIconId, ReactNode>> = {
  home: <IconHome />,
  explore: <IconExplore />,
  workspace: <IconWorkspace />,
  library: <IconLibrary />,
  history: <IconHistory />,
  sparkles: <IconSparkles />,
};

/**
 * 编译期对账：`WorkspacePage` 必须是 `nav-source` 里 `workspace` 那一套外壳的
 * id 的子集。有人在这里加一个 `nav-source` 不认识的页，`tsc` 当场红。
 */
type _WorkspacePageIsNavPage = WorkspacePage extends NavPageId ? true : never;
const _workspacePageIsNavPage: _WorkspacePageIsNavPage = true;
void _workspacePageIsNavPage;

/** 取「本外壳认识的全部页」时用：把所有可见性开关都打开。 */
const ALL_WORKSPACE_PAGES_VISIBLE: NavResolveOptions = {
  withExplore: true,
  withWorkspace: true,
  withPlayground: true,
  withMessages: true,
};

/** 把 `WorkspaceNavOptions` 的三个开关翻成 `nav-source` 的可见性开关。 */
function resolveOptions(opts: WorkspaceNavOptions): NavResolveOptions {
  return {
    withExplore: opts.withExplore,
    withWorkspace: opts.withWorkspace,
    withPlayground: opts.withPlayground,
    withMessages: opts.withMessages ?? imEnabledHere(),
  };
}

/**
 * 全家桶子站四页 nav 的 i18n 标签（操作员 2026-07-01：一旦语言设置改了全局跟随）。
 * 各站 SiteShell 里：`const labels = useWorkspaceNavLabels();
 *   const nav = useMemo(() => workspaceNav({ labels, subNav }), [labels]);`
 * 从共享 `nav` namespace 读（home/workspace/library/history/playground）——17 语言全覆盖。
 * ⚠ 必须在 <I18nProvider> 内调用（client 组件）。
 */
export function useWorkspaceNavLabels(): Record<WorkspacePage, string> {
  const t = useTranslations("nav");
  const tt = useUI();
  // 订阅登录态：登录/退出后各站外壳随之重渲染，「消息」才会出现或消失（workspaceNav 每次重渲染重新取值）。
  useImEnabled();
  // 某个 nav key 在旧翻译包里可能缺失（新加页）。next-intl 缺 key 时的返回值不确定：
  //   - server（走共享 createI18nRequest.getMessageFallback）→ 最后一段，如 "explore"；
  //   - client（NextIntlClientProvider 未接同款 fallback）→ 完整 key，如 "nav.explore"。
  // 两种都不是给用户看的文案。用 safe() 统一判定：若返回值 == key / == "nav.<key>"
  // （即没命中真正翻译）就回退到 DEFAULT_LABELS 的中文（绝不显示 raw key）。
  const safe = (page: WorkspacePage, key: string): string => {
    let v: string;
    try {
      v = t(key);
    } catch {
      return DEFAULT_LABELS[page];
    }
    if (!v || v === key || v === `nav.${key}`) return DEFAULT_LABELS[page];
    return v;
  };
  // 有哪几页、各自的 i18n key 是什么，都问 nav-source 要；这里只负责取文案。
  const labels = {} as Record<WorkspacePage, string>;
  for (const entry of navEntries("workspace", ALL_WORKSPACE_PAGES_VISIBLE)) {
    const page = entry.id as WorkspacePage;
    // labelSource "ui" 的项（如「消息」）取界面词表的中文源串，不进共享 nav namespace。
    labels[page] = entry.labelSource === "ui" ? tt(entry.labelKey) : safe(page, entry.labelKey);
  }
  return labels;
}

/** 构造 AppShell 的导航。顺序：首页 → 探索 → 工作台 → 我的库 → 我的任务 (→ playground)。 */
export function workspaceNav(opts: WorkspaceNavOptions = {}): ShellNavItem[] {
  const base = opts.basePath || "";
  const labels = { ...DEFAULT_LABELS, ...(opts.labels || {}) };
  // 哪几页、什么次序、受哪个开关控制 —— 全部来自 nav-source，本文件不再自持。
  return navEntries("workspace", resolveOptions(opts)).map((entry) => {
    const p = entry.id as WorkspacePage;
    const legacyHistory =
      entry.supportsDisclosure ? opts.subNav?.history : undefined;
    const disclosure =
      opts.disclosures?.[p] ??
      (legacyHistory
        ? {
            defaultOpen: true,
            render: () => legacyHistory.render(() => undefined),
          }
        : undefined);
    if (entry.action === "messages") {
      // 动作项：没有 href，点击打开消息浮层。
      return {
        label: labels[p],
        icon: <MessagesNavIcon />,
        onClick: () => openMessages(),
      };
    }
    return {
      label: labels[p],
      href: `${base}${entry.href ?? "/"}`,
      icon: ICON_BY_ID[entry.iconId],
      exact: entry.exact,
      disclosure,
    };
  });
}

/** 从路径解析当前是哪一页（消费端可用来在单页模式下切换内容）。 */
export function pageFromPath(pathname: string, basePath = ""): WorkspacePage {
  const p = (pathname || "/").slice(basePath.length) || "/";
  // 路由前缀同样来自 nav-source：这里再写一张表就又是一个漂移源。
  for (const entry of navEntries("workspace", ALL_WORKSPACE_PAGES_VISIBLE)) {
    if (entry.exact || !entry.href) continue;
    if (p.startsWith(entry.href)) return entry.id as WorkspacePage;
  }
  return "home";
}
