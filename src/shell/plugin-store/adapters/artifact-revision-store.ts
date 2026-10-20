// ============================================================================
// @oceanleo/ui — typed-artifact revision CAS adapter
// ----------------------------------------------------------------------------
// read() 取 pinned revision 的 source 字节；write() 把 expectedRevision 当作
// If-Match / expected_revision_id，回执 revisionId 是新 revision。
//
// 失败去向刻意拆开，不能把完整性失败当成 CAS 冲突：
//   409 / revision-conflict → conflict（别人先改了，必须重读）
//   integrity-failed        → failed（payload 无效，重放同一份字节没有意义）
//   unauthorized / !canEdit → denied
//   5xx / 网络              → unavailable 或 failed
// ============================================================================

import {
  asPluginStoreError,
  isBlobDocument,
  PluginStoreError,
  type PluginDocument,
  type PluginDocumentStore,
  type PluginStoreDisposition,
  type StoreCapabilities,
  type WriteOptions,
  type WriteReceipt,
} from "../types";

export interface ArtifactRevisionStoreItem {
  artifactId: string;
  revisionId: string;
  artifactType: string;
  artifact?: {
    access?: { canEdit?: boolean; canRead?: boolean };
    integrity?: { ok?: boolean };
    sourceFormat?: string;
    renditions?: {
      source?: { url?: string; digest?: string; mediaType?: string };
    };
  };
}

export interface ArtifactRevisionStoreResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  status?: number;
  retryable?: boolean;
}

export interface ArtifactRevisionStoreHost {
  getItem(
    artifactId: string,
    revisionId?: string,
  ): Promise<ArtifactRevisionStoreResult<ArtifactRevisionStoreItem>>;
  createRevision(
    artifactId: string,
    commit: {
      expectedRevisionId: string;
      artifactType: string;
      source: { format: string; url: string; digest: string };
      renditions: Array<{ purpose: string; url: string; digest: string }>;
    },
  ): Promise<ArtifactRevisionStoreResult<ArtifactRevisionStoreItem>>;
  readSource(url: string): Promise<{ content: string; mediaType?: string }>;
  writeSource(input: {
    content: string;
    mediaType?: string;
    filename?: string;
  }): Promise<{ url: string; digest: string }>;
}

export interface ArtifactRevisionStoreOptions {
  artifactId: string;
  revisionId: string;
  artifactType: string;
  sourceFormat: string;
  host: ArtifactRevisionStoreHost;
  now?: () => number;
}

const CAPABILITIES: StoreCapabilities = {
  revisions: true,
  cas: true,
  multiFile: false,
  watch: false,
};

function dispositionFor(
  result: ArtifactRevisionStoreResult<unknown>,
): PluginStoreDisposition {
  const code = String(result.code || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  if (code === "revision-conflict" || result.status === 409) return "conflict";
  if (code === "unauthorized" || result.status === 401 || result.status === 403) {
    return "denied";
  }
  if (code === "integrity-failed" || result.status === 422) return "failed";
  if (
    result.status === 408 ||
    result.status === 425 ||
    result.status === 429 ||
    (result.status !== undefined && result.status >= 500) ||
    result.status === 0
  ) {
    return "unavailable";
  }
  return "failed";
}

function throwForResult(
  result: ArtifactRevisionStoreResult<unknown>,
  message: string,
  extra: { expectedRevision?: string; actualRevision?: string } = {},
): never {
  throw new PluginStoreError(
    dispositionFor(result),
    result.error || message,
    {
      ...extra,
      cause: result,
    },
  );
}

export function createArtifactRevisionStore(
  options: ArtifactRevisionStoreOptions,
): PluginDocumentStore {
  const now = options.now ?? (() => Date.now());
  let pinnedRevisionId = options.revisionId;

  return {
    capabilities: CAPABILITIES,

    async read(): Promise<PluginDocument> {
      const item = await options.host.getItem(
        options.artifactId,
        pinnedRevisionId,
      );
      if (!item.ok || !item.data) {
        throwForResult(item, "读取素材版本失败");
      }
      if (item.data.artifact?.integrity?.ok === false) {
        throw new PluginStoreError(
          "failed",
          "素材完整性校验没通过，不能用这份版本打开。",
        );
      }
      const source = item.data.artifact?.renditions?.source;
      if (!source?.url) {
        throw new PluginStoreError("failed", "这份素材没有可读取的源文件。");
      }
      try {
        const body = await options.host.readSource(source.url);
        pinnedRevisionId = item.data.revisionId;
        return {
          kind: "blob",
          content: body.content,
          ...(body.mediaType || source.mediaType
            ? { mediaType: body.mediaType || source.mediaType }
            : {}),
          revisionId: item.data.revisionId,
        };
      } catch (error) {
        throw asPluginStoreError(error, "failed", "读取素材源文件失败");
      }
    },

    async write(
      doc: PluginDocument,
      opts: WriteOptions,
    ): Promise<WriteReceipt> {
      if (!isBlobDocument(doc)) {
        throw new PluginStoreError(
          "unavailable",
          "artifact revision CAS 只接受单文件文档，不能写入多文件源码树",
        );
      }
      if (!opts.expectedRevision) {
        throw new PluginStoreError(
          "conflict",
          "artifact revision CAS 需要 expectedRevision",
        );
      }
      const current = await options.host.getItem(
        options.artifactId,
        opts.expectedRevision,
      );
      if (!current.ok || !current.data) {
        throwForResult(current, "保存前读取素材版本失败", {
          expectedRevision: opts.expectedRevision,
        });
      }
      if (current.data.artifact?.access?.canEdit === false) {
        throw new PluginStoreError("denied", "当前账号没有保存这份素材的权限。");
      }
      if (current.data.revisionId !== opts.expectedRevision) {
        throw new PluginStoreError(
          "conflict",
          "这份素材刚被改过，请刷新后再保存。",
          {
            expectedRevision: opts.expectedRevision,
            actualRevision: current.data.revisionId,
          },
        );
      }
      let staged: { url: string; digest: string };
      try {
        staged = await options.host.writeSource({
          content: doc.content,
          mediaType: doc.mediaType,
        });
      } catch (error) {
        throw asPluginStoreError(error, "failed", "上传素材源文件失败");
      }
      const published = await options.host.createRevision(options.artifactId, {
        expectedRevisionId: opts.expectedRevision,
        artifactType: options.artifactType,
        source: {
          format: options.sourceFormat,
          url: staged.url,
          digest: staged.digest,
        },
        renditions: [
          {
            purpose: "full",
            url: staged.url,
            digest: staged.digest,
          },
        ],
      });
      if (!published.ok || !published.data) {
        throwForResult(published, "提交新版本失败", {
          expectedRevision: opts.expectedRevision,
          actualRevision: current.data.revisionId,
        });
      }
      if (
        published.data.artifactId !== options.artifactId ||
        published.data.revisionId === opts.expectedRevision ||
        published.data.artifact?.integrity?.ok === false
      ) {
        throw new PluginStoreError(
          "failed",
          "revision publish 未返回同一 root 的新、完整 revision；旧 head 必须保持不变。",
          { expectedRevision: opts.expectedRevision },
        );
      }
      pinnedRevisionId = published.data.revisionId;
      return { revisionId: published.data.revisionId, savedAt: now() };
    },

    watch(): () => void {
      return () => undefined;
    },
  };
}
