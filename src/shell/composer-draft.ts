"use client";

// Composer drafts: text and private Library references keep their existing tab /
// server sync. Local file bytes live in IndexedDB under the same draft key, so
// uploading, failed and computer-inbox tiles can be restored through the host.

import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentRef } from "../lib/attachment-url";
import { getComposerDrafts, putComposerDraft, type ComposerDraftServerRecord } from "../lib/composer-drafts-api";
import { useImConnection, useImEvent } from "./messages/realtime/hooks";
import type { ComposerAttachment } from "./LeoComposer";

export const COMPOSER_DRAFT_PREFIX = "oceanleo_composer_draft:v1:";

/** 存下来的一个附件：只有引用与展示字段，没有 URL。 */
export interface ComposerDraftAttachment {
  id: string;
  artifactId: string;
  revisionId: string;
  name?: string;
  mime?: string;
  mediaType?: string;
}

export interface ComposerDraftRecord {
  text: string;
  attachments: ComposerDraftAttachment[];
  rev?: number;
}

function composerDeviceId(): string {
  const fallback = `web-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  if (typeof window === "undefined") return fallback;
  try {
    const existing = window.localStorage.getItem("oceanleo_composer_device_id");
    if (existing) return existing;
    window.localStorage.setItem("oceanleo_composer_device_id", fallback);
  } catch { /* private mode */ }
  return fallback;
}

function draftStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function composerDraftStorageKey(draftKey: string): string {
  return `${COMPOSER_DRAFT_PREFIX}${draftKey}`;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** 可以存的附件：上传完成、没失败、带私有引用。其余（上传中 / 失败 / 电脑 inbox）不存。 */
export function draftAttachmentsOf(
  attachments: readonly ComposerAttachment[] | undefined,
): ComposerDraftAttachment[] {
  const out: ComposerDraftAttachment[] = [];
  for (const att of attachments ?? []) {
    if (att.uploading || att.failed) continue;
    const ref = attachmentRef(att);
    if (!ref || !att.id) continue;
    const name = optionalText(att.name);
    const mime = optionalText(att.mime);
    const mediaType = optionalText(att.mediaType);
    out.push({
      id: att.id,
      artifactId: ref.artifactId,
      revisionId: ref.revisionId,
      ...(name ? { name } : {}),
      ...(mime ? { mime } : {}),
      ...(mediaType ? { mediaType } : {}),
    });
  }
  return out;
}

export function readComposerDraft(draftKey: string): ComposerDraftRecord | null {
  const store = draftStorage();
  if (!store || !draftKey) return null;
  let raw: unknown;
  try {
    const text = store.getItem(composerDraftStorageKey(draftKey));
    if (!text) return null;
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { text?: unknown; attachments?: unknown };
  const text = typeof record.text === "string" ? record.text : "";
  // Re-validate on read: a hand-edited or older entry never smuggles a URL in.
  const attachments = draftAttachmentsOf(
    Array.isArray(record.attachments) ? (record.attachments as ComposerAttachment[]) : [],
  );
  if (!text.trim() && attachments.length === 0) return null;
  const rev = typeof (record as { rev?: unknown }).rev === "number" ? (record as { rev: number }).rev : undefined;
  return { text, attachments, ...(rev === undefined ? {} : { rev }) };
}

export function clearComposerDraft(draftKey: string): void {
  const store = draftStorage();
  if (!store || !draftKey) return;
  try {
    store.removeItem(composerDraftStorageKey(draftKey));
  } catch {
    /* storage unavailable */
  }
}

export function writeComposerDraft(
  draftKey: string,
  text: string,
  attachments: readonly ComposerDraftAttachment[],
): void {
  const store = draftStorage();
  if (!store || !draftKey) return;
  if (!text.trim() && attachments.length === 0) {
    clearComposerDraft(draftKey);
    return;
  }
  try {
    store.setItem(composerDraftStorageKey(draftKey), JSON.stringify({ text, attachments }));
  } catch {
    /* quota / private mode: the draft is best effort */
  }
}

type FetchLibraryItem = (
  artifactId: string,
  revisionId: string,
) => Promise<{ ok: boolean; status?: number; data?: import("./library-data").LibraryItem }>;

async function defaultFetchLibraryItem(artifactId: string, revisionId: string) {
  const { getArtifactItem } = await import("./artifact-client");
  return getArtifactItem(artifactId, revisionId);
}

const GONE_STATUSES = new Set([403, 404, 410]);

/**
 * 存下的引用 → 可以放回输入框的附件。每个引用向网关重新取一次 typed LibraryItem：
 * 取到 → 带新的短期缩略图与 `libraryItem`；网关说没有 / 无权 → 丢掉；
 * 网络等其它失败 → 只带引用放回（发送仍走引用，网关会再校验一次）。
 */
export async function rehydrateDraftAttachments(
  items: readonly ComposerDraftAttachment[],
  fetchItem: FetchLibraryItem = defaultFetchLibraryItem,
): Promise<ComposerAttachment[]> {
  const { composerAttachmentFromLibraryItem } = await import("./composer-upload");
  const restored = await Promise.all(
    items.map(async (item): Promise<ComposerAttachment | null> => {
      const refOnly: ComposerAttachment = {
        id: item.id,
        artifactId: item.artifactId,
        revisionId: item.revisionId,
        ...(item.name ? { name: item.name } : {}),
        ...(item.mime ? { mime: item.mime } : {}),
        ...(item.mediaType ? { mediaType: item.mediaType } : {}),
      };
      let result: Awaited<ReturnType<FetchLibraryItem>>;
      try {
        result = await fetchItem(item.artifactId, item.revisionId);
      } catch {
        return refOnly;
      }
      if (result.ok && result.data) {
        const fresh = composerAttachmentFromLibraryItem(result.data);
        if (!fresh) return refOnly;
        return {
          ...refOnly,
          ...fresh,
          // The host's id and the exact revision that was attached stay as they were.
          id: item.id,
          artifactId: item.artifactId,
          revisionId: item.revisionId,
          name: item.name || fresh.name,
          mime: item.mime || fresh.mime,
        };
      }
      if (result.status && GONE_STATUSES.has(result.status)) return null;
      return refOnly;
    }),
  );
  return restored.filter((item): item is ComposerAttachment => item !== null);
}

export const COMPOSER_DRAFT_FILE_LIMIT = 20;
export const COMPOSER_DRAFT_BYTES_LIMIT = 100 * 1024 * 1024;

export interface ComposerDraftFile {
  draftFileId: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  blob: Blob;
  tileId?: string;
  artifactId?: string;
  revisionId?: string;
}

export type ComposerDraftFileNotice = "limit" | "storage_unavailable" | null;

// Reuse the old home-only database: old File[] rows are migrated on read.
async function fileStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: boolean; value?: T }> {
  if (typeof indexedDB === "undefined") return { ok: false };
  return new Promise((resolve) => {
    let db: IDBDatabase | undefined;
    let finished = false;
    const finish = (ok: boolean, value?: T) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      db?.close();
      resolve({ ok, value });
    };
    // Blocked/private-mode opens must not prevent the user attaching a file.
    const timer = setTimeout(() => finish(false), 1500);
    try {
      const request = indexedDB.open("oceanleo-native-draft-files", 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("drafts"); };
      request.onerror = request.onblocked = () => finish(false);
      request.onsuccess = () => {
        db = request.result;
        if (finished) { db.close(); return; }
        try {
          const tx = db.transaction("drafts", mode);
          const req = run(tx.objectStore("drafts"));
          tx.oncomplete = () => finish(true, req.result);
          tx.onerror = tx.onabort = () => finish(false);
        } catch { finish(false); }
      };
    } catch { finish(false); }
  });
}

function storedFile(file: File): ComposerDraftFile {
  return { draftFileId: `df-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name: file.name, type: file.type,
    size: file.size, lastModified: file.lastModified, blob: file };
}

