// ============================================================================
// @oceanleo/ui — 插件文档存储契约（13 件插件的单一持久化事实源）
// ----------------------------------------------------------------------------
// 背景：改造前「把文档存住」这一件事有八条路——陈列馆 doc 通道、artifact
// revision CAS、我的库 working head、Website Project API、内存 double、
// localStorage 草稿、IndexedDB 崩溃恢复、App 会话重开快照。插件各挑一条接，
// 于是三个最要紧的问题在每件插件里都有不同答案：存没存住、撞版本了怎么办、
// 崩了还在不在。逐个补只会补出第九条路，所以把「读 / 写 / 订阅 / 能力自述」
// 收敛到这一个接口上，后端差异一律由 adapter 吸收。
//
// 两条刻意的设计决定：
//   1. 冲突（CAS 失败）是一等公民，不许混进泛化的 write failed。旧代码里
//      artifact 的 409 和网络 500 长得一样，插件只能一起当「保存失败」重试，
//      把别人的修改覆盖掉。disposition 就是为了让插件必须分开处理这一支。
//   2. capabilities 由 store 自述，不由插件猜。没有版本历史就别画历史按钮，
//      没有 CAS 就别假装乐观锁成功——降级要说出口（对应 plugin-chrome 的
//      local-only / notice）。
//
// 未落地的两个 adapter（本次只保证接口能表达，不实现）：
//   · artifact revision CAS（artifact-client.ts `createArtifactRevision`）
//     read() → 取 pinned revision 的 source 字节，doc.revisionId = revisionId；
//     write() → `expectedRevision` 直接就是 `If-Match` / `expected_revision_id`，
//     回执 revisionId 填新 revision；服务端 409 / integrity-failed 映射成
//     disposition "conflict"，access.canEdit 为假映射成 "denied"。
//     capabilities = { revisions: true, cas: true, multiFile: false, watch: false }。
//   · Website Project API（website 仓 project-api.ts）
//     它是八条路里唯一的多文件源码树：read() → `readSourceTree` 折成
//     PluginDocument 的 tree 形态；write() → `transactSource` 提交文件级事务，
//     `expectedRevision` 落到 `expected_base_revision_id` / `expected_head_version`；
//     `createProjectSession` 属于打开文档前的会话握手，`applyProjectDraft` /
//     `materializeWebsiteProjectArtifact` 是发布动作，都不在本契约里。
//     capabilities = { revisions: true, cas: true, multiFile: true, watch: false }。
// ============================================================================

/** 单文件条目。path 是树内相对路径，不含前导斜杠。 */
export interface PluginDocumentFile {
  path: string;
  content: string;
  mediaType?: string;
}

/**
 * 一份文档。
 *
 * 单 blob 和多文件树是并列的两种形态，不折叠成一种：把网站源码树硬塞进
 * 「一个字符串」需要插件自己发明打包格式，把单文件硬塞进「只有一个元素的树」
 * 又让 10 件单 blob 插件天天解包。所以用判别联合，由 capabilities.multiFile
 * 声明某个 store 收不收 tree。
 */
export type PluginDocument = PluginBlobDocument | PluginTreeDocument;

export interface PluginBlobDocument {
  kind: "blob";
  content: string;
  mediaType?: string;
  /** 后端版本标识；写回时原样填进 WriteOptions.expectedRevision 即可做 CAS。 */
  revisionId?: string;
  /** 后端给出的落盘时刻（毫秒）。本地缓存/草稿据此判新旧。 */
  updatedAt?: number;
}

export interface PluginTreeDocument {
  kind: "tree";
  files: readonly PluginDocumentFile[];
  revisionId?: string;
  updatedAt?: number;
}

/** store 自述能力。插件据此决定画什么、降级说什么，不许靠猜后端。 */
export interface StoreCapabilities {
  /** 有版本历史（能回滚 / 能列 revision）。 */
  revisions: boolean;
  /** 支持 If-Match 式乐观锁；为假时传 expectedRevision 会被拒绝而不是被忽略。 */
  cas: boolean;
  /** 收多文件源码树（网站源码树）而不只是单 blob。 */
  multiFile: boolean;
  /** 能订阅外部变更。为假时 watch() 返回一个空退订函数。 */
  watch: boolean;
}

export interface WriteOptions {
  /** 这次写为什么发生（autosave / leave-flush / manual-save…）。进日志与回执。 */
  reason: string;
  /** 读到的版本；store 支持 CAS 时作为 If-Match，冲突抛 disposition "conflict"。 */
  expectedRevision?: string;
}

