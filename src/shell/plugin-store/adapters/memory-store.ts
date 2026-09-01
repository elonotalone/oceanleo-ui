// ============================================================================
// @oceanleo/ui — 内存 store（测试与产品 double）
// ----------------------------------------------------------------------------
// 存在的理由有两个，都不是「省事」：
//   1. 契约测试需要一个能确定性地制造冲突的后端。artifact CAS 的 409 只在真
//      后端上偶发，装饰器与 AdvancedPersistenceController 的冲突分支过去因此
//      几乎没被覆盖过。这里的 cas 开关让 conflict 变成可点名复现的一行断言。
//   2. 演示 / 空白草稿态需要一个不写盘的承载，插件不该为此各写一份假实现。
//
// 默认把四项能力全开，即「最宽松的后端」；要验降级路径就显式关掉某一项，
// 让插件在测试里就撞上 unavailable，而不是上线后才撞。
// ============================================================================

import {
  PluginStoreError,
  type PluginDocument,
  type PluginDocumentStore,
  type StoreCapabilities,
  type WriteOptions,
  type WriteReceipt,
} from "../types";

export interface MemoryStoreOptions {
  initial?: PluginDocument;
  capabilities?: Partial<StoreCapabilities>;
  now?: () => number;
  /** 下一个版本号；默认单调自增的 `mem-1`、`mem-2`…… */
  nextRevisionId?: (previous: string | undefined, sequence: number) => string;
}

export interface MemoryDocumentStore extends PluginDocumentStore {
  /** 不走 read() 直接看当前值，供断言使用。 */
  peek(): PluginDocument;
  /** 绕过契约直接改后端状态，用来伪造「别人改了」。 */
  poke(doc: PluginDocument): void;
  /** 让下一次 read/write 抛出指定错误，用来演练 unavailable / denied 分支。 */
  failNext(error: PluginStoreError): void;
}

const EMPTY_DOCUMENT: PluginDocument = { kind: "blob", content: "" };

export function createMemoryStore(
  options: MemoryStoreOptions = {},
): MemoryDocumentStore {
  const now = options.now ?? (() => Date.now());
  const nextRevisionId =
    options.nextRevisionId ?? ((_previous, sequence) => `mem-${sequence}`);
  const capabilities: StoreCapabilities = {
    revisions: true,
    cas: true,
    multiFile: true,
    watch: true,
    ...options.capabilities,
  };

  let current: PluginDocument = options.initial ?? EMPTY_DOCUMENT;
  let sequence = 0;
  let pendingFailure: PluginStoreError | null = null;
  const listeners = new Set<() => void>();

  const takeFailure = (): void => {
    const failure = pendingFailure;
    pendingFailure = null;
    if (failure) throw failure;
  };

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // 一个订阅者炸了不该让其余订阅者收不到同一次变更。
      }
    }
  };

  return {
    capabilities,

    peek: () => current,

    poke(doc: PluginDocument): void {
      current = doc;
      notify();
    },

    failNext(error: PluginStoreError): void {
      pendingFailure = error;
    },

    async read(): Promise<PluginDocument> {
      takeFailure();
      return current;
    },

    async write(
      doc: PluginDocument,
      opts: WriteOptions,
    ): Promise<WriteReceipt> {
      takeFailure();
      if (doc.kind === "tree" && !capabilities.multiFile) {
        throw new PluginStoreError(
          "unavailable",
          "该 store 未声明 multiFile，不接受多文件源码树",
        );
      }
      if (opts.expectedRevision && !capabilities.cas) {
        throw new PluginStoreError(
          "unavailable",
          "该 store 未声明 cas，无法校验 expectedRevision",
          { expectedRevision: opts.expectedRevision },
        );
      }
      if (
        capabilities.cas &&
        opts.expectedRevision &&
        opts.expectedRevision !== current.revisionId
      ) {
        throw new PluginStoreError(
          "conflict",
          "文档已被其他写入推进，本次提交的基线版本已过期",
          {
            expectedRevision: opts.expectedRevision,
            actualRevision: current.revisionId,
          },
        );
      }
      const savedAt = now();
      sequence += 1;
      const revisionId = capabilities.revisions
        ? nextRevisionId(current.revisionId, sequence)
        : undefined;
      current = { ...doc, revisionId, updatedAt: savedAt };
      notify();
      return { savedAt, ...(revisionId ? { revisionId } : {}) };
    },

    watch(cb: () => void): () => void {
      if (!capabilities.watch) return () => undefined;
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
