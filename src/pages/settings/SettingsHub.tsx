"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  browserClient,
  oceanleoConfigured,
  loginUnavailableNotice,
  getUserEmail,
  getCredits,
  getCreditHistory,
  getUsageBySite,
  isPasswordResetLanding,
} from "../../lib/auth";
import { formatMoney, normalizeCurrency, type LedgerCurrency } from "../../lib/money";
import { useUI } from "../../i18n/ui/useUI";
import { AuthDialog } from "../AuthDialog";
import { PasswordResetPage } from "../PasswordResetPage";
import { SettingsNav, type SettingsNavGroup } from "./SettingsNav";
import { GeneralSection } from "./sections/GeneralSection";
import { AccountSection } from "./sections/AccountSection";
import { BillingSection } from "./sections/BillingSection";
import { OrgSection } from "./sections/OrgSection";

export type SettingsSection = {
  id: string;
  group: "settings" | "capabilities" | "data";
  label: string;
  icon?: ReactNode;
  href?: string;
  external?: boolean;
  render?: () => ReactNode;
};

export type SettingsHubProps = {
  variant?: "page" | "modal";
  onClose?: () => void;
  initialTab?: string;
  onTabChange?: (tab: string) => void;
  defaultTab?: string;
  extraSections?: SettingsSection[];
  planLabel?: string | null;
  menu?: {
    label: string;
    href: string;
    desc?: string;
    external?: boolean;
    expands?: "security";
  }[];
  onSignInClick?: () => void;
  showRequestStat?: boolean;
  orgHref?: string;
  extraStats?: { value: ReactNode; label: string }[];
  onSignedIn?: () => void;
  onSignedOut?: () => void;
  currentHref?: string;
  guestPrompt?: "auth" | "notice";
};

const SKIP_MENU_HREFS = new Set(["/general", "/settings", "/cost", "/org", "/account", ""]);

function SettingsHomeLink({ label }: { label: string }) {
  return (
    <a
      href="/"
      className="mb-3 inline-block text-[13px] font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
    >
      {label}
    </a>
  );
}

function tabFromLocation(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab && tab.trim() ? tab.trim() : fallback;
}

