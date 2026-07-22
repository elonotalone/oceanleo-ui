"use client";

// ============================================================================
// @oceanleo/ui — 全家桶统一外壳（单一事实源）
// ----------------------------------------------------------------------------
// 布局（= 操作员指定的 oceanleo 主站截图）：
//   左侧 248px 侧边栏：站点 Logo + 站名 / 搜索 / 收放键 / 主功能目录（高亮当前页）
//                      / 可选「最近列表」插槽 / 底部 token 余额 / 账户按钮
//   右侧主区：可选 headerRight 浮层 + main（各站业务内容 children）
//   收起：w-[248px] → w-0 平滑动画 + 浮出展开键；移动端抽屉 + 汉堡键；状态存 localStorage
//
// 「各站保留品牌色」：传 brand.accent。布局/交互/中性底色全站统一，只有 accent
// 与目录项随站变化。改这里 = 改所有站的外壳，一处生效，永不漂移。
// ----------------------------------------------------------------------------
// 集成契约：各站把目录(nav)、品牌(brand)、当前用户(userEmail)、余额(credits)
// 与退出(onSignOut)传进来即可。目录路由右上角统一切换全局模型组合，AI 模型页负责组合管理。
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
import type { PreferredModel } from "../lib/auth/account";
import { IconGift, IconPanel, IconSearch } from "./icons";
import { WorkspaceSelectionProvider } from "./WorkspaceSelection";
import { ThemeSwitcher } from "../theme";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { LOCALES } from "../i18n/config";
import { useUI } from "../i18n/ui/useUI";
import { usePresenceHeartbeat } from "../lib/presence";

/** 外壳布局：
 *  - "sidebar"（默认）：经典左侧边栏 + 可选右上操作区。
 *  - "topbar"：删除左侧边栏，改为顶部一条 bar——左=站名标题，
 *    右=token 余额 + 账户按钮（账户在 token 右边）。
 *    用于「单页操作台」站（侧栏只有一个功能按键，没有真正的站级导航需要）。 */
export type AppShellLayout = "sidebar" | "topbar";

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
  if (item.exact || item.href === "/") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

type ModelPickerSearchParams = Pick<URLSearchParams, "get" | "has">;
type ModelPickerSearchInput = string | ModelPickerSearchParams | null | undefined;

const MODEL_PICKER_CONTEXT_PARAMS = [
  "fn",
  "function",
  "app",
  "task",
  "session",
  // SiteCatalogConsole still accepts this legacy function-selection key.
  "mode",
] as const;
const LOCALE_PATH_PREFIXES = new Set(
  LOCALES.map((locale) => locale.toLowerCase()),
);
const DISABLED_QUERY_FLAGS = new Set(["0", "false", "no", "off"]);

function searchParamReader(search: ModelPickerSearchInput): ModelPickerSearchParams {
  if (typeof search === "string") {
    return new URLSearchParams(search.replace(/^\?/, ""));
  }
  return search ?? new URLSearchParams();
}

function decodedRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function logicalRouteSegments(pathname: string): string[] {
  const pathOnly = (pathname || "/").split(/[?#]/, 1)[0];
  const segments = pathOnly
    .split("/")
    .filter(Boolean)
    .map(decodedRouteSegment);
  if (segments[0] && LOCALE_PATH_PREFIXES.has(segments[0].toLowerCase())) {
    return segments.slice(1);
  }
  return segments;
}

function enabledQueryFlag(
  searchParams: ModelPickerSearchParams,
  key: "embed" | "solo",
): boolean {
  if (!searchParams.has(key)) return false;
  const value = (searchParams.get(key) || "").trim().toLowerCase();
  return !DISABLED_QUERY_FLAGS.has(value);
}

/**
 * The shared route-level source of truth for model-picker visibility.
 *
 * Root and one-segment routes are directory surfaces. Deeper routes are
 * concrete detail/runtime surfaces. Search params cover legacy root runtimes,
 * history details, and iframe/solo entry points before their canonical route
 * migration has completed.
 */
export function shouldShowModelPicker(
  pathname: string,
  search: ModelPickerSearchInput = "",
): boolean {
  const searchParams = searchParamReader(search);
  if (
    enabledQueryFlag(searchParams, "embed")
    || enabledQueryFlag(searchParams, "solo")
  ) {
    return false;
  }
  if (
    MODEL_PICKER_CONTEXT_PARAMS.some(
      (key) => (searchParams.get(key) || "").trim().length > 0,
    )
  ) {
    return false;
  }

  const segments = logicalRouteSegments(pathname);
  if (segments[0]?.toLowerCase() === "advanced") return false;
  return segments.length <= 1;
}

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
  /** 剩余 token（人民币元），null = 加载中 */
  credits?: number | null;
  /** 侧栏搜索过滤回调；提供时右上角显示搜索按钮并展开输入框 */
  onSearch?: (term: string) => void;
  searchPlaceholder?: string;
  /** 侧栏中部「最近列表」插槽（聊天历史 / 最近生成等，各站自填；无则不渲染） */
  recentSlot?: ReactNode;
  /** 永远固定在滚动区上方的导航项数量。全家桶标准为 3。 */
  pinnedNavCount?: number;
  /** 账户区点击退出 */
  onSignOut?: () => void;
  /** 左下角账户按钮跳转路由（默认 /account） */
  accountHref?: string;
  /** 账户按钮点击回调（i18n 站用自己的 router 做 locale-aware 跳转）；传了则覆盖 accountHref 的 Link。 */
  onAccountClick?: () => void;
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
export function AppShell(props: AppShellProps) {
  const nested = useContext(AppShellPresence);
  if (nested) return <>{props.children}</>;
  return (
    <AppShellPresence.Provider value>
      <WorkspaceSelectionProvider>
        <AppShellInner {...props} />
      </WorkspaceSelectionProvider>
    </AppShellPresence.Provider>
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
  searchPlaceholder,
  recentSlot,
  pinnedNavCount = 3,
  onSignOut,
  accountHref = "/account",
  onAccountClick,
  apiHref = "/api",
  siteId = "default",
  headerRight,
  hideHeader = false,
  showThemeSwitcher = false,
  showLanguageSwitcher = false,
}: AppShellProps) {
  const tt = useUI();
  const rawPathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const pathname = stripLocale ? stripLocale(rawPathname) : rawPathname;
  // 在线心跳：登录用户每 60s ping 网关（admin「在线人数」曲线的数据源）。
  usePresenceHeartbeat(siteId);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");

  const sourceNavGroups: ShellNavGroup[] = navGroups?.length
    ? navGroups
    : [{ items: nav ?? [] }];
  const flatNav = sourceNavGroups.flatMap((group) => group.items);
  const pinCount = Math.max(0, Math.min(pinnedNavCount, flatNav.length));
  const pinnedNav = flatNav.slice(0, pinCount);
  let remainingPinned = pinCount;
  const scrollNavGroups = sourceNavGroups
    .map((group) => {
      const skipped = Math.min(remainingPinned, group.items.length);
      remainingPinned -= skipped;
      return { ...group, items: group.items.slice(skipped) };
    })
    .filter((group) => group.items.length > 0);
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
          {userEmail ? userEmail.split("@")[0] : tt("未登录")}
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

  // 只读 token 余额胶囊——sidebar 与 topbar 共用。
  function renderCredits(): ReactNode {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-1.5">
        <span style={{ color: brand.accent }}>
          <IconGift className="h-3.5 w-3.5" />
        </span>
        <span className="text-[12px] text-neutral-600">{tt("token 余额")}</span>
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
    const key = disclosureKey(item, idx);
    const disclosureOpen = item.disclosure
      ? disclosureIsOpen(item, idx)
      : false;
    /* 侧栏文字加深（操作员 2026-07-02：旧 text-neutral-600 太浅、观感廉价；
       对照 Manus 侧栏近黑文字）。深色下由 globals.css 全局重映射到 --leo-d-fg。 */
    const cls = `group/nav flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all duration-150 ${
      active
        ? "bg-neutral-200/80 font-medium text-neutral-900"
        : "text-neutral-800 hover:bg-neutral-200/50 hover:text-neutral-900"
    }`;
    const style = active ? { boxShadow: `inset 3px 0 0 ${brand.accent}` } : undefined;
    const inner = (
      <>
        <span className="transition-colors" style={{ color: active ? brand.accent : undefined }}>
          {item.icon}
        </span>
        <span className="flex-1 truncate">{typeof item.label === "string" ? tt(item.label) : item.label}</span>
        {item.shortcut && <span className="text-[11px] text-neutral-400">{item.shortcut}</span>}
        {item.disclosure && (
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform duration-150 ${
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
      control = (
        <button
          type="button"
          onClick={() => toggleDisclosure(item, idx)}
          aria-expanded={disclosureOpen}
          className={cls}
          style={style}
        >
          {inner}
        </button>
      );
    } else if (!item.href || item.onClick) {
      // 纯动作项（无 href）渲染为 button；有 href 渲染为 Link。
      control = (
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            item.onClick?.();
          }}
          className={cls}
          style={style}
        >
          {inner}
        </button>
      );
    } else {
      control = (
        <Link
          href={item.href}
          onClick={() => setMobileOpen(false)}
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
        {item.disclosure && (
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-150 ${
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

  const showModelPicker =
    !hideHeader && shouldShowModelPicker(pathname, searchParams);
  const modelPickerSlot = showModelPicker ? (
    <div className="pointer-events-auto" data-oceanleo-model-picker-slot>
      <ModelGroupPicker apiHref={apiHref} />
    </div>
  ) : null;
  const showHeaderTools =
    !hideHeader && (showModelPicker || Boolean(headerRight));

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
        <div className="flex items-center gap-1 text-neutral-600">
          {onSearch && (
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="rounded-md p-1.5 transition hover:bg-neutral-200/70 active:scale-95"
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
            className="rounded-md p-1.5 transition hover:bg-neutral-200/70 active:scale-95"
            title={tt("收起侧栏")}
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
      )}

      {/* v5：只有前三项固定。品牌/搜索在上方、账户区在下方也固定；其余导航与
          「我的任务」展开列表共用中间唯一滚动区。 */}
      {pinnedNav.length > 0 && (
        <nav className="mt-1 shrink-0 px-2" data-oceanleo-pinned-nav>
          <div className="space-y-0.5">
            {pinnedNav.map((item, ii) => renderNavItem(item, ii))}
          </div>
        </nav>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto" data-oceanleo-scroll-nav>
        <nav className="px-2 pb-1 pt-1">
          {scrollNavGroups.map((group, gi) => (
            <div key={group.heading ?? gi} className="mb-1">
              {group.heading && (
                <div className="px-3 pb-1 pt-3 text-[12px] text-neutral-600">
                  {group.heading}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item, ii) =>
                  renderNavItem(item, pinCount + gi * 1000 + ii),
                )}
              </div>
            </div>
          ))}
        </nav>

        {recentSlot && <div className="mt-3 px-2 pb-1">{recentSlot}</div>}
      </div>

      <div className="mt-auto space-y-3 px-3 pb-4 pt-3">
        {/* 主题 + 语言切换器（全家桶壳内单一事实源，账户区上方） */}
        {renderSwitchers()}

        {/* token 余额 —— 只读展示，不可点击（实时余额由各站传入） */}
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2">
          <span className="flex items-center gap-2 text-[12px] text-neutral-600">
            <span style={{ color: brand.accent }}>
              <IconGift className="h-3.5 w-3.5" />
            </span>
            {tt("token 余额")}
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
          {/* 左：站名标题（原左上角位置） */}
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {renderBrand()}
          </div>
          {/* 右：切换器 + 自定义插槽 + token 余额 + 账户 */}
          <div className="flex shrink-0 items-center gap-2">
            {renderSwitchers()}
            {modelPickerSlot}
            {headerRight}
            {renderCredits()}
            {renderAccountButton()}
          </div>
        </header>

        <main className="min-w-0 flex-1">
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
    <div className="flex min-h-screen bg-transparent" data-oceanleo-shell>
      {/* desktop sidebar。固定宽度 256px（2026-07-02 对齐主站 oceanleo.com 侧栏宽，
          利于显示历史记录的 AI 概括标题）——主导航态与覆盖式子栏态共用同一宽度，
          点「工作台 / 文件库 / 历史记录」等带子栏的项时侧栏不再变宽。 */}
      <aside
        data-oceanleo-chrome
        className={`hidden h-screen shrink-0 flex-col overflow-hidden border-r border-neutral-200/70 bg-[#f7f7f7]/85 backdrop-blur-sm transition-[width] duration-200 ease-out md:flex md:sticky md:top-0 ${
          collapsed ? "w-0 border-r-0" : "w-[256px]"
        }`}
      >
        <div className="flex h-full w-[256px] flex-col">
          {sidebarBody}
        </div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div data-oceanleo-chrome className="fixed inset-0 z-[80] md:hidden">
          <div className="v-fade-in absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          {/* 中部滚动交给 sidebarBody 内部的滚动容器（与 desktop 一致），这里不再整体
              overflow-y-auto，避免底部账户区被推走 / 出现双滚动条。 */}
          <aside className="absolute left-0 top-0 flex h-full w-[280px] flex-col bg-[#f7f7f7] shadow-xl">
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        {collapsed && (
          <button
            type="button"
            data-oceanleo-chrome
            onClick={() => toggleCollapsed(false)}
            className="fixed left-3 top-3 z-50 hidden rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 shadow-sm transition hover:bg-neutral-50 active:scale-95 md:block"
            title={tt("展开侧栏")}
          >
            <IconPanel />
          </button>
        )}
        <button
          type="button"
          data-oceanleo-chrome
          onClick={() => setMobileOpen(true)}
          className="fixed left-3 top-3 z-50 rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 shadow-sm transition hover:bg-neutral-50 active:scale-95 md:hidden"
          title={tt("打开菜单")}
        >
          <IconPanel />
        </button>

        {/* 右侧主区全局模型组合 + 可选 headerRight 浮在右上角，不占整行高度。 */}
        {showHeaderTools && (
          <div
            data-oceanleo-chrome
            data-oceanleo-header-tools
            className="pointer-events-none absolute right-4 top-3 z-30 flex items-center gap-2 md:right-6"
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
          为浮出的「展开/汉堡」按钮预留左侧空间，避免它盖住页面左上角标题。
          - 移动端：汉堡键常驻浮出 → 始终留 pl-14
          - 桌面端：仅在侧栏收起时展开键浮出 → 收起留 md:pl-14，展开 md:pl-0
          顶部工具已改为右上角浮层（不占行高），main 一律按「无 header」方式让位。
          这是按钮让位的「唯一事实源」。页面/组件内部不要再各自加让位内边距。
        */}
        <main className={`flex-1 pl-14 ${collapsed ? "md:pl-14" : "md:pl-0"}`}>
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
