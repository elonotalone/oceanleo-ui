"use client";

// ============================================================================
// @oceanleo/ui — 统一「账户」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 与 oceanleo 主站 /account 对齐。各站 account/page.tsx 只需把它包进自己的
// <AppShell> 即可。退出登录在这里（侧栏不再放独立退出键——单一事实源）。
//
// 只依赖 react + @oceanleo/ui/lib（全站统一），不碰任何站点特有的表。
// 想展示「任务数」等站点特有统计的站，可通过 extraStats 传入额外卡片。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import {
  browserClient,
  getUserEmail,
  getCredits,
  getCreditHistory,
  signOutEverywhere,
} from "../lib/auth";
import { ConfirmDialog } from "../ui";
import { useUI } from "../i18n/ui/useUI";

export interface AccountMenuItem {
  label: string;
  href: string;
  desc: string;
}

export interface AccountPageProps {
  /** 账户菜单项（默认 API + 账户设置）。 */
  menuItems?: AccountMenuItem[];
  /** 额外统计卡片（如主站的「任务数」）。每项 {value,label}。 */
  extraStats?: { value: ReactNode; label: string }[];
  /** 未登录时点击「登录」的回调（各站弹自己的 AuthModal）。 */
  onSignInClick?: () => void;
  /** 退出后跳转（默认刷新当前页）。 */
  onSignedOut?: () => void;
}

export function AccountPage({
  menuItems,
  extraStats = [],
  onSignInClick,
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
    { label: "API", href: "/api", desc: tt("选择模型、查看价格与 token 余额") },
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
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [monthSpend, setMonthSpend] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    async function load() {
      const e = await getUserEmail();
      setEmail(e);
      setChecked(true);
      if (!e) return;
      const c = await getCredits();
      if (c.ok && c.data) setCredits(c.data.balance_yuan);
      const h = await getCreditHistory();
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
    }
    load();
    const c = browserClient();
    if (!c) return;
    const { data: sub } = c.auth.onAuthStateChange((_e, s) =>
      setEmail(s?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await signOutEverywhere();
    if (onSignedOut) onSignedOut();
    else if (typeof window !== "undefined") window.location.reload();
  }

  if (checked && !email) {
    return (
      <div className="px-8 py-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt("账户")}</h1>
        <div className="v-fade-up mx-auto mt-16 max-w-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-2xl">
            👤
          </div>
          <h2 className="mt-5 text-[17px] font-semibold text-neutral-900">{tt("尚未登录")}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
            {tt("登录后即可使用全部功能、查看 token 余额与记录。")}
          </p>
          <button
            type="button"
            onClick={onSignInClick}
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
    ...extraStats,
  ];

  return (
    <div className="px-8 py-6">
      {confirmLogout && (
        <ConfirmDialog
          title={tt("退出登录")}
          body={tt("退出后需要重新登录才能使用任务与 token 余额。")}
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
          <div>
            <p className="text-[16px] font-semibold text-neutral-900">
              {email ? email.split("@")[0] : tt("未登录")}
            </p>
            <p className="text-[13px] text-neutral-500">{email || "—"}</p>
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
          {resolvedMenu.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="group flex items-center justify-between px-4 py-3.5 transition hover:bg-neutral-50"
            >
              <div>
                <p className="text-[13px] font-medium text-neutral-900">{item.label}</p>
                <p className="text-[12px] text-neutral-500">{item.desc}</p>
              </div>
              <span className="shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5">
                ›
              </span>
            </a>
          ))}
        </div>

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
