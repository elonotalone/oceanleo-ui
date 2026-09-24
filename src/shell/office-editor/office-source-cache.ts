import {
  officePackageKindForItem,
  validateOfficePackageBytes,
  type OfficePackageKind,
} from "../doc-editors/office-file";
import type { LibraryItem } from "../library-data";

export const OFFICE_SOURCE_CACHE_LIMIT = 4;
export const OFFICE_SOURCE_CACHE_MAX_BYTES = 64 * 1024 * 1024;

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
}

export interface OfficeSourceCacheHooks {
  fetchBytes?: (url: string, revision: string) => Promise<ArrayBuffer>;
  parse?: (bytes: ArrayBuffer, item?: LibraryItem | null) => unknown;
}

const entries = new Map<string, OfficeSourceCacheEntry>();
const inflight = new Map<string, Promise<OfficeSourceLoadResult>>();
let fetchCount = 0;
let parseCount = 0;
let hooks: OfficeSourceCacheHooks = {};

export function officeSourceCacheKey(url: string, revision: string): string {
  return `${url}::${revision}`;
}

export function sourceHintForItem(item: LibraryItem): {
  url: string;
  revision: string;
} {
  const renditions = item.artifact?.renditions;
  const url =
    item.url ||
    renditions?.source?.url ||
    renditions?.full?.url ||
    item.previewUrl ||
    "";
  const revision = item.revisionId || item.artifact?.revisionId || "";
  return { url, revision };
}

export function configureOfficeSourceCacheForTests(
  next: OfficeSourceCacheHooks = {},
): void {
  hooks = next;
}

export function resetOfficeSourceCacheForTests(): void {
  entries.clear();
  inflight.clear();
  fetchCount = 0;
  parseCount = 0;
  hooks = {};
}

export function officeSourceCacheStats(): {
  size: number;
  bytes: number;
  fetches: number;
  parses: number;
} {
  let bytes = 0;
  for (const entry of entries.values()) bytes += entry.size;
  return { size: entries.size, bytes, fetches: fetchCount, parses: parseCount };
}

export function peekOfficeSource(
  url: string,
  revision: string,
): OfficeSourceCacheEntry | null {
  const entry = entries.get(officeSourceCacheKey(url, revision));
  if (!entry) return null;
  entry.lastAccess = Date.now();
  return entry;
}

function totalBytes(): number {
  let bytes = 0;
  for (const entry of entries.values()) bytes += entry.size;
  return bytes;
}

function evictFor(incomingSize: number): void {
  while (
    entries.size > 0 &&
    (entries.size >= OFFICE_SOURCE_CACHE_LIMIT ||
      totalBytes() + incomingSize > OFFICE_SOURCE_CACHE_MAX_BYTES)
  ) {
    const overCount = entries.size >= OFFICE_SOURCE_CACHE_LIMIT;
    let victimKey = "";
    let victimScore = overCount ? Number.POSITIVE_INFINITY : -1;
    for (const [key, entry] of entries) {
      if (overCount) {
        if (entry.lastAccess < victimScore) {
          victimScore = entry.lastAccess;
          victimKey = key;
        }
      } else if (entry.size > victimScore) {
        victimScore = entry.size;
        victimKey = key;
      }
    }
    if (!victimKey) break;
    entries.delete(victimKey);
  }
}

function defaultParse(bytes: ArrayBuffer, item?: LibraryItem | null): unknown {
  const kind: OfficePackageKind | null = item
    ? officePackageKindForItem(item)
    : null;
  if (!kind) return bytes;
  validateOfficePackageBytes(new Uint8Array(bytes), kind);
  return { kind, byteLength: bytes.byteLength };
}

async function defaultFetch(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: "default" });
  if (!response.ok) {
    throw new Error(`office source HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

async function loadMiss(
  url: string,
  revision: string,
  item?: LibraryItem | null,
): Promise<OfficeSourceLoadResult> {
  fetchCount += 1;
  const bytes = hooks.fetchBytes
    ? await hooks.fetchBytes(url, revision)
    : await defaultFetch(url);
  parseCount += 1;
  const parsed = hooks.parse
    ? hooks.parse(bytes, item)
    : defaultParse(bytes, item);
  const size = bytes.byteLength;
  evictFor(size);
  const entry: OfficeSourceCacheEntry = {
    url,
    revision,
    bytes,
    size,
    parsed,
    lastAccess: Date.now(),
  };
  entries.set(officeSourceCacheKey(url, revision), entry);
  return { url, revision, bytes, parsed, fromCache: false };
}

export async function loadOfficeSource(
  url: string,
  revision: string,
  item?: LibraryItem | null,
): Promise<OfficeSourceLoadResult> {
  const key = officeSourceCacheKey(url, revision);
  const cached = entries.get(key);
  if (cached) {
    cached.lastAccess = Date.now();
    return {
      url: cached.url,
      revision: cached.revision,
      bytes: cached.bytes,
      parsed: cached.parsed,
      fromCache: true,
    };
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const work = loadMiss(url, revision, item).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, work);
  return work;
}

export function prefetchOfficeSource(
  item: LibraryItem,
): Promise<OfficeSourceLoadResult | null> {
  const { url, revision } = sourceHintForItem(item);
  if (!url) return Promise.resolve(null);
  return loadOfficeSource(url, revision, item);
}
