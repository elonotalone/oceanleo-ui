"use client";

import {
  normalizeSelectionCommand,
  normalizeSelectionContext,
} from "@oceanleo/ui/shell/selection-context";
import {
  type EditorToHostMessage,
  type HostToEditorMessage,
} from "./editor-protocol-types.mjs";
import { isCurrentFamilyFirstPartyHost } from "../contracts/domain-family";
import {
  isTrustedEmbedEditorBase,
  isUntrustedContentHostname,
} from "./editor-sandbox-origin";
import {
  boundedRecord,
  boundedString,
  isEditorRecoverySnapshot,
  normalizeEditorHistory,
  recordValue,
  validAssetPayload,
  validAssetUrl,
  validManifestId,
  validProjectManifest,
  validRevision,
  validToolManifest,
} from "./editor-protocol-validation.mjs";

export type {
  EditorAssetPayload,
  EditorDocumentRevision,
  EditorHistorySnapshot,
  EditorMaterialAction,
  EditorMaterialInsertion,
  EditorMessageSeverity,
  EditorProjectAction,
  EditorProjectIcon,
  EditorProjectManifest,
  EditorProjectView,
  EditorRecoverySnapshot,
  EditorRecoveryValue,
  EditorToHostMessage,
  EditorToolChoice,
  EditorToolManifestEntry,
  EditorViewportSnapshot,
  HostToEditorMessage,
} from "./editor-protocol-types.mjs";
export { isEditorRecoverySnapshot } from "./editor-protocol-validation.mjs";
export * from "./editor-sandbox-origin";

export const EDITOR_PROTOCOL = "oceanleo.editor.v1";
const DESIGN_SOURCE_FORMAT = "oceanleo.design-document.v1";
const EDITOR_MESSAGE_SEVERITIES = new Set(["fatal", "warning", "info"]);

function validIssueMetadata(record: Record<string, unknown>): boolean {
  return (
    (record.code === undefined ||
      (boundedString(record.code, 100, true) &&
        /^[A-Z0-9][A-Z0-9_.:-]*$/i.test(String(record.code)))) &&
    (record.severity === undefined ||
      EDITOR_MESSAGE_SEVERITIES.has(String(record.severity))) &&
    (record.retryable === undefined || typeof record.retryable === "boolean")
  );
}

/**
 * 除 `composite_image` 外，还有哪些类型可以由嵌入式画布提交 typed revision。
 *
 * A12：这三类过去一次 revision 都提交不了，因为本校验器写死了 `composite_image`。
 * 放行它们**不等于放宽 source 约束**——`source_format` 属不属于该类型由
 * `design-composite-commit.ts` 的 `embeddedTypedCommitAccepts()` fail-closed 把关，
 * 那份清单与 `artifact-contract.ts` 的 `SOURCE_FORMAT_EXACT` 逐字镜像。
 */
const EMBEDDED_TYPED_COMMIT_ARTIFACT_TYPES = new Set([
  "vector_image",
  "workflow",
  "website",
]);

/** `composite_image`：scene 闭包是它的本体，逐项保持原样，一个字没放松。 */
function validCompositeCommitMeta(
  meta: Record<string, unknown>,
  revision: unknown,
): boolean {
  return Boolean(
    meta.artifact_type === "composite_image" &&
      meta.editor_project_schema === DESIGN_SOURCE_FORMAT &&
      meta.source_format === DESIGN_SOURCE_FORMAT &&
      boundedString(meta.editor_project_url, 2_000, true) &&
      meta.design_document_url === meta.editor_project_url &&
      validAssetUrl(meta.editor_project_url) &&
      Number.isSafeInteger(meta.design_document_revision) &&
      Number(meta.design_document_revision) >= 0 &&
      meta.preview_revision === meta.design_document_revision &&
      revision === meta.design_document_revision,
  );
}

/**
 * `vector_image` / `workflow` / `website`：没有 scene 闭包，因此不要求
 * `design_document_*` 那一组字段（W1 A9 第 2 条：这几类的闭包由后端从已验签的
 * `request.source` 推导，客户端不该发 `scene`）。仍然要求一份可校验的 source URL
 * 与非空 `source_format`——具体格式合不合法由提交层按类型判。
 */
function validEmbeddedTypedCommitMeta(
  meta: Record<string, unknown>,
): boolean {
  return Boolean(
    EMBEDDED_TYPED_COMMIT_ARTIFACT_TYPES.has(String(meta.artifact_type)) &&
      boundedString(meta.source_format, 120, true) &&
      boundedString(meta.editor_project_url, 2_000, true) &&
      validAssetUrl(meta.editor_project_url),
  );
}

