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

/**
 * What the receiver should do with `itemId` once it resolves it.
 *
 * `open` (the default, and what every existing receipt means) reveals the item
 * in its library detail; the user still presses Edit. `edit` is only issued by
 * a first-party deep link that already names one exact artifact — the catalog
 * template-edit entry — and asks the receiver to hand that item straight to the
 * typed advanced editor. Anything else is treated as `open`: an unknown intent
 * must never silently become an editor launch.
 */
export type WorkspaceActionIntent = "open" | "edit";

const WORKSPACE_ACTION_INTENTS: readonly WorkspaceActionIntent[] = [
  "open",
  "edit",
] as const;

export interface WorkspaceActionV1 {
  version: 1;
  tab: WorkspaceSlotId;
  query?: string;
  category?: string;
  itemId?: string;
  /** Catalog card id. Distinct from `itemId` (artifact / material id). */
  entryId?: string;
  url?: string;
  browserSessionId?: string;
  intent?: WorkspaceActionIntent;
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
  // Absent unless explicitly and validly requested: every receipt written
  // before this field existed must keep normalizing to the exact same object.
  const rawIntent = clean("intent", 16) as WorkspaceActionIntent | undefined;
  const intent =
    rawIntent && WORKSPACE_ACTION_INTENTS.includes(rawIntent)
      ? rawIntent
      : undefined;
  const entryId = clean("entryId", 300);
  return {
    version: 1,
    tab,
    query: clean("query", 200),
    category: clean("category", 100),
    itemId: clean("itemId", 300),
    url,
    browserSessionId: clean("browserSessionId", 300),
    ...(entryId ? { entryId } : {}),
    ...(intent ? { intent } : {}),
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

const CONSUMED_NONCE_CAP = 64;
const consumedKeys = new Set<string>();
const consumedOrder: string[] = [];

function consumptionKey(nonce: string, consumer: string): string {
  return `${nonce}\u0000${consumer}`;
}

function evictConsumedNonce(nonce: string): void {
  const prefix = `${nonce}\u0000`;
  for (const key of [...consumedKeys]) {
    if (key.startsWith(prefix)) consumedKeys.delete(key);
  }
}

export function isWorkspaceActionConsumed(
  nonce: string,
  consumer?: string,
): boolean {
  const id = String(nonce || "").trim();
  if (!id) return false;
  if (consumer) return consumedKeys.has(consumptionKey(id, consumer));
  const prefix = `${id}\u0000`;
  for (const key of consumedKeys) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/** First claim for this consumer wins. Later claims (including remount) skip. */
export function consumeWorkspaceAction(
  nonce: string,
  consumer: string,
): boolean {
  const id = String(nonce || "").trim();
  const who = String(consumer || "").trim();
  if (!id || !who) return false;
  const key = consumptionKey(id, who);
  if (consumedKeys.has(key)) return false;
  consumedKeys.add(key);
  if (!consumedOrder.includes(id)) {
    consumedOrder.push(id);
    while (consumedOrder.length > CONSUMED_NONCE_CAP) {
      const oldest = consumedOrder.shift();
      if (oldest) evictConsumedNonce(oldest);
    }
  }
  return true;
}

export function resetWorkspaceActionConsumptionForTests(): void {
  consumedKeys.clear();
  consumedOrder.length = 0;
}
