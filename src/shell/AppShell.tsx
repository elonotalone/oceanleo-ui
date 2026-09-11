"use client";

// ============================================================================
// @oceanleo/ui — 全家桶统一外壳（单一事实源）
// ----------------------------------------------------------------------------
// 布局（= 操作员指定的 oceanleo 主站截图）：
//   左侧 248px 侧边栏：站点 Logo + 站名 / 搜索 / 收放键 / 主功能目录（高亮当前页）
//                      / 可选「最近列表」插槽 / 底部 token 余额 / 账户按钮
//   右侧主区：可选 headerRight 浮层 + main（各站业务内容 children）
//   收起：w-[256px] → w-14 图标轨（只收文字、栏目图标留着）；点「我的任务」自动展开
//                      才能露出任务列表。移动端仍是抽屉 + 汉堡键；状态存 localStorage
//
// 「各站保留品牌色」：传 brand.accent。布局/交互/中性底色全站统一，只有 accent
// 与目录项随站变化。改这里 = 改所有站的外壳，一处生效，永不漂移。
// ----------------------------------------------------------------------------
// 集成契约：各站把目录(nav)、品牌(brand)、当前用户(userEmail)、余额(credits)
// 与退出(onSignOut)传进来即可。首页与 agent 对话页右上角切换全局模型组合，
// AI 模型页负责组合管理。
// ============================================================================

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ReactNode,
  createContext,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { ModelGroupPicker, type ModelCategory } from "./ModelPicker";
import { shouldShowModelPicker } from "./model-picker-visibility";
import { useWorkbenchOpen } from "./workbench-open-store";
import type { PreferredModel } from "../lib/auth/account";
import { formatMoney, useLedgerCurrency } from "../lib/money";
import { ToastProvider } from "../ui";
import { IconGift, IconPanel, IconSearch } from "./icons";
import { WorkspaceSelectionProvider } from "./WorkspaceSelection";
import { ThemeSwitcher } from "../theme";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { useUI } from "../i18n/ui/useUI";
import { HelpLink } from "./HelpLink";
import { usePresenceHeartbeat } from "../lib/presence";
// 手机上「看起来是一个 app」的那一套：安全区让位 + 原生宿主下的触感修复。
// 直接引样式表而不是往 theme/ui.css 里塞：ui.css 是 build:css 的产物，
// 改它要重跑构建，而消费站拿到的就是这份源码（transpilePackages）。
import "./phone-shell.css";
// 路由过渡（View Transitions）的全部 CSS。为什么是这套机制、为什么只重定时 root，
// 见该文件顶部——它与下面的 `useRouteNavigation()` 是同一件事的两半。
import "./nav-source/route-transition.css";
import { useRouteNavigation } from "./nav-source/use-route-navigation";
import {
  fusionMountPrefix,
  withFusionMountPrefix,
} from "./workspace-route";

/** 外壳布局：
 *  - "sidebar"（默认）：经典左侧边栏 + 可选右上操作区。
 *  - "topbar"：删除左侧边栏，改为顶部一条 bar——左=站名标题，
 *    右=token 余额 + 账户按钮（账户在 token 右边）。
 *    用于「单页操作台」站（侧栏只有一个功能按键，没有真正的站级导航需要）。 */
export type AppShellLayout = "sidebar" | "topbar";

/**
 * 侧栏里**哪一段跟着手指走**（操作员 2026-08-07 定的三类行为；2026-09-05 收紧第 2 类）。
 *
 * - `"history"`（默认）：导航**标题行**钉死（新建任务 / 探索 / 工作台 / 我的库 /
 *   我的任务），只有 disclosure 里的具体任务行与下方最近区滚动。
 *   这是除主站与 asset / aitools 之外所有 OceanLeo 系列站要的行为。
 * - `"whole"`：整条侧栏当成一整块一起滚（品牌、搜索、导航含展开体、余额全都跟着走），
 *   **只有左下角的账户按钮固定**。asset 与 aitools 要的是这一种：
 *   它们的左栏是一条很长的类型轴，分段滚反而让人找不到自己在哪。
 *
 * 第三类行为（`oceanleo.com` 主站）不在这里：主站走自己的
 * `app/_components/clone-shell.tsx`，根本不吃这个外壳，所以本开关碰不到它。
 */
export type ShellSidebarScroll = "history" | "whole";

/**
 * 默认整体滚动的站（操作员点名的 asset 与 aitools）。
 *
 * 为什么是共享包里的一张默认表，而不是站点侧传 prop：这两个站现在 pin 的是已发布的
 * `@oceanleo/ui` v0.210.0，那个包里还没有 `sidebarScroll`。在它们自己的仓里传这个
 * prop，它们下一次构建就会当场红掉——而本轮的边界是**只到开发版**，不发布新版本。
 * 默认值放在这里，开发版立刻是对的，两个站点仓一行不用改；将来真发布之后，
 * 站点想把这件事写在自己的接线里，传 prop 就能覆盖这张表。
 */
const WHOLE_SCROLL_SIDEBAR_SITES = new Set(["asset", "aitools"]);

// 手机客户端打开的就是这套网页端，所以「像不像一个 app」全靠网页端这一侧收口。
// phone-shell.css 的触感段（不闪灰、骨架不弹系统菜单、整页不橡皮筋）全部挂在
// <html data-leo-native-shell> 下，浏览器里一条都不生效——这个属性就是那道开关。
//
// 判据用宿主注入的全局，不依赖任何桥接模块。没选 `@media (display-mode: standalone)`，
// 因为 Capacitor 在安卓 WebView 下不保证匹配，用它整套修复会在安卓上静默失效。
// 属性名故意不叫 `data-oceanleo-native`：那个名字别处也可能用，撞名就互相覆盖。
const NATIVE_SHELL_ATTR = "data-leo-native-shell";

