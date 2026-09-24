"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SettingsModal } from "../../pages/settings/SettingsModal";
import type { SettingsSection } from "../../pages/settings/SettingsHub";
import { resolveSettingsTab } from "../../pages/settings/settings-tabs";

function tabFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#settings(?:\/([^/]+))?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1] || "general"); } catch { return "general"; }
}

export function openSettingsModal(tab = "general") {
  window.location.hash = `settings/${encodeURIComponent(tab)}`;
}

function extraIdsOf(sections?: SettingsSection[]): string[] {
  return (sections ?? []).map((section) => section.id);
}

function writeSettingsHash(tab: string) {
  const next = `#settings/${encodeURIComponent(tab)}`;
  if (window.location.hash === next) return;
  window.history.replaceState(window.history.state, "", next);
}

export function SettingsModalHost({ extraSections, orgHref, showRequestStat = false, onSignedOut }: {
  extraSections?: SettingsSection[];
  orgHref?: string;
  showRequestStat?: boolean;
  onSignedOut?: () => void;
} = {}) {
  const pathname = usePathname();
  const [tab, setTab] = useState<string | null>(null);
  const pathRef = useRef(pathname);
  const extraRef = useRef(extraSections);
  extraRef.current = extraSections;

  useEffect(() => {
    const applyHash = () => {
      const raw = tabFromHash();
      if (raw === null) {
        setTab(null);
        return;
      }
      const resolved = resolveSettingsTab(raw, extraIdsOf(extraRef.current));
      if (resolved !== raw) writeSettingsHash(resolved);
      setTab(resolved);
    };

    if (pathRef.current !== pathname) {
      pathRef.current = pathname;
      if (tabFromHash() !== null) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
      setTab(null);
    }

    applyHash();
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("popstate", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
      window.removeEventListener("popstate", applyHash);
    };
  }, [pathname]);

  function close() {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    setTab(null);
  }

  return <SettingsModal open={tab !== null} initialTab={tab || "general"} onClose={close}
    extraSections={extraSections} orgHref={orgHref} showRequestStat={showRequestStat}
    onTabChange={(next) => {
      const resolved = resolveSettingsTab(next, extraIdsOf(extraSections));
      writeSettingsHash(resolved);
      setTab(resolved);
    }} onSignedOut={() => { close(); onSignedOut?.(); }} />;
}
