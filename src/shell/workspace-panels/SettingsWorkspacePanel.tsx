"use client";

import { useEffect, useRef, useState } from "react";
import { SettingsHub } from "../../pages/settings/SettingsHub";
import type { VaultPrefill } from "../../pages/settings/VaultSettingsSection";

/** Below this panel width the sections sit in a top tab strip, as in the narrow Settings modal. */
const LEFT_RAIL_MIN_WIDTH = 880;

export function SettingsWorkspacePanel({ section, prefill }: { section?: string; prefill?: Readonly<Record<string, string>> }) {
  const vaultPrefill: VaultPrefill | undefined = prefill && (prefill.name || prefill.kind || prefill.target)
    ? { name: prefill.name || "", kind: prefill.kind, target: prefill.target || "" }
    : undefined;
  const host = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => setWide(node.clientWidth >= LEFT_RAIL_MIN_WIDTH);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} data-workspace-settings-panel className="h-full min-h-0 overflow-hidden"><SettingsHub variant="modal" layout={wide ? "auto" : "tabs"} initialTab={section || "general"} vaultPrefill={vaultPrefill} guestPrompt="notice" /></div>;
}