function useNativeShellFlag() {
  useLayoutEffect(() => {
    const host = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
      __oceanleoNative?: unknown;
    };
    const native =
      host.Capacitor?.isNativePlatform?.() === true ||
      Boolean(host.__oceanleoNative);
    // 只置不清：这个属性是「宿主是原生」的事实，不是组件状态，卸载时不该抹掉。
    if (native) document.documentElement.setAttribute(NATIVE_SHELL_ATTR, "");
  }, []);
}

/** @deprecated v5 不再允许覆盖式子栏；仅为旧消费端类型兼容保留。 */
export interface ShellSubNav {
  /** 子栏顶部标题（返回键右侧）。 */
  title: ReactNode;
  /** 子栏列表 body。`close` 调用回到主导航态（不改路由）。 */
  render: (close: () => void) => ReactNode;
}

/** v5：导航项下方原地展开的内容（目前用于「我的任务」列表）。 */
export interface ShellNavDisclosure {
  render: () => ReactNode;
  /** 默认展开；「我的任务」应为 true。 */
  defaultOpen?: boolean;
}

export interface ShellNavItem {
  label: string;
  /** 真实路由；省略 href 时必须给 onClick（如「搜索」这种纯动作项） */
  href?: string;
  icon: ReactNode;
  /** 精确匹配（如首页 "/"）；默认前缀匹配 */
  exact?: boolean;
  /** 纯动作项（无 href）：点击触发，如打开命令面板/搜索 */
  onClick?: () => void;
  /** 右侧快捷键提示（如 "⌘ K"） */
  shortcut?: string;
  /** 自定义高亮判断（覆盖默认 href 匹配）；接收已去掉 locale 前缀的逻辑路由 */
  match?: (pathname: string) => boolean;
  /** @deprecated v5 起忽略；请改用 disclosure。 */
  subNav?: ShellSubNav;
  /** v5：点击导航标题只展开/折叠，内容留在同一主侧栏。 */
  disclosure?: ShellNavDisclosure;
}

/** 分组导航（带可选小标题）。传 navGroups 时优先于扁平 nav。 */
export interface ShellNavGroup {
  heading?: string;
  items: ShellNavItem[];
}

export interface AppShellBrand {
  /** 站名，显示在 logo 右侧 */
  name: string;
  /** logo 节点（建议 h-5 w-5 的 svg / emoji span） */
  logo: ReactNode;
  /** 品牌强调色 hex（如 "#10b981"）—— 当前项左竖条 + 头像背景 + 余额图标 */
  accent: string;
}