export function composerDraftFileToFile(row: ComposerDraftFile): File {
  return new File([row.blob], row.name, { type: row.type, lastModified: row.lastModified });
}

export async function readComposerDraftFiles(key: string): Promise<ComposerDraftFile[]> {
  const result = await fileStore<unknown>("readonly", (store) => store.get(key));
  if (!Array.isArray(result.value)) return [];
  return result.value.flatMap((value): ComposerDraftFile[] => {
    if (value instanceof Blob && typeof (value as File).name === "string") return [storedFile(value as File)];
    if (!value || typeof value !== "object" || !(value.blob instanceof Blob) || typeof value.name !== "string" ||
      typeof value.draftFileId !== "string") return [];
    return [{ ...value, type: value.type || "", size: value.blob.size, lastModified: value.lastModified || 0 }];
  });
}

export function limitComposerDraftFiles(files: readonly ComposerDraftFile[]): ComposerDraftFile[] {
  let bytes = 0;
  const kept: ComposerDraftFile[] = [];
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const file = files[i];
    if (kept.length >= COMPOSER_DRAFT_FILE_LIMIT || bytes + file.size > COMPOSER_DRAFT_BYTES_LIMIT) continue;
    bytes += file.size;
    kept.unshift(file);
  }
  return kept;
}

