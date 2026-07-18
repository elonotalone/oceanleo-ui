"use client";

// ============================================================================

import {
  normalizeSelectionCommand,
  normalizeSelectionContext,
  type SelectionCommand,
  type SelectionContext,
} from "@oceanleo/ui/shell/selection-context";
// @oceanleo/ui — oceanleo.editor.v1 嵌入编辑协议（单一事实源）
// ----------------------------------------------------------------------------
// 高级内容工作台（宿主）与专业子站编辑器（design 画布 / video 节点画布 /
// website 站点编辑器）之间的 postMessage 契约。v1 的教训：协议只写了发送端，
// 子站没有接收端，消息发进虚空 → 右侧永远是子站默认落地页。v2 起两端同步落地，
// 宿主在收到 `ready` 之前不得宣称「编辑器已打开」。
//
// 握手时序（宿主 = AdvancedContentWorkbench，子站 = embed 编辑页）：
//   1. 宿主 iframe 加载 `https://<site>.oceanleo.com/<editor-path>?embed=1&
//      editor=1&instance=<instanceId>&host=<encodeURIComponent(hostOrigin)>
//      &assetUrl=...&assetTitle=...&assetKind=...`（asset* 为冗余快启参数）。
//   2. 子站 mount 后向 `window.parent` 发 `ready`（target = host 参数 origin）。
//   3. 宿主收到 `ready` 后发 `open-asset`（带完整 asset 描述）。
//   4. 子站编辑过程中可发 `dirty`；出错发 `error`。
//   5. 子站保存成功（自己完成上传）后发 `artifact-created`（url 必填）；
//      宿主负责把该 URL 登记进「我的库」（parent_asset_id 链）。
//   6. 宿主登记完成后发 `save-result`，子站据此清除 dirty 或展示错误。
//   7. 宿主关闭前发 `dispose`；子站可发 `close-request` 请求宿主关闭。
//
// 安全：双方都必须校验 event.origin ∈ oceanleo.com 子域白名单 + instanceId
// 精确匹配。子站绝不通过本协议接收任何 token。
// ============================================================================

export const EDITOR_PROTOCOL = "oceanleo.editor.v1";

export interface EditorAssetPayload {
  id: string;
  kind: string;
  title: string;
  url?: string;
  previewUrl?: string;
  meta: Record<string, unknown>;
  /** 平台素材 false（先复制再改）；用户自己的内容 true。 */
  writable: boolean;
}

export type EditorMaterialAction = "insert" | "replace" | "apply" | "merge";

export interface EditorMaterialInsertion {
  commandId: string;
  action: EditorMaterialAction;
  material: EditorAssetPayload;
  /** Coordinates in the embedded editor's viewport, omitted for centered/default insertion. */
  point?: { x: number; y: number };
}

export interface EditorViewportSnapshot {
  value: number;
  min: number;
  max: number;
  step?: number;
  canFit?: boolean;
}

export type HostToEditorMessage =
  | { protocol: typeof EDITOR_PROTOCOL; type: "init"; instanceId: string }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "open-asset";
      instanceId: string;
      asset: EditorAssetPayload;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "save-request";
      instanceId: string;
      saveId: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "export-request";
      instanceId: string;
      exportId: string;
      format: "default";
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "set-host-layout";
      instanceId: string;
      /** The App owns the only visible semantic side panel. */
      sidePanelVisible: boolean;
      /** The App owns back/history/autosave chrome; iframe must not duplicate it. */
      hostOwnsChrome?: boolean;
      /** The host renders the only fit/zoom control for the embedded viewport. */
      hostOwnsViewport?: boolean;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "save-result";
      instanceId: string;
      ok: boolean;
      message: string;
      url?: string;
      saveId?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "selection-command";
      instanceId: string;
      command: SelectionCommand;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "material-insert";
      instanceId: string;
      insertion: EditorMaterialInsertion;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "viewport-command";
      instanceId: string;
      commandId: string;
      value?: number;
      fit?: boolean;
    }
  | { protocol: typeof EDITOR_PROTOCOL; type: "dispose"; instanceId: string };