function isActive(pathname: string, item: ShellNavItem): boolean {
  if (item.match) return item.match(pathname);
  if (!item.href) return false; // 纯动作项（搜索等）不高亮
  if (
    item.exact ||
    item.href === "/" ||
    item.href === fusionMountPrefix(item.href)
  ) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export { shouldShowModelPicker } from "./model-picker-visibility";

export interface AppShellProps {
  brand: AppShellBrand;
  /**
   * 外壳布局，默认 "sidebar"。单页操作台站传 "topbar"：删左侧边栏，站名留左上，
   * token 余额 + 账户按钮移到右上角（账户在余额右边）。
   */
  layout?: AppShellLayout;
  /** 扁平导航。与 navGroups 二选一（传 navGroups 时本字段忽略）。 */
  nav?: ShellNavItem[];
  /** 分组导航（带小标题）。传了就用分组渲染，覆盖 nav。 */
  navGroups?: ShellNavGroup[];
  children: ReactNode;
  /** 品牌区点击回调（如 i18n 站要用自己的 router.push("/")）；不传则用 <Link href="/">。 */
  onBrandClick?: () => void;
  /** 把含 locale 前缀的 pathname 归一成逻辑路由再做高亮匹配（i18n 站传入）。 */
  stripLocale?: (pathname: string) => string;
  /** localStorage 收起状态 key，建议 "<site>_sidebar_collapsed" */
  collapseKey?: string;
  /** 当前用户邮箱，无则显示「未登录」 */
  userEmail?: string | null;
  /** 余额，账本货币主单位（.cn 元 / .com 美元），null = 加载中 */
  credits?: number | null;
  /**
   * 余额的货币码（"CNY" / "USD"），来自站点自己的 `getCredits()` 响应。
   * 不传时用网关最近告诉共享包的账本货币（`getCredits()` 归一化时记下），
   * 从没记过就按 CNY —— 绝不猜美元。
   */
  creditsCurrency?: string | null;
  /** 侧栏搜索过滤回调；提供时右上角显示搜索按钮并展开输入框 */
  onSearch?: (term: string) => void;
  searchPlaceholder?: string;
  /** 侧栏中部「最近列表」插槽（聊天历史 / 最近生成等，各站自填；无则不渲染） */
  recentSlot?: ReactNode;
  /**
   * 侧栏滚动范围。不传时按 `siteId` 取默认：asset / aitools 整体滚，其余只滚历史区。
   * 见 `ShellSidebarScroll` 与 `WHOLE_SCROLL_SIDEBAR_SITES`。
   */
  sidebarScroll?: ShellSidebarScroll;
  /**
   * @deprecated 2026-08-07 起忽略。
   *
   * 「钉住前 N 个导航项、其余跟着历史一起滚」这个形状表达不了操作员要的两类行为：
   * 一类要**全部**导航键都不动，另一类要**整条**侧栏一起动。滚动范围因此换成
   * `sidebarScroll`，一个数字旋钮换成一个说得清的枚举。字段保留只为旧消费端不必锁步
   * 发布 —— 实测本波三个仓没有任何一个站显式传过它。
   */
  pinnedNavCount?: number;
  /** 账户区点击退出 */
  onSignOut?: () => void;
  /** 左下角账户按钮跳转路由（默认 /account） */
  accountHref?: string;
  /** 账户按钮点击回调（i18n 站用自己的 router 做 locale-aware 跳转）；传了则覆盖 accountHref 的 Link。 */
  onAccountClick?: () => void;
  /**
   * 「帮助与反馈」入口。`null` = 隐藏；字符串 = 覆盖 href；未传 = 按当前 host
   * 自动指向 help.oceanleo.com / help.oceanleo.cn。
   */
  helpHref?: string | null;
  /**
   * 帮助中心 `?site=` 参数。不传时回退已有的 `siteId`（各站心跳标识）。
   */
  siteKey?: string;
  /** @deprecated 模型统一在「AI 模型」页管理；保留字段仅兼容旧消费端。 */
  apiHref?: string;
  /** @deprecated 顶部模型选择已下线；保留字段仅兼容旧消费端。 */
  modelCategories?: ModelCategory[];
  /** 站点标识（在线心跳等用途）。 */
  siteId?: string;
  /** @deprecated 顶部模型选择已下线。 */
  onModelChange?: (category: ModelCategory, model: PreferredModel) => void;
  /** @deprecated 顶部模型选择已下线。 */
  onModelSelectionChange?: (
    selection: Partial<Record<ModelCategory, PreferredModel>>,
  ) => void;
  /** header 右侧自定义插槽（各站放自己的操作按钮） */
  headerRight?: ReactNode;
  /** true 时隐藏顶部 header（业务页自带顶栏时用） */
  hideHeader?: boolean;
  /** 内建主题切换器（Light/Dark/Auto）。2026-07-01 起默认 **false**——语言/主题
   *  切换统一收进「通用」页(/general)，不再放侧栏左下角（操作员指定）。仍保留此开关
   *  供特殊场景显式开启，但全家桶标准接入不再传 true。 */
  showThemeSwitcher?: boolean;
  /** 内建语言切换器（17 语言）。2026-07-01 起默认 **false**（同上，移到「通用」页）。
   *  ⚠ 若显式开启，站点必须已包 <I18nProvider>（NextIntlClientProvider），否则
   *  useLocale() 会抛错。 */
  showLanguageSwitcher?: boolean;
  /** @deprecated 顶部模型选择已下线；保留字段仅兼容旧消费端。 */
  consoleRouteMatch?: (logicalPathname: string) => boolean;
}

const AppShellPresence = createContext(false);

// shared layout 可先挂一个持久 AppShell，而旧 page 里的 SiteShell 暂时仍可保留。
// 内层 AppShell 自动退化为 children，避免双侧栏；外层在路由切换时保持挂载。
//
// `ToastProvider` 挂在**这一支**（非 nested）而不是 `AppShellInner` 里面：套几层
// AppShell 都只有最外那一层走到这里，所以全应用恒定一个 viewport。没挂的话 toast
// 照常进 store、没人渲染（`src/ui/Toast.tsx` 刻意如此，dev 下 warn 一次）——
// 也就是说这一层缺席时，全站的 toast 一条都不会出现在屏幕上。
// viewport 自己 `pointer-events: none`、`position: fixed`，包在最外面不挡任何点击。
export function AppShell(props: AppShellProps) {
  const nested = useContext(AppShellPresence);
  if (nested) return <>{props.children}</>;
  return (
    <ToastProvider>
      <AppShellPresence.Provider value>
        <WorkspaceSelectionProvider>
          <AppShellInner {...props} />
        </WorkspaceSelectionProvider>
      </AppShellPresence.Provider>
    </ToastProvider>
  );
}

function AppShellInner({
  brand,
  layout = "sidebar",
  nav,
  navGroups,
  children,
  onBrandClick,
  stripLocale,
  collapseKey = "oceanleo_sidebar_collapsed",
  userEmail,
  credits,
  creditsCurrency,
  onSearch,
  searchPlaceholder,
  recentSlot,
  sidebarScroll,
  onSignOut,
  accountHref = "/account",
  onAccountClick,
  helpHref,
  siteKey,
  apiHref = "/api",
  siteId = "default",
  headerRight,
  hideHeader = false,
  showThemeSwitcher = false,
  showLanguageSwitcher = false,
}: AppShellProps) {
  const tt = useUI();
  const ledger = useLedgerCurrency();
  const balanceCurrency = creditsCurrency || ledger;
  const creditsText = credits != null ? formatMoney(credits, balanceCurrency, 2) : "…";
  const helpSiteKey =
    (siteKey || (siteId !== "default" ? siteId : "")).trim() || undefined;
  const showHelp = helpHref !== null;
  const rawPathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const pathname = stripLocale ? stripLocale(rawPathname) : rawPathname;
  const mountNavPath = fusionMountPrefix(rawPathname) ? rawPathname : pathname;
  const shellHref = (href: string) =>
    withFusionMountPrefix(href, rawPathname);
  // 在线心跳：登录用户每 60s ping 网关（admin「在线人数」曲线的数据源）。
  usePresenceHeartbeat(siteId);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // 路由跳转的两件事都在这个 hook 里：View Transitions 的快照过渡（不重挂载，
  // 见下方 route surface 的注释）与 `useTransition` 的 pending 目标。
  // 移动端抽屉在 push 之前先关，否则抽屉会盖着新页面淡入。
  const { navigate: navigateRoute, pendingHref } = useRouteNavigation({
    onNavigate: () => setMobileOpen(false),
    stripLocale,
  });
  const [searchOpen, setSearchOpen] = useState(false);
  useNativeShellFlag();
  const [term, setTerm] = useState("");

  const sourceNavGroups: ShellNavGroup[] = navGroups?.length
    ? navGroups
    : [{ items: nav ?? [] }];
  const scrollScope: ShellSidebarScroll =
    sidebarScroll ??
    (WHOLE_SCROLL_SIDEBAR_SITES.has(siteId) ? "whole" : "history");
  const wholeSidebarScrolls = scrollScope === "whole";
  // v5：展开状态属于持久 AppShell，本身不跟 pathname 重置。layout 路由切换时
  // 侧栏 DOM 不卸载，所以任务展开状态与滚动位置都原样保留。
  const [openDisclosures, setOpenDisclosures] = useState<Record<string, boolean>>({});

  function disclosureKey(item: ShellNavItem, idx: number): string {
    return item.href || `${item.label}:${idx}`;
  }

  function disclosureIsOpen(item: ShellNavItem, idx: number): boolean {
    const key = disclosureKey(item, idx);
    return openDisclosures[key] ?? item.disclosure?.defaultOpen ?? false;
  }

  function toggleDisclosure(item: ShellNavItem, idx: number): void {
    const key = disclosureKey(item, idx);
    setOpenDisclosures((current) => ({
      ...current,
      [key]: !(current[key] ?? item.disclosure?.defaultOpen ?? false),
    }));
  }

  useLayoutEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(collapseKey) === "1");
    } catch {
      setCollapsed(false);
    }
  }, [collapseKey]);

  function toggleCollapsed(next: boolean) {
    setCollapsed(next);
    localStorage.setItem(collapseKey, next ? "1" : "0");
  }

  // 账户按钮（头像 + 用户名）——sidebar 与 topbar 共用。退出登录统一在账户页内。
  // rail=true：图标轨只留头像，用户名用 title / aria-label 交代。
  function renderAccountButton(rail = false): ReactNode {
    const accountName = userEmail ? userEmail.split("@")[0] : tt("未登录");
    const accountInner = (
      <>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium text-white"
          style={{ background: brand.accent }}
        >
          {userEmail ? userEmail[0].toUpperCase() : "?"}
        </div>
        {!rail && (
          <span className="max-w-[120px] flex-1 truncate text-[13px] font-medium text-neutral-800">
            {accountName}
          </span>
        )}
      </>
    );
    // leo-tap-row：手指设备上这一行不矮于 44px（原来 py-1.5 ≈ 30px）。
    const accountCls = `leo-tap-row flex items-center rounded-lg text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/50 ${
      rail ? "justify-center p-1.5" : "gap-2.5 px-2 py-1.5"
    }`;
    return onAccountClick ? (
      <button
        type="button"
        onClick={() => {
          setMobileOpen(false);
          onAccountClick();
        }}
        className={accountCls}
        title={rail ? accountName : undefined}
        aria-label={rail ? accountName : undefined}
      >
        {accountInner}
      </button>
    ) : (
      <Link
        href={shellHref(accountHref)}
        className={accountCls}
        title={rail ? accountName : undefined}
        aria-label={rail ? accountName : undefined}
      >
        {accountInner}
      </Link>
    );
  }

  // 主题 + 语言切换器（全家桶壳内单一事实源）。sidebar 放账户区上方，topbar 放右上区。
  function renderSwitchers(): ReactNode {
    if (!showThemeSwitcher && !showLanguageSwitcher) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {showThemeSwitcher && <ThemeSwitcher variant="compact" />}
        {showLanguageSwitcher && <LanguageSwitcher variant="compact" />}
      </div>
    );
  }

  // 只读 余额胶囊——sidebar 与 topbar 共用。
  function renderCredits(): ReactNode {
    const balanceText = tt("token 余额").replace(/^token\s*/i, "").trim() || "余额";
    return (
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-1.5">
        <span style={{ color: brand.accent }}>
          <IconGift className="h-3.5 w-3.5" />
        </span>
        <span className="text-[12px] text-neutral-600">{balanceText}</span>
        <span className="text-[13px] font-semibold tabular-nums text-neutral-900">
          {creditsText}
        </span>
      </div>
    );
  }

  function renderBrand(): ReactNode {
    const brandInner = (
      <>
        <span className="flex h-5 w-5 items-center justify-center" style={{ color: brand.accent }}>
          {brand.logo}
        </span>
        <span className="text-[15px] font-semibold tracking-tight">{brand.name}</span>
      </>
    );
    return onBrandClick ? (
      <button
        type="button"
        onClick={onBrandClick}
        className="leo-tap-row flex items-center gap-2 text-neutral-900"
      >
        {brandInner}
      </button>
    ) : (
      <Link href={shellHref("/")} className="leo-tap-row flex items-center gap-2 text-neutral-900">
        {brandInner}
      </Link>
    );
  }

  function renderNavItem(
    item: ShellNavItem,
    idx: number,
    rail = false,
    includeDisclosure = true,
  ): ReactNode {
    // 即时反馈：跳转已经发起但路由还没落地时，把「点中的那一项」当成当前页来算
    // 高亮。乐观路径喂给同一个 isActive()，所以 exact / 前缀 / 自定义 match
    // 三种判定规则一个字都不用改，点中项亮起与其余项熄灭也必然是同一帧。
    const navHref = item.href ? shellHref(item.href) : undefined;
    const active = isActive(
      pendingHref ?? mountNavPath,
      navHref ? { ...item, href: navHref } : item,
    );
    const key = disclosureKey(item, idx);
    const disclosureOpen = item.disclosure
      ? disclosureIsOpen(item, idx)
      : false;
    const labelText =
      typeof item.label === "string" ? tt(item.label) : item.label;
    const labelAttr = typeof labelText === "string" ? labelText : undefined;
    /* 侧栏文字加深（操作员 2026-07-02：旧 text-neutral-600 太浅、观感廉价；
       对照 Manus 侧栏近黑文字）。深色下由 globals.css 全局重映射到 --leo-d-fg。 */
    // leo-tap-row：手指设备上这一行不矮于 44px（原来 px-3 py-2 ≈ 36px，要瞄准才点得中）。
    const cls = `leo-tap-row group/nav flex w-full items-center rounded-lg text-left text-[13px] transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
      rail ? "justify-center px-1 py-2" : "gap-2.5 px-3 py-2"
    } ${
      active
        ? "bg-neutral-200/80 font-medium text-neutral-900"
        : "text-neutral-800 hover:bg-neutral-200/50 hover:text-neutral-900"
    }`;
    const style = !rail && active
      ? { boxShadow: `inset 3px 0 0 ${brand.accent}` }
      : undefined;
    const inner = (
      <>
        <span
          className="transition-colors"
          style={{ color: active ? brand.accent : undefined }}
          data-oceanleo-nav-icon
        >
          {item.icon}
        </span>
        {!rail && (
          <span className="flex-1 truncate">{labelText}</span>
        )}
        {!rail && item.shortcut && (
          <span className="text-[11px] text-neutral-400">{item.shortcut}</span>
        )}
        {!rail && item.disclosure && (
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${
              disclosureOpen ? "rotate-90" : ""
            }`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </>
    );
    let control: ReactNode;
    if (item.disclosure) {
      // 「我的任务」标题只负责原地展开/折叠；具体任务条目负责跳历史详情。
      // 图标轨里点它必须先把侧栏展开，任务列表才有地方画。
      control = (
        <button
          type="button"
          onClick={() => {
            if (rail) {
              toggleCollapsed(false);
              setOpenDisclosures((current) => ({
                ...current,
                [key]: true,
              }));
              return;
            }
            toggleDisclosure(item, idx);
          }}
          aria-expanded={rail ? false : disclosureOpen}
          aria-label={labelAttr}
          title={labelAttr}
          className={cls}
          style={style}
          data-oceanleo-nav-disclosure={rail ? "rail" : "expanded"}
        >
          {inner}
        </button>
      );
    } else if (!navHref || item.onClick) {
      // 纯动作项（无 href）渲染为 button；有 href 渲染为 Link。
      control = (
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            item.onClick?.();
          }}
          aria-label={rail ? labelAttr : undefined}
          title={rail ? labelAttr : undefined}
          className={cls}
          style={style}
        >
          {inner}
        </button>
      );
    } else {
      // 仍然渲染成 <Link>：href 要留在 DOM 里，中键/新标签页打开与 RSC 预取
      // 都靠它（预取正是 layout.tsx:18-22 那条性能警告要保住的东西）。
      // navigate() 只接管「本窗普通左键」这一种，其余交还浏览器。
      control = (
        <Link
          href={navHref}
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              setMobileOpen(false);
              return;
            }
            navigateRoute(navHref, event);
          }}
          aria-label={rail ? labelAttr : undefined}
          title={rail ? labelAttr : undefined}
          className={cls}
          style={style}
        >
          {inner}
        </Link>
      );
    }
    return (
      <div key={key}>
        {control}
        {!rail && includeDisclosure && item.disclosure && (
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${
              disclosureOpen
                ? "grid-rows-[1fr] opacity-100"
                : "pointer-events-none grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="ml-3 border-l border-neutral-200 py-1 pl-1">
                {item.disclosure.render()}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 库里点开编辑器 / 详情面板时（workbenchOpen），选择框让位——它只属于纯对话页，
  // 不能压在面板页签上（规范 v2 §1 / §5）。
  // 模型选择器新规范：对话交互主界面已迁移至输入框右下角紧凑模式；
  // 顶栏槽位隐藏避免重复遮挡，同时保留槽位节点与可访问性契约。
  const workbenchOpen = useWorkbenchOpen();
  const showModelPicker =
    !hideHeader
    && shouldShowModelPicker(pathname, searchParams, { workbenchOpen });
  const modelPickerSlot = showModelPicker ? (
    <div className="pointer-events-auto hidden" data-oceanleo-model-picker-slot>
      <ModelGroupPicker apiHref={shellHref(apiHref)} />
    </div>
  ) : null;
  const showHeaderTools =
    !hideHeader && (showModelPicker || Boolean(headerRight));

  function renderBrandMark(rail = false): ReactNode {
    const mark = (
      <>
        <span className="flex h-5 w-5 items-center justify-center" style={{ color: brand.accent }}>
          {brand.logo}
        </span>
        {!rail && (
          <span className="text-[15px] font-semibold tracking-tight">{brand.name}</span>
        )}
      </>
    );
    const markCls = `${
      rail
        ? "leo-tap-icon flex items-center justify-center rounded-md p-1.5"
        : "leo-tap-row flex items-center gap-2"
    } text-neutral-900`;
    return onBrandClick ? (
      <button
        type="button"
        onClick={() => {
          setMobileOpen(false);
          onBrandClick();
        }}
        className={markCls}
        title={rail ? brand.name : undefined}
        aria-label={rail ? brand.name : undefined}
      >
        {mark}
      </button>
    ) : (
      <Link
        href={shellHref("/")}
        className={markCls}
        title={rail ? brand.name : undefined}
        aria-label={rail ? brand.name : undefined}
      >
        {mark}
      </Link>
    );
  }

  function renderBrandHeader(rail = false): ReactNode {
    if (rail) {
      return (
        <div className="flex flex-col items-center gap-1 px-1 pb-2 pt-3">
          {renderBrandMark(true)}
          <button
            type="button"
            onClick={() => toggleCollapsed(false)}
            className="leo-tap-icon rounded-md p-1.5 text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-200/70 active:scale-95"
            title={tt("展开侧栏")}
          >
            <IconPanel />
          </button>
          {onSearch && (
            <button
              type="button"
              onClick={() => {
                toggleCollapsed(false);
                setSearchOpen(true);
              }}
              className="leo-tap-icon rounded-md p-1.5 text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-200/70 active:scale-95"
              title={tt("搜索")}
            >
              <IconSearch />
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        {renderBrandMark()}
        <div className="flex items-center gap-1 text-neutral-600">
          {onSearch && (
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="leo-tap-icon rounded-md p-1.5 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-200/70 active:scale-95"
              title={tt("搜索")}
            >
              <IconSearch />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              toggleCollapsed(true);
              setMobileOpen(false);
            }}
            className="leo-tap-icon rounded-md p-1.5 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-200/70 active:scale-95"
            title={tt("收起侧栏")}
          >
            <IconPanel />
          </button>
        </div>
      </div>
    );
  }

  const searchPanel = onSearch ? (
    <div
      className={`grid transition-[grid-template-rows] duration-[var(--leo-dur-3)] ease-out ${
 searchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
 }`}
    >
      <div className="overflow-hidden">
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 focus-within:border-neutral-400">
            <IconSearch className="h-3.5 w-3.5 text-neutral-400" />
            <input
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-neutral-400"
              placeholder={searchPlaceholder ?? tt("搜索...")}
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                onSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setTerm("");
                  onSearch("");
                  setSearchOpen(false);
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  ) : null;

  /** 整份导航（含分组小标题）。`"whole"` 仍画标题+展开体；`"history"` 钉住区只画标题行。 */
  function renderNavSection(includeDisclosure = true): ReactNode {
    return (
      <nav className="px-2 pb-1 pt-1">
        {sourceNavGroups.map((group, gi) => (
          <div key={group.heading ?? gi} className="mb-1">
            {group.heading && (
              <div className="px-3 pb-1 pt-3 text-[12px] text-neutral-600">
                {group.heading}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item, ii) =>
                renderNavItem(item, gi * 1000 + ii, false, includeDisclosure),
              )}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  /** `"whole"` 用：标题+展开体仍在同一个整体滚动容器里。 */
  const navSection = renderNavSection(true);

  /**
   * `"history"` 滚动区：disclosure 展开体。收起时仍挂着（`grid-rows-0`），
   * 不卸载任务列表，否则一折再开就要重拉、滚动位置也丢。
   */
  function renderDisclosureBodies(): ReactNode {
    const bodies: ReactNode[] = [];
    sourceNavGroups.forEach((group, gi) => {
      group.items.forEach((item, ii) => {
        if (!item.disclosure) return;
        const idx = gi * 1000 + ii;
        const disclosureOpen = disclosureIsOpen(item, idx);
        bodies.push(
          <div
            key={disclosureKey(item, idx)}
            data-oceanleo-nav-disclosure-body
            className={`grid transition-[grid-template-rows,opacity] duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${
              disclosureOpen
                ? "grid-rows-[1fr] opacity-100"
                : "pointer-events-none grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="ml-3 border-l border-neutral-200 py-1 pl-1">
                {item.disclosure.render()}
              </div>
            </div>
          </div>,
        );
      });
    });
    if (bodies.length === 0) return null;
    return <div className="px-2 pb-1 pt-1">{bodies}</div>;
  }

  /** 把「我的任务」之后的项（少见的 Playground）留在滚动区下面，标题仍钉死。 */
  function partitionHistoryNav(): {
    leading: ShellNavGroup[];
    trailing: ShellNavGroup[];
  } {
    const leading: ShellNavGroup[] = [];
    const trailing: ShellNavGroup[] = [];
    let seenDisclosure = false;
    for (const group of sourceNavGroups) {
      const leadItems: ShellNavItem[] = [];
      const trailItems: ShellNavItem[] = [];
      for (const item of group.items) {
        if (item.disclosure) {
          leadItems.push(item);
          seenDisclosure = true;
          continue;
        }
        if (seenDisclosure) trailItems.push(item);
        else leadItems.push(item);
      }
      if (leadItems.length) {
        leading.push({ heading: group.heading, items: leadItems });
      }
      if (trailItems.length) {
        trailing.push({ items: trailItems });
      }
    }
    return {
      leading: leading.length ? leading : sourceNavGroups,
      trailing,
    };
  }

  function navItemSourceIndex(item: ShellNavItem): number {
    for (let gi = 0; gi < sourceNavGroups.length; gi += 1) {
      const ii = sourceNavGroups[gi].items.indexOf(item);
      if (ii >= 0) return gi * 1000 + ii;
    }
    return 0;
  }

  function renderHistoryNavGroups(groups: ShellNavGroup[]): ReactNode {
    return (
      <nav className="px-2 pb-1 pt-1">
        {groups.map((group, gi) => (
          <div key={group.heading ?? `history-nav-${gi}`} className="mb-1">
            {group.heading && (
              <div className="px-3 pb-1 pt-3 text-[12px] text-neutral-600">
                {group.heading}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) =>
                renderNavItem(item, navItemSourceIndex(item), false, false),
              )}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  /** 「最近 / 历史」区：与打开的任务行一起在 `"history"` 滚动区里。 */
  const historySection = recentSlot ? (
    <div className="mt-3 px-2 pb-1">{recentSlot}</div>
  ) : null;

  /* 余额 —— 只读展示，不可点击（实时余额由各站传入）。 */
  const balanceText = tt("token 余额").replace(/^token\s*/i, "").trim() || "余额";
  const creditsCapsule = (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2">
      <span className="flex items-center gap-2 text-[12px] text-neutral-600">
        <span style={{ color: brand.accent }}>
          <IconGift className="h-3.5 w-3.5" />
        </span>
        {balanceText}
      </span>
      <span className="text-[13px] font-semibold tabular-nums text-neutral-900">
        {creditsText}
      </span>
    </div>
  );

  /* 账户按钮 —— 进入账户管理页。退出登录统一移到 /account 页内，侧栏不放
     独立「退出」按钮（这就是消灭 e-commerce 左下角多余退出键的单一事实源）。
     i18n 站传 onAccountClick 用自己的 locale-aware router 跳转。*/
  const accountRow = (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1 [&>a]:w-full [&>button]:w-full">
        {renderAccountButton()}
      </div>
      {showHelp ? <HelpLink href={helpHref} siteKey={helpSiteKey} /> : null}
    </div>
  );

  const historyNavParts = partitionHistoryNav();

  const sidebarBody = wholeSidebarScrolls ? (
    /* "whole"：品牌、搜索、导航、最近区、余额全在同一个滚动容器里一起走，
       左下角账户按钮留在容器外，因此滚多远它都不动（操作员点名的那一颗）。 */
    <>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        data-oceanleo-scroll-nav
        data-oceanleo-sidebar-scroll="whole"
      >
        {renderBrandHeader()}
        {searchPanel}
        {navSection}
        {historySection}
        <div className="space-y-3 px-3 pb-3 pt-3">
          {renderSwitchers()}
          {creditsCapsule}
        </div>
      </div>

      <div
        className="shrink-0 border-t border-neutral-200/70 px-3 pb-4 pt-3"
        data-oceanleo-pinned-account
      >
        {accountRow}
      </div>
    </>
  ) : (
    /* "history"：标题行钉死；只有 disclosure 任务行与最近区跟着手指走。
       「我的任务」之后若还有项（Playground），放在滚动区下面，避免插到标题和任务中间。 */
    <>
      {renderBrandHeader()}
      {searchPanel}

      {/* 标题行按自然高度铺开。留 `overflow-y-auto` 只是兜底：视口矮到连标题
          都放不下时，钉住区可以自己滚，但里面没有任务行。 */}
      <div
        className="mt-1 min-h-0 shrink overflow-y-auto"
        data-oceanleo-pinned-nav
        data-oceanleo-sidebar-scroll="history"
      >
        {renderHistoryNavGroups(historyNavParts.leading)}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-oceanleo-scroll-nav>
        {renderDisclosureBodies()}
        {historySection}
      </div>

      {historyNavParts.trailing.length > 0 ? (
        <div className="shrink-0" data-oceanleo-pinned-nav-tail>
          {renderHistoryNavGroups(historyNavParts.trailing)}
        </div>
      ) : null}

      <div className="mt-auto space-y-3 px-3 pb-4 pt-3">
        {/* 主题 + 语言切换器（全家桶壳内单一事实源，账户区上方） */}
        {renderSwitchers()}
        {creditsCapsule}
        {accountRow}
      </div>
    </>
  );

  // 桌面收起态：只画栏目图标。手机抽屉必须继续用上面那份完整 sidebarBody，
  // 否则桌面收起后打开抽屉会变成一条窄轨。
  const railBody = (
    <>
      {renderBrandHeader(true)}
      <nav
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-1 pt-1"
        data-oceanleo-sidebar-rail-nav
      >
        <div className="space-y-0.5">
          {sourceNavGroups.flatMap((group, gi) =>
            group.items.map((item, ii) =>
              renderNavItem(item, gi * 1000 + ii, true),
            ),
          )}
        </div>
      </nav>
      <div className="shrink-0 px-1 pb-3 pt-2">
        <div className="flex justify-center">{renderAccountButton(true)}</div>
      </div>
    </>
  );

  // ── topbar 布局：无侧边栏。顶部一条 bar——左=站名(+模型选择)，右=余额+账户。
  //    用于单页操作台站（侧栏原本只有一个功能按键，无站级导航可留）。
  if (layout === "topbar") {
    return (
      <div className="leo-safe-shell flex min-h-screen flex-col bg-transparent" data-oceanleo-shell>
        {/* leo-safe-topbar 把 py-2.5 的上半段换成 `2.5 + 刘海高度`，
            否则手机上站名与账户按钮正好落在灵动岛底下。桌面 inset=0，等于原值。 */}
        <header
          data-oceanleo-chrome
          className="leo-safe-topbar sticky top-0 z-40 flex items-center gap-4 border-b border-neutral-200/70 bg-white/80 px-4 pb-2.5 backdrop-blur-sm md:px-6"
        >
          {/* 左：站名标题（原左上角位置） */}
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {renderBrand()}
          </div>
          {/* 右：切换器 + 自定义插槽 + token 余额 + 账户 */}
          <div className="flex shrink-0 items-center gap-2">
            {renderSwitchers()}
            {modelPickerSlot}
            {headerRight}
            {showHelp ? <HelpLink href={helpHref} siteKey={helpSiteKey} /> : null}
            {renderCredits()}
            {renderAccountButton()}
          </div>
        </header>

        <main className="leo-safe-main min-w-0 flex-1">
          <div data-oceanleo-route-surface className="contents">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    /* 根容器透明 → 透出 body 的全家桶浅色渐变（单一事实源在 theme/globals.css）。
       侧栏保留半透明浅灰与主区渐变区分；主区不再铺白，统一渐变底。 */
    <div className="leo-safe-shell flex min-h-screen bg-transparent" data-oceanleo-shell>
      {/* desktop sidebar。固定宽度 256px（2026-07-02 对齐主站 oceanleo.com 侧栏宽，
          利于显示历史记录的 AI 概括标题）——主导航态与覆盖式子栏态共用同一宽度，
          点「工作台 / 文件库 / 历史记录」等带子栏的项时侧栏不再变宽。 */}
      {/* 侧栏钉在视口上（fixed），不是 sticky。理由是实测出来的：sticky 的元素被自己
          的父块夹住，而消费站的根布局会在外壳**之后**再渲染东西（境内站的备案页脚就是
          这么挂的），那一条高度不属于外壳，于是滚到底时侧栏左下角露出一条空白。
          fixed 之后侧栏的高度只跟视口有关，页面下面再挂什么都不会在它底下留缝。
          代价是它不再占据文档流，所以下面那个同宽的占位块是必须的，收起/展开时
          两者宽度必须一起变。 */}
      <aside
        data-oceanleo-chrome
        data-oceanleo-sidebar-mode={collapsed ? "rail" : "expanded"}
        className={`hidden h-screen flex-col overflow-hidden border-r border-neutral-200/70 bg-[#f7f7f7]/85 backdrop-blur-sm transition-[width] duration-[var(--leo-dur-5)] ease-out md:fixed md:start-0 md:top-0 md:z-30 md:flex ${
          collapsed ? "w-14" : "w-[256px]"
        }`}
      >
        <div
          className={`leo-safe-sidebar flex h-full flex-col ${
            collapsed ? "w-14" : "w-[256px]"
          }`}
        >
          {collapsed ? railBody : sidebarBody}
        </div>
      </aside>
      {/* 占位块也必须挂 data-oceanleo-chrome：内嵌（?embed=1）时 EmbedChrome 那段
          pre-paint CSS 靠这个属性把外壳整体 display:none，漏挂就会在 iframe 里留下
          一条 256px 的空白，把内容顶到右边。 */}
      <div
        aria-hidden="true"
        data-oceanleo-chrome
        data-oceanleo-sidebar-spacer
        className={`hidden shrink-0 transition-[width] duration-[var(--leo-dur-3)] ease-out md:block ${
          collapsed ? "w-14" : "w-[256px]"
        }`}
      />

      {/* mobile drawer */}
      {mobileOpen && (
        <div data-oceanleo-chrome className="fixed inset-0 z-[80] md:hidden">
          <div className="v-fade-in absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          {/* 中部滚动交给 sidebarBody 内部的滚动容器（与 desktop 一致），这里不再整体
              overflow-y-auto，避免底部账户区被推走 / 出现双滚动条。 */}
          {/* leo-safe-drawer 同时管宽度（`min(280px, 85vw)`，360px 安卓机上留出
              「点旁边关掉」的余地）与三个方向的安全区让位：底部账户行不会被
              手势条盖住，横屏时也不会被刘海切掉。 */}
          <aside className="leo-safe-drawer absolute left-0 top-0 flex h-full flex-col bg-[#f7f7f7] shadow-xl">
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        <button
          type="button"
          data-oceanleo-chrome
          onClick={() => setMobileOpen(true)}
          className="leo-chrome-topleft leo-tap-target fixed z-50 inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-50 active:scale-95 md:hidden"
          title={tt("打开菜单")}
        >
          <IconPanel />
        </button>

        {/* 右侧主区全局模型组合 + 可选 headerRight 浮在右上角，不占整行高度。 */}
        {showHeaderTools && (
          <div
            data-oceanleo-chrome
            data-oceanleo-header-tools
            className="leo-chrome-topright pointer-events-none absolute right-4 z-30 flex items-center gap-2 md:right-6"
          >
            {modelPickerSlot}
            {/* headerRight 各站自定义操作按钮（与模型组合同一行浮层） */}
            {headerRight && (
              <div className="pointer-events-auto flex min-w-0 items-center gap-2">
                {headerRight}
              </div>
            )}
          </div>
        )}

        {/*
          为浮出的汉堡键预留左侧空间，避免它盖住页面左上角标题。
          - 移动端：汉堡键常驻浮出 → 始终留 pl-14
          - 桌面端：侧栏（展开 256 / 收起图标轨 56）由占位块让位 → md:pl-0
          顶部工具已改为右上角浮层（不占行高），main 一律按「无 header」方式让位。
          这是按钮让位的「唯一事实源」。页面/组件内部不要再各自加让位内边距。
        */}
        {/* leo-safe-main：底部手势条那一条不许压在页面内容上（桌面 0px）。
            leo-safe-main-top（A13）：这条主区头上没有顶栏，顶边也要让出刘海那一条，
            否则刘海机上首屏顶端压在状态栏区里。topbar 布局的主区**不挂**这个类 ——
            那边刘海已经被 .leo-safe-topbar 吃掉，再让一次会多出一条 47px 的空白。 */}
        <main className="leo-safe-main leo-safe-main-top flex-1 pl-14 md:pl-0">
          {/* Route changes update this stable surface in place. In particular,
              /workspace → /workspace/<app> must not remount a live app merely
              to replay a page animation; the app-level console owns its one
              intentional entrance animation. */}
          <div data-oceanleo-route-surface className="contents">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{children}</h1>
  );
}
