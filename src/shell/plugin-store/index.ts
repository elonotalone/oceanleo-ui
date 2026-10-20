// 插件文档存储契约的对外入口。13 件插件一律从这里取，不要深引子模块。
//
// 典型装配（能力从内往外叠，顺序即语义）：
//   withLocalCache(withRecovery(createHostDocStore({ host, path }), …), …)
// 内层决定字节最终去哪，外层只负责「崩了还在」和「后端不在也能开」。

export {
  PluginStoreError,
  asPluginStoreError,
  blobDocument,
  isBlobDocument,
  isPluginStoreError,
  isTreeDocument,
  normalizePluginDocument,
  treeDocument,
  type PluginBlobDocument,
  type PluginDocument,
  type PluginDocumentFile,
  type PluginDocumentStore,
  type PluginStoreDisposition,
  type PluginStoreErrorOptions,
  type PluginTreeDocument,
  type StoreCapabilities,
  type WriteOptions,
  type WriteReceipt,
} from "./types";

export {
  createHostDocStore,
  type HostDocStoreOptions,
  type PluginDocHost,
} from "./adapters/host-doc-store";

export {
  createMemoryStore,
  type MemoryDocumentStore,
  type MemoryStoreOptions,
} from "./adapters/memory-store";

export {
  withRecovery,
  type PluginRecoveredDraft,
  type RecoveryBackedStore,
  type WithRecoveryOptions,
} from "./decorators/with-recovery";

export {
  pluginStoreCacheKey,
  withLocalCache,
  type LocalCacheBackedStore,
  type PluginStoreLocalStorage,
  type WithLocalCacheOptions,
} from "./decorators/with-local-cache";
