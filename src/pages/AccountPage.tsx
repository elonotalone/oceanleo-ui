"use client";

// ============================================================================
// @oceanleo/ui — 统一「账户」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 全家桶 36 个 consumer 的单一事实源。各站 account/page.tsx 只需把它包进自己的
// <AppShell> / <SiteShell>。退出登录在这里（侧栏不再放独立退出键）。
//
// 2026-07-29：本组件补成各站 components/AccountCenter.tsx（302 行、32 站逐字节
// 相同）的**超集**，各站换 2 行 re-export shim 不会丢功能。从分叉吸收进来的四项：
//   1. 第三格统计「近 30 天请求」（getUsageBySite(30)），可用 showRequestStat 关掉
//   2. 用户卡片的计划标签「免费计划」（planLabel，传 null 隐藏）
//   3. 菜单项 external 外链支持（「插件与连接器」跳主站那类）
//   4. oceanleoConfigured() 为假时的「登录服务尚未配置」分支
//
// 未登录时的「登录」按钮**就地打开共享 AuthDialog**。历史上分叉版是「返回首页
// 登录」跳首页、而首页没有登录表单 —— 那是死路（docs/architecture/
// oceanleo-cross-subdomain-sso.md §3.3 已否掉引导页）。本组件不再提供该退路：
// onSignInClick 不传时也必定就地弹出登录框，不会出现"点了没反应"。
//
// 只依赖 react + next/link + @oceanleo/ui/lib（全站统一），不碰任何站点特有的表。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  browserClient,
  oceanleoConfigured,
  loginUnavailableNotice,
  getUserEmail,
  getCredits,
  getCreditHistory,
  getUsageBySite,
  signOutEverywhere,
  isPasswordResetLanding,
} from "../lib/auth";
import { formatMoney, normalizeCurrency, type LedgerCurrency } from "../lib/money";
import { ConfirmDialog } from "../ui";
import { AuthDialog } from "./AuthDialog";
import { AccountSecurityPage } from "./AccountSecurityPage";
import { PasswordResetPage } from "./PasswordResetPage";
import { useUI } from "../i18n/ui/useUI";

export interface AccountMenuItem {
  label: string;
  href: string;
  desc: string;
  /**
   * 外链（如子站的「插件与连接器」指向主站）。true 时用原生 <a> 新窗打开，
   * 不走 next/link 的 SPA 预取——跨站预取只会 404。
   */
  external?: boolean;
  /**
   * 就地展开的面板，而不是跳走。共享包没有路由——路由长在 36 个消费站各自的仓里，
   * 所以新增的账号页内容只能这样才在今天真的点得开。
   */
  expands?: "security";
}

export interface AccountPageProps {
  /** 账户菜单项（默认 通用 / AI 模型 / Cost / 账户设置 / 插件与连接器）。 */
  menuItems?: AccountMenuItem[];
  /** 仅为可测：不传就取 `window.location.href`。 */
  currentHref?: string;
  /** 额外统计卡片（如主站的「任务数」）。每项 {value,label}，排在内置格子之后。 */
  extraStats?: { value: ReactNode; label: string }[];
  /**
   * 是否显示内置第三格「近 30 天请求」。默认 true（与 32 站分叉一致）。
   * 主站用 extraStats 放「任务数」占第三格时传 false，避免挤成四格。
   */
  showRequestStat?: boolean;
  /** 用户卡片里的计划标签，默认「免费计划」；传 null 隐藏。 */
  planLabel?: string | null;
  /** 菜单下方的额外区块（如主站的「记忆」）。 */
  extraSections?: ReactNode;
  /**
   * 未登录时点「登录」的回调。**不传时就地打开共享 AuthDialog**，
   * 绝不跳首页——传入自定义实现时也不得退化成跳转。
   */
  onSignInClick?: () => void;
  /** 登录成功后的回调（默认刷新当前页，让全站进入登录态）。 */
  onSignedIn?: () => void;
  /** 退出后跳转（默认刷新当前页）。 */
  onSignedOut?: () => void;
}

