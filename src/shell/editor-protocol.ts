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
      type: "set-host-layout";
      instanceId: string;
      sidePanelVisible: boolean;
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
  | { protocol: typeof EDITOR_PROTOCOL; type: "dispose"; instanceId: string };

export type EditorToHostMessage =
  | { protocol: typeof EDITOR_PROTOCOL; type: "ready"; instanceId: string }
  | { protocol: typeof EDITOR_PROTOCOL; type: "dirty"; instanceId: string; dirty?: boolean }
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
  | { protocol: typeof EDITOR_PROTOCOL; type: "error"; instanceId: string; message: string }
  | { protocol: typeof EDITOR_PROTOCOL; type: "close-request"; instanceId: string };

/** 允许作为协议对端的 origin（宿主校验子站、子站校验宿主都用它）。 */
export function isTrustedEditorOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
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

/** 类型收窄：任意 message data 是否是本协议的子站→宿主消息。 */
export function asEditorToHostMessage(
  data: unknown,
  instanceId: string,
): EditorToHostMessage | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.protocol !== EDITOR_PROTOCOL) return null;
  if (record.instanceId !== instanceId) return null;
  const type = record.type;
  if (type === "artifact-created" || type === "artifact-updated") {
    if (
      typeof record.url !== "string" ||
      record.url.length > 2_000 ||
      !record.url.startsWith("https://")
    ) {
      return null;
    }
    if (
      record.saveId != null &&
      (typeof record.saveId !== "string" || record.saveId.length > 128)
    ) {
      return null;
    }
    if (
      record.meta != null &&
      (typeof record.meta !== "object" || Array.isArray(record.meta))
    ) {
      return null;
    }
    if (record.meta != null) {
      try {
        if (JSON.stringify(record.meta).length > 20_000) return null;
      } catch {
        return null;
      }
    }
    return record as unknown as EditorToHostMessage;
  }
  if (type === "error") {
    if (typeof record.message !== "string" || record.message.length > 1_000) {
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
      typeof record.requestId !== "string" ||
      !record.requestId ||
      record.requestId.length > 128 ||
      typeof record.ok !== "boolean" ||
      (record.message !== undefined &&
        (typeof record.message !== "string" || record.message.length > 500))
    ) {
      return null;
    }
    return record as unknown as EditorToHostMessage;
  }
  if (
    type === "dirty" &&
    record.dirty !== undefined &&
    typeof record.dirty !== "boolean"
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
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.protocol !== EDITOR_PROTOCOL) return null;
  if (record.instanceId !== instanceId) return null;
  const type = record.type;
  if (type === "save-request") {
    if (
      typeof record.saveId !== "string" ||
      !record.saveId ||
      record.saveId.length > 128
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
  if (
    type === "init" ||
    type === "open-asset" ||
    (type === "set-host-layout" &&
      typeof record.sidePanelVisible === "boolean") ||
    type === "save-result" ||
    type === "dispose"
  ) {
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
  url.searchParams.set("embed", "1");
  url.searchParams.set("editor", "1");
  url.searchParams.set("instance", opts.instanceId);
  url.searchParams.set("host", opts.hostOrigin);
  if (opts.assetUrl) url.searchParams.set("assetUrl", opts.assetUrl);
  if (opts.assetTitle) url.searchParams.set("assetTitle", opts.assetTitle);
  if (opts.assetKind) url.searchParams.set("assetKind", opts.assetKind);
  for (const [key, value] of Object.entries(opts.extra || {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