// 只改 `?tab=`，不换页面：走 history.replaceState 即可，不依赖 next/navigation 的
// app router（AccountPage 会被 36 个站在各种壳里渲染，测试里也常没有 router）。
function writeTab(tab: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function SettingsHub({
  variant = "page",
  initialTab,
  onTabChange,
  defaultTab = "general",
  extraSections = [],
  planLabel,
  menu,
  onSignInClick,
  showRequestStat = true,
  orgHref,
  extraStats = [],
  onSignedIn,
  onSignedOut,
  currentHref,
  guestPrompt = "auth",
}: SettingsHubProps) {
  const tt = useUI();
  const configured = oceanleoConfigured();
  const href = currentHref ?? (typeof window !== "undefined" ? window.location.href : "");
  const resetLanding = isPasswordResetLanding(href);
  const fallbackTab = defaultTab || "general";
  const [tab, setTab] = useState(() => variant === "modal" ? initialTab || fallbackTab : tabFromLocation(fallbackTab));
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [currency, setCurrency] = useState<LedgerCurrency>("CNY");
  const [monthSpend, setMonthSpend] = useState<number | null>(null);
  const [requests, setRequests] = useState<number | null>(null);
  const [checked, setChecked] = useState(() => !configured);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (variant === "modal") setTab(initialTab || fallbackTab);
  }, [variant, initialTab, fallbackTab]);

  useEffect(() => {
    if (variant === "modal" && checked && !email && guestPrompt === "auth") setShowAuth(true);
  }, [variant, checked, email, guestPrompt]);

  useEffect(() => {
    if (variant === "modal") return;
    function onPop() {
      setTab(tabFromLocation(fallbackTab));
    }
    if (typeof window === "undefined") return;
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fallbackTab, variant]);

  useEffect(() => {
    if (!configured) return;
    async function load() {
      const e = await getUserEmail();
      setEmail(e);
      setChecked(true);
      if (!e) return;
      const c = await getCredits();
      if (c.ok && c.data) {
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

  const sections = useMemo<SettingsSection[]>(() => {
    const builtin: SettingsSection[] = [
      {
        id: "general",
        group: "settings",
        label: tt("通用"),
        render: () => <GeneralSection />,
      },
      {
        id: "account",
        group: "settings",
        label: tt("账户"),
        render: () => <AccountSection email={email} onSignedOut={onSignedOut} />,
      },
      {
        id: "billing",
        group: "settings",
        label: tt("用量与账单"),
        render: () => <BillingSection stats={stats} />,
      },
    ];
    const capsByHref = new Map<string, SettingsSection>();
    const putCap = (section: SettingsSection) => {
      if (section.href) capsByHref.set(section.href, section);
    };
    putCap({
      id: "models",
      group: "capabilities",
      label: tt("AI 模型"),
      href: "/api",
    });
    putCap({
      id: "plugins",
      group: "capabilities",
      label: tt("插件与连接器"),
      href: "/plugins",
    });
    putCap({
      id: "devices",
      group: "capabilities",
      label: tt("我的设备"),
      href: "/devices",
    });
    for (const item of menu ?? []) {
      if (item.expands) continue;
      const itemHref = (item.href || "").trim();
      if (SKIP_MENU_HREFS.has(itemHref)) continue;
      const slug = itemHref.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || item.label;
      putCap({
        id: `cap-${slug}`,
        group: "capabilities",
        label: item.label,
        href: itemHref,
        external: item.external,
      });
    }
    const org: SettingsSection = {
      id: "org",
      group: "data",
      label: tt("组织"),
      render: () => <OrgSection orgHref={orgHref} />,
    };
    return [...builtin, ...capsByHref.values(), org, ...extraSections];
  }, [tt, email, onSignedOut, stats, menu, orgHref, extraSections]);

  const groups = useMemo<SettingsNavGroup[]>(() => {
    const labels: Record<SettingsSection["group"], string> = {
      settings: tt("设置"),
      capabilities: tt("能力"),
      data: tt("数据与组织"),
    };
    const order: SettingsSection["group"][] = ["settings", "capabilities", "data"];
    return order
      .map((id) => ({
        id,
        label: labels[id],
        items: sections.filter((s) => s.group === id),
      }))
      .filter((g) => g.items.length > 0);
  }, [sections, tt]);

  const paneSections = sections.filter((s) => !s.href);
  const active =
    paneSections.find((s) => s.id === tab) ??
    paneSections.find((s) => s.id === fallbackTab) ??
    paneSections[0];

  function selectTab(id: string) {
    setTab(id);
    if (variant === "modal") onTabChange?.(id);
    else writeTab(id);
  }

  function handleSignedIn() {
    setShowAuth(false);
    if (onSignedIn) onSignedIn();
    else if (typeof window !== "undefined") window.location.reload();
  }

  if (resetLanding) {
    return (
      <div className="px-8 py-6">
        <SettingsHomeLink label={tt("回到首页")} />
        <PasswordResetPage currentHref={href} onDone={onSignedIn} />
      </div>
    );
  }

  if (!configured) {
    const notice = loginUnavailableNotice();
    return (
      <div className="px-8 py-6">
        <SettingsHomeLink label={tt("回到首页")} />
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt("设置")}
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
    if (guestPrompt === "notice") {
      return (
        <div className="px-8 py-6">
          <SettingsHomeLink label={tt("回到首页")} />
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
            {tt("设置")}
          </h1>
          <div className="v-fade-up mx-auto mt-10 max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 text-center text-[14px] text-neutral-600">
            {tt("请先登录后再管理账户设置。")}
          </div>
        </div>
      );
    }
    return (
      <div className="px-8 py-6">
        {showAuth && (
          <AuthDialog onClose={() => setShowAuth(false)} onSuccess={handleSignedIn} />
        )}
        <SettingsHomeLink label={tt("回到首页")} />
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt("设置")}
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

  if (variant === "modal") {
    return <div data-settings-hub data-settings-variant="modal" className="flex h-full min-h-0 flex-col gap-4 p-5 pt-14 text-neutral-900 dark:text-neutral-100 sm:flex-row sm:gap-6 sm:p-6 sm:pt-14">
      <div className="min-h-0 shrink-0 overflow-auto sm:w-56"><SettingsNav groups={groups} activeId={active?.id ?? fallbackTab} onSelect={selectTab} userEmail={email} planLabel={resolvedPlanLabel} /></div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"><h2 className="mb-4 text-[16px] font-semibold">{active?.label}</h2>{active?.render?.()}</div>
    </div>;
  }

  return (
    <div className="px-6 py-6 md:px-8" data-settings-hub>
      <SettingsHomeLink label={tt("回到首页")} />
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt("设置")}</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start">
        <SettingsNav
          groups={groups}
          activeId={active?.id ?? fallbackTab}
          onSelect={selectTab}
          userEmail={email}
          planLabel={resolvedPlanLabel}
        />
        <div className="min-w-0 flex-1">
          <h2 className="mb-4 text-[16px] font-semibold text-neutral-900">
            {active?.label}
          </h2>
          {active?.render?.()}
        </div>
      </div>
    </div>
  );
}
