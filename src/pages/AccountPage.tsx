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
  getUserEmail,
  getCredits,
  getCreditHistory,
  getUsageBySite,
  signOutEverywhere,
} from "../lib/auth";
import { ConfirmDialog } from "../ui";
import { AuthDialog } from "./AuthDialog";
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
}

export interface AccountPageProps {
  /** 账户菜单项（默认 通用 / AI 模型 / Cost / 账户设置 / 插件与连接器）。 */
  menuItems?: AccountMenuItem[];
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
    {
      label: tt("插件与连接器"),
      href: "/plugins",
      desc: tt("技能、连接器与 MCP 服务器"),
    },
  ];
  const configured = oceanleoConfigured();
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [monthSpend, setMonthSpend] = useState<number | null>(null);
  const [requests, setRequests] = useState<number | null>(null);
  // 未配置 Supabase 时不会有任何会话查询回来，直接视为已检查，否则永远卡在空白。
  const [checked, setChecked] = useState(() => !configured);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

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
      if (c.ok && c.data) setCredits(c.data.balance_yuan);
      const h = await getCreditHistory(200);
      if (h.ok && h.data) {
        const now = new Date();
        let spend = 0;
        for (const ev of h.data.events || []) {
          const yuan = Number(ev.amount_yuan ?? 0);
          const d = ev.created_at ? new Date(ev.created_at) : null;
          const inMonth =
            d &&
            d.getUTCFullYear() === now.getUTCFullYear() &&
            d.getUTCMonth() === now.getUTCMonth();
          if (inMonth && yuan < 0) spend += Math.abs(yuan);
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

  // 登录服务未配置（缺 Supabase 环境变量）：说清楚原因，不要假装未登录后
  // 再给一个必然失败的登录框。
  if (!configured) {
    return (
      <div className="px-8 py-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt("账户")}
        </h1>
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-[13px] text-amber-800">
          {tt("登录服务尚未配置（缺少 Supabase 环境变量）。")}
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
            className="mt-6 w-full rounded-xl bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99]"
          >
            {tt("登录")}
          </button>
        </div>
      </div>
    );
  }

  const stats = [
    {
      value: credits !== null ? `¥${credits.toFixed(2)}` : "...",
      label: tt("token 余额"),
    },
    {
      value: monthSpend !== null ? `¥${monthSpend.toFixed(2)}` : "—",
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
                <IconChevronRight className="shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
              </>
            );
            const className =
              "group flex items-center justify-between px-4 py-3.5 transition hover:bg-neutral-50";
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
          className="mt-6 w-full rounded-xl border border-neutral-200 py-2.5 text-[13px] text-red-600 transition hover:border-red-200 hover:bg-red-50 active:scale-[0.99]"
        >
          {tt("退出登录")}
        </button>
      </div>
    </div>
  );
}
