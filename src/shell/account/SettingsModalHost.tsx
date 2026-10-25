"use client";

import { useEffect, useRef, useState } from "react";
import { portalHref } from "../../contracts/domain-family";
import { usePathname, useRouter } from "next/navigation";
import { SettingsModal } from "../../pages/settings/SettingsModal";
import type { SettingsHubProps, SettingsSection } from "../../pages/settings/SettingsHub";
import { getLocalWorkspace } from "../LocalWorkspace";
import {
  captureSettingsReturnTo,
  isSettingsPathname,
  openSettingsModal,
  readSettingsBillingView,
  readSettingsReturnTo,
  resolveSettingsTab,
  settingsPath,
  tabFromSettingsLocation,
} from "../../pages/settings/settings-tabs";

export { openSettingsModal };

function extraIdsOf(sections?: SettingsSection[]): string[] {
  return [...(sections ?? []).map((section) => section.id), ...(getLocalWorkspace() ? ["local-computer"] : [])];
}

function locationHref(): string {
  return typeof window === "undefined" ? "https://oceanleo.com/" : window.location.href;
}

function herePath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function SettingsModalHost({ extraSections, orgHref, showRequestStat = false, extraStats, onSignedOut, wallet }: {
  extraSections?: SettingsSection[];
  orgHref?: string;
  showRequestStat?: boolean;
  extraStats?: SettingsHubProps["extraStats"];
  onSignedOut?: () => void;
  wallet?: SettingsHubProps["wallet"];
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [tab, setTab] = useState<string | null>(null);
  const extraRef = useRef(extraSections);
  extraRef.current = extraSections;

  useEffect(() => {
    const apply = () => {
      const href = locationHref();
      const legacyDeviceUrl = new URL(href, window.location.origin);
      if (/^\/settings\/devices\/?$/.test(legacyDeviceUrl.pathname)
        || (legacyDeviceUrl.pathname === "/settings" && legacyDeviceUrl.searchParams.get("tab") === "devices")) {
        setTab(null);
        router.replace(portalHref("/devices"));
        return;
      }
      const extras = extraIdsOf(extraRef.current);
      const hashMatch = typeof window !== "undefined"
        ? window.location.hash.match(/^#settings(?:\/([^/]*))?$/)
        : null;

      if (hashMatch && !isSettingsPathname(window.location.pathname)) {
        const raw = (() => {
          try { return decodeURIComponent(hashMatch[1] || "general"); } catch { return "general"; }
        })();
        openSettingsModal(raw);
        return;
      }

      if (!isSettingsPathname(window.location.pathname) && !hashMatch) {
        setTab(null);
        return;
      }

      const resolved = tabFromSettingsLocation(href, extras);
      const canonical = settingsPath(resolved);
      const billingView = readSettingsBillingView(href);
      const prev = (window.history.state as {
        settingsBillingView?: string;
        settingsReturnTo?: string;
      } | null) || {};
      if (isSettingsPathname(window.location.pathname) && herePath() !== canonical) {
        window.history.replaceState(
          {
            ...prev,
            settingsOverlay: true,
            settingsReturnTo: captureSettingsReturnTo(undefined, prev),
            settingsBillingView:
              resolved === "billing" && billingView !== "overview" ? billingView : undefined,
          },
          "",
          canonical,
        );
      }
      setTab(resolved);
    };

    apply();
    window.addEventListener("hashchange", apply);
    window.addEventListener("popstate", apply);
    return () => {
      window.removeEventListener("hashchange", apply);
      window.removeEventListener("popstate", apply);
    };
  }, [pathname]);

  function close() {
    if (typeof window === "undefined") return;
    const returnTo = readSettingsReturnTo(
      window.history.state as { settingsReturnTo?: string } | null,
    );
    setTab(null);
    const onSettings =
      isSettingsPathname(window.location.pathname) ||
      isSettingsPathname(pathname || "");
    if (!onSettings) return;
    // Next 16 把带 `__NA` 的 replaceState 当成内部调用，只改地址栏、不换页面。
    // `/settings/<tab>` 本身是空页；history.back() 也回不到主页面（登录后常是
    // 整页落到设置地址）。必须走 App Router，把主区真正换成打开前的那一页。
    router.replace(returnTo);
  }

  return <SettingsModal open={tab !== null} initialTab={tab || "general"} onClose={close}
    extraSections={extraSections} extraStats={extraStats} orgHref={orgHref} showRequestStat={showRequestStat}
    wallet={wallet}
    onTabChange={(next) => {
      const resolved = resolveSettingsTab(next, extraIdsOf(extraSections));
      const canonical = settingsPath(resolved);
      if (herePath() !== canonical) {
        window.history.replaceState({
          ...(window.history.state as object),
          settingsOverlay: true,
          settingsReturnTo: captureSettingsReturnTo(
            undefined,
            window.history.state as { settingsReturnTo?: string } | null,
          ),
        }, "", canonical);
      }
      setTab(resolved);
    }} onSignedOut={() => { close(); onSignedOut?.(); }} />;
}
