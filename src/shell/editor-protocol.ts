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
  validIssueMetadata,
  validTypedCompositeCommitMeta,
} from "./editor-protocol-commit-meta";
import { canLoadFamilyEmbedBase } from "./family-embed-origin";
import { isHostedEditorOrigin } from "./hosted-editor-origins";
import {
  boundedRecord,
  boundedString,
  contractV2EditorToHost,
  contractV2HostToEditor,
  isEditorRecoverySnapshot,
  normalizeEditorHistory,
  recordValue,
  validAssetPayload,
  validAssetUrl,
  validManifestId,
  validHostInitChrome,
  validProjectManifest,
  validRevision,
  validToolsManifestMessage,
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
// 指令白名单本身住在隔壁（600 行拆分闸），但两个方向的前置拦截仍在本文件里。
import {
  EDITOR_TO_HOST_MESSAGE_TYPES,
  HOST_TO_EDITOR_MESSAGE_TYPES,
} from "./editor-protocol-message-types";
export {
  EDITOR_TO_HOST_MESSAGE_TYPES,
  HOST_TO_EDITOR_MESSAGE_TYPES,
} from "./editor-protocol-message-types";

export const EDITOR_PROTOCOL = "oceanleo.editor.v1";
// [loopback-dev-gate:begin] 网页永远不许直连本机。
// 两道条件同时成立才放行本机地址，缺一即拒：
//  1. 构建期常量：打包器把 `process.env.NODE_ENV` 换成字面量 `"production"`，
//     生产 bundle 里这里收敛成 `return false`，下面的 loopback 分支构建期不可达；
//  2. 页面自身的 origin 也必须在 loopback 上。这一条与任何 flag 无关：
//     `oceanleo.com` 上的脚本（含 XSS）永远不满足它，所以即使 NODE_ENV 被翻掉，
//     线上页面也拿不到通往用户本机的地址。
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopbackHostname(value: string): boolean {
  return LOOPBACK_HOSTNAMES.has(
    String(value || "")
      .toLowerCase()
      .replace(/^\[|\]$/g, ""),
  );
}

function localDevLoopbackOpen(): boolean {
  if (typeof process === "undefined" || process.env.NODE_ENV === "production") {
    return false;
  }
  return isLoopbackHostname(globalThis.location?.hostname || "");
}
// [loopback-dev-gate:end]
export function isTrustedEditorOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const { protocol, hostname } = parsed;
    if (parsed.origin !== origin || parsed.username || parsed.password) {
      return false;
    }
    // W18 R1 全串白名单。**必须排在下一行之前**（`*.oceanleo.app` 整域是
    // 不可信内容域，排在后面就永远走不到）。论证见 hosted-editor-origins.ts。
    if (isHostedEditorOrigin(origin)) return true;
    if (isUntrustedContentHostname(hostname)) return false;
    if (isLoopbackHostname(hostname)) {
      return (
        localDevLoopbackOpen() &&
        (protocol === "http:" || protocol === "https:")
      );
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
    return validToolsManifestMessage(record)
      ? (record as unknown as EditorToHostMessage)
      : null;
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
  // v2 分支（住在 validation.mjs，因为本文件撞着 600 行拆分闸）。未知 type 回 null。
  return contractV2EditorToHost(
    type,
    record,
    normalizeSelectionContext,
  ) as EditorToHostMessage | null;
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
  if (type === "init") return validHostInitChrome(record) ? (record as unknown as HostToEditorMessage) : null;
  // v2 分支（set-mode / hide-chrome / review-decision）。未知 type 回 null。
  return contractV2HostToEditor(type, record) as HostToEditorMessage | null;
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
  let hostName = "";
  try {
    hostName = new URL(opts.hostOrigin).hostname;
  } catch {
    hostName = "";
  }
  if (
    !(
      isTrustedEmbedEditorBase(base) ||
      canLoadFamilyEmbedBase(base, hostName)
    ) ||
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
