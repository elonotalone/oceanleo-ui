"use client";

import { useEffect, useState } from "react";
import { SettingsModal } from "../../pages/settings/SettingsModal";
import type { SettingsSection } from "../../pages/settings/SettingsHub";

function tabFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#settings(?:\/([^/]+))?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1] || "general"); } catch { return "general"; }
}

export function openSettingsModal(tab = "general") {
  window.location.hash = `settings/${encodeURIComponent(tab)}`;
}

export function SettingsModalHost({ extraSections, orgHref, showRequestStat = false, onSignedOut }: {
  extraSections?: SettingsSection[];
  orgHref?: string;
  showRequestStat?: boolean;
  onSignedOut?: () => void;
} = {}) {
  const [tab, setTab] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  function close() {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    setTab(null);
  }
  return <SettingsModal open={tab !== null} initialTab={tab || "general"} onClose={close}
    extraSections={extraSections} orgHref={orgHref} showRequestStat={showRequestStat}
    onTabChange={(next) => {
      window.history.replaceState(window.history.state, "", `#settings/${encodeURIComponent(next)}`);
      setTab(next);
    }} onSignedOut={() => { close(); onSignedOut?.(); }} />;
}
