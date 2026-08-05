// ============================================================================
// oceanleo.interactive-doc.v1 — 提交路径
// ----------------------------------------------------------------------------
// 契约: interactive-doc.md §1.1 四元组(line 55-71)、§3.3 状态机的两条保存禁令
//   (line 590 `degraded → saving`、line 592 `invalid → computing`)、
//   §8.1 字节下限 8,192 B、§8.2 完备判据、F6 孪生、F7 依赖闭包。
//
// 铁律 ADR-04:`source_format` 恒为 `oceanleo.interactive-doc.v1`,媒体类型恒为
// `application/json`。HTML 只可能是渲染结果,MUST NOT 落库。
//
// 依赖注入:upload / publish / fork / digest 都可注入,聚焦用例不发网络请求。
// ============================================================================

import { createArtifactRevision, forkArtifact } from "../artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import {
  saveTargetForItem,
  type PluginSaveTarget,
} from "../plugin-initial-state";
import { uploadFile } from "../../lib/database";
import {
  INTERACTIVE_DOC_ARTIFACT_TYPE,
  INTERACTIVE_DOC_EDITOR_CAPABILITY,
  INTERACTIVE_DOC_LIMITS,
  INTERACTIVE_DOC_PROJECT_SCHEMA,
  INTERACTIVE_DOC_SOURCE_MEDIA_TYPE,
  validateInteractiveDocProject,
  type InteractiveDocProject,
  type InteractiveDocValidationError,
} from "./interactive-doc-schema";
import {
  INTERACTIVE_DOC_EDITOR_ADAPTER,
  INTERACTIVE_DOC_EDITOR_ID,
  assessInteractiveDocCompleteness,
  evaluateComputeGraph,
  interactiveDocSimilarity,
  parseInteractiveDocSource,
  serializeInteractiveDocProject,
  type CompletenessFailure,
  type ComputeGraphResult,
  type EvaluateComputeGraphOptions,
} from "./interactive-doc-source";

/**
 * 保存的是一件素材，还是一个功能里用户自己的数据。定义与判别在
 * `plugin-initial-state.ts`，三个内核共用同一套词汇，这里只做本内核的别名。
 */
export type InteractiveDocSaveTarget = PluginSaveTarget;

/** 手上这件东西该按哪套判据存。插件实例认 `meta.plugin_id`，其余一律按素材。 */
export function interactiveDocSaveTargetForItem(
  item: Pick<LibraryItem, "meta"> | null | undefined,
): InteractiveDocSaveTarget {
  return saveTargetForItem(item);
}

export type InteractiveDocCommitErrorCode =
  | "html-source-rejected"
  | "invalid-schema"
  | "identity"
  | "graph-cyclic"
  | "graph-invalid"
  | "degraded-not-saveable"
  | "plugin-not-material"
  | "incomplete"
  | "source-too-small"
  | "roundtrip-mismatch"
  | "interactive-doc-twin"
  | "upload-failed"
  | "publish-failed"
  | "digest-unavailable";

export class InteractiveDocCommitError extends Error {
  readonly code: InteractiveDocCommitErrorCode;
  readonly failures: CompletenessFailure[];
  readonly schemaErrors: InteractiveDocValidationError[];

  constructor(
    code: InteractiveDocCommitErrorCode,
    message: string,
    detail: {
      failures?: CompletenessFailure[];
      schemaErrors?: InteractiveDocValidationError[];
    } = {},
  ) {
    super(message);
    this.name = "InteractiveDocCommitError";
    this.code = code;
    this.failures = detail.failures || [];
    this.schemaErrors = detail.schemaErrors || [];
  }
}

interface UploadResult {
  ok: boolean;
  data?: { file?: { url?: string; meta?: Record<string, unknown> } };
  error?: string;
}

interface PublishResult {
  ok: boolean;
  data?: LibraryItem;
  error?: string;
}

/** 与 `ArtifactRevisionCommit` 同形,但 `artifactType` 收成 string —— W3 把
 * `"interactive_doc"` 加进 `ARTIFACT_TYPES` 之后这层就只是文档。 */
export interface InteractiveDocRevisionCommit {
  expectedRevisionId: string;
  artifactType: string;
  source: { format: string; url: string; digest: string };
  renditions: {
    purpose: "preview" | "full" | "editor_manifest";
    url: string;
    digest: string;
  }[];
  provenance?: Record<string, unknown>;
}

export interface InteractiveDocPersistenceDependencies {
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
    commit: InteractiveDocRevisionCommit,
  ) => Promise<PublishResult>;
  fork?: (item: LibraryItem) => Promise<PublishResult>;
  digest?: (blob: Blob) => Promise<string>;
}

