import {
  createArtifactRevision,
  forkArtifact,
} from "../artifact-client";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "../library-data";
import {
  saveProjectWorkingHead,
  type SaveProjectWorkingHeadInput,
  type SaveToLibraryResult,
} from "../doc-editors/doc-io";
import { uploadFile } from "../../lib/database";
import {
  fetchMediaBlob,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import {
  CHART_DOCUMENT_SCHEMA,
  chartDocumentFromJson,
  chartDocumentToJson,
  normalizeChartDocument,
  type ChartDocumentV1,
} from "./chart-schema";
import {
  CHART_EDITOR_ADAPTER,
  CHART_EDITOR_ID,
  CHART_OPTION_FORMAT,
  assertFreshChartSourceUrl,
  trustedCanonicalChartSourceUrl,
} from "./chart-source";

interface UploadResult {
  ok: boolean;
  data?: {
    file?: {
      url?: string;
      meta?: Record<string, unknown>;
    };
  };
  error?: string;
}

interface PublishResult {
  ok: boolean;
  data?: LibraryItem;
  error?: string;
}

export interface ChartPersistenceDependencies {
  upload: (
    file: File,
    options: {
      siteId?: string;
      title?: string;
      registerAsset?: boolean;
      idempotencyKey?: string;
    },
  ) => Promise<UploadResult>;
  publish: (
    artifactId: string,
    commit: Parameters<typeof createArtifactRevision>[1],
  ) => Promise<PublishResult>;
  fork?: (item: LibraryItem) => Promise<PublishResult>;
  verifySource?: (url: string, digest: string) => Promise<void>;
  verifyPreview?: (url: string, digest: string) => Promise<void>;
  saveLegacy: (
    input: SaveProjectWorkingHeadInput,
  ) => Promise<SaveToLibraryResult>;
}

export interface SaveChartRevisionInput {
  item: LibraryItem;
  siteId: string;
  editRevision: number;
  document: ChartDocumentV1;
  workingHeadUrl: string;
  title: string;
  previewBlob?: Blob;
}

export interface ChartSaveResult {
  url: string;
  json: string;
  document: ChartDocumentV1;
  versionId: string;
  projectUrl: string;
  projectSchema: typeof CHART_DOCUMENT_SCHEMA;
  artifactId: string;
  revisionId: string;
  previousRevisionId: string;
  item?: LibraryItem;
}

const defaultDependencies: ChartPersistenceDependencies = {
  upload: (file, options) => uploadFile(file, options),
  publish: (artifactId, commit) =>
    createArtifactRevision(artifactId, commit),
  fork: (item) => forkArtifact(item),
  verifySource: async (url, digest) => {
    if (!isFirstPartyMediaUrl(url)) {
      throw new Error("chart source 上传返回了未托管的 URL");
    }
    const persisted = await fetchMediaBlob(url, {
      maxBytes: 2_000_000,
      cache: "no-store",
    });
    if ((await sha256(persisted)) !== digest) {
      throw new Error("chart source 上传后的实际字节 digest 不一致");
    }
  },
  verifyPreview: async (url, digest) => {
    if (!isFirstPartyMediaUrl(url)) {
      throw new Error("chart preview 上传返回了未托管的 URL");
    }
    const persisted = await fetchMediaBlob(url, {
      maxBytes: 32_000_000,
      cache: "no-store",
    });
    if ((await sha256(persisted)) !== digest) {
      throw new Error("chart preview 上传后的实际字节 digest 不一致");
    }
  },
  saveLegacy: (input) => saveProjectWorkingHead(input),
};

async function sha256(value: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前环境缺少 Web Crypto，无法生成 chart revision digest");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await value.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizedDigest(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
}

async function chartPreviewDigest(blob: Blob | undefined): Promise<string> {
  if (!blob || blob.size <= 0 || blob.size > 32_000_000) {
    throw new Error("canonical chart 保存缺少同 revision 的 PNG preview");
  }
  const signature = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
    (value, index) => signature[index] === value,
  ) && String.fromCharCode(...signature.subarray(12, 16)) === "IHDR";
  const mime = blob.type.split(";")[0].trim().toLowerCase();
  if (!png || (mime && mime !== "image/png")) {
    throw new Error("canonical chart preview 的 MIME 与 PNG magic 不一致");
  }
  return sha256(blob);
}

function safeFilename(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized || "chart";
}

function uploadReceiptDigest(
  file: { meta?: Record<string, unknown> } | null | undefined,
): string {
  return normalizedDigest(file?.meta?.content_digest || file?.meta?.sha256);
}

function assertUploadReceiptDigest(
  label: string,
  expected: string,
  file: { meta?: Record<string, unknown> } | null | undefined,
): void {
  const receipt = uploadReceiptDigest(file);
  if (receipt && receipt !== expected) {
    throw new Error(`${label}上传回执 digest 与本地字节不一致`);
  }
}

