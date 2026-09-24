"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EAS_W19_MESSAGES } from "../../i18n/ui/messages/eas-w19-copy";

export type W19SavedItem = {
  id?: string;
  artifactId?: string;
  revisionId?: string;
  versionId?: string;
  url?: string;
  previewUrl?: string;
  content?: unknown;
  meta?: Record<string, unknown>;
};

const PRO_SAVED_AS_NEW_VERSION_KEY =
  "专业编辑的改动会作为新版本保存，快速编辑显示最新版本预览";

export const W19_PRO_SAVED_AS_NEW_VERSION =
  EAS_W19_MESSAGES.zh[PRO_SAVED_AS_NEW_VERSION_KEY] ??
  PRO_SAVED_AS_NEW_VERSION_KEY;

/**
 * W17 的 `editor-handoff.ts` 已落地：专业面走 `useEditorHandoffSource` /
 * `useModeSwitchHandoff`。这份 store 留下三件事——next 档不经过渡门、
 * 耐久素材不许回落到预览、五件用插件前缀 key 回流。门仍丢掉
 * `beforeEnterPro` 返回值时也能靠 stash 交稿。
 */
export type W19Handoff =
  | { kind: "inline"; json: unknown; revision: string | null }
  | { kind: "url"; url: string; format: string | null; revision: string | null }
  | { kind: "empty" };

type W19Store = {
  pending: Map<string, W19Handoff>;
  saved: Map<string, W19SavedItem>;
  listeners: Set<() => void>;
};

function w19Store(): W19Store {
  const bag = globalThis as typeof globalThis & { __oceanleoEasW19?: W19Store };
  if (!bag.__oceanleoEasW19) {
    bag.__oceanleoEasW19 = {
      pending: new Map(),
      saved: new Map(),
      listeners: new Set(),
    };
  }
  return bag.__oceanleoEasW19;
}

function notifyW19(): void {
  for (const listener of w19Store().listeners) listener();
}

export function resetW19HandoffStore(): void {
  const store = w19Store();
  store.pending.clear();
  store.saved.clear();
  notifyW19();
}

export function w19ItemKey(
  plugin: "audio" | "threed" | "video-timeline" | "chart-editor" | "pdf",
  item: { id?: string; artifactId?: string },
): string {
  return `${plugin}:${item.artifactId || item.id || ""}`;
}

export function w19RemountKey(item: {
  id?: string;
  revisionId?: string;
  versionId?: string;
}): string {
  return String(item.revisionId || item.versionId || item.id || "");
}

function formatFromUrl(url: string): string | null {
  const match = url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : null;
}

function revisionOf(item: {
  revisionId?: string;
  versionId?: string;
}): string | null {
  return item.revisionId || item.versionId || null;
}

export function resolveW19Handoff(
  item: {
    url?: string;
    previewUrl?: string;
    versionId?: string;
    revisionId?: string;
    artifactId?: string;
    meta?: Record<string, unknown>;
  },
  handoff?: W19Handoff | null,
  renditionUrl = "",
): W19Handoff {
  if (handoff && handoff.kind !== "empty") return handoff;
  const meta = item.meta ?? {};
  const working = String(meta.editor_working_head_url || "").trim();
  if (working) {
    return {
      kind: "url",
      url: working,
      format: formatFromUrl(working),
      revision: revisionOf(item),
    };
  }
  const project = String(meta.editor_project_url || "").trim();
  if (project) {
    return {
      kind: "url",
      url: project,
      format: formatFromUrl(project),
      revision: revisionOf(item),
    };
  }
  const rendition = renditionUrl.trim();
  if (rendition) {
    return {
      kind: "url",
      url: rendition,
      format: formatFromUrl(rendition),
      revision: revisionOf(item),
    };
  }
  const url = String(item.url || "").trim();
  if (url) {
    return {
      kind: "url",
      url,
      format: formatFromUrl(url),
      revision: revisionOf(item),
    };
  }
  const durable = Boolean(item.artifactId && item.revisionId);
  const preview = String(item.previewUrl || "").trim();
  if (!durable && preview) {
    return {
      kind: "url",
      url: preview,
      format: formatFromUrl(preview),
      revision: revisionOf(item),
    };
  }
  return { kind: "empty" };
}

/** 已经能从内存 / 现成 url 交稿时，不要把同一地址再交给 Office 源去 fetch。 */
export function w19OfficeProbeItem<
  T extends {
    url?: string;
    previewUrl?: string;
    artifactId?: string;
    revisionId?: string;
    meta?: Record<string, unknown>;
  },
>(item: T, handoff?: W19Handoff | null): T {
  if (resolveW19Handoff(item, handoff).kind === "empty") return item;
  return { ...item, url: undefined, previewUrl: undefined };
}

export function applyW19HandoffToItem<
  T extends {
    url?: string;
    content?: unknown;
    versionId?: string;
    meta?: Record<string, unknown>;
  },
>(item: T, source: W19Handoff): T {
  if (source.kind === "empty") return item;
  if (source.kind === "url") {
    return {
      ...item,
      url: source.url,
      versionId: source.revision || item.versionId,
    };
  }
  const json = source.json;
  if (
    json &&
    typeof json === "object" &&
    json !== null &&
    "pdfBytes" in json
  ) {
    return item;
  }
  const content =
    typeof json === "string" ? json : JSON.stringify(json ?? null);
  return {
    ...item,
    content,
    versionId: source.revision || item.versionId,
  };
}

export function stashW19EnterHandoff(
  itemKey: string,
  handoff: W19Handoff,
): void {
  w19Store().pending.set(itemKey, handoff);
}

export function peekW19EnterHandoff(itemKey: string): W19Handoff | null {
  return w19Store().pending.get(itemKey) ?? null;
}

export function reportW19ProSaved(
  itemKey: string,
  item: W19SavedItem,
): void {
  w19Store().saved.set(itemKey, item);
  notifyW19();
}

export function peekW19ProSaved<T extends W19SavedItem = W19SavedItem>(
  itemKey: string,
): T | null {
  return (w19Store().saved.get(itemKey) as T | undefined) ?? null;
}

export function subscribeW19ProSaved(listener: () => void): () => void {
  const listeners = w19Store().listeners;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useW19ProSavedRevision<T extends W19SavedItem = W19SavedItem>(
  itemKey: string,
): T | null {
  const getSnapshot = useCallback(
    () => peekW19ProSaved<T>(itemKey),
    [itemKey],
  );
  return useSyncExternalStore(subscribeW19ProSaved, getSnapshot, () => null);
}

export function w19PdfBytesFromHandoff(
  handoff: W19Handoff | null,
): Uint8Array | null {
  if (!handoff || handoff.kind !== "inline") return null;
  const json = handoff.json;
  if (!json || typeof json !== "object" || json === null) return null;
  const bytes = (json as { pdfBytes?: unknown }).pdfBytes;
  return bytes instanceof Uint8Array ? bytes : null;
}
