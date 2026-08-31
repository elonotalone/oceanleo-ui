// ============================================================================
// @oceanleo/ui — 侧栏导航的**唯一事实源**（数据，不是组件）
// ----------------------------------------------------------------------------
// 病根（本文件存在的理由，W24 2026-08-31 实测）：外壳有两套**各自手写**的导航——
//   A. `WorkspacePages.tsx` 的 `workspaceNav()`：31 个租户站走这套；
//   B. 门户 `oceanleo/app/_components/clone-shell.tsx` 的 `usePrimaryNav()`：
//      主站 oceanleo.com 走这套（它比功能站多出项目/Playground/插件/计划四项，
//      当初套不进 `workspaceNav()`，于是整份复制着手写）。
// 两套不同步，而且**已经真实发病过一次**：`/explore` 页 2026-07-27 就建好并部署，
// 门户侧栏却一直没有入口，用户只能手打 URL 才进得去（`clone-shell.tsx` 的注释里
// 由作者本人记录在案）。
//
// 所以这里放的是**数据**：菜单项 id、路由、label key、图标 id、可见性条件、排序。
// 两套外壳都从这份数据派生自己的渲染，谁都不许再单侧手写一项。
//
// 为什么是「图标 id」而不是图标节点：本文件必须是**纯数据、零 JSX、零 React**。
//   - 两个仓（共享包与门户）各自持有自己的图标实现，节点没法跨仓共享；
//   - 纯 TS 才能被 `node --experimental-strip-types` 直接 import，
//     `tests/nav-single-source.test.mjs` 于是能跑**真实派生**而不是复刻一份再断言复刻品。
// 往这里加 `import ... from "react"` 或任何 JSX，那条测试会当场红。
// ============================================================================

/** 哪一套外壳。`workspace` = 31 个租户站的 `AppShell`；`portal` = 主站 `CloneShell`。 */
export type NavScope = "workspace" | "portal";

/** 侧栏里的分区：主导航，或钉在底部的那一组。 */
export type NavSection = "primary" | "footer";

/** 菜单项 id。两套外壳共用同一套 id，这是「同一页」的判定依据。 */
export type NavPageId =
  | "home"
  | "explore"
  | "workspace"
  | "library"
  | "history"
  | "playground"
  | "projects"
  | "talent"
  | "plugins"
  | "schedules"
  | "devices"
  | "download";

/**
 * 图标 id。消费方各自把 id 映射到自己的图标节点。
 * 同一页在两套外壳里**允许**用不同图标，但必须在本文件里**声明**（见 `placements`）——
 * 声明过的差异是设计决定，没声明的差异才是漂移。
 */
export type NavIconId =
  | "home"
  | "explore"
  | "workspace"
  | "library"
  | "history"
  | "sparkles"
  | "newTask"
  | "search"
  | "panel"
  | "folder"
  | "talent"
  | "plugins"
  | "clock"
  | "device"
  | "download";

/**
 * 文案取自哪个来源。
 * - `"nav"`：i18n `nav` namespace 的 key（17 语言全覆盖，操作员 2026-07-01）。
 * - `"ui"`：`useUI()` 的中文源串——共享 `nav` namespace 里还没有这个键时的过渡态。
 *   每一处 `"ui"` 都是一笔待还的债：键进了共享包就该改回 `"nav"`。
 */
export type NavLabelSource = "nav" | "ui";

/** 可见性开关。带 `option` 的项由调用方按站点情况决定显示与否。 */
export type NavOption =
  | "withExplore"
  | "withWorkspace"
  | "withPlayground"
  | "withTalent";

