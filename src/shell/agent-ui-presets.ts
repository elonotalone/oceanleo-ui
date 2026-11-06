"use client";

import { dispatchWorkspaceAction, normalizeWorkspaceAction, type WorkspaceAction, type WorkspaceActionV2, type WorkspaceActionEnvelope } from "./workspace-actions";
import { appearanceToHtmlClass, allThemeClassNames, normalizeThemeMode, resolveThemeClass, type ThemeMode } from "../theme/theme-config";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, normalizeLocale, type Locale } from "../i18n/config";

export type AgentUiPreset =
  | { kind: "theme"; value: "dark" | "light" | "system" }
  | { kind: "locale"; value: string };

function setTheme(mode: ThemeMode) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const normalized = normalizeThemeMode(mode);
  try { localStorage.setItem("oceanleo_theme", normalized); } catch { /* storage is optional */ }
  document.cookie = `oceanleo_theme=${encodeURIComponent(normalized)}; path=/; max-age=31536000; samesite=lax`;
  const resolved = resolveThemeClass(normalized, window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false);
  const root = document.documentElement;
  root.classList.remove(...allThemeClassNames());
  appearanceToHtmlClass(resolved).split(" ").forEach((name) => root.classList.add(name));
  root.style.colorScheme = resolved === "light" ? "light" : "dark";
  window.dispatchEvent(new CustomEvent("oceanleo:agent-theme", { detail: { mode: normalized } }));
}

function setLocale(value: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const locale: Locale = isLocale(value) ? value : normalizeLocale(value);
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  document.documentElement.lang = locale;
  window.dispatchEvent(new CustomEvent("oceanleo:agent-locale", { detail: { locale } }));
}

/** Apply a capability-pack preset through the existing theme/locale surfaces. */
export function applyAgentPreset(preset: AgentUiPreset | { kind?: unknown; value?: unknown }): void {
  if (!preset || typeof preset !== "object") return;
  if (preset.kind === "theme" && (preset.value === "dark" || preset.value === "light" || preset.value === "system")) {
    setTheme(preset.value === "system" ? "auto" : preset.value);
  } else if (preset.kind === "locale" && typeof preset.value === "string") {
    setLocale(preset.value);
  }
}

function pageAction(action: WorkspaceAction): WorkspaceActionV2 | null {
  const normalized = normalizeWorkspaceAction(action);
  if (!normalized) return null;
  if (normalized.version === 2) return normalized as WorkspaceActionV2;
  if (normalized.tab === "browser") return { ...normalized, version: 2, tab: "devices", section: "cloud-browser" };
  if (normalized.tab === "devices" || normalized.tab === "projects" || normalized.tab === "settings" || normalized.tab === "leochat") {
    return { ...normalized, version: 2, tab: normalized.tab };
  }
  return null;
}

/** Route a verified UI action to the single sidebar instance in this window. */
export function openWorkspacePage(action: WorkspaceAction): void {
  const next = pageAction(action);
  if (!next || typeof window === "undefined") return;
  const envelope: WorkspaceActionEnvelope = {
    nonce: `capability:${Date.now().toString(36)}:${Math.random().toString(16).slice(2, 10)}`,
    action: next,
  };
  dispatchWorkspaceAction(envelope);
}