// Queue writes per key so a late attach write can never resurrect a removed or
// sent draft. Reads also wait for writes from an instance that just unmounted.
const draftFileWrites = new Map<string, Promise<boolean>>();
export function writeComposerDraftFiles(key: string, files: readonly ComposerDraftFile[]): Promise<boolean> {
  const snapshot = limitComposerDraftFiles(files);
  const previous = draftFileWrites.get(key) ?? Promise.resolve(true);
  const next = previous.then(async () => {
    const result = snapshot.length
      ? await fileStore("readwrite", (store) => store.put(snapshot, key))
      : await fileStore("readwrite", (store) => store.delete(key));
    return result.ok;
  });
  draftFileWrites.set(key, next);
  void next.finally(() => { if (draftFileWrites.get(key) === next) draftFileWrites.delete(key); });
  return next;
}

export function clearComposerDraftFiles(key: string): Promise<boolean> {
  return writeComposerDraftFiles(key, []);
}

/** Library picks in computer chats need bytes for the computer inbox. */
export async function libraryAttachmentFile(att: { name?: string; mime?: string; artifactId?: string; revisionId?: string }): Promise<File | null> {
  if (!att.artifactId || !att.revisionId) return null;
  try {
    const { resolveAttachmentDisplayUrl } = await import("../lib/attachment-url");
    const url = await resolveAttachmentDisplayUrl({ artifactId: att.artifactId, revisionId: att.revisionId }, "source");
    if (!url) return null;
    const result = await fetch(url);
    if (!result.ok) return null;
    const blob = await result.blob();
    return new File([blob], att.name || "file", { type: att.mime || blob.type || "application/octet-stream" });
  } catch { return null; }
}

type FileSession = {
  key: string;
  rows: ComposerDraftFile[];
  ready: Promise<void>;
  restored: boolean;
  observed: Set<string>;
  savedIds: Set<string>;
  // Existing tiles must not absorb a newly attached same-name file.
  excluded: Map<string, Set<string>>;
};

function fileMatches(row: ComposerDraftFile, att: ComposerAttachment): boolean {
  const name = att.name || "";
  const size = (att as ComposerAttachment & { size?: number }).size;
  const basename = name.includes(" · ") ? name.slice(0, name.lastIndexOf(" · ")) : name;
  const dot = row.name.lastIndexOf(".");
  const stem = dot > 0 ? row.name.slice(0, dot) : row.name;
  const extension = dot > 0 ? row.name.slice(dot) : "";
  // Computer hosts disambiguate repeated names with -2, -3, ... .
  const renamed = basename.startsWith(`${stem}-`) && basename.endsWith(extension) &&
    /^\d+$/.test(basename.slice(stem.length + 1, extension ? -extension.length : undefined));
  return (name === row.name || basename === row.name || renamed) && (size === undefined || size === row.size) &&
    (!att.mime || !row.type || att.mime === row.type);
}