export type EditorToHostMessage =
  | { protocol: typeof EDITOR_PROTOCOL; type: "ready"; instanceId: string }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "dirty";
      instanceId: string;
      dirty?: boolean;
      /** Monotonic editor mutation revision; required for lossless save queuing. */
      revision?: number;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "artifact-created" | "artifact-updated";
      instanceId: string;
      url: string;
      previewUrl?: string;
      title?: string;
      meta?: Record<string, unknown>;
      saveId?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "selection-changed";
      instanceId: string;
      selection: SelectionContext | null;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "selection-result";
      instanceId: string;
      requestId: string;
      ok: boolean;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "material-result";
      instanceId: string;
      commandId: string;
      ok: boolean;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "export-result";
      instanceId: string;
      exportId: string;
      ok: boolean;
      /** Child may download itself or return a trusted deliverable URL. */
      url?: string;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "viewport-changed";
      instanceId: string;
      viewport: EditorViewportSnapshot;
    }
  | { protocol: typeof EDITOR_PROTOCOL; type: "error"; instanceId: string; message: string }
  | { protocol: typeof EDITOR_PROTOCOL; type: "close-request"; instanceId: string };

/** 允许作为协议对端的 origin（宿主校验子站、子站校验宿主都用它）。 */
export function isTrustedEditorOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const { protocol, hostname } = parsed;
    if (
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    ) {
      return false;
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return protocol === "http:" || protocol === "https:";
    }
    if (protocol !== "https:") return false;
    return (
      hostname === "oceanleo.com" ||
      hostname.endsWith(".oceanleo.com")
    );
  } catch {
    return false;
  }
}

function validAssetUrl(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string" || !value || value.length > 4_096) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(
  value: unknown,
  max: number,
  required = false,
): boolean {
  return (
    (value === undefined && !required) ||
    (typeof value === "string" &&
      value.length <= max &&
      (!required || value.length > 0))
  );
}

function boundedRecord(value: unknown, max: number): boolean {
  if (!recordValue(value)) return false;
  try {
    return JSON.stringify(value).length <= max;
  } catch {
    return false;
  }
}

function validAssetPayload(value: unknown): value is EditorAssetPayload {
  const asset = recordValue(value);
  return Boolean(
    asset &&
      boundedString(asset.id, 256, true) &&
      boundedString(asset.kind, 80, true) &&
      boundedString(asset.title, 300, true) &&
      validAssetUrl(asset.url) &&
      validAssetUrl(asset.previewUrl) &&
      boundedRecord(asset.meta, 20_000) &&
      typeof asset.writable === "boolean",
  );
}

/** 类型收窄：任意 message data 是否是本协议的子站→宿主消息。 */
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
    if (
      !boundedString(record.url, 2_000, true) ||
      !validAssetUrl(record.url) ||
      !validAssetUrl(record.previewUrl) ||
      !boundedString(record.title, 300) ||
      !boundedString(record.saveId, 128) ||
      (record.meta !== undefined && !boundedRecord(record.meta, 20_000))
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "error") {
    if (!boundedString(record.message, 1_000, true)) {
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

/** 类型收窄：宿主→子站消息（给子站接收端用；子站侧通常手抄本文件的形状）。 */
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
    if (!boundedString(record.saveId, 128, true)) {
      return null;
    }
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
      !boundedString(record.saveId, 128)
    ) {
      return null;
    }
    return record as unknown as HostToEditorMessage;
  }
  if (type === "init" || type === "dispose") {
    return record as unknown as HostToEditorMessage;
  }
  return null;
}

/** 构造子站 embed 编辑器 URL（宿主用）。 */
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
      value.length > 2_000
    ) {
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url.toString();
}
