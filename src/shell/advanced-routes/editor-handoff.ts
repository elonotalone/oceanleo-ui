"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { LibraryItem } from "../library-data";
import { useOfficeArtifactSource } from "../office-editor/useOfficeArtifactSource";

/**
 * Shared quick ⇄ pro handoff. Deck (W17) is the first consumer; W18–W20
 * read this file from `main` and keep the same priority and confirmation rules.
 *
 * Resolve order: inline memory → working head URL → project URL → the same
 * office/rendition source the quick face already uses.
 */

export type EditorHandoff =
  | { kind: "inline"; json: unknown; revision: string | null }
  | { kind: "url"; url: string; format: string | null; revision: string | null }
  | { kind: "empty" };

export type BeforeEnterPro = () => Promise<
  | { ok: true; handoff: EditorHandoff; item: LibraryItem }
  | { ok: false; error: string }
>;

export type EditorHandoffSourceState = {
  status: "loading" | "ready" | "error";
  source: EditorHandoff | null;
  error?: string;
};

export const PRO_FLUSH_TIMEOUT_MS = 8_000;

export const ENTER_PRO_NOT_READY =
  "还没准备好，稍后再切换";

export const PRO_SAVE_UNCONFIRMED =
  "保存超时，专业面还没确认存上。";

export type HostedSaveWaitResult =
  | { ok: true; snapshot: unknown }
  | { ok: false; error: string };

export type NormalFaceHandoffBinder = {
  getHandoff: () => EditorHandoff;
  persistInBackground?: () => void;
};

const normalFaceBinders = new Map<string, NormalFaceHandoffBinder>();
const proSavedItems = new Map<string, LibraryItem>();
const proSavedListeners = new Set<() => void>();

function notifyProSaved(): void {
  for (const listener of proSavedListeners) listener();
}

export function handoffItemKey(item: Pick<LibraryItem, "key" | "id">): string {
  return String(item.key || item.id || "");
}

