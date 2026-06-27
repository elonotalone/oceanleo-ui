"use client";

// ============================================================================
// @oceanleo/ui — 全家桶统一外壳（单一事实源）
// ----------------------------------------------------------------------------
// 布局（= 操作员指定的 oceanleo 主站截图）：
//   左侧 248px 侧边栏：站点 Logo + 站名 / 搜索 / 收放键 / 主功能目录（高亮当前页）
//                      / 可选「最近列表」插槽 / 底部 token 余额 / 账户按钮
//   右侧主区：顶部 header（左=可选 ModelPicker 模型选择，右=可选 headerRight 插槽）
//             + main（各站业务内容 children）
//   收起：w-[248px] → w-0 平滑动画 + 浮出展开键；移动端抽屉 + 汉堡键；状态存 localStorage
//
// 「各站保留品牌色」：传 brand.accent。布局/交互/中性底色全站统一，只有 accent
// 与目录项随站变化。改这里 = 改所有站的外壳，一处生效，永不漂移。
// ----------------------------------------------------------------------------
// 集成契约：各站把目录(nav)、品牌(brand)、当前用户(userEmail)、余额(credits)、
// 退出(onSignOut)、以及要哪些模型类目(modelCategories)传进来即可。
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { ModelPicker, type ModelCategory } from "./ModelPicker";
import { EnginePicker } from "./EnginePicker";
import type { PreferredModel } from "../lib/auth/account";
import { IconGift, IconPanel, IconSearch } from "./icons";
import { WorkspaceSelectionProvider } from "./WorkspaceSelection";
import { ShellChromeProvider, useShellChrome } from "./ShellChrome";

/** 外壳布局：
 *  - "sidebar"（默认）：经典左侧边栏 + 右上 header（兼容所有未迁移站）。
 *  - "topbar"：删除左侧边栏，改为顶部一条 bar——左=站名标题（原左上角位置）+
 *    右侧紧跟模型选择，右=token 余额 + 账户按钮（账户在 token 右边）。
 *    用于「单页操作台」站（侧栏只有一个功能按键，没有真正的站级导航需要）。 */
export type AppShellLayout = "sidebar" | "topbar";

/** doctrine v4：覆盖式左栏子栏（master-detail）。带 subNav 的 nav item 被点击后，
 *  AppShell 进入「子栏态」——隐藏主导航，渲染「← 返回」+ title + body。主区由路由
 *  页负责（深链不变）。直接深链进入该 item 的路由时也自动进入子栏态。 */
