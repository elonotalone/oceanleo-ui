// ============================================================================
// @oceanleo/ui — 宿主 doc 通道 adapter（陈列馆那条 readDoc/writeDoc/watchDoc）
// ----------------------------------------------------------------------------
// 陈列馆给插件的就是一个「路径 + 字符串」的哑通道：没有版本、没有 If-Match、
// 没有权限模型。插件因此长期把它当成「保存成功了」用，实际上换个宿主就可能
// 只写进了内存。这里把它包成标准 store，并且在 capabilities 里如实写下
// revisions/cas 都是 false——降级要说出口，别让插件替宿主吹牛。
//
// 宿主接口在本文件就地声明，不 import plugin-gallery：@oceanleo/ui 是被
// 陈列馆依赖的一方，反向依赖会成环，而且这套形状也不该只服务陈列馆一家。
// 结构上是 GalleryHostAdapter 的超集（watchDoc / log 放宽为可选），所以现成的
// GalleryHostAdapter 可以直接传进来。
// ============================================================================

import {
  asPluginStoreError,
  PluginStoreError,
  type PluginDocument,
  type PluginDocumentStore,
  type StoreCapabilities,
  type WriteOptions,
  type WriteReceipt,
} from "../types";

/** 宿主文档通道。可选成员缺席时由 capabilities 如实降级，不静默假装。 */
export interface PluginDocHost {
  readDoc(path: string): Promise<string>;
  writeDoc(path: string, content: string): Promise<void>;
  watchDoc?(path: string, onChange: () => void): () => void;
  log?(message: string): void;
}

export interface HostDocStoreOptions {
  host: PluginDocHost;
  path: string;
  /** 写回文档时带上的 MIME，仅作为 blob 的自述，宿主通道本身不认。 */
  mediaType?: string;
  now?: () => number;
}

export function createHostDocStore(
  options: HostDocStoreOptions,
): PluginDocumentStore {
  const { host, path } = options;
  const now = options.now ?? (() => Date.now());
  const capabilities: StoreCapabilities = {
    revisions: false,
    cas: false,
    multiFile: false,
    watch: typeof host.watchDoc === "function",
  };

  const note = (message: string): void => {
    try {
      host.log?.(message);
    } catch {
      // 宿主日志坏了不该连累一次正常的读写。
    }
  };

  return {
    capabilities,

    async read(): Promise<PluginDocument> {
      try {
        const content = await host.readDoc(path);
        return {
          kind: "blob",
          content: typeof content === "string" ? content : "",
          ...(options.mediaType ? { mediaType: options.mediaType } : {}),
        };
      } catch (error) {
        throw asPluginStoreError(error, "failed", `读取 ${path} 失败`);
      }
    },

    async write(
      doc: PluginDocument,
      opts: WriteOptions,
    ): Promise<WriteReceipt> {
      if (doc.kind !== "blob") {
        throw new PluginStoreError(
          "unavailable",
          `宿主 doc 通道只接受单文件文档，${path} 无法写入多文件源码树`,
        );
      }
      // 通道没有 If-Match。忽略 expectedRevision 等于把「乐观锁生效了」这个
      // 假象交给插件，冲突就会变成静默覆盖，所以在这里明确拒绝。
      if (opts.expectedRevision) {
        throw new PluginStoreError(
          "unavailable",
          `宿主 doc 通道不支持乐观锁，无法校验 expectedRevision（${path}）`,
          { expectedRevision: opts.expectedRevision },
        );
      }
      try {
        await host.writeDoc(path, doc.content);
      } catch (error) {
        throw asPluginStoreError(error, "failed", `写入 ${path} 失败`);
      }
      note(`plugin-store: wrote ${path} (${opts.reason})`);
      return { savedAt: now() };
    },

    watch(cb: () => void): () => void {
      const subscribe = host.watchDoc;
      if (!subscribe) return () => undefined;
      let unsubscribe: (() => void) | undefined;
      try {
        unsubscribe = subscribe.call(host, path, cb);
      } catch (error) {
        note(`plugin-store: watch ${path} unavailable (${String(error)})`);
        return () => undefined;
      }
      return () => {
        try {
          unsubscribe?.();
        } catch {
          // 退订失败只会多留一个回调，不值得把卸载流程炸掉。
        }
      };
    },
  };
}
