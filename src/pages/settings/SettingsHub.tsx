"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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

function tabFromLocation(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab && tab.trim() ? tab.trim() : fallback;
}

function writeTab(replace: (href: string) => void, tab: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  const href = `${url.pathname}${url.search}${url.hash}`;
  try {
    replace(href);
  } catch {
    window.history.replaceState(null, "", href);
  }
}

export function SettingsHub({
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
  const router = useRouter();
  const configured = oceanleoConfigured();
  const href = currentHref ?? (typeof window !== "undefined" ? window.location.href : "");
  const resetLanding = isPasswordResetLanding(href);
  const fallbackTab = defaultTab || "general";
  const [tab, setTab] = useState(() => tabFromLocation(fallbackTab));
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [currency, setCurrency] = useState<LedgerCurrency>("CNY");
  const [monthSpend, setMonthSpend] = useState<number | null>(null);
  const [requests, setRequests] = useState<number | null>(null);
  const [checked, setChecked] = useState(() => !configured);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    function onPop() {
      setTab(tabFromLocation(fallbackTab));
    }
    if (typeof window === "undefined") return;
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fallbackTab]);

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
    writeTab((hrefNext) => router.replace(hrefNext), id);
  }

  function handleSignedIn() {
    setShowAuth(false);
    if (onSignedIn) onSignedIn();
    else if (typeof window !== "undefined") window.location.reload();
  }

  if (resetLanding) {
    return <PasswordResetPage currentHref={href} onDone={onSignedIn} />;
  }

  if (!configured) {
    const notice = loginUnavailableNotice();
    return (
      <div className="px-8 py-6">
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

  return (
    <div className="px-6 py-6 md:px-8" data-settings-hub>
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