export interface WriteReceipt {
  revisionId?: string;
  savedAt: number;
}

export interface PluginDocumentStore {
  read(): Promise<PluginDocument>;
  write(doc: PluginDocument, opts: WriteOptions): Promise<WriteReceipt>;
  watch(cb: () => void): () => void;
  readonly capabilities: StoreCapabilities;
}

/**
 * 失败去向。插件只需要按这四支分流，不必认识各后端的状态码：
 *   conflict    别人先改了（CAS 失败）。不能重放同一份字节，必须重读或让用户选。
 *   unavailable 后端/能力这会儿不在（未接、离线、IndexedDB 关了）。可降级本地。
 *   denied      没权限。重试没有意义。
 *   failed      其余的传输/服务端错误。交给 AdvancedPersistenceController 退避重试。
 */
export type PluginStoreDisposition =
  | "conflict"
  | "unavailable"
  | "denied"
  | "failed";

export interface PluginStoreErrorOptions {
  /** 冲突时把两边版本一起带出来，UI 才有话可说。 */
  expectedRevision?: string;
  actualRevision?: string;
  cause?: unknown;
}

export class PluginStoreError extends Error {
  readonly disposition: PluginStoreDisposition;
  readonly expectedRevision?: string;
  readonly actualRevision?: string;

  constructor(
    disposition: PluginStoreDisposition,
    message: string,
    options: PluginStoreErrorOptions = {},
  ) {
    super(message);
    this.name = "PluginStoreError";
    this.disposition = disposition;
    this.expectedRevision = options.expectedRevision;
    this.actualRevision = options.actualRevision;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export function isPluginStoreError(value: unknown): value is PluginStoreError {
  return value instanceof PluginStoreError;
}

/**
 * 把任意 throw 收敛成本契约的错误。已经是 PluginStoreError 的原样透传——
 * 内层 adapter 判定过的 conflict 不能被外层装饰器降级成 failed。
 */
export function asPluginStoreError(
  error: unknown,
  fallback: PluginStoreDisposition,
  message?: string,
): PluginStoreError {
  if (isPluginStoreError(error)) return error;
  const detail =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "string" && error
        ? error
        : "";
  return new PluginStoreError(
    fallback,
    [message, detail].filter(Boolean).join("：") || "文档存储操作失败",
    { cause: error },
  );
}

export function blobDocument(
  content: string,
  extra: Omit<PluginBlobDocument, "kind" | "content"> = {},
): PluginBlobDocument {
  return { kind: "blob", content, ...extra };
}

export function treeDocument(
  files: readonly PluginDocumentFile[],
  extra: Omit<PluginTreeDocument, "kind" | "files"> = {},
): PluginTreeDocument {
  return { kind: "tree", files, ...extra };
}

export function isBlobDocument(
  doc: PluginDocument,
): doc is PluginBlobDocument {
  return doc.kind === "blob";
}

export function isTreeDocument(
  doc: PluginDocument,
): doc is PluginTreeDocument {
  return doc.kind === "tree";
}

/**
 * 校验一份来自不可信存储（localStorage / IndexedDB / 会话快照）的文档。
 *
 * 这些字节可能是上个 schema 版本写的，也可能被手改过，直接 as 回来会让脏数据
 * 一路走到编辑器模型里。形状对不上就返回 null，让调用方按「没有草稿」处理。
 */
export function normalizePluginDocument(value: unknown): PluginDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const revisionId =
    typeof raw.revisionId === "string" ? raw.revisionId : undefined;
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : undefined;
  if (raw.kind === "blob") {
    if (typeof raw.content !== "string") return null;
    return {
      kind: "blob",
      content: raw.content,
      ...(typeof raw.mediaType === "string"
        ? { mediaType: raw.mediaType }
        : {}),
      ...(revisionId ? { revisionId } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    };
  }
  if (raw.kind === "tree") {
    if (!Array.isArray(raw.files)) return null;
    const files: PluginDocumentFile[] = [];
    for (const entry of raw.files) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const file = entry as Record<string, unknown>;
      if (typeof file.path !== "string" || !file.path) return null;
      if (typeof file.content !== "string") return null;
      files.push({
        path: file.path,
        content: file.content,
        ...(typeof file.mediaType === "string"
          ? { mediaType: file.mediaType }
          : {}),
      });
    }
    return {
      kind: "tree",
      files,
      ...(revisionId ? { revisionId } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    };
  }
  return null;
}
