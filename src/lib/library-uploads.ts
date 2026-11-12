"use client";

/** Owner-only Library sessions. Storage requests carry signed URLs, never account credentials. */
import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import { deriveUploadIdentity } from "./upload/chunked";

import { readAdvancedRecovery, writeAdvancedRecovery, deleteAdvancedRecovery } from "../shell/advanced-recovery-store";
import type { FileItem } from "./database";

export const LIBRARY_UPLOAD_EVENT = "oceanleo:library-upload";
export type UploadState = "queued" | "uploading" | "paused" | "waiting" | "failed" | "complete";
export interface UploadPart { partNumber: number; url: string; headers?: Record<string, string> }
export interface UploadSession {
  uploadId: string;
  method: string;
  partSize: number;
  parts?: UploadPart[] | number[];
  offset?: number;
  status?: string;
  result?: { file?: FileItem; folderId?: string };
  url?: string;
  headers?: Record<string, string>;
  uploadedParts?: { partNumber: number; etag?: string }[];
  expiresAt?: string;
}
export interface LibraryUploadOptions {
  folderId?: string;
  path?: string;
  projectId?: string;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}
export interface PendingLibraryUpload {
  key: string;
  uploadId: string;
  name: string;
  size: number;
  loaded: number;
  state: UploadState;
  error?: string;
  folderId?: string;
  /** False if the browser could not keep local bytes; the file can still be reselected. */
  persisted: boolean;
}
interface SavedUpload extends PendingLibraryUpload {
  file: File;
  lastModified: number;
  options: Pick<LibraryUploadOptions, "folderId" | "path" | "projectId">;
}
export class LibraryUploadError extends Error {
  // Explicit fields (no TypeScript parameter properties): the node test loader strips types only.
  status: number;
  retryable: boolean;
  constructor(message: string, status = 0, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export function libraryUploadError(status: number, body: unknown): LibraryUploadError {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const detail = record.detail && typeof record.detail === "object" ? record.detail as Record<string, unknown> : record;
  const error = detail.error && typeof detail.error === "object" ? detail.error as Record<string, unknown> : detail;
  const numbersRecord = detail.details && typeof detail.details === "object" ? detail.details as Record<string, unknown> : detail;
  const used = numbersRecord.usedBytes ?? numbersRecord.used_bytes;
  const quota = numbersRecord.quotaBytes ?? numbersRecord.quota_bytes ?? numbersRecord.limit_bytes;
  const requested = numbersRecord.requestedBytes ?? numbersRecord.requested_bytes;
  if (status === 413 || detail.code === "quota_exceeded" || detail.code === "storage_quota_exceeded") {
    const numbers = [used != null ? `已用 ${used} B` : "", quota != null ? `总量 ${quota} B` : "", requested != null ? `本次 ${requested} B` : ""].filter(Boolean).join("，");
    return new LibraryUploadError(`${typeof error.message === "string" ? error.message : "存储空间不足"}${numbers ? `（${numbers}）` : ""}`, status);
  }
  return new LibraryUploadError(typeof record.detail === "string" ? record.detail : typeof error.message === "string" ? error.message : status === 401 ? "请先登录" : "上传失败，请重试", status, status === 0 || status >= 500);
}

export async function libraryRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = await accessToken();
  if (!token) throw new LibraryUploadError("请先登录", 401);
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Accept-Language": typeof document === "undefined" ? "zh" : document.documentElement.lang || "zh", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new LibraryUploadError("连接中断，请稍后重试", 0, true);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw libraryUploadError(response.status, data);
  if (!data || typeof data !== "object") throw new LibraryUploadError("服务返回的内容无法识别", response.status);
  return data as T;
}

const active = new Map<string, AbortController>();
const memory = new Map<string, SavedUpload>();
const byteCopies = new Set<string>();

async function ownerScope(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new LibraryUploadError("请先登录", 401);
  // No token or signed URL is persisted. Hashing also scopes opaque access tokens.
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token.split(".").length === 3 ? token.split(".")[1] : token));
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.sub === "string" && payload.sub) return encodeURIComponent(payload.sub);
  } catch { /* opaque test/development token */ }
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function indexKey(scope: string) { return `library-upload-index:${scope}`; }
function index(scope: string): string[] {
  try { return JSON.parse(localStorage.getItem(indexKey(scope)) || "[]"); } catch { return []; }
}
function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_UPLOAD_EVENT));
}
async function save(record: SavedUpload, scope: string) {
  memory.set(record.key, record);
  try {
    // Keep one Blob per upload, not a second multi-gigabyte copy on each chunk.
    if (!record.persisted && !byteCopies.has(record.key)) {
      await writeAdvancedRecovery({ key: `${record.key}:file`, editorId: "library-upload-bytes", revision: record.lastModified, updatedAt: Date.now(), payload: record.file });
      byteCopies.add(record.key);
    }
    record.persisted = true;
    await writeAdvancedRecovery({ key: record.key, editorId: "library-upload", revision: record.uploadId, updatedAt: Date.now(), payload: { ...record, file: undefined } });
    const keys = new Set(index(scope)); keys.add(record.key);
    localStorage.setItem(indexKey(scope), JSON.stringify([...keys]));
    record.persisted = true;
  } catch { record.persisted = false; }
  announce();
}
export async function pendingLibraryUploads(): Promise<PendingLibraryUpload[]> {
  const scope = await ownerScope();
  const prefix = `library-upload:${scope}:`;
  const rows = new Map([...memory].filter(([key]) => key.startsWith(prefix)));
  for (const key of index(scope)) {
    if (!key.startsWith(prefix) || rows.has(key)) continue;
    const saved = await readAdvancedRecovery(key).catch(() => null);
    if (saved?.payload) rows.set(key, saved.payload as SavedUpload);
  }
  return [...rows.values()].filter((row) => row.state !== "complete").map(({ file: _file, options, ...row }) => ({ ...row, folderId: options?.folderId }));
}
export function pauseLibraryUpload(key: string) { active.get(key)?.abort(); }
export async function discardLibraryUpload(key: string) {
  const scope = await ownerScope();
  if (!key.startsWith(`library-upload:${scope}:`)) return;
  active.get(key)?.abort(); memory.delete(key); byteCopies.delete(key);
  await deleteAdvancedRecovery(key).catch(() => undefined);
  await deleteAdvancedRecovery(`${key}:file`).catch(() => undefined);
  try { localStorage.setItem(indexKey(scope), JSON.stringify(index(scope).filter((item) => item !== key))); } catch { /* browser storage disabled */ }
  announce();
}