export interface InteractiveDocCommitArgs {
  project: InteractiveDocProject;
  item: LibraryItem;
  siteId?: string;
  editRevision?: number;
  title?: string;
  /** 可选 PNG 封面。缺省时 cover 落在原生 JSON 字节上(preview_purposes 仍成立)。 */
  previewBlob?: Blob;
  /** 已算好的一轮结果;缺省时本函数自己跑一遍 §3.3 的 linking + computing。 */
  compute?: ComputeGraphResult;
  computeOptions?: EvaluateComputeGraphOptions;
  /** F6:同族既有产物,用于孪生判定。 */
  familyProjects?: InteractiveDocProject[];
  /** 缺省按 `item` 自己的身份判（`interactiveDocSaveTargetForItem`）。 */
  saveTarget?: InteractiveDocSaveTarget;
  dependencies?: InteractiveDocPersistenceDependencies;
}

export interface InteractiveDocCommitResult {
  ok: true;
  /** 这一版按哪套判据存的；插件数据不进 artifact 链，下面几格身份为空。 */
  saveTarget: InteractiveDocSaveTarget;
  json: string;
  project: InteractiveDocProject;
  byteSize: number;
  sourceDigest: string;
  previewDigest: string;
  projectUrl: string;
  projectSchema: typeof INTERACTIVE_DOC_PROJECT_SCHEMA;
  artifactType: typeof INTERACTIVE_DOC_ARTIFACT_TYPE;
  editorCapability: typeof INTERACTIVE_DOC_EDITOR_CAPABILITY;
  artifactId: string;
  revisionId: string;
  previousRevisionId: string;
  /** cover 落在原生 JSON 字节上(本次没有位图)。 */
  nativeCover: boolean;
  item: LibraryItem;
}

