import { isTrustedEditorOrigin } from "../../editor-protocol";
import { normalizeSelectionCommand, type SelectionCommand } from "../../selection-context";
import type { CanvasCommandSurface } from "./command-registry";

export const LEGACY_CANVAS_EDITOR_PROTOCOL = "oceanleo.editor.v1";
export const CANVAS_EDITOR_PROTOCOL = "oceanleo.editor.v2";
export const CANVAS_PROTOCOL_VERSION = 2;
export const MAX_PROTOCOL_MESSAGE_BYTES = 64 * 1024;
export const MAX_ASSET_URL_LENGTH = 4096;
export const MAX_ASSET_META_BYTES = 1_000_000;
export const MAX_INSTANCE_ID_LENGTH = 128;

export interface CanvasEditorAsset {
  id?: string;
  kind?: string;
  title?: string;
  url?: string;
  previewUrl?: string;
  meta?: Record<string, unknown>;
  writable?: boolean;
  artifactId?: string;
  revisionId?: string;
  artifactType?: string;
}

export type CanvasHostMessage =
  | { type: "init"; hostOwnsChrome?: boolean; chrome?: "host" | "self" }
  | { type: "open-asset"; asset: CanvasEditorAsset }
  | { type: "save-request"; saveId: string }
  | { type: "export-request"; exportId: string; format: "default" }
  | {
      type: "set-host-layout";
      sidePanelVisible: boolean;
      hostOwnsChrome?: boolean;
    }
  | { type: "selection-command"; command: SelectionCommand }
  | {
      type: "command";
      commandId: string;
      requestId: string;
      projectVersionId: string;
      selectionEpoch: number;
      surface: CanvasCommandSurface;
      args: Record<string, unknown>;
    }
  | {
      type: "save-result";
      ok: boolean;
      message: string;
      saveId?: string;
      url?: string;
      revision?: number;
      artifactId?: string;
      revisionId?: string;
      currentRevisionId?: string;
      code?: string;
    }
  | { type: "dispose" }
  | { type: "set-mode"; mode: "normal" | "pro" }
  | { type: "project-view"; viewId: string }
  | { type: "project-action"; actionId: string }
  // 外壳 v1 协议里已有的两条（多人同改借它们交换图，见 canvas-collab.ts）：不新增指令。
  | { type: "recovery-capture"; recoveryId: string }
  | {
      type: "recovery-restore";
      recoveryId: string;
      snapshot: {
        revision: number | string;
        expectedNativeRevision?: number;
        payload: Record<string, unknown>;
      };
    };

export interface CanvasEmbedConfig {
  active: boolean;
  requested: boolean;
  hostOrigin: string;
  instanceId: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length <= max ? value : undefined;
}

