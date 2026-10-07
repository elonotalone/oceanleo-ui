"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  browserClient,
  oceanleoConfigured,
  loginUnavailableNotice,
  getUserEmail,
  getUserId,
  getCredits,
  getCreditHistory,
  getUsageBySite,
  isPasswordResetLanding,
} from "../../lib/auth";
import { formatMoney, normalizeCurrency, type LedgerCurrency } from "../../lib/money";
import { useUI } from "../../i18n/ui/useUI";
import { ApiPage } from "../ApiPage";
import { AuthPanel } from "../AuthDialog";
import { DevicesPage } from "../DevicesPage";
import { PasswordResetPage } from "../PasswordResetPage";
import { PluginsPage } from "../PluginsPage";
import { SettingsNav, type SettingsNavGroup } from "./SettingsNav";
import { PersonalizationSection } from "./personalization/PersonalizationSection";
import { MailSection } from "./mail/MailSection";
import { GeneralSection } from "./sections/GeneralSection";
import { AccountSection } from "./sections/AccountSection";
import { BaySettingsSection } from "../../shell/bay/settings";
import { bayEnabledHere } from "../../shell/bay/shell/bay-state";
import { BillingSection } from "./sections/BillingSection";
import { OrgSection, type OrgPane } from "./sections/OrgSection";
import { SettingsBackButton } from "./SettingsBackButton";
import {
  accountSettingsPath,
  accountSettingsView,
  canonicalSettingsTab,
  isReservedSettingsTab,
  readSettingsBillingView,
  rememberSettingsBillingView,
  resolveSettingsTab,
  settingsPath,
  tabFromSettingsLocation,
  type AccountSettingsView,
  type BillingPaneView,
} from "./settings-tabs";
import type { AccountSectionProfile } from "./sections/AccountSection";

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
  /** @deprecated 账户页不再显示计划标签；保留以免旧调用方类型报错。 */
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
  /** 充值页里的钱包/金额与支付方式（门户传入）。用量页不渲染这块。 */
  wallet?: ReactNode;
  onSignedIn?: () => void;
  onSignedOut?: () => void;
  currentHref?: string;
  guestPrompt?: "auth" | "notice";
};

const SKIP_MENU_HREFS = new Set([
  "/general",
  "/settings",
  "/cost",
  "/usage-details",
  "/topup",
  "/org",
  "/team",
  "/account",
  "",
]);
/** 旧账号菜单里指向这几页的项（站内或主站外链）已由内置面板承接。 */
const PANE_MENU_PATHS = new Set(["/api", "/plugins", "/devices"]);

function menuPath(href: string): string {
  try {
    return new URL(href, "https://settings.invalid").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return href;
  }
}

const warnedShadowedSections = new Set<string>();

function withoutShadowedSections(sections: SettingsSection[]): SettingsSection[] {
  return sections.filter((section) => {
    if (!isReservedSettingsTab(section.id)) return true;
    if (!warnedShadowedSections.has(section.id)) {
      warnedShadowedSections.add(section.id);
      console.warn(
        `[SettingsHub] extraSections item "${section.id}" is ignored: the built-in "${canonicalSettingsTab(section.id)}" section owns this id.`,
      );
    }
    return false;
  });
}

function tabFromLocation(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return tabFromSettingsLocation(window.location.href, [], fallback);
}

function writeTab(tab: string) {
  if (typeof window === "undefined") return;
  const prev = (window.history.state as object) || {};
  window.history.replaceState(prev, "", settingsPath(tab));
}

type AccountProfileReader = () => Promise<
  | AccountSectionProfile
  | { profile?: AccountSectionProfile; error?: string }
  | null
  | undefined
>;

async function readAccountProfile(): Promise<AccountSectionProfile | null> {
  try {
    const auth = (await import("../../lib/auth")) as {
      getAccountProfile?: AccountProfileReader;
    };
    if (typeof auth.getAccountProfile !== "function") return null;
    const box = await auth.getAccountProfile();
    if (!box || typeof box !== "object") return null;
    if ("profile" in box) return box.profile ?? null;
    if ("userId" in box) return box as AccountSectionProfile;
    return null;
  } catch {
    /* W1 尚未把 getAccountProfile 挂到桶上 */
  }
  return null;
}

