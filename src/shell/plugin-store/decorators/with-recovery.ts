// ============================================================================
// @oceanleo/ui — 崩溃恢复装饰器（IndexedDB 草稿镜像）
// ----------------------------------------------------------------------------
// 崩溃恢复过去被当成「某几件插件的功能」写在编辑器里，结果是 10 件共享插件有，
// 设计画布 / 网站编辑 / 视频画布三个 extracted 包没有——同样是浏览器崩在
// AdvancedPersistenceController 的 1600ms 去抖窗口里，前者能捞回来，后者一句
// 不剩。恢复其实与后端无关：它只关心「有没有一份还没落盘的字节」，所以是能套
// 在任意 store 外面的装饰器，而不是第八条存储路。
//
// 与去抖窗口的配合：write() 之前先镜像、成功之后才删，中间任何一步崩掉，草稿
// 都还在；更早的键入级改动由 noteDirty() 主动镜像，不必等到 write 才有保护。
//
// 底层直接复用 advanced-recovery-store.ts（DB oceanleo-advanced-recovery /
// store drafts）：它已经有按 key 串行的写队列、7 天过期与打不开库时的失败路径，
// 再写第二套 IndexedDB 只会多出一份要同步维护的过期策略。
// ============================================================================

import {
  deleteAdvancedRecovery,
  readAdvancedRecovery,
  writeAdvancedRecovery,
} from "../../advanced-recovery-store";
import {
  normalizePluginDocument,
  type PluginDocument,
  type PluginDocumentStore,
  type StoreCapabilities,
  type WriteOptions,
  type WriteReceipt,
} from "../types";

const DRAFT_SCHEMA = "oceanleo.plugin-store-draft.v1";

export interface WithRecoveryOptions {
  /** 写进恢复记录的编辑器标识，和插件 id 一致。 */
  editorId: string;
  /**
   * 恢复记录主键。持有 LibraryItem 的调用方请用 advancedRecoveryKey(editorId, item)
   * 生成，保证与既有草稿同键；没有 LibraryItem 的插件自己拼一个稳定串即可。
   */
  recoveryKey: string;
  now?: () => number;
  /** 草稿层出错只上报、不阻断真正的保存。默认静默。 */
  onRecoveryError?: (error: unknown, phase: "mirror" | "clear" | "read") => void;
}

export interface PluginRecoveredDraft {
  doc: PluginDocument;
  updatedAt: number;
  reason: string;
  /** 镜像时这份草稿基于的后端版本；为空表示当时没有版本可依。 */
  baseRevision: string;
}

export interface RecoveryBackedStore extends PluginDocumentStore {
  /**
   * 编辑器变脏但还没到 write 的时刻主动镜像一次。
   * 不会触碰后端，也不会改变 dirty 语义。
   */
  noteDirty(doc: PluginDocument, reason?: string): Promise<void>;
  /**
   * 读回上次未落盘的草稿。
   * 刻意不在 read() 里自动顶替后端内容：恢复是要用户确认的动作，静默用草稿覆盖
   * 服务端 head 就是另一种形式的丢数据。
   */
  readRecoveredDraft(): Promise<PluginRecoveredDraft | null>;
  discardRecoveredDraft(): Promise<void>;
}

interface DraftPayload {
  schema: typeof DRAFT_SCHEMA;
  reason: string;
  doc: PluginDocument;
}

export function withRecovery(
  inner: PluginDocumentStore,
  options: WithRecoveryOptions,
): RecoveryBackedStore {
  const now = options.now ?? (() => Date.now());
  const capabilities: StoreCapabilities = inner.capabilities;
  let mirrorSequence = 0;

  const report = (
    error: unknown,
    phase: "mirror" | "clear" | "read",
  ): void => {
    try {
      options.onRecoveryError?.(error, phase);
    } catch {
      // 上报回调自身出错不该反过来打断保存链路。
    }
  };

  const mirror = async (
    doc: PluginDocument,
    reason: string,
    baseRevision: string | undefined,
  ): Promise<void> => {
    mirrorSequence += 1;
    const payload: DraftPayload = { schema: DRAFT_SCHEMA, reason, doc };
    try {
      await writeAdvancedRecovery({
        key: options.recoveryKey,
        editorId: options.editorId,
        revision: baseRevision || mirrorSequence,
        updatedAt: now(),
        payload,
      });
    } catch (error) {
      // IndexedDB 可能被隐私模式或配额挡掉。安全网塌了就塌了，正片必须继续。
      report(error, "mirror");
    }
  };

  const clear = async (): Promise<void> => {
    try {
      await deleteAdvancedRecovery(options.recoveryKey);
    } catch (error) {
      report(error, "clear");
    }
  };

  return {
    capabilities,

    read: () => inner.read(),

    watch: (cb: () => void) => inner.watch(cb),

    async noteDirty(doc: PluginDocument, reason = "dirty"): Promise<void> {
      await mirror(doc, reason, doc.revisionId);
    },

    async write(
      doc: PluginDocument,
      opts: WriteOptions,
    ): Promise<WriteReceipt> {
      await mirror(doc, opts.reason, opts.expectedRevision ?? doc.revisionId);
      const receipt = await inner.write(doc, opts);
      // 只有后端确认之后才清。write 抛错（含 conflict）时草稿留在原地，
      // 用户下次进来还能拿回这份未落盘的修改。
      await clear();
      return receipt;
    },

    async readRecoveredDraft(): Promise<PluginRecoveredDraft | null> {
      let record: Awaited<ReturnType<typeof readAdvancedRecovery>> = null;
      try {
        record = await readAdvancedRecovery(options.recoveryKey);
      } catch (error) {
        report(error, "read");
        return null;
      }
      if (!record || record.editorId !== options.editorId) return null;
      const payload = record.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
      }
      const raw = payload as Record<string, unknown>;
      if (raw.schema !== DRAFT_SCHEMA) return null;
      const doc = normalizePluginDocument(raw.doc);
      if (!doc) return null;
      return {
        doc,
        updatedAt: record.updatedAt,
        reason: typeof raw.reason === "string" ? raw.reason : "",
        baseRevision:
          typeof record.revision === "string" ? record.revision : "",
      };
    },

    discardRecoveredDraft: clear,
  };
}
