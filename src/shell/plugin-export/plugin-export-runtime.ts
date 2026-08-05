/**
 * 导出链的执行体：一份用户数据 + 一个形态 → 一件进「我的库」的可下载素材。
 *
 * 走的是「我的库」今天已经在用的那条入库通路，没有新表也没有新接口：
 *   1. `uploadFile()` 把字节落进文件库（`MyLibrary.tsx:886` 上传文件用的同一个）；
 *   2. 上传回执里带 canonical `file.artifact` 就直接投影成库条目，
 *      不带就用 `/v1/artifacts/ensure` 的幂等回执补一件 durable artifact
 *      （`MyLibrary.tsx:909-926` 的旧上传补登路径，逐字同源）；
 *   3. 落库前逐条核对产物确实是「可下载的成品」，不是运行时工程态；
 *   4. 通过 `ARTIFACT_LIBRARY_CHANGE_EVENT` 通告，「我的库」当场多出这一件。
 *
 * 依赖全部由调用方注入，本文件不 import 任何网络客户端：真实接线在
 * `plugin-export-wiring.ts`，测试注入假网关。
 */

import {
  artifactProjectionToLibraryItem,
  isDurableLibraryItem,
  type LibraryItem,
} from "../library-data";
import {
  artifactIsVisible,
  normalizeArtifactProjectionResult,
  type TransientGenerationResult,
} from "../artifact-contract";
import {
  libraryEntryIsDownloadableMaterial,
  libraryEntryIsRuntimeSurface,
  normalizePluginExportRequest,
  pluginExportProvenance,
  pluginExportTitle,
  type PluginExportForm,
  type PluginExportRejection,
  type PluginExportRequest,
} from "./plugin-export-contract";
import { renderPluginExport } from "./plugin-export-render";

export interface PluginExportUploadedFile {
  id?: string;
  url?: string;
  thumb_url?: string;
  title?: string;
  site_id?: string;
  meta?: Record<string, unknown>;
  artifact_id?: string;
  revision_id?: string;
  artifact?: unknown;
}

export interface PluginExportUploadResult {
  ok: boolean;
  data?: { file?: PluginExportUploadedFile } | null;
  error?: string;
}

export interface PluginExportEnsureResult {
  ok: boolean;
  data?: LibraryItem | null;
  error?: string;
}

export interface PluginExportDownloadEvidence {
  visible: boolean;
  available: boolean;
  reason: string;
}

/**
 * 走的是哪一条入库通路。`ensureArtifact()` 自己会通告库，所以接线层要靠这个
 * 值决定还要不要再发一次事件。
 */
export type PluginExportPath = "upload-projection" | "ensure-receipt";

export interface PluginExportDependencies {
  upload: (
    file: File,
    options: {
      siteId?: string;
      title?: string;
      registerAsset?: boolean;
      idempotencyKey?: string;
    },
  ) => Promise<PluginExportUploadResult>;
  ensure: (
    transient: TransientGenerationResult,
  ) => Promise<PluginExportEnsureResult>;
  downloadEvidence: (item: LibraryItem) => PluginExportDownloadEvidence;
  digest?: (bytes: Uint8Array) => Promise<string>;
  announce?: (item: LibraryItem, via: PluginExportPath) => void;
}

export interface PluginExportSuccess {
  ok: true;
  item: LibraryItem;
  form: PluginExportForm;
  filename: string;
  byteLength: number;
  digest: string;
  idempotencyKey: string;
  via: PluginExportPath;
  /** 网关最终定的载体与形态声明是否一致；不一致不拦，但要能查。 */
  artifactTypeMatchesForm: boolean;
}

export type PluginExportFailure =
  | PluginExportRejection
  | {
      ok: false;
      code: "upload-failed" | "ensure-failed" | "not-downloadable";
      error: string;
    };

