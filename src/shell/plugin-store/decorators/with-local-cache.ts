// ============================================================================
// @oceanleo/ui — localStorage 读穿缓存装饰器
// ----------------------------------------------------------------------------
// 现状是每件插件自己拼一个 key 往 localStorage 里塞草稿：图片编辑的
// `oceanleo:advanced:image-draft:v1:*`、设计画布的 `leo-design-*`……前者带命名
// 空间和版本号，后者两样都没有。没有版本号意味着换了 schema 的旧字节会被当成
// 新格式读回来；没有命名空间意味着清理时不敢批量删。这里把 key 规则收进一处：
// 统一前缀 + 版本号 + namespace + 文档键，并且读回来一律过 normalize，形状对不
// 上就当没有缓存。
//
// 读的顺序是先后端、后缓存，不是反过来：缓存的作用是「后端这会儿不在时还能把
// 编辑器打开」，不是替后端回答。拿缓存顶上的时候通过 onServedFromCache 说出去，
// 插件据此把 chrome 标成 local-only，而不是假装 clean。
//
// 与 with-recovery 的分工：这一层是可读的缓存（同步、体积受限、能被用户清掉），
// 那一层是崩溃后的草稿（异步、带过期、要用户确认才恢复）。两者可以叠。
// ============================================================================

import {
  asPluginStoreError,
  normalizePluginDocument,
  type PluginDocument,
  type PluginDocumentStore,
  type StoreCapabilities,
  type WriteOptions,
  type WriteReceipt,
} from "../types";

const CACHE_PREFIX = "oceanleo:plugin-store";
const CACHE_VERSION = "v1";
const DEFAULT_MAX_BYTES = 5_000_000;

/** window.localStorage 的最小子集，便于测试注入。 */
export interface PluginStoreLocalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WithLocalCacheOptions {
  /** 插件自己的命名空间，例如 image-draft / design-canvas。 */
  namespace: string;
  /** 文档标识（素材根 id 之类），与 namespace 一起构成缓存键。 */
  key: string;
  maxBytes?: number;
  storage?: PluginStoreLocalStorage;
  now?: () => number;
  /** 后端读失败、改用缓存兜底时触发。插件应据此提示「仅本地」。 */
  onServedFromCache?: (info: { savedAt: number; error: unknown }) => void;
}

export interface LocalCacheBackedStore extends PluginDocumentStore {
  readonly cacheKey: string;
  peekCache(): PluginDocument | null;
  clearCache(): void;
}

interface CacheEnvelope {
  schema: string;
  savedAt: number;
  doc: PluginDocument;
}

const ENVELOPE_SCHEMA = "oceanleo.plugin-store-cache.v1";

function boundedSegment(value: string): string {
  return value.replaceAll(/[\s:]+/g, "-").slice(0, 200);
}

export function pluginStoreCacheKey(namespace: string, key: string): string {
  return `${CACHE_PREFIX}:${CACHE_VERSION}:${boundedSegment(
    namespace,
  )}:${boundedSegment(key)}`;
}

function defaultStorage(): PluginStoreLocalStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Safari 的隐私模式会在访问 localStorage 时直接抛。
    return null;
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function withLocalCache(
  inner: PluginDocumentStore,
  options: WithLocalCacheOptions,
): LocalCacheBackedStore {
  const now = options.now ?? (() => Date.now());
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const capabilities: StoreCapabilities = inner.capabilities;
  const cacheKey = pluginStoreCacheKey(options.namespace, options.key);
  const storage = options.storage ?? defaultStorage();

  const readEnvelope = (): CacheEnvelope | null => {
    if (!storage) return null;
    let raw: string | null = null;
    try {
      raw = storage.getItem(cacheKey);
    } catch {
      return null;
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.schema !== ENVELOPE_SCHEMA) return null;
    const doc = normalizePluginDocument(record.doc);
    if (!doc) return null;
    return {
      schema: ENVELOPE_SCHEMA,
      savedAt:
        typeof record.savedAt === "number" && Number.isFinite(record.savedAt)
          ? record.savedAt
          : 0,
      doc,
    };
  };

  const writeEnvelope = (doc: PluginDocument): void => {
    if (!storage) return;
    try {
      const envelope: CacheEnvelope = {
        schema: ENVELOPE_SCHEMA,
        savedAt: now(),
        doc,
      };
      const encoded = JSON.stringify(envelope);
      // 超限就把旧的删掉而不是留着：留下的会是一份比编辑器更旧的字节，
      // 下次降级读取时它会伪装成「刚才的内容」。
      if (byteLength(encoded) > maxBytes) {
        storage.removeItem(cacheKey);
        return;
      }
      storage.setItem(cacheKey, encoded);
    } catch {
      // 配额满 / 隐私模式。缓存是尽力而为，不能影响真正的读写。
    }
  };

  const clearCache = (): void => {
    if (!storage) return;
    try {
      storage.removeItem(cacheKey);
    } catch {
      // 同上。
    }
  };

  return {
    capabilities,

    cacheKey,

    peekCache: () => readEnvelope()?.doc ?? null,

    clearCache,

    watch: (cb: () => void) => inner.watch(cb),

    async read(): Promise<PluginDocument> {
      try {
        const doc = await inner.read();
        writeEnvelope(doc);
        return doc;
      } catch (error) {
        const cached = readEnvelope();
        if (!cached) throw asPluginStoreError(error, "failed");
        options.onServedFromCache?.({ savedAt: cached.savedAt, error });
        return cached.doc;
      }
    },

    async write(
      doc: PluginDocument,
      opts: WriteOptions,
    ): Promise<WriteReceipt> {
      // 先落缓存再写后端：后端失败时缓存里留着的正是用户最新的内容，
      // 这也是「离线还能接着编辑」唯一成立的顺序。
      writeEnvelope(doc);
      const receipt = await inner.write(doc, opts);
      writeEnvelope(
        receipt.revisionId ? { ...doc, revisionId: receipt.revisionId } : doc,
      );
      return receipt;
    },
  };
}