async function storageRequest(part: UploadPart, blob: Blob, signal: AbortSignal, onProgress: (loaded: number) => void, method: "PUT" | "PATCH" = "PUT"): Promise<string> {
  // Signed storage grants never receive account cookies or account Bearer tokens.
  if (typeof XMLHttpRequest !== "undefined") {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      const finish = () => signal.removeEventListener("abort", abort);
      xhr.open(method, part.url, true);
      xhr.withCredentials = false;
      xhr.timeout = 120_000;
      for (const [name, value] of Object.entries(part.headers || {})) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => onProgress(event.loaded);
      xhr.onload = () => { finish(); if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader("ETag") || ""); else reject(new LibraryUploadError(`文件传输失败（${xhr.status}）`, xhr.status, xhr.status >= 500 || [401, 403, 408, 409, 429].includes(xhr.status))); };
      xhr.onerror = xhr.ontimeout = () => { finish(); reject(new LibraryUploadError("连接中断，网络恢复后会继续上传", 0, true)); };
      xhr.onabort = () => { finish(); reject(new DOMException("Paused", "AbortError")); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { finish(); reject(new DOMException("Paused", "AbortError")); return; }
      xhr.send(blob);
    });
  }
  const response = await fetch(part.url, { method, body: blob, headers: part.headers, signal, credentials: "omit" });
  if (!response.ok) throw new LibraryUploadError(`文件传输失败（${response.status}）`, response.status, response.status >= 500 || [401, 403, 408, 409, 429].includes(response.status));
  onProgress(blob.size);
  return response.headers.get("ETag") || "";
}

