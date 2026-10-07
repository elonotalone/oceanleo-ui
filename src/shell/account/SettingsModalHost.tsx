"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SettingsModal } from "../../pages/settings/SettingsModal";
import type { SettingsHubProps, SettingsSection } from "../../pages/settings/SettingsHub";
import {
  isSettingsPathname,
  openSettingsModal,
  readSettingsBillingView,
  resolveSettingsTab,
  settingsPath,
  tabFromSettingsLocation,
} from "../../pages/settings/settings-tabs";

export { openSettingsModal };

function extraIdsOf(sections?: SettingsSection[]): string[] {
  return (sections ?? []).map((section) => section.id);
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
  const [tab, setTab] = useState<string | null>(null);
  const extraRef = useRef(extraSections);
  extraRef.current = extraSections;

  useEffect(() => {
    const apply = () => {
      const href = locationHref();
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
      const prev = (window.history.state as { settingsBillingView?: string } | null) || {};
      if (isSettingsPathname(window.location.pathname) && herePath() !== canonical) {
        window.history.replaceState(
          {
            ...prev,
            settingsOverlay: true,
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
    const overlay = Boolean((window.history.state as { settingsOverlay?: boolean } | null)?.settingsOverlay);
    if (overlay && window.history.length > 1) {
      window.history.back();
      return;
    }
    if (isSettingsPathname(window.location.pathname)) {
      window.history.replaceState(window.history.state, "", "/");
      window.dispatchEvent(new Event("popstate"));
    }
    setTab(null);
  }

  return <SettingsModal open={tab !== null} initialTab={tab || "general"} onClose={close}
    extraSections={extraSections} extraStats={extraStats} orgHref={orgHref} showRequestStat={showRequestStat}
    wallet={wallet}
    onTabChange={(next) => {
      const resolved = resolveSettingsTab(next, extraIdsOf(extraSections));
      const canonical = settingsPath(resolved);
      if (herePath() !== canonical) {
        window.history.replaceState({ ...(window.history.state as object), settingsOverlay: true }, "", canonical);
      }
      setTab(resolved);
    }} onSignedOut={() => { close(); onSignedOut?.(); }} />;
}
