import type { AdvancedEditorDraftAdapter, AdvancedEditorRecoveryAdapter } from "./advanced-editor-adapter";
import type { AdvancedEditRevision } from "./advanced-persistence-controller";
import type { AdvancedDraftPointer } from "./advanced-draft";

export const ADVANCED_PORTABLE_DRAFT_MAX_BYTES = 5_000_000;
const restoredEdits = new Map<string, { revision: AdvancedEditRevision; updatedAt: number }>();
const publishedDrafts = new Set<string>();
export interface AdvancedLocalRecoveryPromotion {
  key: string;
  revision: AdvancedEditRevision;
  updatedAt: number;
  /** Distinguishes a later recovery lifetime even if the editor revision resets. */
  token: number;
}
const localRecoveryPromotions = new Map<string, AdvancedLocalRecoveryPromotion>();
const localRecoveryListeners = new Set<() => void>();
let localRecoveryToken = 0;
const receiptKey = (pointer: AdvancedDraftPointer) => JSON.stringify([pointer.rootId, pointer.baseRevisionId, pointer.schema, pointer.url, pointer.editRevision, pointer.savedAt]);
function emitLocalRecoveryChange(): void { for (const listener of [...localRecoveryListeners]) listener(); }
export function subscribeAdvancedLocalRecovery(onChange: () => void): () => void {
  localRecoveryListeners.add(onChange);
  return () => localRecoveryListeners.delete(onChange);
}
export function advancedLocalRecoveryPromotion(key: string): AdvancedLocalRecoveryPromotion | undefined {
  return localRecoveryPromotions.get(key);
}
export function noteAdvancedLocalRecoveryRestored(
  key: string,
  revision: AdvancedEditRevision,
  updatedAt: number,
): AdvancedLocalRecoveryPromotion | undefined {
  if (!key || !Number.isFinite(updatedAt)) return undefined;
  const promotion = { key, revision, updatedAt, token: ++localRecoveryToken };
  localRecoveryPromotions.set(key, promotion);
  if (localRecoveryPromotions.size > 256) localRecoveryPromotions.delete(localRecoveryPromotions.keys().next().value!);
  emitLocalRecoveryChange();
  return promotion;
}
export function clearAdvancedLocalRecoveryPromotion(
  key: string,
  expected?: Partial<Pick<AdvancedLocalRecoveryPromotion, "updatedAt" | "token">>,
): void {
  const current = localRecoveryPromotions.get(key);
  if (
    !current ||
    (expected?.token !== undefined && current.token !== expected.token) ||
    (expected?.updatedAt !== undefined && current.updatedAt !== expected.updatedAt)
  ) return;
  localRecoveryPromotions.delete(key);
  emitLocalRecoveryChange();
}
export function resetAdvancedLocalRecoveryPromotionsForTests(): void {
  localRecoveryPromotions.clear();
  localRecoveryToken = 0;
  emitLocalRecoveryChange();
}
export function noteAdvancedDraftPublished(pointer: AdvancedDraftPointer): void {
  publishedDrafts.add(receiptKey(pointer));
  if (publishedDrafts.size > 256) publishedDrafts.delete(publishedDrafts.values().next().value!);
}
export function advancedDraftPublished(pointer: AdvancedDraftPointer): boolean { return publishedDrafts.has(receiptKey(pointer)); }
export function clearAdvancedDraftRestored(key: string): void { restoredEdits.delete(key); }
export function noteAdvancedDraftRestored(key: string, revision: AdvancedEditRevision, updatedAt: number): void {
  restoredEdits.set(key, { revision, updatedAt });
  if (restoredEdits.size > 256) restoredEdits.delete(restoredEdits.keys().next().value!);
}
export function advancedDraftRestoredAt(key: string, revision: AdvancedEditRevision): number | undefined {
  const restored = restoredEdits.get(key);
  return restored && Object.is(restored.revision, revision) ? restored.updatedAt : undefined;
}

/** JSON must retain the whole working document, not silently erase binary or
 * editor objects. Clone here so a later editor mutation cannot change a receipt. */
export function portableAdvancedDraft(payload: unknown): unknown | null {
  const parents = new Set<object>();
  const visit = (value: unknown): boolean => {
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "string") return !value.startsWith("blob:");
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || parents.has(value)) return false;
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    parents.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ok = Reflect.ownKeys(descriptors).every(key => {
      if (Array.isArray(value) && key === "length") return true;
      const descriptor = descriptors[key as string];
      return typeof key === "string" && descriptor.enumerable && "value" in descriptor &&
        ((!Array.isArray(value) && descriptor.value === undefined) || visit(descriptor.value));
    });
    parents.delete(value);
    return ok;
  };
  try {
    if (payload == null || !visit(payload)) return null;
    const encoded = JSON.stringify(payload);
    if (new TextEncoder().encode(encoded).byteLength > ADVANCED_PORTABLE_DRAFT_MAX_BYTES) return null;
    return JSON.parse(encoded);
  } catch { return null; }
}

export function draftFromRecovery(recovery?: AdvancedEditorRecoveryAdapter): AdvancedEditorDraftAdapter | undefined {
  if (!recovery?.draftSchema) return undefined;
  return { schema: recovery.draftSchema, capture: recovery.capture, captureRevision: recovery.captureRevision };
}

export async function capturePortableAdvancedDraft(draft: AdvancedEditorDraftAdapter, revision: AdvancedEditRevision): Promise<unknown | null> {
  if (draft.captureRevision) {
    const captured = await draft.captureRevision(revision);
    return captured && Object.is(captured.revision, revision) ? portableAdvancedDraft(captured.payload) : null;
  }
  const payload = draft.capture();
  // Async adapters must explicitly say which mutation their result covers.
  if (payload && typeof (payload as Promise<unknown>).then === "function") {
    await Promise.resolve(payload).catch(() => undefined);
    return null;
  }
  return portableAdvancedDraft(payload);
}

export function draftRecoveryKey(recovery: AdvancedEditorRecoveryAdapter): string {
  return recovery.draftSchema ? `${recovery.key}:${recovery.draftSchema}` : recovery.key;
}
