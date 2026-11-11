// OceanLeo family navigation data shared by the merged portal and every site pack.
// The merged CloneShell owns every domain. There is no separate sub-site shell
// or workspace placement: all sites receive the same labels, icons and order.
// Keep this module free of React/JSX so routing checks can use the actual data.
// The portal mirror is checked by oceanleo/tests/route-loading-boundary.test.mjs.

/** All family domains use the merged portal shell. */
export type NavScope = "portal";

/** 侧栏里的分区：主导航，或钉在底部的那一组。 */
export type NavSection = "primary" | "footer";

/** Page identities shared by every family domain. */
export type NavPageId =
  | "home"
  | "explore"
  | "workspace"
  | "library"
  | "history"
  | "playground"
  | "projects"
  | "talent"
  | "bay"
  | "plugins"
  | "schedules"
  | "messages"
  | "leochat"
  | "devices"
  | "download";

/**
 * 图标 id。消费方各自把 id 映射到自己的图标节点。
 * Every family domain uses the same icon for a page.
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
  | "bay"
  | "plugins"
  | "clock"
  | "messages"
  | "device"
  | "download";

/**
 * 文案取自哪个来源。
 * - `"nav"`：i18n `nav` namespace 的 key（17 语言全覆盖，操作员 2026-07-01）。
 * - `"ui"`：`useUI()` 的中文源串——共享 `nav` namespace 里还没有这个键时的过渡态。
 *   每一处 `"ui"` 都是一笔待还的债：键进了共享包就该改回 `"nav"`。
 */
export type NavLabelSource = "nav" | "ui";

/**
 * 可见性开关。带 `option` 的项由调用方按站点情况决定显示与否。
 * `withExplore` 是旧名，语义是「显示 LeoBay 这一项」；`withBay` 与它同义。
 * 两者任一为 false 就不显示。
 */
export type NavOption =
  | "withExplore"
  | "withBay"
  | "withWorkspace"
  | "withPlayground"
  | "withTalent"
  | "withMessages";

/** A menu entry in the merged family shell. */
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
   * 纯动作项（没有页面）：点击触发一个动作而不是跳转，所以**没有 href**。
   * 目前没有动作项。消费方把它映射成 `onClick`。
   */
  action?: "messages";
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
 * Shared navigation contract for the merged main site and 33 functional sites.
 *
 * `order` leaves room for new entries; every family domain uses the same order,
 * 不是全局的一条。playground 条目仍留在表里（类型 / withPlayground 开关还在），
 * `navEntries` 不再产出这一行。
 */
export const NAV_SOURCE: readonly NavSourceEntry[] = [
  {
    id: "home",
    href: "/",
    labelKey: "home",
    iconId: "home",
    exact: true,
    placements: {
      // 门户的首页**就是**新建任务入口（`/tasks/new` 已废弃，2026-07-10），
      // All family domains use the main site label and icon.
      portal: { order: 10, labelKey: "newTask", iconId: "newTask" },
    },
  },
  {
    id: "bay",
    href: "/bay",
    labelKey: "LeoBay",
    labelSource: "ui",
    iconId: "bay",
    placements: {
      // LeoBay follows New Task on every family domain.
      // 门户侧栏用它自己那套图标里的一枚（`portal-nav.ts` 的 iconId 必须与这里逐字一致）。
      portal: { order: 20, iconId: "talent" },
    },
  },
  {
    id: "leochat",
    href: "/leochat",
    labelKey: "LeoChat",
    labelSource: "ui",
    iconId: "messages",
    placements: {
      // 紧跟 LeoBay。境内外一样都有 LeoChat（2026-10-23 操作员：两版 leo message 功能完全一样）。
      portal: { order: 25 },
    },
  },
  {
    id: "projects",
    href: "/projects",
    labelKey: "projects",
    iconId: "folder",
    // Projects are shared across the main site and every functional sub-site.
    placements: { portal: { order: 30, iconId: "folder" } },
  },
  {
    id: "devices",
    href: "/devices",
    labelKey: "我的设备",
    labelSource: "ui",
    iconId: "device",
    placements: { portal: { order: 35 } },
  },
  {
    id: "workspace",
    href: "/workspace",
    labelKey: "workspace",
    iconId: "workspace",
    placements: {
      portal: { order: 50, iconId: "panel" },
    },
  },
  {
    id: "playground",
    href: "/playground",
    labelKey: "playground",
    iconId: "sparkles",
    placements: {
      // 落位保留，避免「死数据」闸；navEntries 恒跳过 id=playground。
      // 门户侧栏已无此项；不挂 option，避免跨仓把 playground 当成「有条件显示」的项。
      portal: { order: 60 },
    },
  },
  // 「插件」不占侧栏：入口是账号菜单「插件」→ 设置窗的插件面板。
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
    placements: { portal: { order: 90 } },
  },
  {
    id: "history",
    // 路径保留 history 兼容旧链接。
    href: "/history",
    labelKey: "history",
    iconId: "history",
    supportsDisclosure: true,
    placements: { portal: { order: 100 } },
  },
] as const;

/** 派生出来的一行：调用方只需把 `iconId` / `labelKey` 换成自己的节点与文案。 */
export interface ResolvedNavEntry {
  id: NavPageId;
  /** 动作项（无 href）：点击触发动作，如 `"messages"` 打开消息浮层。 */
  action?: "messages";
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
  // withPlayground 作废：开了也不再多一行。货架并进工作台「全部」。
  if (placement.option === "withPlayground") return false;
  if (!placement.option) return true;
  if (placement.option === "withExplore" || placement.option === "withBay") {
    if (options.withExplore === false || options.withBay === false) return false;
    if (typeof options.withExplore === "boolean") return options.withExplore;
    if (typeof options.withBay === "boolean") return options.withBay;
    return placement.optionDefault ?? true;
  }
  const explicit = options[placement.option];
  if (typeof explicit === "boolean") return explicit;
  return placement.optionDefault ?? true;
}

/**
 * 取某一套外壳、某一个分区的导航，按该外壳的 `order` 升序。
 *
 * 这是合并外壳的取数入口。任何站点不得自持不同的导航数组，
 * `tests/nav-single-source.test.mjs` 会当场红。
 */
export function navEntries(
  scope: NavScope,
  options: NavResolveOptions = {},
  section: NavSection = "primary",
): ResolvedNavEntry[] {
  return NAV_SOURCE.filter((entry) => {
    if (entry.id === "playground") return false;
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
        ...(entry.action ? { action: entry.action } : {}),
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