export interface ShellSubNav {
  /** 子栏顶部标题（返回键右侧）。 */
  title: ReactNode;
  /** 子栏列表 body。`close` 调用回到主导航态（不改路由）。 */
  render: (close: () => void) => ReactNode;
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
  /** doctrine v4：覆盖式左栏子栏。点击该项 → 侧栏切到该子栏列表（master-detail）。 */
  subNav?: ShellSubNav;
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
  if (item.exact || item.href === "/") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export interface AppShellProps {
  brand: AppShellBrand;
  /**
   * 外壳布局，默认 "sidebar"。单页操作台站传 "topbar"：删左侧边栏，站名留左上、
   * 模型选择紧跟站名右侧、token 余额 + 账户按钮移到右上角（账户在余额右边）。
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
  /** 剩余 token（人民币元），null = 加载中 */
  credits?: number | null;
  /** 侧栏搜索过滤回调；提供时右上角显示搜索按钮并展开输入框 */
  onSearch?: (term: string) => void;
  searchPlaceholder?: string;
  /** 侧栏中部「最近列表」插槽（聊天历史 / 最近生成等，各站自填；无则不渲染） */
  recentSlot?: ReactNode;
  /** 账户区点击退出 */
  onSignOut?: () => void;
  /** 左下角账户按钮跳转路由（默认 /account） */
  accountHref?: string;
  /** 账户按钮点击回调（i18n 站用自己的 router 做 locale-aware 跳转）；传了则覆盖 accountHref 的 Link。 */
  onAccountClick?: () => void;
  /** API 管理页路由（默认 /api），ModelPicker 底部「管理模型」跳这里 */
  apiHref?: string;
  // --- 右侧主区顶部 header ---
  /** 顶部模型选择需要的模态；不传则不渲染 ModelPicker（如纯展示页） */
  modelCategories?: ModelCategory[];
  /** 站点标识（用于模型选择「站点 × 用户」持久化）。建议传，默认 "default"。 */
  siteId?: string;
  /** 某模态选中变化回调：(模态, 模型)。各站拿去驱动对应生成调用。 */
  onModelChange?: (category: ModelCategory, model: PreferredModel) => void;
  /** 整体已选模态映射变化回调：{模态: 模型}。 */
  onModelSelectionChange?: (
    selection: Partial<Record<ModelCategory, PreferredModel>>,
  ) => void;
  /** header 右侧自定义插槽（各站放自己的操作按钮） */
  headerRight?: ReactNode;
  /** true 时隐藏顶部 header（业务页自带顶栏时用） */
  hideHeader?: boolean;
  /** Stage C：true 时在模型选择旁渲染 agent 引擎选择器（OceanLeo 原生 / 4 外部
   *  引擎 BYOK）。主站首页传 true。 */
  showEnginePicker?: boolean;
  /** 引擎选择变化回调（参数是引擎 id）。各站拿去在 createTask 时带 engine 字段。 */
  onEngineChange?: (engineId: string) => void;
}

// doctrine v4：覆盖式子栏的「选中态」需要在侧栏列表与主区详情之间共享。AppShell
// 同时渲染两者，故在此统一包一层 WorkspaceSelectionProvider，各消费站零接线即可用。
export function AppShell(props: AppShellProps) {
  // 把本站的模型选择配置透传进 ShellChrome——主区组件（OperatorConsole 等）可零接线
  // fallback 取用，免得每个站的工作台页再各自把 modelCategories 传一遍。
  const modelConfig = props.modelCategories?.length
    ? {
        categories: props.modelCategories as string[],
        siteId: props.siteId || "default",
        apiHref: props.apiHref || "/api",
      }
    : null;
  return (
    <WorkspaceSelectionProvider>
      <ShellChromeProvider modelConfig={modelConfig}>
        <AppShellInner {...props} />
      </ShellChromeProvider>
    </WorkspaceSelectionProvider>
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
  onSearch,
  searchPlaceholder = "搜索...",
  recentSlot,
  onSignOut,
  accountHref = "/account",
  onAccountClick,
  apiHref = "/api",
  modelCategories,
  siteId = "default",
  onModelChange,
  onModelSelectionChange,
  headerRight,
  hideHeader = false,
  showEnginePicker = false,
  onEngineChange,
}: AppShellProps) {
  const rawPathname = usePathname() || "/";
  const pathname = stripLocale ? stripLocale(rawPathname) : rawPathname;
  // 主区（如 OperatorConsole 工作台）自带模型选择时，header 不再重复渲染（消灭两行顶栏）。
  const { suppressHeaderModel } = useShellChrome();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");

  // doctrine v4：覆盖式左栏子栏（master-detail）。把所有带 subNav 的项摊平，按
  // pathname 找出当前应展开哪个子栏（深链直达也进子栏态）。手动「返回」可临时收回。
  const flatNav: ShellNavItem[] = navGroups?.length
    ? navGroups.flatMap((g) => g.items)
    : nav ?? [];
  const routeSubNavItem = flatNav.find((it) => it.subNav && isActive(pathname, it));
  // null = 跟随路由（默认）；false = 用户手动返回主导航；item = 用户手动展开某项。
  const [subNavOverride, setSubNavOverride] = useState<ShellNavItem | false | null>(null);
  // 路由变了就重置手动覆盖，回到「跟随路由」。
  useEffect(() => {
    setSubNavOverride(null);
  }, [pathname]);
  const activeSubItem: ShellNavItem | null =
    subNavOverride === false
      ? null
      : subNavOverride
        ? subNavOverride
        : routeSubNavItem || null;
  const closeSubNav = () => setSubNavOverride(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(collapseKey) === "1");
  }, [collapseKey]);

  function toggleCollapsed(next: boolean) {
    setCollapsed(next);
    localStorage.setItem(collapseKey, next ? "1" : "0");
  }

  // 账户按钮（头像 + 用户名）——sidebar 与 topbar 共用。退出登录统一在账户页内。
  function renderAccountButton(): ReactNode {
    const accountInner = (
      <>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium text-white"
          style={{ background: brand.accent }}
        >
          {userEmail ? userEmail[0].toUpperCase() : "?"}
        </div>
        <span className="max-w-[120px] flex-1 truncate text-[13px] font-medium text-neutral-800">
          {userEmail ? userEmail.split("@")[0] : "未登录"}
        </span>
      </>
    );
    const accountCls =
      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-neutral-200/50";
    return onAccountClick ? (
      <button
        type="button"
        onClick={() => {
          setMobileOpen(false);
          onAccountClick();
        }}
        className={accountCls}
      >
        {accountInner}
      </button>
    ) : (
      <Link href={accountHref} className={accountCls}>
        {accountInner}
      </Link>
    );
  }

  // 只读 token 余额胶囊——sidebar 与 topbar 共用。
  function renderCredits(): ReactNode {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-1.5">
        <span style={{ color: brand.accent }}>
          <IconGift className="h-3.5 w-3.5" />
        </span>
        <span className="text-[12px] text-neutral-600">token 余额</span>
        <span className="text-[13px] font-semibold tabular-nums text-neutral-900">
          {credits != null ? `¥${credits.toFixed(2)}` : "…"}
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
        className="flex items-center gap-2 text-neutral-900"
      >
        {brandInner}
      </button>
    ) : (
      <Link href="/" className="flex items-center gap-2 text-neutral-900">
        {brandInner}
      </Link>
    );
  }

  function renderNavItem(item: ShellNavItem, idx: number): ReactNode {
    const active = isActive(pathname, item);
    const cls = `group/nav flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all duration-150 ${
      active
        ? "bg-neutral-200/80 font-medium text-neutral-900"
        : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900"
    }`;
    const style = active ? { boxShadow: `inset 3px 0 0 ${brand.accent}` } : undefined;
    const inner = (
      <>
        <span className="transition-colors" style={{ color: active ? brand.accent : undefined }}>
          {item.icon}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.shortcut && <span className="text-[11px] text-neutral-400">{item.shortcut}</span>}
      </>
    );
    // doctrine v4：带 subNav 的项点击后，让侧栏进入该子栏态（即便已在同路由）。
    const onActivate = () => {
      setMobileOpen(false);
      if (item.subNav) setSubNavOverride(item);
    };
    // 纯动作项（无 href）渲染为 button；有 href 渲染为 Link。
    if (!item.href || item.onClick) {
      return (
        <button
          key={item.href ?? item.label ?? idx}
          type="button"
          onClick={() => {
            onActivate();
            item.onClick?.();
          }}
          className={cls}
          style={style}
        >
          {inner}
        </button>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onActivate}
        className={cls}
        style={style}
      >
        {inner}
      </Link>
    );
  }

  // header 里的模型选择：主区已自带（suppressHeaderModel）时不再渲染，避免两行顶栏。
  const showModelInHeader = Boolean(modelCategories?.length) && !suppressHeaderModel;
  const showHeader = !hideHeader && (showModelInHeader || Boolean(headerRight));

  const sidebarBody = (
    <>
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        {onBrandClick ? (
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onBrandClick();
            }}
            className="flex items-center gap-2 text-neutral-900"
          >
            <span className="flex h-5 w-5 items-center justify-center" style={{ color: brand.accent }}>
              {brand.logo}
            </span>
            <span className="text-[15px] font-semibold tracking-tight">{brand.name}</span>
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-2 text-neutral-900">
            <span className="flex h-5 w-5 items-center justify-center" style={{ color: brand.accent }}>
              {brand.logo}
            </span>
            <span className="text-[15px] font-semibold tracking-tight">{brand.name}</span>
          </Link>
        )}
        <div className="flex items-center gap-1 text-neutral-500">
          {onSearch && (
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="rounded-md p-1.5 transition hover:bg-neutral-200/70 active:scale-95"
              title="搜索"
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
            className="rounded-md p-1.5 transition hover:bg-neutral-200/70 active:scale-95"
            title="收起侧栏"
          >
            <IconPanel />
          </button>
        </div>
      </div>

      {onSearch && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            searchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 focus-within:border-neutral-400">
                <IconSearch className="h-3.5 w-3.5 text-neutral-400" />
                <input
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-neutral-400"
                  placeholder={searchPlaceholder}
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
      )}

      {activeSubItem?.subNav ? (
        /* doctrine v4 覆盖式子栏态：「← 返回」+ 标题 + 该项子栏 body（占满中部，可滚动） */
        <div className="mt-1 flex min-h-0 flex-1 flex-col px-2">
          <button
            type="button"
            onClick={closeSubNav}
            className="group/back mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-200/60"
          >
            <svg
              className="h-4 w-4 shrink-0 text-neutral-400 transition-colors group-hover/back:text-neutral-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate">{activeSubItem.subNav.title}</span>
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeSubItem.subNav.render(closeSubNav)}
          </div>
        </div>
      ) : (
        <>
          <nav className="mt-1 px-2">
            {navGroups?.length ? (
              navGroups.map((group, gi) => (
                <div key={group.heading ?? gi} className="mb-1">
                  {group.heading && (
                    <div className="px-3 pb-1 pt-3 text-[12px] text-neutral-500">{group.heading}</div>
                  )}
                  <div className="space-y-0.5">
                    {group.items.map((item, ii) => renderNavItem(item, ii))}
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-0.5">{(nav ?? []).map((item, ii) => renderNavItem(item, ii))}</div>
            )}
          </nav>

          {recentSlot && <div className="mt-3 flex min-h-0 flex-1 flex-col px-2">{recentSlot}</div>}
          {!recentSlot && <div className="min-h-0 flex-1" />}
        </>
      )}

      <div className="mt-auto space-y-3 px-3 pb-4 pt-3">
        {/* token 余额 —— 只读展示，不可点击（实时余额由各站传入） */}
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2">
          <span className="flex items-center gap-2 text-[12px] text-neutral-600">
            <span style={{ color: brand.accent }}>
              <IconGift className="h-3.5 w-3.5" />
            </span>
            token 余额
          </span>
          <span className="text-[13px] font-semibold tabular-nums text-neutral-900">
            {credits != null ? `¥${credits.toFixed(2)}` : "…"}
          </span>
        </div>

        {/* 账户按钮 —— 进入账户管理页。退出登录统一移到 /account 页内，侧栏不放
            独立「退出」按钮（这就是消灭 e-commerce 左下角多余退出键的单一事实源）。
            i18n 站传 onAccountClick 用自己的 locale-aware router 跳转。*/}
        <div className="[&>a]:w-full [&>button]:w-full">{renderAccountButton()}</div>
      </div>
    </>
  );

  // ── topbar 布局：无侧边栏。顶部一条 bar——左=站名(+模型选择)，右=余额+账户。
  //    用于单页操作台站（侧栏原本只有一个功能按键，无站级导航可留）。
  if (layout === "topbar") {
    return (
      <div className="flex min-h-screen flex-col bg-transparent" data-oceanleo-shell>
        <header
          data-oceanleo-chrome
          className="sticky top-0 z-40 flex items-center gap-4 border-b border-neutral-200/70 bg-white/80 px-4 py-2.5 backdrop-blur-sm md:px-6"
        >
          {/* 左：站名标题（原左上角位置）+ 紧跟其右的模型选择 */}
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {renderBrand()}
            {showModelInHeader ? (
              <div className="flex min-w-0 items-center gap-2">
                <ModelPicker
                  categories={modelCategories!}
                  siteId={siteId}
                  onChange={onModelChange}
                  onSelectionChange={onModelSelectionChange}
                  apiHref={apiHref}
                />
                {showEnginePicker && (
                  <EnginePicker siteId={siteId} apiHref={apiHref} onChange={onEngineChange} />
                )}
              </div>
            ) : showEnginePicker ? (
              <EnginePicker siteId={siteId} apiHref={apiHref} onChange={onEngineChange} />
            ) : null}
          </div>
          {/* 右：自定义插槽 + token 余额 + 账户（账户在余额右边） */}
          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            {renderCredits()}
            {renderAccountButton()}
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div key={pathname} className="v-page contents">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    /* 根容器透明 → 透出 body 的全家桶浅色渐变（单一事实源在 theme/globals.css）。
       侧栏保留半透明浅灰与主区渐变区分；主区不再铺白，统一渐变底。 */
    <div className="flex min-h-screen bg-transparent" data-oceanleo-shell>
      {/* desktop sidebar。固定宽度 224px——主导航态与覆盖式子栏态共用同一宽度，
          点「工作台 / 文件库 / 历史记录」等带子栏的项时侧栏不再变宽
          （操作员 2026-06-23：变宽体验差，统一宽度）。宽度既容得下主导航文字，
          也容得下子栏列表（文件名 / 历史标题 / agent 名，超长截断）。 */}
      <aside
        data-oceanleo-chrome
        className={`hidden h-screen shrink-0 flex-col overflow-hidden border-r border-neutral-200/70 bg-[#f7f7f7]/85 backdrop-blur-sm transition-[width] duration-200 ease-out md:flex md:sticky md:top-0 ${
          collapsed ? "w-0 border-r-0" : "w-[224px]"
        }`}
      >
        <div className="flex h-full w-[224px] flex-col">
          {sidebarBody}
        </div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div data-oceanleo-chrome className="fixed inset-0 z-[80] md:hidden">
          <div className="v-fade-in absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] flex-col overflow-y-auto bg-[#f7f7f7] shadow-xl">
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {collapsed && (
          <button
            type="button"
            data-oceanleo-chrome
            onClick={() => toggleCollapsed(false)}
            className="fixed left-3 top-3 z-50 hidden rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 shadow-sm transition hover:bg-neutral-50 active:scale-95 md:block"
            title="展开侧栏"
          >
            <IconPanel />
          </button>
        )}
        <button
          type="button"
          data-oceanleo-chrome
          onClick={() => setMobileOpen(true)}
          className="fixed left-3 top-3 z-50 rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 shadow-sm transition hover:bg-neutral-50 active:scale-95 md:hidden"
          title="打开菜单"
        >
          <IconPanel />
        </button>

        {/* 右侧主区顶部 header：左 = 模型选择，右 = 自定义插槽。这是「右上模型
            选择」的唯一落点，与 oceanleo 主站截图一致。 */}
        {showHeader && (
          <div
            data-oceanleo-chrome
            className={`flex items-center justify-between border-b border-neutral-100 px-8 py-3 pl-14 ${
              collapsed ? "md:pl-14" : "md:pl-8"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              {showModelInHeader ? (
                <ModelPicker
                  categories={modelCategories!}
                  siteId={siteId}
                  onChange={onModelChange}
                  onSelectionChange={onModelSelectionChange}
                  apiHref={apiHref}
                />
              ) : null}
              {showEnginePicker && (
                <EnginePicker siteId={siteId} apiHref={apiHref} onChange={onEngineChange} />
              )}
              {!showModelInHeader && !showEnginePicker && <span />}
            </div>
            {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
          </div>
        )}

        {/*
          为浮出的「展开/汉堡」按钮预留左侧空间，避免它盖住页面左上角标题。
          - 移动端：汉堡键常驻浮出 → 始终留 pl-14
          - 桌面端：仅在侧栏收起时展开键浮出 → 收起留 md:pl-14，展开 md:pl-0
          有顶部 header 时，让位已由 header 承担，main 不再额外缩进。
          这是按钮让位的「唯一事实源」。页面/组件内部不要再各自加让位内边距。
        */}
        <main
          className={
            showHeader
              ? "flex-1"
              : `flex-1 pl-14 ${collapsed ? "md:pl-14" : "md:pl-0"}`
          }
        >
          {/* 统一页面入场动画（复刻 oceanleo.com/tasks/new 的从上而下阶梯淡入）。
              key={pathname} 让每次切页都重新挂载 → 重新触发 .v-page 的错峰淡入。
              这是全站「打开/切换页面」动画的唯一事实源，各站无需逐页手写。 */}
          <div key={pathname} className="v-page contents">
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
