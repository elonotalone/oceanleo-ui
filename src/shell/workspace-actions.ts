"use client";

/**
 * Versioned, deliberately small protocol used by a trusted agent tool receipt
 * to control the right-hand workspace.  Free-form assistant text is never
 * parsed as an action.
 */
export type WorkspaceSlotId =
  | "template"
  | "preview"
  | "materials"
  | "mine"
  | "browser";

export interface WorkspaceActionV1 {
  version: 1;
  tab: WorkspaceSlotId;
  query?: string;
  category?: string;
  itemId?: string;
  url?: string;
  browserSessionId?: string;
}

export interface WorkspaceActionEnvelope {
  nonce: string;
  action: WorkspaceActionV1;
}

export const WORKSPACE_ACTION_EVENT = "oceanleo:workspace-action";

export const FIXED_WORKSPACE_SLOTS: readonly WorkspaceSlotId[] = [
  "template",
  "preview",
  "materials",
  "mine",
  "browser",
] as const;

const SLOT_ALIASES: Record<string, WorkspaceSlotId> = {
  __guide: "template",
  guide: "template",
  navigator: "template",
  template: "template",
  templates: "template",
  result: "preview",
  results: "preview",
  preview: "preview",
  artifact: "preview",
  material: "materials",
  materials: "materials",
  inspiration: "materials",
  style: "materials",
  files: "mine",
  file: "mine",
  library: "mine",
  database: "mine",
  works: "mine",
  mine: "mine",
  mylib: "mine",
  my_library: "mine",
  favorites: "mine",
  favourites: "mine",
  browser: "browser",
  cloud_browser: "browser",
};

/** Unknown legacy tabs are product-specific pages and therefore previews. */
export function workspaceSlotForLegacyId(id: string): WorkspaceSlotId {
  const normalized = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return SLOT_ALIASES[normalized] || "preview";
}

export function normalizeWorkspaceAction(
  value: unknown,
): WorkspaceActionV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Number(raw.version) !== 1) return null;
  const tab = String(raw.tab || "") as WorkspaceSlotId;
  if (!FIXED_WORKSPACE_SLOTS.includes(tab)) return null;
  const clean = (key: string, max = 500) => {
    const text = typeof raw[key] === "string" ? String(raw[key]).trim() : "";
    return text ? text.slice(0, max) : undefined;
  };
  const rawUrl = clean("url", 2000);
  let url: string | undefined;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        url = parsed.toString();
      }
    } catch {
      // Receipt payloads must never turn into javascript:/data: links.
    }
  }
  return {
    version: 1,
    tab,
    query: clean("query", 200),
    category: clean("category", 100),
    itemId: clean("itemId", 300),
    url,
    browserSessionId: clean("browserSessionId", 300),
  };
}

export function dispatchWorkspaceAction(envelope: WorkspaceActionEnvelope) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceActionEnvelope>(WORKSPACE_ACTION_EVENT, {
      detail: envelope,
    }),
  );
}