function assertCanonicalChartItem(
  item: LibraryItem,
): asserts item is LibraryItem & {
  artifactId: string;
  revisionId: string;
  artifactType: "chart";
  artifact: NonNullable<LibraryItem["artifact"]>;
} {
  if (
    !isDurableLibraryItem(item) ||
    item.artifactType !== "chart" ||
    item.artifact.artifactType !== "chart" ||
    item.artifact.sourceFormat !== CHART_DOCUMENT_SCHEMA ||
    (item.artifact.editorCapability !== CHART_EDITOR_ID &&
      item.artifact.editorCapability !== CHART_EDITOR_ADAPTER) ||
    !item.artifact.integrity.ok ||
    (!item.artifact.access.canEdit && !item.artifact.access.canFork)
  ) {
    throw new Error(
      "canonical chart 不能保存：artifact/revision、ACL、integrity 或 oceanleo.chart.v1 source contract 无效",
    );
  }
}

async function saveCanonicalRevision(
  input: SaveChartRevisionInput,
  snapshot: ChartDocumentV1,
  json: string,
  dependencies: ChartPersistenceDependencies,
): Promise<ChartSaveResult> {
  assertCanonicalChartItem(input.item);
  const originalItem = input.item;
  let item = originalItem;
  const requiresFork =
    item.artifact.owner.visibility === "public" ||
    !item.artifact.access.canEdit;
  if (requiresFork) {
    if (!item.artifact.access.canFork) {
      throw new Error("当前 chart 不可编辑且不允许安全 fork");
    }
    const forked = await dependencies.fork?.(item);
    if (
      !forked?.ok ||
      !forked.data ||
      !isDurableLibraryItem(forked.data) ||
      forked.data.artifactId === item.artifactId
    ) {
      throw new Error(
        forked?.error ||
          "当前 chart 只允许 fork，但未能创建独立、可编辑的 artifact root",
      );
    }
    assertCanonicalChartItem(forked.data);
    if (!forked.data.artifact.access.canEdit) {
      throw new Error("fork 后的 chart artifact 仍没有 revision 写权限");
    }
    if (forked.data.artifact.owner.visibility === "public") {
      throw new Error("fork 后的 chart artifact 仍是 public template");
    }
    item = forked.data;
  }
  const file = new File(
    [json],
    `${safeFilename(input.title)}.oceanleo.chart.json`,
    { type: "application/vnd.oceanleo.chart+json" },
  );
  const digest = await sha256(file);
  const previewDigest = await chartPreviewDigest(input.previewBlob);
  const previewFile = new File(
    [input.previewBlob!],
    `${safeFilename(input.title)}.preview.png`,
    { type: "image/png" },
  );
  const idempotencyKey = [
    "chart-revision-v1",
    item.artifactId,
    item.revisionId,
    input.editRevision,
    digest.slice(0, 24),
  ].join(":");
  const [uploaded, uploadedPreview] = await Promise.all([
    dependencies.upload(file, {
      siteId: input.siteId || item.siteId || "chart",
      title: input.title,
      registerAsset: false,
      idempotencyKey,
    }),
    dependencies.upload(previewFile, {
      siteId: input.siteId || item.siteId || "chart",
      title: `${input.title}预览`,
      registerAsset: false,
      idempotencyKey: `${idempotencyKey}:preview`.slice(0, 180),
    }),
  ]);
  const sourceRow = uploaded.data?.file;
  const previewRow = uploadedPreview.data?.file;
  const sourceUrl = String(sourceRow?.url || "").trim();
  const previewUrl = String(previewRow?.url || "").trim();
  if (!uploaded.ok || !sourceUrl) {
    throw new Error(uploaded.error || "oceanleo.chart.v1 source 上传失败");
  }
  if (!uploadedPreview.ok || !previewUrl) {
    throw new Error(uploadedPreview.error || "chart preview 上传失败");
  }
  trustedCanonicalChartSourceUrl(sourceUrl);
  trustedCanonicalChartSourceUrl(previewUrl);
  assertFreshChartSourceUrl(sourceUrl);
  assertFreshChartSourceUrl(previewUrl);
  assertUploadReceiptDigest("chart source", digest, sourceRow);
  assertUploadReceiptDigest("chart preview", previewDigest, previewRow);
  await dependencies.verifySource?.(sourceUrl, digest);
  await dependencies.verifyPreview?.(previewUrl, previewDigest);
  const published = await dependencies.publish(item.artifactId, {
    expectedRevisionId: item.revisionId,
    artifactType: "chart",
    source: {
      format: CHART_DOCUMENT_SCHEMA,
      url: sourceUrl,
      digest,
    },
    renditions: [
      { purpose: "preview", url: previewUrl, digest: previewDigest },
      { purpose: "full", url: previewUrl, digest: previewDigest },
      { purpose: "editor_manifest", url: sourceUrl, digest },
    ],
    provenance: {
      editor: CHART_EDITOR_ADAPTER,
      previousRevisionId: item.revisionId,
      editRevision: input.editRevision,
      preview_source_digest: digest,
      preview_digest: previewDigest,
      preview_static_frame: "final",
      ...(item.artifactId !== originalItem.artifactId
        ? {
            forkedFromArtifactId: originalItem.artifactId,
            forkedFromRevisionId: originalItem.revisionId,
          }
        : {}),
    },
  });
  const next = published.data;
  if (
    !published.ok ||
    !next ||
    !isDurableLibraryItem(next) ||
    next.artifactId !== item.artifactId ||
    next.revisionId === item.revisionId ||
    next.artifactType !== "chart" ||
    next.artifact.artifactType !== "chart" ||
    next.artifact.sourceFormat !== CHART_DOCUMENT_SCHEMA ||
    !next.artifact.integrity.ok ||
    !next.artifact.access.canEdit ||
    next.artifact.renditions.source?.revisionId !== next.revisionId ||
    !next.artifact.renditions.source?.url ||
    normalizedDigest(next.artifact.renditions.source?.digest) !== digest ||
    next.artifact.renditions.preview?.revisionId !== next.revisionId ||
    !next.artifact.renditions.preview?.url ||
    normalizedDigest(next.artifact.renditions.preview?.digest) !==
      previewDigest ||
    next.artifact.renditions.full?.revisionId !== next.revisionId ||
    !next.artifact.renditions.full?.url ||
    normalizedDigest(next.artifact.renditions.full?.digest) !== previewDigest
  ) {
    throw new Error(
      published.error ||
        "chart revision publish 未返回同一 artifact root 的新、完整 revision",
    );
  }
  trustedCanonicalChartSourceUrl(next.artifact.renditions.source.url);
  assertFreshChartSourceUrl(
    next.artifact.renditions.source.url,
    next.artifact.renditions.source.expiresAt,
  );
  trustedCanonicalChartSourceUrl(next.artifact.renditions.preview.url);
  trustedCanonicalChartSourceUrl(next.artifact.renditions.full.url);
  return {
    url: next.url || next.artifact.renditions.source.url,
    json,
    document: snapshot,
    versionId: next.revisionId,
    projectUrl: next.artifact.renditions.source.url,
    projectSchema: CHART_DOCUMENT_SCHEMA,
    artifactId: next.artifactId,
    revisionId: next.revisionId,
    previousRevisionId: item.revisionId,
    item: next,
  };
}