function validTypedCompositeCommitMeta(
  value: unknown,
  revision: unknown,
): boolean {
  const meta = recordValue(value);
  if (
    !meta ||
    meta.requires_typed_artifact_commit !== true ||
    !boundedString(meta.artifact_id, 300, true) ||
    !boundedString(meta.expected_artifact_revision_id, 300, true) ||
    (meta.artifact_revision_id !== undefined &&
      meta.artifact_revision_id !== meta.expected_artifact_revision_id) ||
    meta.preview_static_frame !== "final"
  ) {
    return false;
  }
  return (
    validCompositeCommitMeta(meta, revision) ||
    validEmbeddedTypedCommitMeta(meta)
  );
}

export function isTrustedEditorOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const { protocol, hostname } = parsed;
    if (parsed.origin !== origin || parsed.username || parsed.password) {
      return false;
    }
    if (isUntrustedContentHostname(hostname)) return false;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return protocol === "http:" || protocol === "https:";
    }
    if (protocol !== "https:" || parsed.port) return false;
    // 按**当前家族**判第一方，不再写死 `.oceanleo.com`：`.com` 页面对 `.com`
    // origin 的结论与改动前逐字相同，而 `.cn` 页面只信 `.cn` origin。
    // postMessage 是双向的，跨族互信一旦成立，境内页面就会把消息投给境外 frame。
    return isCurrentFamilyFirstPartyHost(hostname);
  } catch {
    return false;
  }
}

export function isValidEditorTargetOrigin(origin: string): boolean {
  // `*` 会把消息广播给任何导航到该 frame 的文档，等于放弃投递方向的校验。
  return origin !== "*" && isTrustedEditorOrigin(origin);
}

/** 来自 frame 的消息只允许这些指令；不含任何「代我调用 API」式通用代理。 */
export const EDITOR_TO_HOST_MESSAGE_TYPES = new Set([
  "artifact-created",
  "artifact-updated",
  "close-request",
  "dirty",
  "error",
  "export-result",
  "history-changed",
  "material-result",
  "project-manifest",
  "project-result",
  "ready",
  "recovery-result",
  "recovery-snapshot",
  "selection-changed",
  "selection-result",
  "tools-manifest",
  "viewport-changed",
]);

export const HOST_TO_EDITOR_MESSAGE_TYPES = new Set([
  "dispose",
  "export-request",
  "init",
  "material-insert",
  "open-asset",
  "project-action",
  "project-view",
  "recovery-capture",
  "recovery-restore",
  "save-request",
  "save-result",
  "selection-command",
  "set-host-layout",
  "viewport-command",
]);

/**
 * 单一收信闸门：source（必须是本 frame 的 contentWindow）、origin（必须等于
 * 预期 origin 且仍在受信任集合内）、协议信封与指令白名单，缺一不可。
 */
export function acceptEditorFrameMessage(
  event: { origin: string; source: unknown; data: unknown },
  gate: { expectedOrigin: string; frameWindow: unknown; instanceId: string },
): EditorToHostMessage | null {
  if (!gate.frameWindow || event.source !== gate.frameWindow) return null;
  if (!gate.expectedOrigin || !isTrustedEditorOrigin(gate.expectedOrigin)) {
    return null;
  }
  if (event.origin !== gate.expectedOrigin) return null;
  if (!isTrustedEditorOrigin(event.origin)) return null;
  return asEditorToHostMessage(event.data, gate.instanceId);
}