async function sha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new InteractiveDocCommitError(
      "digest-unavailable",
      "当前环境缺少 Web Crypto,无法生成 interactive-doc revision digest",
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const defaultDependencies: InteractiveDocPersistenceDependencies = {
  upload: (file, options) => uploadFile(file, options),
  publish: (artifactId, commit) =>
    createArtifactRevision(
      artifactId,
      commit as unknown as Parameters<typeof createArtifactRevision>[1],
    ),
  fork: (item) => forkArtifact(item),
  digest: (blob) => sha256(blob),
};

function normalizedDigest(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
}

function safeFilename(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized || "interactive-doc";
}

/** ADR-04 与 §1.1:落库四元组只有一种合法形态。 */
function assertSourceContract(item: LibraryItem): void {
  const declaredFormat = String(item.artifact?.sourceFormat || "").toLowerCase();
  if (
    declaredFormat === "html" ||
    declaredFormat.endsWith("+html") ||
    declaredFormat === "text/html"
  ) {
    throw new InteractiveDocCommitError(
      "html-source-rejected",
      "interactive_doc MUST NOT 以 source_format='html' 落库(ADR-04);热 HTML 只能由结构化数据模型驱动。",
    );
  }
  if (declaredFormat && declaredFormat !== INTERACTIVE_DOC_PROJECT_SCHEMA) {
    throw new InteractiveDocCommitError(
      "identity",
      `interactive_doc 的 source_format 必须逐字是 ${INTERACTIVE_DOC_PROJECT_SCHEMA},实际 ${declaredFormat}。`,
    );
  }
  const declaredType = String(item.artifactType || item.artifact?.artifactType || "");
  if (declaredType && declaredType !== INTERACTIVE_DOC_ARTIFACT_TYPE) {
    throw new InteractiveDocCommitError(
      "identity",
      `artifact_type 必须是下划线拼法 ${INTERACTIVE_DOC_ARTIFACT_TYPE},实际 ${declaredType}(§1.1.1)。`,
    );
  }
  if (!isDurableLibraryItem(item)) {
    throw new InteractiveDocCommitError(
      "identity",
      "interactive_doc 保存需要已固定的 artifact/revision 身份。",
    );
  }
  if (!item.artifact.integrity.ok) {
    throw new InteractiveDocCommitError(
      "identity",
      "当前 revision 的 integrity 不 ok,拒绝在残缺闭包上再造一个残缺产物(F7)。",
    );
  }
  if (!item.artifact.access.canEdit && !item.artifact.access.canFork) {
    throw new InteractiveDocCommitError(
      "identity",
      "当前主体既不能写 revision 也不能 fork。",
    );
  }
}

/**
 * 保存前的全部闸门。视口层(W7)也可以单独调用它做「能不能存」的判断,
 * 不必先把字节传上去。
 *
 * 闸门分两段：
 *   · **正确性**（schema、计算图有没有环 / 悬空引用 / degraded、结构化 roundtrip
 *     确不确定）—— 两种保存对象都要过。存一份自己都解析不回来的字节，对谁都是坏的。
 *   · **素材完备**（§8.1 字节下限、§8.2 blocks / prose / attribution / docKind 专项、
 *     F6 孪生）—— **只有 `material` 要过**。这些判据回答的是「这件产物够不够格上货架」，
 *     而插件里的用户数据根本不上货架（`_COMMON.md` §3.1 / §3.3）。
 *
 * 默认是 `material`：调用方不显式说明保存的是插件数据，就按最严那套走。
 */
export function assertInteractiveDocSaveable(
  project: InteractiveDocProject,
  options: {
    compute?: ComputeGraphResult;
    computeOptions?: EvaluateComputeGraphOptions;
    familyProjects?: InteractiveDocProject[];
    saveTarget?: InteractiveDocSaveTarget;
  } = {},
): { json: string; byteSize: number; project: InteractiveDocProject } {
  const saveTarget: InteractiveDocSaveTarget = options.saveTarget || "material";
  const validated = validateInteractiveDocProject(project);
  if (!validated.ok) {
    throw new InteractiveDocCommitError(
      "invalid-schema",
      `工程不满足 ${INTERACTIVE_DOC_PROJECT_SCHEMA}(${validated.errors.length} 处校验失败)。`,
      { schemaErrors: validated.errors },
    );
  }
  const canonical = validated.project;
  const compute =
    options.compute || evaluateComputeGraph(canonical, {}, options.computeOptions);
  if (compute.state === "cyclic") {
    throw new InteractiveDocCommitError(
      "graph-cyclic",
      `计算图有环,MUST NOT 保存:${compute.cycle.join(" → ")}(F2 / §3.3)。`,
    );
  }
  if (compute.state === "invalid") {
    throw new InteractiveDocCommitError(
      "graph-invalid",
      `计算图存在悬空引用或非法表达式,MUST NOT 保存:${compute.graphErrors
        .map((error) => `${error.path} ${error.code}`)
        .join("; ")}(F4 / §3.3)。`,
    );
  }
  if (compute.state === "degraded") {
    // §3.3 line 590:`degraded → saving` 是非法迁移。
    throw new InteractiveDocCommitError(
      "degraded-not-saveable",
      "缺依赖件或重算超时的 degraded 态 MUST NOT 保存,否则制造第二个残缺产物(§3.3 / F7)。",
    );
  }
  if (saveTarget === "material") {
    const completeness = assessInteractiveDocCompleteness(canonical, {
      ...options.computeOptions,
    });
    if (!completeness.ok) {
      const tooSmall = completeness.failures.some(
        (failure) => failure.code === "source-too-small",
      );
      throw new InteractiveDocCommitError(
        tooSmall ? "source-too-small" : "incomplete",
        `工程未达 §8 完备判据:${completeness.failures
          .map((failure) => `${failure.code} ${failure.message}`)
          .join("; ")}`,
        { failures: completeness.failures },
      );
    }
  }
  const json = serializeInteractiveDocProject(canonical);
  const reopened = parseInteractiveDocSource(json);
  if (serializeInteractiveDocProject(reopened) !== json) {
    throw new InteractiveDocCommitError(
      "roundtrip-mismatch",
      "保存前结构化 roundtrip 不确定:serialize(parse(serialize(p))) 与 serialize(p) 不一致。",
    );
  }
  // F6 孪生也是货架判据：两个用户各自建的空排程表本来就该长得一样，
  // 拿「与同族既有产物太像」去拒绝用户自己的数据是没有道理的。
  for (const sibling of saveTarget === "material"
    ? options.familyProjects || []
    : []) {
    const similarity = interactiveDocSimilarity(canonical, sibling);
    if (similarity.twin) {
      throw new InteractiveDocCommitError(
        "interactive-doc-twin",
        `与同族既有产物 Jaccard ${similarity.jaccard.toFixed(4)} ≥ ${INTERACTIVE_DOC_LIMITS.twinJaccardMax},孪生 MUST 拒绝(F6)。`,
      );
    }
  }
  return {
    json,
    byteSize: new TextEncoder().encode(json).byteLength,
    project: canonical,
  };
}

async function uploadedBlob(
  dependencies: InteractiveDocPersistenceDependencies,
  file: File,
  options: {
    siteId: string;
    title: string;
    idempotencyKey: string;
    label: string;
  },
): Promise<{ url: string; digest: string }> {
  const digest = await (dependencies.digest || sha256)(file);
  const uploaded = await dependencies.upload(file, {
    siteId: options.siteId,
    title: options.title,
    registerAsset: false,
    idempotencyKey: options.idempotencyKey,
  });
  const url = String(uploaded.data?.file?.url || "").trim();
  if (!uploaded.ok || !url) {
    throw new InteractiveDocCommitError(
      "upload-failed",
      uploaded.error || `${options.label}上传失败`,
    );
  }
  const receipt = normalizedDigest(
    uploaded.data?.file?.meta?.content_digest || uploaded.data?.file?.meta?.sha256,
  );
  if (receipt && receipt !== digest) {
    throw new InteractiveDocCommitError(
      "upload-failed",
      `${options.label}上传回执 digest 与本地字节不一致`,
    );
  }
  return { url, digest };
}

/**
 * 保存一个功能里**用户自己的数据**。
 *
 * 与素材那条路的差别不只是判据松一档，是**根本不走同一条链**：
 *   · 不上传、不发 revision、不碰 `artifact_revisions` —— 插件永不进货架，
 *     用户在换算器里改的一组单位不是一件可下载的成品（`_COMMON.md` §3.1）。
 *     字节回给调用方，由工作台把它记进本次会话的快照；要变成素材得走导出链，
 *     导出物才是素材（§3.3）。
 *   · 不套 §8 完备判据与 F6 孪生 —— 正确性仍然全查（见
 *     `assertInteractiveDocSaveable`）。
 *
 * 一道反向闸：**带着 artifact 身份的东西不许从这条路走**。否则给一件真素材挂上
 * `meta.plugin_id` 就能绕开完备判据落库，那正是本轮要堵的洞的镜像。
 */
async function commitPluginInstanceData(
  args: InteractiveDocCommitArgs,
): Promise<InteractiveDocCommitResult> {
  if (isDurableLibraryItem(args.item) || args.item.artifactId) {
    throw new InteractiveDocCommitError(
      "plugin-not-material",
      "这件内容带着 artifact 身份,不能按功能数据保存;真素材一律走素材那条路与它的完备判据。",
    );
  }
  const { json, byteSize, project } = assertInteractiveDocSaveable(args.project, {
    compute: args.compute,
    computeOptions: args.computeOptions,
    saveTarget: "plugin-instance",
  });
  return {
    ok: true,
    saveTarget: "plugin-instance",
    json,
    project,
    byteSize,
    sourceDigest: "",
    previewDigest: "",
    projectUrl: "",
    projectSchema: INTERACTIVE_DOC_PROJECT_SCHEMA,
    artifactType: INTERACTIVE_DOC_ARTIFACT_TYPE,
    editorCapability: INTERACTIVE_DOC_EDITOR_CAPABILITY,
    artifactId: "",
    revisionId: "",
    previousRevisionId: "",
    nativeCover: true,
    item: { ...args.item, content: json },
  };
}

/**
 * 提交一版 interactive_doc。`full` 装 JSON 交付字节(§1.1 preview_purposes
 * 含 "full"),`editor_manifest` 装同一份可重开工程,`preview` 装位图(如有)。
 */
export async function commitInteractiveDocProject(
  args: InteractiveDocCommitArgs,
): Promise<InteractiveDocCommitResult> {
  const dependencies = args.dependencies || defaultDependencies;
  const saveTarget =
    args.saveTarget || interactiveDocSaveTargetForItem(args.item);
  if (saveTarget === "plugin-instance") {
    return commitPluginInstanceData(args);
  }
  assertSourceContract(args.item);
  const { json, byteSize, project } = assertInteractiveDocSaveable(args.project, {
    compute: args.compute,
    computeOptions: args.computeOptions,
    familyProjects: args.familyProjects,
    saveTarget,
  });

  let item = args.item;
  const originalItem = args.item;
  if (!item.artifact?.access.canEdit) {
    const forked = await dependencies.fork?.(item);
    if (!forked?.ok || !forked.data || !isDurableLibraryItem(forked.data)) {
      throw new InteractiveDocCommitError(
        "identity",
        forked?.error || "当前 interactive_doc 只允许 fork,但 fork 没有返回可写 artifact root。",
      );
    }
    item = forked.data;
  }
  const durableItem = item as LibraryItem & {
    artifactId: string;
    revisionId: string;
    artifact: NonNullable<LibraryItem["artifact"]>;
  };
  const title = args.title || project.metadata.title;
  const siteId = args.siteId || durableItem.siteId || "interactive-doc";
  const editRevision = args.editRevision ?? 0;

  const sourceFile = new File([json], `${safeFilename(title)}.oceanleo.interactive-doc.json`, {
    type: INTERACTIVE_DOC_SOURCE_MEDIA_TYPE,
  });
  const idempotencyKey = [
    "interactive-doc-revision-v1",
    durableItem.artifactId,
    durableItem.revisionId,
    editRevision,
  ].join(":");
  const source = await uploadedBlob(dependencies, sourceFile, {
    siteId,
    title,
    idempotencyKey,
    label: "interactive-doc source",
  });

  let preview = { url: "", digest: "" };
  if (args.previewBlob && args.previewBlob.size > 0) {
    const previewFile = new File(
      [args.previewBlob],
      `${safeFilename(title)}.preview.png`,
      { type: "image/png" },
    );
    preview = await uploadedBlob(dependencies, previewFile, {
      siteId,
      title: `${title}预览`,
      idempotencyKey: `${idempotencyKey}:preview`.slice(0, 180),
      label: "interactive-doc preview",
    });
  }

  const renditions: InteractiveDocRevisionCommit["renditions"] = [
    { purpose: "editor_manifest", url: source.url, digest: source.digest },
    { purpose: "full", url: source.url, digest: source.digest },
    ...(preview.url
      ? ([{ purpose: "preview", url: preview.url, digest: preview.digest }] as const)
      : []),
  ];

  const published = await dependencies.publish(durableItem.artifactId, {
    expectedRevisionId: durableItem.revisionId,
    artifactType: INTERACTIVE_DOC_ARTIFACT_TYPE,
    source: {
      format: INTERACTIVE_DOC_PROJECT_SCHEMA,
      url: source.url,
      digest: source.digest,
    },
    renditions,
    provenance: {
      editor: INTERACTIVE_DOC_EDITOR_ADAPTER,
      editorCapability: INTERACTIVE_DOC_EDITOR_CAPABILITY,
      previousRevisionId: durableItem.revisionId,
      editRevision,
      source_bytes: byteSize,
      parameter_count: project.parameters.length,
      computation_count: project.computations.length,
      block_count: project.blocks.length,
      doc_kind: project.metadata.docKind,
      ...(durableItem.artifactId !== originalItem.artifactId
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
    next.artifactId !== durableItem.artifactId ||
    next.revisionId === durableItem.revisionId ||
    String(next.artifact.sourceFormat) !== INTERACTIVE_DOC_PROJECT_SCHEMA ||
    normalizedDigest(next.artifact.renditions.source?.digest) !== source.digest ||
    next.artifact.renditions.source?.revisionId !== next.revisionId
  ) {
    throw new InteractiveDocCommitError(
      "publish-failed",
      published.error ||
        "interactive_doc revision publish 未返回同一 artifact root 的新、完整 revision。",
    );
  }

  return {
    ok: true,
    saveTarget: "material",
    json,
    project,
    byteSize,
    sourceDigest: source.digest,
    previewDigest: preview.digest,
    projectUrl: next.artifact.renditions.source?.url || source.url,
    projectSchema: INTERACTIVE_DOC_PROJECT_SCHEMA,
    artifactType: INTERACTIVE_DOC_ARTIFACT_TYPE,
    editorCapability: INTERACTIVE_DOC_EDITOR_CAPABILITY,
    artifactId: next.artifactId,
    revisionId: next.revisionId,
    previousRevisionId: durableItem.revisionId,
    nativeCover: !preview.url,
    item: next,
  };
}

/** 供 W7 的工具栏显示「这份工程能不能存」用的编辑器身份常量。 */
export const INTERACTIVE_DOC_PERSISTENCE_IDENTITY = Object.freeze({
  editorId: INTERACTIVE_DOC_EDITOR_ID,
  adapter: INTERACTIVE_DOC_EDITOR_ADAPTER,
  artifactType: INTERACTIVE_DOC_ARTIFACT_TYPE,
  sourceFormat: INTERACTIVE_DOC_PROJECT_SCHEMA,
  sourceMediaType: INTERACTIVE_DOC_SOURCE_MEDIA_TYPE,
  editorCapability: INTERACTIVE_DOC_EDITOR_CAPABILITY,
  minimumSourceBytes: INTERACTIVE_DOC_LIMITS.sourceBytesMin,
});