export function handoffRevisionOf(item: LibraryItem): string | null {
  const meta = item.meta || {};
  const raw =
    item.revisionId ||
    meta.handoff_revision ||
    meta.revision_id ||
    meta.editor_saved_at ||
    null;
  if (raw == null || raw === "") return null;
  return String(raw);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonish(value: unknown): unknown | null {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function firstInlineFromMeta(item: LibraryItem): unknown | null {
  const content = parseJsonish(item.content);
  if (content) return content;
  const meta = item.meta || {};
  for (const key of ["deck", "slides", "project", "presentation"] as const) {
    const parsed = parseJsonish(meta[key]);
    if (parsed) return parsed;
  }
  return null;
}

export function inferHandoffFormat(
  item: LibraryItem | null | undefined,
  url: string,
): string | null {
  const meta = item?.meta || {};
  const hints = [
    meta.source_format,
    meta.format,
    meta.delivery_format,
    meta.mime,
    meta.editor_working_head_schema,
    meta.editor_project_schema,
    url,
  ]
    .map((hint) => String(hint || "").toLowerCase())
    .join(" ");
  if (
    hints.includes("pptx") ||
    hints.includes("presentationml") ||
    hints.includes("pptm")
  ) {
    return "pptx";
  }
  if (
    hints.includes("pptist") ||
    hints.includes("oceanleo.deck") ||
    hints.includes("application/json") ||
    hints.includes(".json")
  ) {
    return "json";
  }
  try {
    const path = new URL(url, "https://oceanleo.invalid").pathname.toLowerCase();
    if (path.endsWith(".pptx") || path.endsWith(".pptm")) return "pptx";
    if (path.endsWith(".json")) return "json";
  } catch {
    /* keep null */
  }
  return null;
}

export function resolveEditorHandoffFromItem(
  item: LibraryItem,
  extras?: { officeUrl?: string },
): EditorHandoff {
  const revision = handoffRevisionOf(item);
  const inline = firstInlineFromMeta(item);
  if (inline) return { kind: "inline", json: inline, revision };

  const working = String(item.meta?.editor_working_head_url || "").trim();
  if (working) {
    return {
      kind: "url",
      url: working,
      format: inferHandoffFormat(item, working),
      revision,
    };
  }

  const project = String(item.meta?.editor_project_url || "").trim();
  if (project) {
    return {
      kind: "url",
      url: project,
      format: inferHandoffFormat(item, project),
      revision,
    };
  }

  const officeUrl = String(extras?.officeUrl || item.url || "").trim();
  if (officeUrl) {
    return {
      kind: "url",
      url: officeUrl,
      format: inferHandoffFormat(item, officeUrl),
      revision,
    };
  }

  return { kind: "empty" };
}

export function bindNormalFaceHandoff(
  itemKey: string,
  binder: NormalFaceHandoffBinder,
): () => void {
  if (!itemKey) return () => {};
  normalFaceBinders.set(itemKey, binder);
  return () => {
    if (normalFaceBinders.get(itemKey) === binder) {
      normalFaceBinders.delete(itemKey);
    }
  };
}

export function peekNormalFaceHandoff(itemKey: string): EditorHandoff {
  return normalFaceBinders.get(itemKey)?.getHandoff() ?? { kind: "empty" };
}

export async function captureBeforeEnterPro(
  item: LibraryItem,
): Promise<
  | { ok: true; handoff: EditorHandoff; item: LibraryItem }
  | { ok: false; error: string }
> {
  const key = handoffItemKey(item);
  const binder = key ? normalFaceBinders.get(key) : undefined;
  if (binder) {
    try {
      binder.persistInBackground?.();
    } catch {
      /* background save must not block the switch */
    }
    const handoff = binder.getHandoff();
    if (handoff.kind !== "empty") {
      return { ok: true, handoff, item };
    }
  }
  const resolved = resolveEditorHandoffFromItem(item);
  if (resolved.kind === "empty") {
    return { ok: false, error: ENTER_PRO_NOT_READY };
  }
  return { ok: true, handoff: resolved, item };
}

export function reportProSaved(itemKey: string, item: LibraryItem): void {
  if (!itemKey) return;
  proSavedItems.set(itemKey, item);
  notifyProSaved();
}

export function peekProSavedRevision(itemKey: string): LibraryItem | null {
  return proSavedItems.get(itemKey) ?? null;
}

export function useProSavedRevision(itemKey: string): LibraryItem | null {
  return useSyncExternalStore(
    (listener) => {
      proSavedListeners.add(listener);
      return () => {
        proSavedListeners.delete(listener);
      };
    },
    () => proSavedItems.get(itemKey) ?? null,
    () => proSavedItems.get(itemKey) ?? null,
  );
}

export function useEditorHandoffSource(
  item: LibraryItem,
  handoff?: EditorHandoff | null,
): EditorHandoffSourceState {
  const office = useOfficeArtifactSource(item);
  return useMemo(() => {
    if (handoff && handoff.kind !== "empty") {
      return { status: "ready" as const, source: handoff };
    }
    if (office.loading) {
      return { status: "loading" as const, source: null };
    }
    if (office.error && !office.url && !firstInlineFromMeta(item)) {
      return {
        status: "error" as const,
        source: null,
        error: office.error,
      };
    }
    const source = resolveEditorHandoffFromItem(item, { officeUrl: office.url });
    if (source.kind === "empty") {
      return {
        status: "error" as const,
        source,
        error: ENTER_PRO_NOT_READY,
      };
    }
    return { status: "ready" as const, source };
  }, [
    handoff,
    item,
    office.error,
    office.loading,
    office.url,
  ]);
}

export function openHostedSaveGate(options?: {
  timeoutMs?: number;
  saveId?: string;
}): {
  saveId: string;
  wait: () => Promise<HostedSaveWaitResult>;
  acceptSnapshot: (snapshot: unknown) => void;
  acceptSaveResult: () => void;
} {
  const timeoutMs = options?.timeoutMs ?? PRO_FLUSH_TIMEOUT_MS;
  const saveId =
    options?.saveId || `save-${Date.now().toString(36)}`;
  let snapshot: unknown = null;
  let settled = false;
  let resolveWait: (result: HostedSaveWaitResult) => void = () => {};
  const waitPromise = new Promise<HostedSaveWaitResult>((resolve) => {
    resolveWait = resolve;
  });
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    resolveWait({ ok: false, error: PRO_SAVE_UNCONFIRMED });
  }, timeoutMs);
  return {
    saveId,
    wait: () => waitPromise,
    acceptSnapshot(next: unknown) {
      snapshot = next;
    },
    acceptSaveResult() {
      if (settled) return;
      if (snapshot == null) return;
      settled = true;
      clearTimeout(timer);
      resolveWait({ ok: true, snapshot });
    },
  };
}