export interface UseComposerDraftOptions {
  draftKey?: string;
  value: string;
  onChange: (value: string) => void;
  attachments?: readonly ComposerAttachment[];
  /** 宿主把恢复出来的附件加回自己的状态。不传 = 只存文字。 */
  onAddAttachments?: (items: ComposerAttachment[]) => void;
  onRemoveAttachment?: (id: string) => void;
  /** All local file intake goes through the returned attachFiles wrapper. */
  onAttachFiles?: (files: File[]) => void;
  /** 测试注入；缺省按引用向网关取 LibraryItem。 */
  fetchItem?: FetchLibraryItem;
}

export interface ComposerDraftHandle {
  /** 点发送时调：输入框原样卸载（首页切到任务对话）即清掉草稿。 */
  markSubmitted: () => void;
  attachFiles: (files: File[]) => void;
  /** Bytes over the per-draft limit or unavailable local storage. */
  fileNotice: ComposerDraftFileNotice;
}

function serverRecord(record: ComposerDraftServerRecord): ComposerDraftRecord {
  return { text: record.text || "", attachments: record.attachments || [], rev: record.rev };
}

function preserveCaretAfterRemoteText(previous: string, next: string, caret: number): number {
  if (previous === next) return caret;
  let prefix = 0;
  const limit = Math.min(previous.length, next.length);
  while (prefix < limit && previous[prefix] === next[prefix]) prefix += 1;
  return prefix < caret ? next.length : caret;
}