/** 一个菜单项在**某一套外壳**里的落位。同一项在两套外壳里可以有不同落位。 */
export interface NavPlacement {
  /** 该外壳内的排序键（只比大小，不要求连续；留白便于插项）。 */
  order: number;
  /** 默认 `"primary"`。 */
  section?: NavSection;
  /** 覆盖 `label`（本外壳的语义与共享默认不同时）。 */
  labelKey?: string;
  /** 覆盖 `labelSource`。 */
  labelSource?: NavLabelSource;
  /** 覆盖 `iconId`（本外壳的图标与共享默认不同时）。 */
  iconId?: NavIconId;
  /** 受这个开关控制；不给则恒显。 */
  option?: NavOption;
  /** `option` 未显式传值时的取值。 */
  optionDefault?: boolean;
}

export interface NavSourceEntry {
  id: NavPageId;
  /**
   * 站内逻辑路由（不含 basePath）。
   * 站**外**子站（`external: true`）不写地址：它的 origin 由域名家族在运行时解析，
   * 任何写死的可注册域都是把用户送出境的那条路（见 `contracts/domain-family.ts`）。
   */
  href?: string;
  /** 站外第一方子站（同窗打开，跨站沿用同族登录态）。 */
  external?: boolean;
  /** i18n key（`labelSource` 决定去哪个来源取）。 */
  labelKey: string;
  labelSource?: NavLabelSource;
  iconId: NavIconId;
  /** 精确匹配（首页 `/`）；默认前缀匹配。 */
  exact?: boolean;
  /** 该项支持在侧栏内原地展开子内容（目前只有「我的任务」）。 */
  supportsDisclosure?: boolean;
  placements: Partial<Record<NavScope, NavPlacement>>;
}

/**
 * 唯一事实源。**加一页只改这一处**，两套外壳自动跟上。
 *
 * `order` 留白 10：两套外壳的次序本来就不同（门户把 Playground 放在工作台之后，
 * 租户站放在末位），所以次序是**每套外壳各自的数据**，不是全局的一条。
 */
export const NAV_SOURCE: readonly NavSourceEntry[] = [
  {
    id: "home",
    href: "/",
    labelKey: "home",
    iconId: "home",
    exact: true,
    placements: {
      workspace: { order: 10 },
      // 门户的首页**就是**新建任务入口（`/tasks/new` 已废弃，2026-07-10），
      // 所以它的文案与图标与租户站不同。这是语义差异，不是漂移，故在此声明。
      portal: { order: 10, labelKey: "newTask", iconId: "newTask" },
    },
  },
  {
    id: "explore",
    href: "/explore",
    labelKey: "explore",
    iconId: "explore",
    placements: {
      // 宗旨 v19（操作员 2026-07-08）：「探索」恒在首页与工作台之间。
      workspace: { order: 20, option: "withExplore", optionDefault: true },
      portal: { order: 20, iconId: "search" },
    },
  },
  {
    id: "projects",
    href: "/projects",
    labelKey: "projects",
    iconId: "folder",
    // 门户独有：租户站没有跨站项目的概念。
    placements: { portal: { order: 30, iconId: "folder" } },
  },
  {
    id: "talent",
    external: true,
    labelKey: "真人协作",
    labelSource: "ui",
    iconId: "talent",
    // 紧挨「项目」：成交后的活仍然回到门户项目里进行。
    // 当前域名家族里没有这个子站（境内）时整条不渲染 —— 见 `external` 的注释。
    placements: {
      portal: { order: 40, option: "withTalent", optionDefault: false },
    },
  },
  {
    id: "workspace",
    href: "/workspace",
    labelKey: "workspace",
    iconId: "workspace",
    placements: {
      workspace: { order: 30, option: "withWorkspace", optionDefault: true },
      portal: { order: 50, iconId: "panel" },
    },
  },
  {
    id: "playground",
    href: "/playground",
    labelKey: "playground",
    iconId: "sparkles",
    placements: {
      // 租户站默认没有 Playground，要显式打开，且排在末位。
      workspace: { order: 60, option: "withPlayground", optionDefault: false },
      // 门户恒有，且紧跟工作台。
      portal: { order: 60 },
    },
  },
  {
    id: "plugins",
    href: "/plugins",
    labelKey: "plugins",
    iconId: "plugins",
    placements: { portal: { order: 70 } },
  },
  {
    id: "schedules",
    href: "/schedules",
    labelKey: "schedules",
    iconId: "clock",
    placements: { portal: { order: 80 } },
  },
  {
    id: "library",
    href: "/library",
    labelKey: "library",
    iconId: "library",
    placements: { workspace: { order: 40 }, portal: { order: 90 } },
  },
  {
    id: "history",
    // 路径保留 history 兼容旧链接。
    href: "/history",
    labelKey: "history",
    iconId: "history",
    supportsDisclosure: true,
    placements: { workspace: { order: 50 }, portal: { order: 100 } },
  },
  {
    id: "devices",
    href: "/devices",
    labelKey: "我的设备",
    labelSource: "ui",
    iconId: "device",
    // 与「下载 App」是同一件事的两头：先下载客户端，再回这里把电脑连上来。
    placements: { portal: { order: 10, section: "footer" } },
  },
  {
    id: "download",
    href: "/download",
    labelKey: "downloadApp",
    iconId: "download",
    placements: { portal: { order: 20, section: "footer" } },
  },
] as const;