export function libraryItemFromProSave(
  item: LibraryItem,
  input: {
    deck: unknown;
    revision: string;
    projectUrl?: string;
    sourceUrl?: string;
  },
): LibraryItem {
  const deck = input.deck;
  if (input.projectUrl) {
    return {
      ...item,
      revisionId: input.revision,
      url: input.sourceUrl || item.url,
      content:
        typeof deck === "string" ? deck : JSON.stringify(deck ?? {}),
      meta: {
        ...item.meta,
        deck,
        editor_project_url: input.projectUrl,
        editor_working_head_url: input.projectUrl,
        editor_working_head_project_url: input.projectUrl,
        editor_working_head_schema: "oceanleo.deck.v1",
        handoff_revision: input.revision,
      },
    };
  }
  return {
    ...item,
    revisionId: input.revision,
    url: undefined,
    content: typeof deck === "string" ? deck : JSON.stringify(deck ?? {}),
    meta: {
      ...item.meta,
      deck,
      editor_project_url: "",
      editor_working_head_url: "",
      editor_working_head_project_url: "",
      handoff_revision: input.revision,
    },
  };
}

export function slideCountOf(value: unknown): number {
  const record = asRecord(value);
  const slides = record && Array.isArray(record.slides) ? record.slides : null;
  if (slides) return slides.length;
  return Array.isArray(value) ? value.length : 0;
}

export async function materializeHandoffJson(
  source: EditorHandoff,
  options: {
    title?: string;
    fetchJson?: (url: string) => Promise<unknown>;
    fetchBytes?: (url: string) => Promise<ArrayBuffer>;
    importPptx?: (bytes: ArrayBuffer, title: string) => Promise<unknown>;
  } = {},
): Promise<
  { ok: true; json: unknown; slideCount: number } | { ok: false; error: string }
> {
  const title = options.title || "演示文稿";
  if (source.kind === "empty") {
    return { ok: false, error: ENTER_PRO_NOT_READY };
  }
  if (source.kind === "inline") {
    return {
      ok: true,
      json: source.json,
      slideCount: slideCountOf(source.json),
    };
  }
  const format = (source.format || inferHandoffFormat(null, source.url) || "")
    .toLowerCase();
  try {
    if (format === "pptx") {
      if (!options.importPptx || !options.fetchBytes) {
        return { ok: false, error: "这份素材只有 PPTX，还没有导入器。" };
      }
      const bytes = await options.fetchBytes(source.url);
      const json = await options.importPptx(bytes, title);
      return { ok: true, json, slideCount: slideCountOf(json) };
    }
    const fetchJson =
      options.fetchJson ||
      (async (url: string) => {
        const response = await fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`工程档读取失败（HTTP ${response.status}）`);
        }
        return response.json() as Promise<unknown>;
      });
    const json = await fetchJson(source.url);
    return { ok: true, json, slideCount: slideCountOf(json) };
  } catch (caught) {
    return {
      ok: false,
      error:
        caught instanceof Error ? caught.message : "专业面源文件读取失败。",
    };
  }
}

/** Test-only: wipe binders and saved revisions. */
export function resetEditorHandoffForTests(): void {
  normalFaceBinders.clear();
  proSavedItems.clear();
  notifyProSaved();
}