export function useComposerDraft({
  draftKey,
  value,
  onChange,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onAttachFiles,
  fetchItem,
}: UseComposerDraftOptions): ComposerDraftHandle {
  const connection = useImConnection();
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const latest = useRef({ value, onChange, attachments, onAddAttachments, onRemoveAttachment, onAttachFiles, fetchItem });
  latest.current = { value, onChange, attachments, onAddAttachments, onRemoveAttachment, onAttachFiles, fetchItem };
  const keyRef = useRef(draftKey);
  keyRef.current = draftKey;
  const restoredKeyRef = useRef<string | undefined>(undefined);
  // Last state seen by the writer: unchanged state (first render, StrictMode's
  // re-run, a just-restored key) is never written over what is stored.
  const lastSeenRef = useRef<string | null>(null);
  const submittedRef = useRef<string | null>(null);
  // Restored references still being re-read: kept in storage until they land.
  const pendingRestoreRef = useRef<ComposerDraftAttachment[]>([]);
  const remoteSignatureRef = useRef<string | null>(null);
  const revRef = useRef(0);
  const pendingPutRef = useRef<{ text: string; attachments: ComposerDraftAttachment[]; base_rev?: number } | null>(null);
  const putTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef<string>("");
  if (!deviceIdRef.current) deviceIdRef.current = composerDeviceId();

  const libraryRestoreRef = useRef<Promise<ComposerAttachment[]>>(Promise.resolve([]));
  const [fileNotice, setFileNotice] = useState<ComposerDraftFileNotice>(null);
  const filesRef = useRef<FileSession | null>(null);
  const aliveRef = useRef(false);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  const notice = (session: FileSession, value: ComposerDraftFileNotice) => {
    if (aliveRef.current && filesRef.current === session) setFileNotice(value);
  };
  const persistFiles = (session: FileSession) => {
    const kept = limitComposerDraftFiles(session.rows);
    if (kept.length !== session.rows.length) notice(session, "limit");
    session.rows = kept;
    return writeComposerDraftFiles(session.key, kept).then((ok) => { if (!ok) notice(session, "storage_unavailable"); });
  };
  const reconcileFiles = (session: FileSession) => {
    const shown = latest.current.attachments ?? [];
    const used = new Set<string>();
    const before = JSON.stringify(session.rows.map(({ blob: _blob, ...row }) => row));
    session.rows = session.rows.filter((row) => {
      let tile = row.tileId ? shown.find((att) => att.id === row.tileId && !used.has(att.id)) : undefined;
      if (!tile && !row.tileId) tile = shown.find((att) => !used.has(att.id) &&
        !session.excluded.get(row.draftFileId)?.has(att.id) && fileMatches(row, att));
      if (!tile) return !session.observed.has(row.draftFileId);
      session.observed.add(row.draftFileId);
      used.add(tile.id);
      row.tileId = tile.id;
      const ref = attachmentRef(tile);
      if (ref) { row.artifactId = ref.artifactId; row.revisionId = ref.revisionId; }
      // Store the host's disambiguated name for a stable next restore.
      if (tile.name && !tile.failed && !tile.name.includes(" · ")) row.name = tile.name;
      return true;
    });
    if (before !== JSON.stringify(session.rows.map(({ blob: _blob, ...row }) => row))) void persistFiles(session);
  };

  // Initialize independently of reference hydration: a text-only draft may have
  // file bytes, and an offline host may only supply its intake callback later.
  useEffect(() => {
    if (!draftKey) { filesRef.current = null; return; }
    if (filesRef.current?.key === draftKey) return;
    setFileNotice(null);
    const session: FileSession = { key: draftKey, rows: [], ready: Promise.resolve(), restored: false, observed: new Set(), savedIds: new Set(), excluded: new Map() };
    filesRef.current = session;
    session.ready = (async () => {
      await draftFileWrites.get(draftKey);
      const saved = await readComposerDraftFiles(draftKey);
      session.rows = limitComposerDraftFiles(saved);
      session.savedIds = new Set(session.rows.map((row) => row.draftFileId));
      if (saved.length !== session.rows.length) notice(session, "limit");
    })();
  }, [draftKey]);

  useEffect(() => {
    const session = filesRef.current;
    if (!session || !onAttachFiles) return;
    void session.ready.then(async () => {
      // Let the reference restore finish first, then match each row at most once.
      const pending = readComposerDraft(session.key)?.attachments ?? [];
      const hydrated = pending.length && latest.current.onAddAttachments ? await libraryRestoreRef.current : [];
      if (!aliveRef.current || filesRef.current !== session || session.restored || !latest.current.onAttachFiles) return;
      session.restored = true;
      const refs = latest.current.onAddAttachments ? draftAttachmentsOf([...(latest.current.attachments ?? []), ...hydrated]) : [];
      const unused = [...new Map(refs.map((att) => [att.id, att])).values()];
      const upload: File[] = [];
      for (const row of session.rows) {
        if (!session.savedIds.has(row.draftFileId)) continue;
        const index = unused.findIndex((att) => row.artifactId && row.revisionId
          ? att.artifactId === row.artifactId && att.revisionId === row.revisionId
          : fileMatches(row, att));
        if (index >= 0) {
          row.tileId = unused.splice(index, 1)[0].id;
        } else if ((latest.current.attachments ?? []).some((att) => att.id === row.tileId && fileMatches(row, att))) {
          session.observed.add(row.draftFileId);
        } else {
          delete row.tileId;
          session.excluded.set(row.draftFileId, new Set((latest.current.attachments ?? []).map((att) => att.id)));
          upload.push(composerDraftFileToFile(row));
        }
      }
      if (upload.length) latest.current.onAttachFiles?.(upload);
    });
  }, [draftKey, onAttachFiles]);

  const fileSignature = JSON.stringify((attachments ?? []).map((att) => [att.id, att.name, att.mime, att.uploading, att.failed, attachmentRef(att)]));
  useEffect(() => {
    const session = filesRef.current;
    if (!session) return;
    void session.ready.then(() => {
      if (!aliveRef.current || filesRef.current !== session) return;
      if (submittedRef.current !== null && !(latest.current.attachments ?? []).length) {
        session.rows = [];
        void clearComposerDraftFiles(session.key);
      } else reconcileFiles(session);
    });
  }, [draftKey, fileSignature]);

  const attachFiles = useCallback((files: File[]) => {
    const host = latest.current.onAttachFiles;
    if (!host || !files.length) return;
    const session = filesRef.current;
    if (!session || !keyRef.current) { host(files); return; }
    const excluded = new Set((latest.current.attachments ?? []).map((att) => att.id));
    // Capture before calling the host; host uploads can finish synchronously.
    const rows = files.map(storedFile);
    // The host gets the files at once: a slow, full or missing IndexedDB must
    // never keep a picked image out of the composer. The refresh copy is
    // written alongside (tile association uses `excluded`, captured above).
    host(files);
    void session.ready.then(async () => {
      for (const row of rows) session.excluded.set(row.draftFileId, excluded);
      session.rows.push(...rows);
      await persistFiles(session);
    });
  }, []);

  const saveable = onAddAttachments ? draftAttachmentsOf(attachments) : [];
  const signature = draftKey ? JSON.stringify([value, saveable]) : "";
  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  // Restore once per key (refs survive StrictMode's simulated remount).
  useEffect(() => {
    if (!draftKey || restoredKeyRef.current === draftKey) return;
    restoredKeyRef.current = draftKey;
    lastSeenRef.current = null;
    submittedRef.current = null;
    pendingRestoreRef.current = [];
    const record = readComposerDraft(draftKey);
    if (record?.rev) revRef.current = record.rev;
    if (!record) return;
    if (record.text && !latest.current.value.trim()) latest.current.onChange(record.text);
    if (!record.attachments.length || !latest.current.onAddAttachments) return;
    pendingRestoreRef.current = record.attachments;
    libraryRestoreRef.current = rehydrateDraftAttachments(record.attachments, latest.current.fetchItem).then((items) => {
      if (keyRef.current !== draftKey) return [];
      pendingRestoreRef.current = [];
      const add = latest.current.onAddAttachments;
      const have = new Set((latest.current.attachments ?? []).map((att) => att.id));
      const fresh = items.filter((item) => !have.has(item.id));
      if (add && fresh.length) add(fresh);
      else {
        // Nothing came back (all gone): storage follows what is shown.
        const now = latest.current;
        writeComposerDraft(draftKey, now.value, now.onAddAttachments ? draftAttachmentsOf(now.attachments) : []);
      }
      return items;
    });
  }, [draftKey]);

  const applyRemote = useCallback((event: Extract<import("../lib/im/types").ImEvent, { type: "composer_draft" }>, allowOwn = false) => {
    if (!draftKey || event.key !== draftKey || (!allowOwn && event.device_id === deviceIdRef.current) || event.rev <= revRef.current) return;
    revRef.current = event.rev;
    const now = latest.current;
    if (event.text !== now.value) {
      const active = typeof document !== "undefined" ? document.activeElement : null;
      const editable = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active : null;
      const caret = editable && typeof editable.selectionStart === "number" ? editable.selectionStart : null;
      const nextCaret = caret === null ? null : preserveCaretAfterRemoteText(now.value, event.text, caret);
      now.onChange(event.text);
      if (editable && nextCaret !== null) {
        queueMicrotask(() => {
          if (document.activeElement !== editable) return;
          try { editable.setSelectionRange(nextCaret, nextCaret); } catch { /* non-text input */ }
        });
      }
    }
    remoteSignatureRef.current = JSON.stringify([event.text, event.attachments]);
    const remoteIds = new Set(event.attachments.map((item) => item.id));
    for (const item of now.attachments ?? []) {
      const ref = draftAttachmentsOf([item])[0];
      if (ref && !remoteIds.has(ref.id)) now.onRemoveAttachment?.(item.id);
    }
    if (now.onAddAttachments) {
      void rehydrateDraftAttachments(event.attachments, now.fetchItem).then((items) => {
        if (keyRef.current !== draftKey) return;
        const existing = new Set((latest.current.attachments ?? []).map((item) => item.id));
        const fresh = items.filter((item) => !existing.has(item.id));
        if (fresh.length) latest.current.onAddAttachments?.(fresh);
      });
    }
    // Attachments without Library refs (computer inbox files) are intentionally untouched.
  }, [draftKey]);
  useImEvent("composer_draft", applyRemote);

  const queuePut = useCallback((key: string, text: string, attachments: ComposerDraftAttachment[]) => {
    pendingPutRef.current = { text, attachments, ...(revRef.current ? { base_rev: revRef.current } : {}) };
    if (putTimerRef.current) clearTimeout(putTimerRef.current);
    putTimerRef.current = setTimeout(() => {
      putTimerRef.current = null;
      if (connectionRef.current !== "open") return;
      const body = pendingPutRef.current;
      if (!body) return;
      void putComposerDraft(key, { ...body, device_id: deviceIdRef.current }).then((result) => {
        revRef.current = Math.max(revRef.current, result.rev);
        if (pendingPutRef.current === body) pendingPutRef.current = null;
      }).catch(() => { /* retried on reconnect or next edit */ });
    }, 300);
  }, []);

  useEffect(() => {
    if (!draftKey || connection !== "open" || !pendingPutRef.current) return;
    const body = pendingPutRef.current;
    void putComposerDraft(draftKey, { ...body, device_id: deviceIdRef.current }).then((result) => {
      revRef.current = Math.max(revRef.current, result.rev);
      if (pendingPutRef.current === body) pendingPutRef.current = null;
    }).catch(() => {});
  }, [connection, draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    void getComposerDrafts([draftKey]).then(({ drafts }) => {
      const remote = drafts[0];
      if (!remote || remote.rev <= revRef.current) return;
      // A newer server copy wins over this tab's restored text (rev-guarded inside).
      applyRemote({ type: "composer_draft", ...serverRecord(remote), key: remote.key || draftKey, rev: remote.rev, device_id: remote.device_id, updated_at: remote.updated_at }, true);
    }).catch(() => {});
  }, [applyRemote, draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (lastSeenRef.current === null || lastSeenRef.current === signature) {
      lastSeenRef.current = signature;
      return;
    }
    lastSeenRef.current = signature;
    if (remoteSignatureRef.current === signature) {
      remoteSignatureRef.current = null;
      return;
    }
    if (submittedRef.current !== null) {
      if (submittedRef.current === signature) return;
      submittedRef.current = null;
    }
    const now = latest.current;
    const shown = now.onAddAttachments ? draftAttachmentsOf(now.attachments) : [];
    const pending = pendingRestoreRef.current.filter((item) => !shown.some((att) => att.id === item.id));
    writeComposerDraft(draftKey, now.value, [...shown, ...pending]);
    queuePut(draftKey, now.value, [...shown, ...pending]);
  }, [draftKey, signature]);

  // Sent and then unmounted unchanged (home → the task conversation): the draft is spent.
  useEffect(() => {
    if (!draftKey) return;
    return () => {
      if (submittedRef.current !== null) {
        clearComposerDraft(draftKey);
        const session = filesRef.current;
        if (session?.key === draftKey) void session.ready.then(() => { session.rows = []; void clearComposerDraftFiles(draftKey); });
      }
      submittedRef.current = null;
    };
  }, [draftKey]);

  const markSubmitted = useCallback(() => {
    if (keyRef.current) submittedRef.current = signatureRef.current;
    if (keyRef.current) queuePut(keyRef.current, "", []);
  }, [queuePut]);

  return { markSubmitted, attachFiles, fileNotice };
}
