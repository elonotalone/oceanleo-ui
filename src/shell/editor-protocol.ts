"use client";

import {
  normalizeSelectionCommand,
  normalizeSelectionContext,
} from "@oceanleo/ui/shell/selection-context";
import {
  type EditorToHostMessage,
  type HostToEditorMessage,
} from "./editor-protocol-types.mjs";
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

export const EDITOR_PROTOCOL = "oceanleo.editor.v1";
const DESIGN_SOURCE_FORMAT = "oceanleo.design-document.v1";

function validTypedCompositeCommitMeta(
  value: unknown,
  revision: unknown,
): boolean {
  const meta = recordValue(value);
  return Boolean(
    meta &&
      meta.requires_typed_artifact_commit === true &&
      meta.artifact_type === "composite_image" &&
      meta.editor_project_schema === DESIGN_SOURCE_FORMAT &&
      meta.source_format === DESIGN_SOURCE_FORMAT &&
      boundedString(meta.artifact_id, 300, true) &&
      boundedString(meta.expected_artifact_revision_id, 300, true) &&
      (meta.artifact_revision_id === undefined ||
        meta.artifact_revision_id === meta.expected_artifact_revision_id) &&
      boundedString(meta.editor_project_url, 2_000, true) &&
      meta.design_document_url === meta.editor_project_url &&
      validAssetUrl(meta.editor_project_url) &&
      Number.isSafeInteger(meta.design_document_revision) &&
      Number(meta.design_document_revision) >= 0 &&
      meta.preview_revision === meta.design_document_revision &&
      meta.preview_static_frame === "final" &&
      revision === meta.design_document_revision,
  );
}

export function isTrustedEditorOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const { protocol, hostname } = parsed;
    if (parsed.origin !== origin || parsed.username || parsed.password) {
      return false;
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return protocol === "http:" || protocol === "https:";
    }
    if (protocol !== "https:" || parsed.port) return false;
    return (
      hostname === "oceanleo.com" || hostname.endsWith(".oceanleo.com")
    );
  } catch {
    return false;
  }
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
      (record.ok === false && !boundedString(record.message, 1_000, true))
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "error") {
    if (!boundedString(record.message, 1_000, true)) return null;
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