function IconChevronRight({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AccountPage({
  menuItems,
  extraStats = [],
  showRequestStat = true,
  planLabel,
  extraSections,
  onSignInClick,
  onSignedIn,
  onSignedOut,
  currentHref,
}: AccountPageProps) {
  const tt = useUI();
  // 2026-07-02：「我的数据库」入口删除（左侧侧栏的文件库已覆盖其功能）；
  // 新增「Cost」页（用量柱状图 + 用量记录，从 settings/api 迁来）。
  const resolvedMenu: AccountMenuItem[] = menuItems ?? [
    {
      label: tt("通用"),
      href: "/general",
      desc: tt("语言与主题（浅色 / 深色 / 自动）等外观设置"),
    },
    { label: tt("AI 模型"), href: "/api", desc: tt("选择模型、查看价格与 token 余额") },
    {
      label: "Cost",
      href: "/cost",
      desc: tt("用量柱状图与每次调用的真实计费记录"),
    },
    { label: tt("账户设置"), href: "/settings", desc: tt("个人资料、用量与知识库") },
    // W4（2026-08-21）：在这条之前，用户能对自己账号做的只有登录和退出所有设备。
    // 不给 href：路由长在 36 个消费站各自的仓里，`/account/security` 今天哪个站
    // 都没有，写成链接就是点了 404。这一条就地展开，不需要任何消费站改代码。
    {
      label: tt("账号安全"),
      href: "",
      desc: tt("最近的登录与改动、还在登录状态的设备、每天最多能花多少"),
      expands: "security",
    },
    {
      label: tt("插件与连接器"),
      href: "/plugins",
      desc: tt("技能、连接器与 MCP 服务器"),
    },
  ];
  const configured = oceanleoConfigured();
  // 找回密码的邮件把人送回 `/account?reset=1`（见 client.ts 的 PASSWORD_RESET_PATH：
  // 那是唯一一条 36 个消费站都已经有的路由）。带这个标记进来时，账户页整页让位给
  // 改密码那一屏——否则用户点开邮件看到的是一张普通账户页，无处输入新密码。
  const href = currentHref ?? (typeof window !== "undefined" ? window.location.href : "");
  const resetLanding = isPasswordResetLanding(href);
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  // 账本货币由网关的钱包响应决定（.cn = CNY、.com = USD）；没说之前按 CNY，绝不猜美元。
  const [currency, setCurrency] = useState<LedgerCurrency>("CNY");
  const [monthSpend, setMonthSpend] = useState<number | null>(null);
  const [requests, setRequests] = useState<number | null>(null);
  // 未配置 Supabase 时不会有任何会话查询回来，直接视为已检查，否则永远卡在空白。
  const [checked, setChecked] = useState(() => !configured);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [openPanel, setOpenPanel] = useState<AccountMenuItem["expands"]>(undefined);

  useEffect(() => {
    if (!configured) return;
    async function load() {
      // SSO（2026-07-01）：getUserEmail() 内部走 getSession()，读本地共享 cookie
      // 并自动续期；getUser() 的网络校验在跨子域场景下会把已登录用户判成未登录。
      const e = await getUserEmail();
      setEmail(e);
      setChecked(true);
      if (!e) return;
      const c = await getCredits();
      if (c.ok && c.data) {
        // 新键 `balance` 优先，旧网关只有 `balance_yuan`（同一个数）。
        setCredits(Number(c.data.balance ?? c.data.balance_yuan ?? 0));
        if (c.data.currency) setCurrency(normalizeCurrency(c.data.currency));
      }
      const h = await getCreditHistory(200);
      if (h.ok && h.data) {
        const now = new Date();
        let spend = 0;
        for (const ev of h.data.events || []) {
          const major = Number(ev.amount_major ?? ev.amount_yuan ?? 0);
          const d = ev.created_at ? new Date(ev.created_at) : null;
          const inMonth =
            d &&
            d.getUTCFullYear() === now.getUTCFullYear() &&
            d.getUTCMonth() === now.getUTCMonth();
          if (inMonth && major < 0) spend += Math.abs(major);
        }
        setMonthSpend(spend);
      }
      if (showRequestStat) {
        const u = await getUsageBySite(30);
        if (u.ok && u.data) setRequests(u.data.total?.requests ?? 0);
      }
    }
    load();
    const c = browserClient();
    if (!c) return;
    const { data: sub } = c.auth.onAuthStateChange((_e, s) =>
      setEmail(s?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [configured, showRequestStat]);

  async function handleLogout() {
    await signOutEverywhere();
    if (onSignedOut) onSignedOut();
    else if (typeof window !== "undefined") window.location.reload();
  }

  function handleSignedIn() {
    setShowAuth(false);
    if (onSignedIn) onSignedIn();
    else if (typeof window !== "undefined") window.location.reload();
  }

  // 邮件链接进来的这一趟先于一切：这时用户既不是来看余额的，多半也还没「登录」
  // 到能看账户页的程度（恢复会话只够改一次密码）。
  if (resetLanding) {
    return <PasswordResetPage currentHref={href} onDone={onSignedIn} />;
  }

  // 登不上的时候说清楚原因，不要假装未登录后再给一个必然失败的登录框。
  // 说什么由 loginUnavailableNotice() 按域名家族决定（境内=还没开放，其他=没接上）。
  if (!configured) {
    const notice = loginUnavailableNotice();
    return (
      <div className="px-8 py-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt("账户")}
        </h1>
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          <p className="text-[14px] font-medium">{tt(notice?.title || "")}</p>
          {notice?.detail && (
            <p className="mt-1.5 text-[13px] text-amber-700">{tt(notice.detail)}</p>
          )}
        </div>
      </div>
    );
  }

  if (checked && !email) {
    return (
      <div className="px-8 py-6">
        {showAuth && (
          <AuthDialog onClose={() => setShowAuth(false)} onSuccess={handleSignedIn} />
        )}
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt("账户")}
        </h1>
        <div className="v-fade-up mx-auto mt-16 max-w-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-2xl">
            👤
          </div>
          <h2 className="mt-5 text-[17px] font-semibold text-neutral-900">{tt("尚未登录")}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
            {tt("登录后即可查看 token 余额与用量。")}
            <br />
            {tt("一次登录，全家桶所有 AI 应用通用。")}
          </p>
          <button
            type="button"
            onClick={onSignInClick ?? (() => setShowAuth(true))}
            className="mt-6 w-full rounded-xl bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-800 active:scale-[0.99]"
          >
            {tt("登录")}
          </button>
        </div>
      </div>
    );
  }

  const stats = [
    {
      value: credits !== null ? formatMoney(credits, currency, 2) : "...",
      label: tt("token 余额"),
    },
    {
      value: monthSpend !== null ? formatMoney(monthSpend, currency, 2) : "—",
      label: tt("本月消耗"),
    },
    ...(showRequestStat
      ? [
          {
            value: requests !== null ? requests.toLocaleString() : "—",
            label: tt("近 30 天请求"),
          },
        ]
      : []),
    ...extraStats,
  ];
  const resolvedPlanLabel = planLabel === undefined ? tt("免费计划") : planLabel;

  return (
    <div className="px-8 py-6">
      {confirmLogout && (
        <ConfirmDialog
          title={tt("退出登录")}
          body={tt("退出后需要重新登录才能使用。这将退出全部 OceanLeo 站点。")}
          confirmLabel={tt("退出登录")}
          danger
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt("账户")}</h1>

      <div className="v-fade-up mx-auto mt-8 max-w-lg">
        <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-800 text-lg font-medium text-white">
            {email ? email[0].toUpperCase() : "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-neutral-900">
              {email ? email.split("@")[0] : tt("未登录")}
            </p>
            <p className="truncate text-[13px] text-neutral-500">{email || "—"}</p>
            {resolvedPlanLabel && (
              <p className="mt-1 text-[12px] text-neutral-400">{resolvedPlanLabel}</p>
            )}
          </div>
        </div>

        <div
          className="mt-4 grid gap-3"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((s, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-3 text-center">
              <p className="text-[18px] font-semibold tabular-nums text-neutral-900">{s.value}</p>
              <p className="text-[11px] text-neutral-500">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {resolvedMenu.map((item) => {
            const body = (
              <>
                <div>
                  <p className="text-[13px] font-medium text-neutral-900">{item.label}</p>
                  <p className="text-[12px] text-neutral-500">{item.desc}</p>
                </div>
                <IconChevronRight className="shrink-0 text-neutral-400 transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] group-hover:translate-x-0.5" />
              </>
            );
            const className =
              "group flex items-center justify-between px-4 py-3.5 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";
            if (item.expands) {
              const open = openPanel === item.expands;
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    aria-expanded={open}
                    data-account-expands={item.expands}
                    onClick={() => setOpenPanel(open ? undefined : item.expands)}
                    className={`${className} w-full text-left`}
                  >
                    {body}
                  </button>
                  {open && (
                    <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-4">
                      <AccountSecurityPage embedded onSignedOutAll={onSignedOut} />
                    </div>
                  )}
                </div>
              );
            }
            return item.external ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {body}
              </a>
            ) : (
              <Link key={item.label} href={item.href} className={className}>
                {body}
              </Link>
            );
          })}
        </div>

        {extraSections}

        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="mt-6 w-full rounded-xl border border-neutral-200 py-2.5 text-[13px] text-red-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:border-red-200 hover:bg-red-50 active:scale-[0.99]"
        >
          {tt("退出登录")}
        </button>
      </div>
    </div>
  );
}