export function asEditorToHostMessage(
  data: unknown,
  instanceId: string,
): EditorToHostMessage | null {
  const record = recordValue(data);
  if (!record) return null;
  if (record.protocol !== EDITOR_PROTOCOL) return null;
  if (
    record.instanceId !== instanceId ||
    !boundedString(instanceId, 128, true)
  ) {
    return null;
  }
  const type = record.type;
  if (typeof type !== "string" || !EDITOR_TO_HOST_MESSAGE_TYPES.has(type)) {
    return null;
  }
  if (type === "artifact-created" || type === "artifact-updated") {
    const meta = recordValue(record.meta);
    const typedCommit = meta?.requires_typed_artifact_commit === true;
    if (
      !boundedString(record.url, 2_000, true) ||
      !validAssetUrl(record.url) ||
      !validAssetUrl(record.previewUrl) ||
      !boundedString(record.title, 300) ||
      !boundedString(record.saveId, 128) ||
      (record.revision !== undefined && !validRevision(record.revision)) ||
      (record.meta !== undefined && !boundedRecord(record.meta, 20_000)) ||
      (typedCommit &&
        (!boundedString(record.previewUrl, 2_000, true) ||
          !boundedString(record.saveId, 128, true) ||
          !validTypedCompositeCommitMeta(record.meta, record.revision)))
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "history-changed") {
    const history = normalizeEditorHistory(record.history ?? record);
    return history
      ? ({ ...record, history } as unknown as EditorToHostMessage)
      : null;
  }
  if (type === "tools-manifest") {
    if (!validRevision(record.revision) || !validToolManifest(record.tools)) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "project-manifest") {
    return validProjectManifest(record.manifest)
      ? (record as unknown as EditorToHostMessage)
      : null;
  }
  if (type === "project-result") {
    if (
      !boundedString(record.requestId, 128, true) ||
      !validRevision(record.manifestRevision) ||
      typeof record.ok !== "boolean" ||
      !boundedString(record.message, 500) ||
      (record.ok === false && !boundedString(record.message, 500, true))
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "recovery-snapshot") {
    if (
      !boundedString(record.recoveryId, 128, true) ||
      typeof record.ok !== "boolean" ||
      !boundedString(record.message, 1_000) ||
      !validIssueMetadata(record) ||
      (record.ok === true
        ? !isEditorRecoverySnapshot(record.snapshot)
        : record.snapshot !== undefined ||
          !boundedString(record.message, 1_000, true))
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "recovery-result") {
    if (
      !boundedString(record.recoveryId, 128, true) ||
      typeof record.ok !== "boolean" ||
      (record.revision !== undefined && !validRevision(record.revision)) ||
      !boundedString(record.message, 1_000) ||
      !validIssueMetadata(record) ||
      (record.ok === false && !boundedString(record.message, 1_000, true))
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "error") {
    if (
      !boundedString(record.message, 1_000, true) ||
      !validIssueMetadata(record)
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "selection-changed") {
    if (record.selection === null) {
      return record as unknown as EditorToHostMessage;
    }
    const selection = normalizeSelectionContext(record.selection);
    if (!selection) return null;
    return { ...record, selection } as unknown as EditorToHostMessage;
  }
  if (type === "selection-result") {
    if (
      !boundedString(record.requestId, 128, true) ||
      typeof record.ok !== "boolean" ||
      !boundedString(record.message, 500)
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "material-result") {
    if (
      !boundedString(record.commandId, 128, true) ||
      typeof record.ok !== "boolean" ||
      !boundedString(record.message, 500)
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "export-result") {
    if (
      !boundedString(record.exportId, 128, true) ||
      typeof record.ok !== "boolean" ||
      !validAssetUrl(record.url) ||
      !boundedString(record.message, 500)
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "viewport-changed") {
    const viewport = recordValue(record.viewport);
    if (
      !viewport ||
      !Number.isFinite(viewport.value as number) ||
      !Number.isFinite(viewport.min as number) ||
      !Number.isFinite(viewport.max as number) ||
      Number(viewport.min) < 1 ||
      Number(viewport.max) > 1_000 ||
      Number(viewport.min) >= Number(viewport.max) ||
      Number(viewport.value) < Number(viewport.min) ||
      Number(viewport.value) > Number(viewport.max) ||
      (viewport.step !== undefined &&
        (!Number.isFinite(viewport.step as number) ||
          Number(viewport.step) <= 0)) ||
      (viewport.canFit !== undefined && typeof viewport.canFit !== "boolean")
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (
    type === "dirty" &&
    ((record.dirty !== undefined && typeof record.dirty !== "boolean") ||
      (record.revision !== undefined &&
        (!Number.isSafeInteger(record.revision) ||
          Number(record.revision) < 0)))
  ) {
    return null;
  }
  if (type === "ready" || type === "dirty" || type === "close-request") {
    return record as unknown as EditorToHostMessage;
  }
  return null;
}

export function asHostToEditorMessage(
  data: unknown,
  instanceId: string,
): HostToEditorMessage | null {
  const record = recordValue(data);
  if (!record) return null;
  if (record.protocol !== EDITOR_PROTOCOL) return null;
  if (
    record.instanceId !== instanceId ||
    !boundedString(instanceId, 128, true)
  ) {
    return null;
  }
  const type = record.type;
  if (typeof type !== "string" || !HOST_TO_EDITOR_MESSAGE_TYPES.has(type)) {
    return null;
  }
  if (type === "save-request") {
    if (!boundedString(record.saveId, 128, true)) return null;
    return record as unknown as HostToEditorMessage;
  }
  if (type === "export-request") {
    if (
      !boundedString(record.exportId, 128, true) ||
      record.format !== "default"
    ) {
      return null;
    }
    return record as unknown as HostToEditorMessage;
  }
  if (type === "project-view" || type === "project-action") {
    const target = type === "project-view" ? record.viewId : record.actionId;
    if (
      !boundedString(record.requestId, 128, true) ||
      !validManifestId(target) ||
      !validRevision(record.manifestRevision)
    ) {
      return null;
    }
    return record as unknown as HostToEditorMessage;
  }
  if (type === "recovery-capture") {
    if (!boundedString(record.recoveryId, 128, true)) return null;
    return record as unknown as HostToEditorMessage;
  }
  if (type === "recovery-restore") {
    if (
      !boundedString(record.recoveryId, 128, true) ||
      !isEditorRecoverySnapshot(record.snapshot)
    ) {
      return null;
    }
    return record as unknown as HostToEditorMessage;
  }
  if (type === "selection-command") {
    const command = normalizeSelectionCommand(record.command);
    if (!command) return null;
    return { ...record, command } as unknown as HostToEditorMessage;
  }
  if (type === "material-insert") {
    const insertion = recordValue(record.insertion);
    const point = recordValue(insertion?.point);
    if (
      !insertion ||
      !boundedString(insertion.commandId, 128, true) ||
      !["insert", "replace", "apply", "merge"].includes(
        String(insertion.action),
      ) ||
      !validAssetPayload(insertion.material) ||
      (point !== null &&
        (!Number.isFinite(point.x as number) ||
          !Number.isFinite(point.y as number) ||
          Math.abs(point.x as number) > 100_000 ||
          Math.abs(point.y as number) > 100_000))
    ) {
      return null;
    }
    if (!boundedRecord(insertion, 24_000)) return null;
    return record as unknown as HostToEditorMessage;
  }
  if (type === "viewport-command") {
    const hasValue = record.value !== undefined;
    const fits = record.fit === true;
    if (
      !boundedString(record.commandId, 128, true) ||
      (hasValue &&
        (!Number.isFinite(record.value as number) ||
          Number(record.value) < 1 ||
          Number(record.value) > 1_000)) ||
      (record.fit !== undefined && record.fit !== true) ||
      hasValue === fits
    ) {
      return null;
    }
    return record as unknown as HostToEditorMessage;
  }
  if (type === "open-asset") {
    return validAssetPayload(record.asset)
      ? (record as unknown as HostToEditorMessage)
      : null;
  }
  if (type === "set-host-layout") {
    if (
      typeof record.sidePanelVisible !== "boolean" ||
      (record.hostOwnsChrome !== undefined &&
        typeof record.hostOwnsChrome !== "boolean") ||
      (record.hostOwnsViewport !== undefined &&
        typeof record.hostOwnsViewport !== "boolean")
    ) {
      return null;
    }
    return record as unknown as HostToEditorMessage;
  }
  if (type === "save-result") {
    if (
      typeof record.ok !== "boolean" ||
      !boundedString(record.message, 1_000, true) ||
      !validAssetUrl(record.url) ||
      !boundedString(record.saveId, 128, true) ||
      (record.revision !== undefined && !validRevision(record.revision)) ||
      !boundedString(record.artifactId, 300) ||
      !boundedString(record.revisionId, 300) ||
      !boundedString(record.code, 100) ||
      !boundedString(record.currentRevisionId, 300) ||
      (record.ok === false &&
        record.code === "revision-conflict" &&
        !boundedString(record.currentRevisionId, 300, true))
    ) {
      return null;
    }
    return record as unknown as HostToEditorMessage;
  }
  if (type === "dispose") {
    if (!boundedString(record.disposeId, 128, true)) return null;
    return record as unknown as HostToEditorMessage;
  }
  if (type === "init") return record as unknown as HostToEditorMessage;
  return null;
}

export function buildEditorEmbedUrl(
  base: string,
  opts: {
    instanceId: string;
    hostOrigin: string;
    assetUrl?: string;
    assetTitle?: string;
    assetKind?: string;
    extra?: Record<string, string>;
  },
): string {
  const url = new URL(base);
  if (
    !isTrustedEmbedEditorBase(base) ||
    !isTrustedEditorOrigin(url.origin) ||
    !isTrustedEditorOrigin(opts.hostOrigin) ||
    !boundedString(opts.instanceId, 128, true) ||
    !validAssetUrl(opts.assetUrl) ||
    !boundedString(opts.assetTitle, 300) ||
    !boundedString(opts.assetKind, 80)
  ) {
    throw new TypeError("Untrusted or malformed editor embed URL");
  }
  url.searchParams.set("embed", "1");
  url.searchParams.set("editor", "1");
  url.searchParams.set("instance", opts.instanceId);
  url.searchParams.set("host", opts.hostOrigin);
  if (opts.assetUrl) url.searchParams.set("assetUrl", opts.assetUrl);
  if (opts.assetTitle) url.searchParams.set("assetTitle", opts.assetTitle);
  if (opts.assetKind) url.searchParams.set("assetKind", opts.assetKind);
  const reserved = new Set([
    "embed",
    "editor",
    "instance",
    "host",
    "assetUrl",
    "assetTitle",
    "assetKind",
  ]);
  for (const [key, value] of Object.entries(opts.extra || {})) {
    if (
      reserved.has(key) ||
      !/^[a-z0-9_.:-]{1,80}$/i.test(key) ||
      typeof value !== "string" ||
      value.length > 2_000
    ) {
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url.toString();
}