export type PluginExportResult = PluginExportSuccess | PluginExportFailure;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("当前环境缺少 Web Crypto，无法为导出物生成内容摘要。");
  }
  const view = new Uint8Array(bytes);
  const digest = await subtle.digest("SHA-256", view.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function uploadReceiptDigest(
  file: PluginExportUploadedFile | undefined,
): string {
  return String(file?.meta?.content_digest || file?.meta?.sha256 || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
}

/**
 * 上传回执自带 canonical durable projection 时的投影路径，判据与
 * `MyLibrary.tsx` 的 `canonicalUploadLibraryItem()` 一致：三处身份必须互相对上，
 * ACL / integrity 也必须过，否则宁可不显示。
 */
function canonicalItemFromUpload(
  file: PluginExportUploadedFile,
): { ok: true; item: LibraryItem } | { ok: false; error: string } {
  const normalized = normalizeArtifactProjectionResult(file.artifact);
  if (!normalized.ok || !normalized.data) {
    return {
      ok: false,
      error:
        normalized.error ||
        "上传回执的 file.artifact 不是 canonical durable projection。",
    };
  }
  const artifactId = String(file.artifact_id || "").trim();
  const revisionId = String(file.revision_id || "").trim();
  if (
    !artifactId ||
    !revisionId ||
    normalized.data.artifactId !== artifactId ||
    normalized.data.revisionId !== revisionId ||
    !artifactIsVisible(normalized.data)
  ) {
    return {
      ok: false,
      error:
        "上传回执的 artifact 身份或 ACL/integrity 不一致，已拒绝把它当成导出物。",
    };
  }
  return { ok: true, item: artifactProjectionToLibraryItem(normalized.data) };
}

export async function exportToLibrary(
  request: PluginExportRequest,
  dependencies: PluginExportDependencies,
): Promise<PluginExportResult> {
  const normalized = normalizePluginExportRequest(request);
  if (!normalized.ok) return normalized;
  const input = normalized.request;
  const rendered = renderPluginExport(input);
  const digest = await (dependencies.digest || sha256Hex)(rendered.bytes);
  const idempotencyKey = [
    "plugin-export-v1",
    input.sourceId,
    input.form.id,
    digest.slice(0, 24),
  ].join(":");
  const title = pluginExportTitle(input);
  const siteId = input.siteId || "home";
  const view = new Uint8Array(rendered.bytes);
  const file = new File([view], rendered.filename, {
    type: rendered.mediaType,
  });

  const uploaded = await dependencies.upload(file, {
    siteId,
    title,
    registerAsset: false,
    idempotencyKey,
  });
  const uploadedFile = uploaded.data?.file;
  const renditionUrl = String(uploadedFile?.url || "").trim();
  if (!uploaded.ok || !uploadedFile || !renditionUrl) {
    return {
      ok: false,
      code: "upload-failed",
      error: uploaded.error || "导出物上传失败，请重试。",
    };
  }
  const receipt = uploadReceiptDigest(uploadedFile);
  if (receipt && receipt !== digest) {
    return {
      ok: false,
      code: "upload-failed",
      error: "导出物上传回执的内容摘要与本地字节不一致，已拒绝入库。",
    };
  }

  let item: LibraryItem | null = null;
  let via: PluginExportPath = "ensure-receipt";
  const declaresCanonical =
    uploadedFile.artifact !== undefined ||
    Boolean(uploadedFile.artifact_id) ||
    Boolean(uploadedFile.revision_id);
  if (declaresCanonical) {
    const canonical = canonicalItemFromUpload(uploadedFile);
    if (!canonical.ok) {
      return { ok: false, code: "ensure-failed", error: canonical.error };
    }
    item = canonical.item;
    via = "upload-projection";
  } else {
    const resultId = String(uploadedFile.id || "").trim();
    if (!resultId || resultId === "undefined" || resultId === "null") {
      return {
        ok: false,
        code: "ensure-failed",
        error: "上传回执没有稳定 id，无法为导出物补一件可查的素材。",
      };
    }
    const transient: TransientGenerationResult = {
      schema: "oceanleo.transient-generation.v1",
      operation: "generation",
      resultId,
      idempotencyKey,
      payloadDigest: digest,
      artifactType: input.form.artifactType,
      title,
      renditionUrl,
      sourceUrl: renditionUrl,
      sourceFormat: input.form.sourceFormat,
      siteId: uploadedFile.site_id || siteId,
      appId: input.appId,
      provenance: pluginExportProvenance(input, {
        upload_id: resultId,
        content_digest: digest,
        byte_length: rendered.bytes.length,
      }),
    };
    const ensured = await dependencies.ensure(transient);
    if (!ensured.ok || !ensured.data) {
      return {
        ok: false,
        code: "ensure-failed",
        error: ensured.error || "导出物已落盘，但没能在库里登记成一件素材。",
      };
    }
    item = ensured.data;
  }

  if (!isDurableLibraryItem(item)) {
    return {
      ok: false,
      code: "ensure-failed",
      error: "入库结果没有稳定身份，已拒绝把它挂进库里。",
    };
  }
  // 反面闸门：入库结果如果是运行时工程态而不是成品，这条链就地终止，
  // 既不通告库，也不给下载入口（§3.1「软件本身永不进库」）。
  if (
    libraryEntryIsRuntimeSurface(item) ||
    !libraryEntryIsDownloadableMaterial(item)
  ) {
    return {
      ok: false,
      code: "not-a-material",
      error: "入库结果不是可下载的成品，已拒绝把它显示成一件素材。",
    };
  }
  const evidence = dependencies.downloadEvidence(item);
  if (!evidence.visible || !evidence.available) {
    return {
      ok: false,
      code: "not-downloadable",
      error: evidence.reason || "导出物暂时不可下载。",
    };
  }
  dependencies.announce?.(item, via);
  return {
    ok: true,
    item,
    form: input.form,
    filename: rendered.filename,
    byteLength: rendered.bytes.length,
    digest,
    idempotencyKey,
    via,
    artifactTypeMatchesForm:
      (item.artifactType || item.artifact.artifactType) ===
      input.form.artifactType,
  };
}
