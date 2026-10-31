"use client";

// ============================================================================
// @oceanleo/ui — 首页电脑对话草稿附件：刷新不丢（2026-10-31 A1 补）
// ----------------------------------------------------------------------------
// 首页选了 Claude Code / Codex 这类电脑程序时，附件在建好 task session 之前只留在本
// 标签页（useAgentDialogController 的 deferred），没有 Library 引用，composer-draft
// 存不了。这里把这些 File 本身存进 IndexedDB（同源、只在本机浏览器），刷新后交回
// thread.onAttachFiles 重新加一次；删掉的跟着删，发出去（建了 session）就清掉。
// ============================================================================

import { useCallback, useEffect, useRef } from "react";

const DB_NAME = "oceanleo-native-draft-files";
const STORE = "drafts";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<any> | void): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req ? (req.result as T) : undefined); };
      tx.onerror = () => { db.close(); resolve(undefined); };
    } catch {
      db.close();
      resolve(undefined);
    }
  });
}

export async function readNativeDraftFiles(key: string): Promise<File[]> {
  const value = await withStore<unknown>("readonly", (store) => store.get(key));
  return Array.isArray(value) ? value.filter((item): item is File => item instanceof Blob && typeof (item as File).name === "string") : [];
}

export function writeNativeDraftFiles(key: string, files: readonly File[]): Promise<unknown> {
  return withStore("readwrite", (store) => (files.length ? store.put([...files], key) : store.delete(key)));
}

export function clearNativeDraftFiles(key: string): Promise<unknown> {
  return withStore("readwrite", (store) => store.delete(key));
}

/** The tile name of a failed upload carries a suffix; the file is still the same one. */
function baseName(name: string): string {
  const cut = name.lastIndexOf(" · ");
  return cut > 0 ? name.slice(0, cut) : name;
}

/**
 * 「从资料库添加文件」in a computer chat: the computer's inbox takes bytes, not
 * Library references, so the picked file's original is read once and handed over
 * as a File (it then goes to the inbox like a local pick).
 */
export async function libraryAttachmentFile(att: {
  name?: string;
  mime?: string;
  artifactId?: string;
  revisionId?: string;
}): Promise<File | null> {
  if (!att.artifactId || !att.revisionId) return null;
  try {
    const { resolveAttachmentDisplayUrl } = await import("../lib/attachment-url");
    const url = await resolveAttachmentDisplayUrl({ artifactId: att.artifactId, revisionId: att.revisionId }, "source");
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], att.name || "file", { type: att.mime || blob.type || "application/octet-stream" });
  } catch {
    return null;
  }
}

export interface UseNativeDraftFilesOptions {
  /** e.g. `home:<userId>`; undefined = off. */
  key?: string;
  /** False while the conversation already has its task session (files upload under it). */
  enabled: boolean;
  /** The thread's composer tiles (names only are compared). */
  attachments: readonly { name?: string }[];
  /** thread.onAttachFiles; undefined while the computer link is down. */
  attach: ((files: File[]) => void) | undefined;
}

export interface NativeDraftFilesHandle {
  /** Use in place of `attach` for files the user picks: they are remembered too. */
  attachFiles: (files: File[]) => void;
  /** The prompt went out (or the draft was dropped): forget the files. */
  clear: () => void;
}

export function useNativeDraftFiles({ key, enabled, attachments, attach }: UseNativeDraftFilesOptions): NativeDraftFilesHandle {
  const filesRef = useRef<File[]>([]);
  const restoredRef = useRef<string | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  // Restore once per key, as soon as the thread can take files.
  useEffect(() => {
    if (!key || !enabled || !attach || restoredRef.current === key) return;
    restoredRef.current = key;
    let alive = true;
    void readNativeDraftFiles(key).then((files) => {
      if (!alive || keyRef.current !== key || !files.length) return;
      filesRef.current = files;
      attach(files);
    });
    return () => { alive = false; };
  }, [key, enabled, attach]);

  // Removing a tile forgets its file.
  const names = attachments.map((item) => baseName(item.name ?? "")).join("\u0000");
  useEffect(() => {
    if (!key || !enabled || !filesRef.current.length) return;
    const shown = new Set(names ? names.split("\u0000") : []);
    const kept = filesRef.current.filter((file) => shown.has(file.name));
    if (kept.length === filesRef.current.length) return;
    filesRef.current = kept;
    void writeNativeDraftFiles(key, kept);
  }, [key, enabled, names]);

  const attachFiles = useCallback((files: File[]) => {
    if (attach) attach(files);
    const k = keyRef.current;
    if (!k || !enabled || !attach || !files.length) return;
    filesRef.current = [...filesRef.current, ...files];
    void writeNativeDraftFiles(k, filesRef.current);
  }, [attach, enabled]);

  const clear = useCallback(() => {
    filesRef.current = [];
    const k = keyRef.current;
    if (k) void clearNativeDraftFiles(k);
  }, []);

  return { attachFiles, clear };
}