async function sendTus(session: UploadSession, file: File, record: SavedUpload, scope: string, signal: AbortSignal, options: LibraryUploadOptions) {
  let current = session;
  let failures = 0;
  while ((current.offset || 0) < file.size) {
    if (signal.aborted) throw new DOMException("Paused", "AbortError");
    const start = current.offset || 0;
    if (!current.url || start < 0 || start > file.size || !current.partSize) throw new LibraryUploadError("上传会话无法识别，请重试");
    const bytes = file.slice(start, Math.min(start + current.partSize, file.size));
    try {
      await storageRequest({ partNumber: 0, url: current.url, headers: { ...current.headers, "Tus-Resumable": "1.0.0", "Upload-Offset": String(start), "Content-Type": "application/offset+octet-stream" } }, bytes, signal, (loaded) => { record.loaded = start + loaded; options.onProgress?.(record.loaded, file.size); announce(); }, "PATCH");
      current.offset = start + bytes.size;
      record.loaded = current.offset;
      record.state = "uploading";
      failures = 0;
      await save(record, scope);
    } catch (error) {
      if (signal.aborted || failures++ >= 2 || error instanceof LibraryUploadError && !error.retryable) throw error;
      record.state = "waiting"; announce();
      await new Promise<void>((resolve) => setTimeout(resolve, 500 * failures));
      // A failed PATCH may already have reached storage. The server reads the
      // actual offset and refreshes the grant before any bytes are retried.
      current = await libraryRequest<UploadSession>(`/v1/library/uploads/${encodeURIComponent(record.uploadId)}`, undefined, signal);
    }
  }
}

