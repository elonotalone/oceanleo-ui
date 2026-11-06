"use client";

import { SettingsHub } from "../../pages/settings/SettingsHub";
import type { VaultPrefill } from "../../pages/settings/VaultSettingsSection";

export function SettingsWorkspacePanel({ section, prefill }: { section?: string; prefill?: Readonly<Record<string, string>> }) {
  const vaultPrefill: VaultPrefill | undefined = prefill && (prefill.name || prefill.kind || prefill.target)
    ? { name: prefill.name || "", kind: prefill.kind, target: prefill.target || "" }
    : undefined;
  return <div data-workspace-settings-panel className="h-full min-h-0 overflow-auto"><SettingsHub variant="modal" initialTab={section || "general"} vaultPrefill={vaultPrefill} guestPrompt="notice" /></div>;
}