function headingForAccountView(view: AccountSettingsView): string {
  switch (view) {
    case "sign-in-methods":
      return "管理登录方式";
    case "login-devices":
      return "已连接的设备";
    case "security":
      return "账号安全";
    default:
      return "账户";
  }
}

export function SettingsHub({
  variant = "page",
  initialTab,
  onTabChange,
  defaultTab = "general",
  extraSections = [],
  menu,
  onSignInClick,
  showRequestStat = true,
  orgHref,
  extraStats = [],
  wallet,
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
  const extraIdKey = extraSections.map((section) => section.id).join("\0");
  const extraIds = useMemo(() => extraIdKey.split("\0").filter(Boolean), [extraIdKey]);
  const [tab, setTab] = useState(() =>
    resolveSettingsTab(
      variant === "modal" ? initialTab || fallbackTab : tabFromLocation(fallbackTab),
      extraIds,
      fallbackTab,
    ),
  );
  const [accountView, setAccountView] = useState<AccountSettingsView>(() =>
    accountSettingsView(href),
  );
  const [profile, setProfile] = useState<AccountSectionProfile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const signedInRef = useRef(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [currency, setCurrency] = useState<LedgerCurrency>("CNY");
  const [monthSpend, setMonthSpend] = useState<number | null>(null);
  const [requests, setRequests] = useState<number | null>(null);
  const [checked, setChecked] = useState(() => !configured);
  const [orgInitialPane, setOrgInitialPane] = useState<OrgPane>("mine");
  const [billingView, setBillingView] = useState<BillingPaneView>(() => readSettingsBillingView(href));
  const loadAccountRef = useRef<() => Promise<void>>(async () => {});

  function applySession(next: { email: string | null; signedIn: boolean }) {
    signedInRef.current = next.signedIn;
    setSignedIn(next.signedIn);
    setEmail(next.email);
  }

  useEffect(() => {
    if (variant === "modal") {
      const next = resolveSettingsTab(initialTab || fallbackTab, extraIds, fallbackTab);
      setTab(next);
      setAccountView(accountSettingsView(typeof window !== "undefined" ? window.location.href : href));
      if (next === "billing") setBillingView(readSettingsBillingView());
    }
  }, [variant, initialTab, fallbackTab, extraIds, href]);

  useEffect(() => {
    if (variant === "modal") return;
    function onPop() {
      setTab(resolveSettingsTab(tabFromLocation(fallbackTab), extraIds, fallbackTab));
      setAccountView(accountSettingsView(window.location.href));
      setBillingView(readSettingsBillingView());
    }
    if (typeof window === "undefined") return;
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fallbackTab, variant, extraIds]);

  useEffect(() => {
    if (variant !== "page" || typeof window === "undefined") return;
    if (resolveSettingsTab(tabFromLocation(fallbackTab), extraIds, fallbackTab) !== "billing") return;
    const view = readSettingsBillingView();
    setBillingView(view);
    if (window.location.pathname.replace(/\/+$/, "") !== "/settings/billing") {
      rememberSettingsBillingView(view);
    }
  }, [variant, fallbackTab, extraIds]);

  useEffect(() => {
    if (!configured) return;
    async function load() {
      const [e, id] = await Promise.all([getUserEmail(), getUserId()]);
      if (id) {
        applySession({ email: e, signedIn: true });
        const nextProfile = await readAccountProfile();
        if (nextProfile) setProfile(nextProfile);
      } else if (!signedInRef.current) {
        applySession({ email: null, signedIn: false });
        setProfile(null);
      }
      setChecked(true);
      if (!id) return;
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
    loadAccountRef.current = load;
    load();
    const c = browserClient();
    if (!c) return;
    const { data: sub } = c.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        applySession({ email: null, signedIn: false });
        setProfile(null);
        return;
      }
      if (s?.user) {
        applySession({ email: s.user.email ?? null, signedIn: true });
        void readAccountProfile().then((nextProfile) => {
          if (nextProfile) setProfile(nextProfile);
        });
      }
    });
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
  function goAccountView(view: AccountSettingsView) {
    setTab("account");
    setAccountView(view);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        { ...(window.history.state as object), settingsOverlay: true },
        "",
        accountSettingsPath(view),
      );
    }
    if (variant === "modal") onTabChange?.("account");
  }

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
        render: () => (
          <AccountSection
            email={email}
            onSignedOut={onSignedOut}
            view={accountView}
            profile={profile}
            credits={credits}
            currency={currency}
            onOpenSignInMethods={() => goAccountView("sign-in-methods")}
            onOpenDevices={() => goAccountView("login-devices")}
            onOpenTopup={() => selectTab("billing", { billingView: "topup" })}
            onProfileChange={(next) => setProfile(next)}
          />
        ),
      },
      {
        id: "personalization",
        group: "settings",
        label: tt("个性化"),
        render: () => <PersonalizationSection />,
      },
      {
        id: "billing",
        group: "settings",
        label: tt("用量与账单"),
        render: () => (
          <BillingSection
            stats={stats}
            wallet={wallet}
            view={billingView}
            onViewChange={(next) => {
              setBillingView(next);
              rememberSettingsBillingView(next);
            }}
          />
        ),
      },
      ...(bayEnabledHere()
        ? [
            {
              id: "bay",
              group: "settings" as const,
              label: tt("OceanLeo Bay"),
              render: () => <BaySettingsSection />,
            },
          ]
        : []),
    ];
    const caps: SettingsSection[] = [
      {
        id: "ai-models",
        group: "capabilities",
        label: tt("AI 模型"),
        render: () => <ApiPage variant="pane" />,
      },
      {
        id: "plugins",
        group: "capabilities",
        label: tt("插件与连接器"),
        render: () => <PluginsPage variant="pane" />,
      },
      {
        id: "mail",
        group: "capabilities",
        label: tt("邮件"),
        render: () => <MailSection variant="pane" />,
      },
      {
        id: "devices",
        group: "capabilities",
        label: tt("我的设备"),
        render: () => <DevicesPage variant="pane" />,
      },
    ];
    const takenLabels = new Set([...builtin, ...caps].map((section) => section.label));
    const capsByHref = new Map<string, SettingsSection>();
    for (const item of menu ?? []) {
      if (item.expands) continue;
      const itemHref = (item.href || "").trim();
      if (SKIP_MENU_HREFS.has(itemHref)) continue;
      if (PANE_MENU_PATHS.has(menuPath(itemHref))) continue;
      if (takenLabels.has(item.label)) continue;
      const slug = itemHref.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || item.label;
      capsByHref.set(itemHref, {
        id: `cap-${slug}`,
        group: "capabilities",
        label: item.label,
        href: itemHref,
        external: item.external,
      });
    }
    const org: SettingsSection = {
      id: "team",
      group: "data",
      label: tt("团队"),
      render: () => <OrgSection orgHref={orgHref} initialPane={orgInitialPane} />,
    };
    return [...builtin, ...caps, ...capsByHref.values(), org, ...withoutShadowedSections(extraSections)];
  }, [
    tt,
    email,
    onSignedOut,
    stats,
    wallet,
    menu,
    orgHref,
    extraSections,
    accountView,
    profile,
    credits,
    currency,
    orgInitialPane,
    billingView,
  ]);

  const groups = useMemo<SettingsNavGroup[]>(() => {
    const labels: Record<SettingsSection["group"], string> = {
      settings: tt("设置"),
      capabilities: tt("能力"),
      data: tt("数据与团队"),
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
  const paneIds = paneSections.map((s) => s.id);
  const requested = resolveSettingsTab(tab, paneIds, fallbackTab);
  const active =
    paneSections.find((s) => s.id === requested) ??
    paneSections.find((s) => s.id === fallbackTab) ??
    paneSections[0];
  const navActiveId = active?.id ?? fallbackTab;

  function selectTab(id: string, options?: { orgPane?: OrgPane; billingView?: BillingPaneView }) {
    const next = resolveSettingsTab(id, paneIds, fallbackTab);
    setOrgInitialPane(next === "team" ? (options?.orgPane ?? "mine") : "mine");
    if (next === "billing") {
      if (options?.billingView) {
        setBillingView(options.billingView);
        rememberSettingsBillingView(options.billingView);
      } else if (tab !== "billing") {
        setBillingView("overview");
        rememberSettingsBillingView("overview");
      }
    }
    setTab(next);
    if (next === "account") {
      goAccountView("home");
      return;
    }
    setAccountView("home");
    if (variant === "modal") onTabChange?.(next);
    else writeTab(next);
  }

  function paneHeading() {
    const nestedAccount = active?.id === "account" && accountView !== "home";
    const title = nestedAccount ? tt(headingForAccountView(accountView)) : active?.label;
    return (
      <div
        className={`mb-6 flex w-full items-center gap-2 ${
          variant === "modal" ? "pr-20" : ""
        } ${nestedAccount ? "border-b border-neutral-200 pb-3" : ""}`}
      >
        {nestedAccount ? (
          <SettingsBackButton onClick={() => goAccountView("home")} label="账户" />
        ) : null}
        <h2
          data-settings-pane-title=""
          className="text-[24px] font-semibold tracking-tight text-neutral-900"
        >
          {title}
        </h2>
      </div>
    );
  }

  function handleSignedIn() {
    // Never location.reload(): LeoDev keeps the new session in an in-tab overlay.
    // A reload drops it and the guest latch puts Sign in back on screen.
    signedInRef.current = true;
    setSignedIn(true);
    setChecked(true);
    onSignedIn?.();
    void loadAccountRef.current();
  }

  if (resetLanding) {
    return (
      <div className="px-8 py-6">
        <PasswordResetPage currentHref={href} onDone={onSignedIn} />
      </div>
    );
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

  if (checked && !signedIn) {
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
      <div
        data-settings-guest-auth=""
        className={
          variant === "modal"
            ? "flex h-full min-h-0 w-full flex-col overflow-y-auto text-neutral-900"
            : "flex min-h-[70vh] w-full flex-col overflow-y-auto text-neutral-900"
        }
        style={{
          backgroundColor: "#f4f4f5",
          backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        <div
          className={
            variant === "modal"
              ? "flex min-h-full w-full flex-col items-center justify-center px-6 pb-10 pt-16"
              : "flex min-h-[70vh] w-full flex-col items-center justify-center px-6 py-16"
          }
        >
        {onSignInClick ? (
          <div className="v-fade-up mx-auto mt-8 max-w-sm text-center">
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
              onClick={onSignInClick}
              className="mt-6 w-full rounded-xl bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-800 active:scale-[0.99]"
            >
              {tt("登录")}
            </button>
          </div>
        ) : (
          <AuthPanel onSuccess={handleSignedIn} />
        )}
        </div>
      </div>
    );
  }

  if (variant === "modal") {
    return <div data-settings-hub data-settings-variant="modal" className="flex h-full min-h-0 flex-col gap-4 overflow-visible p-5 text-neutral-900 dark:text-neutral-100 md:flex-row md:gap-0 md:p-0">
      <div data-settings-nav-rail="" className="shrink-0 overflow-hidden px-5 pt-5 md:flex md:h-full md:w-60 md:flex-col md:border-r md:border-neutral-200 md:pl-5 md:pr-0.5 md:py-6">
        <SettingsNav groups={groups} activeId={navActiveId} onSelect={selectTab} displayName={profile?.displayName} avatarUrl={profile?.avatarUrl} userEmail={email} onCreateOrganization={() => selectTab("team", { orgPane: "create" })} />
      </div>
      <div data-settings-pane-scroll="" className="v-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-5 pt-5 md:px-7 md:py-6">{paneHeading()}{active?.render?.()}</div>
    </div>;
  }

  return (
    <div className="px-6 py-6 md:px-8" data-settings-hub>
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt("设置")}</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start md:gap-0">
        <SettingsNav
          groups={groups}
          activeId={navActiveId}
          onSelect={selectTab}
          displayName={profile?.displayName}
          avatarUrl={profile?.avatarUrl}
          userEmail={email}
          onCreateOrganization={() => selectTab("team", { orgPane: "create" })}
        />
        <div className="min-w-0 flex-1 md:border-l md:border-neutral-200 md:pl-7">
          {paneHeading()}
          {active?.render?.()}
        </div>
      </div>
    </div>
  );
}