export async function uploadLibraryFile(file: File, options: LibraryUploadOptions = {}): Promise<FileItem> {
  if (options.signal?.aborted) throw new LibraryUploadError("上传已暂停");
  const scope = await ownerScope();
  const identity = await deriveUploadIdentity(file, { filename: file.name, contentType: file.type, siteId: `${options.folderId || ""}:${options.path || ""}:${options.projectId || ""}`, registerAsset: true });
  const key = `library-upload:${scope}:${identity.idempotencyKey}`;
  if (active.has(key)) throw new LibraryUploadError("这个文件正在上传");
  const finished = await readAdvancedRecovery(`${key}:complete`).catch(() => null);
  if (finished?.payload) {
    options.onProgress?.(file.size, file.size);
    return finished.payload as FileItem;
  }
  const stored = await readAdvancedRecovery(key).catch(() => null);
  const prior = memory.get(key) || stored?.payload as SavedUpload | undefined;
  // Cache reads yield; another caller may have claimed this file meanwhile.
  if (active.has(key)) throw new LibraryUploadError("这个文件正在上传");
  const record: SavedUpload = prior || { key, uploadId: "", name: file.name, size: file.size, loaded: 0, state: "uploading", persisted: false, file, lastModified: file.lastModified, options: { folderId: options.folderId, path: options.path, projectId: options.projectId } };
  record.file = file; record.state = "uploading"; record.error = undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  active.set(key, controller);
  const signal = controller.signal;
  try {
    await save(record, scope);
    let session: UploadSession;
    if (record.uploadId) {
      try {
        session = await libraryRequest<UploadSession>(`/v1/library/uploads/${encodeURIComponent(record.uploadId)}`, undefined, signal);
      } catch (error) {
        if (!(error instanceof LibraryUploadError) || ![404, 410].includes(error.status)) throw error;
        record.uploadId = "";
        record.loaded = 0;
        session = await libraryRequest<UploadSession>("/v1/library/uploads", { filename: file.name, size: file.size, contentType: file.type || "application/octet-stream", ...record.options }, signal);
        record.uploadId = session.uploadId;
      }
    } else {
      session = await libraryRequest<UploadSession>("/v1/library/uploads", { filename: file.name, size: file.size, contentType: file.type || "application/octet-stream", ...record.options }, signal);
      record.uploadId = session.uploadId;
    }
    if (!session.uploadId || typeof session.method !== "string") throw new LibraryUploadError("上传未返回会话编号，请重试");
    await save(record, scope);
    let completeBody: unknown = {};
    if (session.method.toLowerCase() === "tus") {
      record.loaded = session.offset || 0;
      options.onProgress?.(record.loaded, file.size);
      await sendTus(session, file, record, scope, signal, options);
    } else {
      const completed = new Map((session.uploadedParts || []).map((part) => [part.partNumber, part.etag || ""]));
      const parts = session.parts as UploadPart[] | undefined || (session.url ? [{ partNumber: 1, url: session.url, headers: session.headers }] : []);
      const partSize = session.partSize || file.size || 1;
      const count = Math.max(1, Math.ceil(file.size / partSize));
      record.loaded = [...completed.keys()].reduce((sum, n) => sum + Math.min(partSize, Math.max(0, file.size - (n - 1) * partSize)), 0);
      options.onProgress?.(record.loaded, file.size);
      announce();
      for (const part of parts) {
        if (completed.has(part.partNumber)) continue;
        if (signal.aborted) throw new DOMException("Paused", "AbortError");
        const start = (part.partNumber - 1) * partSize;
        const bytes = file.slice(start, Math.min(start + partSize, file.size));
        const baseline = record.loaded;
        let etag = "";
        for (let attempt = 0;;attempt++) {
          try {
            etag = await storageRequest(part, bytes, signal, (loaded) => { record.loaded = baseline + loaded; options.onProgress?.(record.loaded, file.size); announce(); });
            break;
          } catch (error) {
            if (signal.aborted || attempt >= 2 || error instanceof LibraryUploadError && !error.retryable) throw error;
            record.state = "waiting"; announce();
            await new Promise<void>((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
            record.state = "uploading";
          }
        }
        completed.set(part.partNumber, etag);
        record.loaded = baseline + bytes.size;
        await save(record, scope);
      }
      if (completed.size !== count) throw new LibraryUploadError("上传分片不完整，请继续上传", 0, true);
      completeBody = { parts: [...completed].map(([partNumber, etag]) => ({ partNumber, etag })) };
    }
    const result = await libraryRequest<{ file?: FileItem; item?: FileItem; folderId?: string } & Partial<FileItem>>(`/v1/library/uploads/${encodeURIComponent(session.uploadId)}/complete`, completeBody, signal);
    let uploaded = result.file || result.item || result as FileItem;
    if (result.folderId && !options.folderId) {
      const folderResult = await libraryRequest<{ folder: import("../shell/skills/kit/types").Folder }>(`/v1/folders/${encodeURIComponent(result.folderId)}`);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("oceanleo:library-folders-change", { detail: { folder: folderResult.folder } }));
      uploaded = { ...uploaded, id: result.folderId, title: file.name, url: "", meta: { ...uploaded.meta, library_folder_id: result.folderId } };
    }
    if (!uploaded.id && !uploaded.artifact_id && !result.folderId && !options.folderId) throw new LibraryUploadError("上传未返回文件编号，请重试");
    record.state = "complete";
    // A composer tile may retry after the Library finished its resumed session.
    // Keep only the returned identity, never another copy of the file bytes.
    await writeAdvancedRecovery({ key: `${key}:complete`, editorId: "library-upload-result", revision: record.uploadId, updatedAt: Date.now(), payload: uploaded }).catch(() => undefined);
    await discardLibraryUpload(key);
    return uploaded;
  } catch (error) {
    record.state = signal.aborted ? "paused" : error instanceof LibraryUploadError && !error.retryable ? "failed" : "waiting";
    record.error = signal.aborted ? "上传已暂停" : error instanceof LibraryUploadError ? error.message : "连接中断，网络恢复后会继续上传";
    await save(record, scope);
    if (signal.aborted) throw new LibraryUploadError(record.error);
    throw error instanceof LibraryUploadError ? error : new LibraryUploadError(record.error, 0, true);
  } finally {
    options.signal?.removeEventListener("abort", abort);
    active.delete(key);
  }
}
export async function queueLibraryFile(file: File, options: LibraryUploadOptions): Promise<void> {
  const scope = await ownerScope();
  const identity = await deriveUploadIdentity(file, { filename: file.name, contentType: file.type, siteId: `${options.folderId || ""}:${options.path || ""}:${options.projectId || ""}`, registerAsset: true });
  const key = `library-upload:${scope}:${identity.idempotencyKey}`;
  await save({ key, uploadId: "", name: file.name, size: file.size, loaded: 0, state: "queued", persisted: false, file, lastModified: file.lastModified, options: { folderId: options.folderId, path: options.path, projectId: options.projectId } }, scope);
}
export async function resumeLibraryUpload(key: string): Promise<FileItem | undefined> {
  const scope = await ownerScope();
  if (!key.startsWith(`library-upload:${scope}:`) || active.has(key)) return;
  const saved = memory.get(key) || (await readAdvancedRecovery(key).catch(() => null))?.payload as SavedUpload | undefined;
  if (saved && !saved.file) saved.file = (await readAdvancedRecovery(`${key}:file`).catch(() => null))?.payload as File;
  if (!saved?.file) throw new LibraryUploadError("请重新选择原文件以继续上传");
  // IndexedDB may restore File as Blob in older browsers.
  const file = new File([saved.file], saved.name, { type: saved.file.type, lastModified: saved.lastModified });
  return uploadLibraryFile(file, saved.options);
}

export async function createLibraryFolder(title: string, projectId?: string) {
  const result = await libraryRequest<{ folder: import("../shell/skills/kit/types").Folder }>("/v1/folders", { title, ...(projectId ? { projectId } : {}) });
  return result.folder;
}