async function saveLegacyRevision(
  input: SaveChartRevisionInput,
  snapshot: ChartDocumentV1,
  json: string,
  dependencies: ChartPersistenceDependencies,
): Promise<ChartSaveResult> {
  const digest = await sha256(new Blob([json], { type: "application/json" }));
  const previousProjectUrl = String(
    input.item.meta.editor_project_url || "",
  ).trim();
  const result = await dependencies.saveLegacy({
    item: input.item,
    siteId: input.siteId,
    fallbackSite: "chart",
    title: input.title,
    mediaType: "other",
    kind: "chart",
    idempotencyKey: [
      "chart-project-v1",
      input.item.id,
      input.editRevision,
      digest.slice(0, 24),
    ].join(":"),
    workingHeadUrl: input.workingHeadUrl,
    thumbUrl: input.item.thumbUrl || input.item.previewUrl,
    meta: {
      editor: {
        schema: "oceanleo.editor-manifest.v1",
        id: CHART_EDITOR_ID,
        version: 1,
        capabilities: ["load", "mutate", "save", "reopen"],
        source: { kind: "inline", format: CHART_OPTION_FORMAT },
      },
      content_type: "chart",
      representation: "echarts-option",
      subtype: String(
        input.item.meta.subtype || input.item.meta.category || "",
      ),
      chart_document: snapshot,
    },
    project: {
      schema: CHART_DOCUMENT_SCHEMA,
      data: snapshot,
    },
  });
  if (
    !result.ok ||
    !result.url ||
    !result.versionId ||
    !result.projectUrl ||
    result.projectSchema !== CHART_DOCUMENT_SCHEMA
  ) {
    throw new Error(result.error || "图表保存未返回可重开的结构化 revision");
  }
  if (
    input.editRevision > 0 &&
    previousProjectUrl &&
    result.projectUrl === previousProjectUrl
  ) {
    throw new Error("图表保存没有创建新的结构化 project revision");
  }
  return {
    url: result.url,
    json,
    document: snapshot,
    versionId: result.versionId,
    projectUrl: result.projectUrl,
    projectSchema: CHART_DOCUMENT_SCHEMA,
    artifactId: "",
    revisionId: result.versionId,
    previousRevisionId: String(
      input.item.revisionId || input.item.meta.editor_version_id || "",
    ),
  };
}

export async function saveChartRevision(
  input: SaveChartRevisionInput,
  dependencies: ChartPersistenceDependencies = defaultDependencies,
): Promise<ChartSaveResult> {
  const snapshot = normalizeChartDocument(input.document);
  const json = chartDocumentToJson(snapshot);
  const reopened = chartDocumentFromJson(json);
  if (chartDocumentToJson(reopened) !== json) {
    throw new Error("图表保存前结构化 roundtrip 校验失败");
  }
  const declaresCanonicalIdentity = Boolean(
    input.item.artifact ||
      input.item.artifactId ||
      input.item.revisionId ||
      input.item.artifactType,
  );
  return declaresCanonicalIdentity
    ? saveCanonicalRevision(input, snapshot, json, dependencies)
    : saveLegacyRevision(input, snapshot, json, dependencies);
}