export function isValidEditorInstanceId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_INSTANCE_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function originOf(value: string): string {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

/**
 * Resolve one immutable host origin. If both query and referrer are available,
 * they must agree; an allowed sibling origin may not redirect the message pin.
 */
export function resolvePinnedHostOrigin(hostParam: string, referrer: string): string {
  const fromParam = originOf(hostParam);
  const fromReferrer = originOf(referrer);
  if (hostParam && (!fromParam || !isTrustedEditorOrigin(fromParam))) return "";
  if (fromReferrer && !isTrustedEditorOrigin(fromReferrer)) return "";
  if (fromParam && fromReferrer && fromParam !== fromReferrer) return "";
  return fromParam || fromReferrer || "";
}

export function resolveCanvasEmbedConfig(
  search: string,
  referrer: string,
  isFramed: boolean,
): CanvasEmbedConfig {
  const params = new URLSearchParams(search);
  const requested = params.get("editor") === "1";
  const instanceId = params.get("instance") || "";
  const hostOrigin = resolvePinnedHostOrigin(params.get("host") || "", referrer);
  return {
    requested,
    active:
      requested &&
      isFramed &&
      isValidEditorInstanceId(instanceId) &&
      Boolean(hostOrigin),
    hostOrigin,
    instanceId,
  };
}

function safeAssetUrl(value: unknown): string | undefined {
  const url = boundedString(value, MAX_ASSET_URL_LENGTH);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function normalizeCanvasEditorAsset(value: unknown): CanvasEditorAsset | null {
  const source = record(value);
  if (!source) return null;
  let meta: Record<string, unknown> | undefined;
  if (source.meta !== undefined) {
    meta = record(source.meta) || undefined;
    if (!meta) return null;
    try {
      if (new TextEncoder().encode(JSON.stringify(meta)).byteLength > MAX_ASSET_META_BYTES) {
        return null;
      }
    } catch {
      return null;
    }
  }
  const rawUrl = source.url;
  const rawPreview = source.previewUrl;
  const url = rawUrl === undefined ? undefined : safeAssetUrl(rawUrl);
  const previewUrl = rawPreview === undefined ? undefined : safeAssetUrl(rawPreview);
  if (rawUrl !== undefined && !url) return null;
  if (rawPreview !== undefined && !previewUrl) return null;
  const artifactId =
    source.artifactId === undefined
      ? undefined
      : boundedString(source.artifactId, 300);
  const revisionId =
    source.revisionId === undefined
      ? undefined
      : boundedString(source.revisionId, 300);
  const artifactType =
    source.artifactType === undefined
      ? undefined
      : boundedString(source.artifactType, 80);
  if (
    (source.artifactId !== undefined && !artifactId) ||
    (source.revisionId !== undefined && !revisionId) ||
    (source.artifactType !== undefined && !artifactType)
  ) {
    return null;
  }
  return {
    id: boundedString(source.id, 256),
    kind: boundedString(source.kind, 80),
    title: boundedString(source.title, 300),
    url,
    previewUrl,
    meta,
    writable: typeof source.writable === "boolean" ? source.writable : undefined,
    artifactId,
    revisionId,
    artifactType,
  };
}

/** Parse only the host→editor message variants accepted by the canvas. */
export function parseCanvasHostMessage(
  value: unknown,
  instanceId: string,
): CanvasHostMessage | null {
  try {
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      MAX_PROTOCOL_MESSAGE_BYTES
    ) {
      return null;
    }
  } catch {
    return null;
  }
  const source = record(value);
  if (
    !source ||
    (source.protocol !== CANVAS_EDITOR_PROTOCOL &&
      source.protocol !== LEGACY_CANVAS_EDITOR_PROTOCOL) ||
    source.instanceId !== instanceId
  ) {
    return null;
  }
  const isV2 =
    source.protocol === CANVAS_EDITOR_PROTOCOL &&
    source.protocolVersion === CANVAS_PROTOCOL_VERSION;
  switch (source.type) {
    case "init":
      return {
        type: "init",
        ...(typeof source.hostOwnsChrome === "boolean"
          ? { hostOwnsChrome: source.hostOwnsChrome }
          : {}),
        ...(source.chrome === "host" || source.chrome === "self"
          ? { chrome: source.chrome }
          : {}),
      };
    case "open-asset": {
      const asset = normalizeCanvasEditorAsset(source.asset);
      return asset ? { type: "open-asset", asset } : null;
    }
    case "save-request": {
      const saveId = boundedString(source.saveId, 128);
      return saveId ? { type: "save-request", saveId } : null;
    }
    case "export-request": {
      const exportId = boundedString(source.exportId, 128);
      return exportId && source.format === "default"
        ? { type: "export-request", exportId, format: "default" }
        : null;
    }
    case "set-host-layout":
      return typeof source.sidePanelVisible === "boolean"
        ? {
            type: "set-host-layout",
            sidePanelVisible: source.sidePanelVisible,
            ...(typeof source.hostOwnsChrome === "boolean"
              ? { hostOwnsChrome: source.hostOwnsChrome }
              : {}),
          }
        : null;
    case "selection-command": {
      const command = normalizeSelectionCommand(source.command);
      return command ? { type: "selection-command", command } : null;
    }
    case "command": {
      if (!isV2) return null;
      const commandId = boundedString(source.commandId, 160);
      const requestId = boundedString(source.requestId, 160);
      const projectVersionId = boundedString(source.projectVersionId, 160);
      const args = source.args === undefined ? {} : record(source.args);
      const surface = boundedString(source.surface, 32);
      if (
        !commandId ||
        !requestId ||
        !projectVersionId ||
        !args ||
        !Number.isSafeInteger(source.selectionEpoch) ||
        !surface ||
        !["compact", "toolbar", "node-menu", "keyboard", "protocol", "context-more"].includes(
          surface,
        )
      ) {
        return null;
      }
      return {
        type: "command",
        commandId,
        requestId,
        projectVersionId,
        selectionEpoch: source.selectionEpoch as number,
        surface: surface as CanvasCommandSurface,
        args,
      };
    }
    case "save-result": {
      if (typeof source.ok !== "boolean") return null;
      const saveId =
        source.saveId === undefined ? undefined : boundedString(source.saveId, 160);
      if (source.saveId !== undefined && !saveId) return null;
      const url = source.url === undefined ? undefined : safeAssetUrl(source.url);
      if (source.url !== undefined && !url) return null;
      const artifactId =
        source.artifactId === undefined
          ? undefined
          : boundedString(source.artifactId, 300);
      const revisionId =
        source.revisionId === undefined
          ? undefined
          : boundedString(source.revisionId, 300);
      const currentRevisionId =
        source.currentRevisionId === undefined
          ? undefined
          : boundedString(source.currentRevisionId, 300);
      const code =
        source.code === undefined ? undefined : boundedString(source.code, 128);
      if (
        (source.artifactId !== undefined && !artifactId) ||
        (source.revisionId !== undefined && !revisionId) ||
        (source.currentRevisionId !== undefined && !currentRevisionId) ||
        (source.code !== undefined && !code) ||
        (source.revision !== undefined &&
          (!Number.isSafeInteger(source.revision) ||
            (source.revision as number) < 0))
      ) {
        return null;
      }
      return {
        type: "save-result",
        ok: source.ok,
        message: boundedString(source.message, 1000) || "",
        saveId,
        url,
        ...(source.revision === undefined
          ? {}
          : { revision: source.revision as number }),
        ...(artifactId ? { artifactId } : {}),
        ...(revisionId ? { revisionId } : {}),
        ...(currentRevisionId ? { currentRevisionId } : {}),
        ...(code ? { code } : {}),
      };
    }
    case "dispose":
      return { type: "dispose" };
    case "set-mode":
      return source.mode === "normal" || source.mode === "pro"
        ? { type: "set-mode", mode: source.mode }
        : null;
    case "project-view": {
      const viewId = boundedString(source.viewId, 64);
      return viewId ? { type: "project-view", viewId } : null;
    }
    case "project-action": {
      const actionId = boundedString(source.actionId, 160);
      return actionId ? { type: "project-action", actionId } : null;
    }
    case "recovery-capture": {
      const recoveryId = boundedString(source.recoveryId, 128);
      return recoveryId ? { type: "recovery-capture", recoveryId } : null;
    }
    case "recovery-restore": {
      const recoveryId = boundedString(source.recoveryId, 128);
      const snapshot = record(source.snapshot);
      const payload = snapshot ? record(snapshot.payload) : null;
      const revision = snapshot?.revision;
      const expectedNativeRevision = snapshot?.expectedNativeRevision;
      const revisionOk =
        (typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0) ||
        (typeof revision === "string" && revision.length > 0 && revision.length <= 128);
      const expectedNativeRevisionOk =
        expectedNativeRevision === undefined ||
        (typeof expectedNativeRevision === "number" &&
          Number.isSafeInteger(expectedNativeRevision) &&
          expectedNativeRevision >= 0);
      return recoveryId && snapshot && payload && revisionOk && expectedNativeRevisionOk
        ? {
            type: "recovery-restore",
            recoveryId,
            snapshot: {
              revision: revision as number | string,
              ...(expectedNativeRevision === undefined
                ? {}
                : { expectedNativeRevision }),
              payload,
            },
          }
        : null;
    }
    default:
      return null;
  }
}