/** 派生出来的一行：调用方只需把 `iconId` / `labelKey` 换成自己的节点与文案。 */
export interface ResolvedNavEntry {
  id: NavPageId;
  /** 站外项这里是 `undefined`，地址由调用方解析后填入。 */
  href?: string;
  external: boolean;
  labelKey: string;
  labelSource: NavLabelSource;
  iconId: NavIconId;
  exact: boolean;
  section: NavSection;
  supportsDisclosure: boolean;
}

export type NavResolveOptions = Partial<Record<NavOption, boolean>>;

function placementVisible(
  placement: NavPlacement,
  options: NavResolveOptions,
): boolean {
  if (!placement.option) return true;
  const explicit = options[placement.option];
  if (typeof explicit === "boolean") return explicit;
  return placement.optionDefault ?? true;
}

/**
 * 取某一套外壳、某一个分区的导航，按该外壳的 `order` 升序。
 *
 * 这是两套外壳**唯一**允许的取数入口。谁在自己那边另写一份数组，
 * `tests/nav-single-source.test.mjs` 会当场红。
 */
export function navEntries(
  scope: NavScope,
  options: NavResolveOptions = {},
  section: NavSection = "primary",
): ResolvedNavEntry[] {
  return NAV_SOURCE.filter((entry) => {
    const placement = entry.placements[scope];
    if (!placement) return false;
    if ((placement.section ?? "primary") !== section) return false;
    return placementVisible(placement, options);
  })
    .sort((a, b) => {
      const pa = a.placements[scope];
      const pb = b.placements[scope];
      return (pa ? pa.order : 0) - (pb ? pb.order : 0);
    })
    .map((entry) => {
      // 上面的 filter 已经保证 placement 存在。
      const placement = entry.placements[scope] as NavPlacement;
      return {
        id: entry.id,
        href: entry.href,
        external: entry.external ?? false,
        labelKey: placement.labelKey ?? entry.labelKey,
        labelSource: placement.labelSource ?? entry.labelSource ?? "nav",
        iconId: placement.iconId ?? entry.iconId,
        exact: entry.exact ?? false,
        section: placement.section ?? "primary",
        supportsDisclosure: entry.supportsDisclosure ?? false,
      };
    });
}

/** 某一套外壳里出现过的全部 id（不受可见性开关影响）—— 门禁用。 */
export function navIdsForScope(scope: NavScope): NavPageId[] {
  return NAV_SOURCE.filter((entry) => Boolean(entry.placements[scope]))
    .slice()
    .sort((a, b) => {
      const pa = a.placements[scope];
      const pb = b.placements[scope];
      return (pa ? pa.order : 0) - (pb ? pb.order : 0);
    })
    .map((entry) => entry.id);
}

/** 按 id 取原始条目（门禁与调试用）。 */
export function navEntryById(id: NavPageId): NavSourceEntry | undefined {
  return NAV_SOURCE.find((entry) => entry.id === id);
}
