import { officeSourceCacheKey } from "./office-source-identity";
import { fetchMediaBlob } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";

export const OFFICE_SOURCE_CACHE_LIMIT = 4;
export const OFFICE_SOURCE_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const TOO_LARGE = "素材过大，无法在浏览器内存中安全处理";

export interface OfficeSourceCacheEntry {
  url: string;
  revision: string;
  bytes: ArrayBuffer;
  size: number;
  parsed: unknown;
  lastAccess: number;
}
export interface OfficeSourceLoadResult {
  url: string;
  revision: string;
  bytes: ArrayBuffer;
  parsed: unknown;
  fromCache: boolean;
  contentType?: string;
}
export interface OfficeSourceCacheHooks {
  fetchBytes?: (url: string, revision: string) => Promise<ArrayBuffer>;
  parse?: (bytes: ArrayBuffer, item?: LibraryItem | null) => unknown;
}
interface StoredSource extends OfficeSourceCacheEntry {
  contentType: string;
  kind: string | null;
  aliases: Set<string>;
}
const entries = new Map<string, StoredSource>();
const inflight = new Map<string, Promise<StoredSource>>();
let fetchCount = 0;
let parseCount = 0;
let hooks: OfficeSourceCacheHooks = {};


export function configureOfficeSourceCacheForTests(next: OfficeSourceCacheHooks = {}): void {
  hooks = next;
}
export function resetOfficeSourceCacheForTests(): void {
  entries.clear();
  inflight.clear();
  fetchCount = 0;
  parseCount = 0;
  hooks = {};
}
export function officeSourceCacheStats() {
  let bytes = 0;
  for (const entry of entries.values()) bytes += entry.size;
  return { size: entries.size, bytes, fetches: fetchCount, parses: parseCount };
}

function copyEntry(entry: StoredSource): OfficeSourceCacheEntry {
  return {
    url: entry.url, revision: entry.revision, size: entry.size,
    lastAccess: entry.lastAccess,
    bytes: entry.bytes.slice(0),
    parsed: structuredClone(entry.parsed),
  };
}
export function peekOfficeSource(url: string, revision: string): OfficeSourceCacheEntry | null {
  const alias = officeSourceCacheKey(url, revision);
  const entry = entries.get(alias) || [...entries.values()].find(e => e.aliases.has(alias));
  if (!entry) return null;
  entry.lastAccess = Date.now();
  return copyEntry(entry);
}
function rememberUrl(entry: StoredSource, url: string, revision: string) {
  // Compatibility for URL-only readers; keep re-signing metadata bounded too.
  entry.aliases.add(officeSourceCacheKey(url, revision));
  if (entry.aliases.size > 16) entry.aliases.delete(entry.aliases.values().next().value!);
}
function evictFor(incomingSize: number): void {
  while (entries.size && (entries.size >= OFFICE_SOURCE_CACHE_LIMIT ||
    officeSourceCacheStats().bytes + incomingSize > OFFICE_SOURCE_CACHE_MAX_BYTES)) {
    const overCount = entries.size >= OFFICE_SOURCE_CACHE_LIMIT;
    let victimKey = "";
    let victimScore = overCount ? Infinity : -1;
    for (const [key, entry] of entries) {
      if (overCount ? entry.lastAccess < victimScore : entry.size > victimScore) {
        victimScore = overCount ? entry.lastAccess : entry.size;
        victimKey = key;
      }
    }
    if (!victimKey) break;
    entries.delete(victimKey);
  }
}
async function loadMiss(
  key: string, url: string, revision: string, item: LibraryItem | null | undefined,
  options: OfficeByteLoadOptions,
): Promise<StoredSource> {
  const { kind, validate } = options;
  fetchCount++;
  // A component's AbortSignal never owns the shared transport.
  const blob = hooks.fetchBytes ? null : await fetchMediaBlob(url, {
    cache: "default", maxBytes: OFFICE_SOURCE_CACHE_MAX_BYTES,
  });
  const bytes = hooks.fetchBytes ? await hooks.fetchBytes(url, revision) : await blob!.arrayBuffer();
  if (bytes.byteLength > OFFICE_SOURCE_CACHE_MAX_BYTES) throw new Error(TOO_LARGE);
  const contentType = blob?.type || "";
  parseCount++;
  if (!hooks.parse) validate?.(new Uint8Array(bytes), contentType);
  // Hooks/parsers receive their own copy as well, including transferable buffers.
  const parsed = hooks.parse ? hooks.parse(bytes.slice(0), item) : kind ? { kind, byteLength: bytes.byteLength } : null;
  const entry: StoredSource = { url, revision, bytes, size: bytes.byteLength, parsed,
    lastAccess: Date.now(), contentType, kind, aliases: new Set() };
  rememberUrl(entry, url, revision);
  evictFor(entry.size);
  entries.set(key, entry);
  return entry;
}

function waitForConsumer<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export interface OfficeByteLoadOptions {
  signal?: AbortSignal;
  maxBytes?: number;
  kind: string | null;
  validate?: (bytes: Uint8Array, contentType: string) => void;
}

/** Shared storage only: callers own format detection and validation. */
export async function loadOfficeBytes(
  url: string,
  revision: string,
  item: LibraryItem | null | undefined,
  options: OfficeByteLoadOptions,
): Promise<OfficeSourceLoadResult> {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const key = officeSourceCacheKey(url, revision, item);
  const { kind, validate } = options;
  const cached = entries.get(key);
  let work = inflight.get(key);
  if (!cached && !work) {
    work = loadMiss(key, url, revision, item, options).finally(() => { inflight.delete(key); });
    inflight.set(key, work);
  }
  const entry = cached || await waitForConsumer(work!, options.signal);
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (entry.size > Math.min(options.maxBytes || OFFICE_SOURCE_CACHE_MAX_BYTES, OFFICE_SOURCE_CACHE_MAX_BYTES)) {
    throw new Error(TOO_LARGE);
  }
  if (kind && entry.kind !== kind) validate?.(new Uint8Array(entry.bytes), entry.contentType);
  entry.lastAccess = Date.now();
  rememberUrl(entry, url, revision);
  return { ...copyEntry(entry), url, revision, fromCache: Boolean(cached), contentType: entry.contentType };
}
