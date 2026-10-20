/**
 * RichDoc 托管 iframe 的 URL 与契约 v2 信封（W08 判据 2）。
 *
 * 默认 origin 是 W18 分给文档件的 `https://docs.oceanleo.app`。
 * 只接受这个 origin（可带路径），不接受任意第三方 URL。
 */

import { EDITOR_PROTOCOL, buildEditorEmbedUrl } from "../editor-protocol";
import { hostedEditorOrigin } from "../hosted-editor-origins";
import { isTrustedEmbedEditorBase } from "../editor-sandbox-origin";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor/index";
import {
  normalizeSelectionCommand,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
} from "../selection-context";

/** 缺省家族（com）的文档 origin。运行时嵌 iframe 走 `richDocHostedEmbedBase()`。 */
export const RICHDOC_HOSTED_EMBED_ORIGIN = "https://docs.oceanleo.app";

export function richDocHostedEmbedBase(override?: string): string {
  const current = hostedEditorOrigin("docs");
  if (!override) return current;
  try {
    const url = new URL(override);
    if (url.origin !== current) return current;
    if (url.search || url.hash || url.username || url.password) {
      return current;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}` || current;
  } catch {
    return current;
  }
}

export function canBuildRichDocEmbedUrl(base: string): boolean {
  return isTrustedEmbedEditorBase(base);
}

export function buildRichDocEmbedUrl(opts: {
  instanceId: string;
  hostOrigin: string;
  assetUrl?: string;
  assetTitle?: string;
  extra?: Record<string, string>;
  base?: string;
}): string {
  const base = richDocHostedEmbedBase(opts.base);
  if (!canBuildRichDocEmbedUrl(base)) {
    throw new TypeError("docs.oceanleo.app 还不在宿主可信 embed 白名单里");
  }
  return buildEditorEmbedUrl(base, {
    instanceId: opts.instanceId,
    hostOrigin: opts.hostOrigin,
    assetUrl: opts.assetUrl,
    assetTitle: opts.assetTitle,
    assetKind: "document",
    extra: opts.extra,
  });
}

/**
 * `init` 的扩展字段。契约把 `init` 当自由载荷，Umo 侧读 `content` / `readOnly`。
 * `mode` 跟宿主当前页走：两行 chrome 之后，Umo iframe 只在「专业编辑」页上露面，
 * 所以 `init` 里通常就是 `pro`。umo-hosted 收到 `init` 会把模式重置为默认普通，
 * 因此宿主必须在 `init` **之后**再补一发 `set-mode`（见 RichDocHostedRoute.pushInit）；
 * 这里带上 mode 只是让旧版 Umo 也能一步到位，不是替代那一发。
 */
export function buildRichDocInitEnvelope(
  instanceId: string,
  payload: {
    content: unknown;
    readOnly: boolean;
    title?: string;
    mode?: EditorMode;
  },
): Record<string, unknown> {
  if (!instanceId || instanceId.length > 128) {
    throw new TypeError("richdoc hosted: instanceId 必须非空且 ≤128");
  }
  return {
    protocol: EDITOR_PROTOCOL,
    type: "init",
    instanceId,
    content: payload.content,
    readOnly: payload.readOnly === true,
    mode: payload.mode ?? DEFAULT_EDITOR_MODE,
    ...(payload.title ? { title: payload.title } : {}),
  };
}

export function defaultHostedMode(): EditorMode {
  return DEFAULT_EDITOR_MODE;
}

/** Closed Umo adapter controls. Unknown ids never count as success. */
export const RICHDOC_HOSTED_CONTROL_IDS: ReadonlySet<string> = new Set([
  "bold",
  "italic",
  "heading",
  "list",
  "link",
  "color",
]);

export const RICHDOC_HOSTED_HUMAN_ORIGINS: ReadonlySet<string> = new Set([
  "user",
  "human",
  "l1",
  "l2",
]);

export type RichDocHostedCommandOrigin = "user" | "agent";

export interface RichDocHostedSelectionGate {
  accept(command: SelectionCommand, context: SelectionContext | null): boolean;
}

export type RichDocHostedSelectionSendResult =
  | { ok: true; applied: boolean; reviewed: boolean; message: string }
  | { ok: false; message: string };

const HOSTED_FALLBACK_CONTROLS: SelectionControl[] = [
  {
    id: "bold",
    kind: "toggle",
    label: "粗体",
    icon: "bold",
    semantic: "bold",
    value: false,
  },
  {
    id: "italic",
    kind: "toggle",
    label: "斜体",
    icon: "italic",
    semantic: "italic",
    value: false,
  },
  {
    id: "heading",
    kind: "select",
    label: "标题级别",
    icon: "text",
    value: "0",
    options: [
      { value: "0", label: "正文" },
      { value: "1", label: "标题 1" },
      { value: "2", label: "标题 2" },
      { value: "3", label: "标题 3" },
      { value: "4", label: "标题 4" },
      { value: "5", label: "标题 5" },
      { value: "6", label: "标题 6" },
    ],
  },
  {
    id: "list",
    kind: "select",
    label: "列表",
    icon: "align-left",
    options: [
      { value: "bullet", label: "无序列表" },
      { value: "ordered", label: "有序列表" },
      { value: "task", label: "任务列表" },
      { value: "none", label: "取消列表" },
    ],
  },
  {
    id: "link",
    kind: "toggle",
    label: "链接",
    icon: "link",
    value: false,
  },
  {
    id: "color",
    kind: "color",
    label: "文字颜色",
    icon: "color",
    semantic: "color",
  },
];

/** Host edit bar is the L1 path only on the artifact/normal page. */
export function richDocHostedHostEditBarActive(input: {
  mode: EditorMode | string;
  ready: boolean;
  hasSource: boolean;
  readOnly: boolean;
}): boolean {
  return (
    input.mode === "normal" &&
    input.ready &&
    input.hasSource &&
    !input.readOnly
  );
}

export function richDocHostedFallbackSelection(
  revision?: number | string,
): SelectionContext {
  return {
    version: 1,
    kind: "paragraph",
    id: "richdoc-caret",
    label: "当前段落",
    controls: HOSTED_FALLBACK_CONTROLS,
    ...(revision !== undefined ? { revision } : {}),
  };
}

export function hostedSelectionForToolbar(
  selection: SelectionContext | null,
  revision?: number | string,
): SelectionContext {
  const base = selection ?? richDocHostedFallbackSelection(revision);
  return {
    ...base,
    controls: (base.controls || []).filter((control) =>
      RICHDOC_HOSTED_CONTROL_IDS.has(control.id),
    ),
  };
}

export function coerceRichDocHostedSelectionCommand(
  value: unknown,
): SelectionCommand | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const nested = record.command;
    const direct = normalizeSelectionCommand(record);
    if (direct) return adaptHostedLinkCommand(direct);
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const inner = normalizeSelectionCommand(nested);
      return inner ? adaptHostedLinkCommand(inner) : null;
    }
    if (typeof nested === "string" && nested.trim()) {
      try {
        const parsed = JSON.parse(nested) as unknown;
        const inner = normalizeSelectionCommand(parsed);
        return inner ? adaptHostedLinkCommand(inner) : null;
      } catch {
        return null;
      }
    }
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return coerceRichDocHostedSelectionCommand(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  return null;
}

function adaptHostedLinkCommand(command: SelectionCommand): SelectionCommand {
  if (command.controlId !== "link") return command;
  if (command.value === "unset") return command;
  if (command.value === false || command.value === "false") {
    return { ...command, value: "unset" };
  }
  return command;
}

export function buildRichDocHostedSelectionCommand(
  instanceId: string,
  command: unknown,
  origin: RichDocHostedCommandOrigin = "user",
): Record<string, unknown> {
  if (!instanceId || instanceId.length > 128) {
    throw new TypeError("richdoc hosted: instanceId 必须非空且 ≤128");
  }
  const normalized = coerceRichDocHostedSelectionCommand(command);
  if (!normalized) {
    throw new TypeError("richdoc hosted: selection-command 不合法");
  }
  return {
    protocol: EDITOR_PROTOCOL,
    type: "selection-command",
    instanceId,
    command: normalized,
    ...(origin === "user" || RICHDOC_HOSTED_HUMAN_ORIGINS.has(origin)
      ? { origin: "user" }
      : {}),
  };
}

export function sendRichDocHostedSelectionCommand(input: {
  command: unknown;
  selection: SelectionContext | null;
  ready: boolean;
  readOnly: boolean;
  origin: RichDocHostedCommandOrigin;
  gate: RichDocHostedSelectionGate;
  send: (message: Record<string, unknown>) => boolean;
}): RichDocHostedSelectionSendResult {
  const normalized = coerceRichDocHostedSelectionCommand(input.command);
  if (!normalized) {
    return { ok: false, message: "选区命令不合法。" };
  }
  if (!RICHDOC_HOSTED_CONTROL_IDS.has(normalized.controlId)) {
    return { ok: false, message: "专业编辑没有这条指令。" };
  }
  if (normalized.controlId === "link" && normalized.value !== "unset") {
    return { ok: false, message: "专业编辑没有这条指令。" };
  }
  if (!input.ready) {
    return { ok: false, message: "专业编辑还没载入。" };
  }
  if (input.readOnly) {
    return { ok: false, message: "文档还没载入或正在只读，不能改。" };
  }
  if (!input.gate.accept(normalized, input.selection)) {
    return { ok: false, message: "选择已变化，请重新选择后再编辑。" };
  }
  const envelope: Record<string, unknown> = {
    type: "selection-command",
    command: normalized,
  };
  if (input.origin === "user") envelope.origin = "user";
  const sent = input.send(envelope);
  if (!sent) {
    return { ok: false, message: "专业编辑还没握手成功，命令没有送出。" };
  }
  if (input.origin === "user") {
    return {
      ok: true,
      applied: true,
      reviewed: false,
      message: "已把这条选区命令交给专业编辑。",
    };
  }
  return {
    ok: true,
    applied: false,
    reviewed: true,
    message: "已提交审阅，接受后才会改动文档",
  };
}

export function buildRichDocHostedCommandSurface(input: {
  ready: boolean;
  readOnly: boolean;
  hasSource: boolean;
  selection: SelectionContext | null;
  gate: RichDocHostedSelectionGate;
  send: (message: Record<string, unknown>) => boolean;
}): {
  editorId: "richdoc";
  describe: () => Array<{
    id: string;
    label: string;
    summary: string;
    mutates: boolean;
    params?: Array<{ key: string; label: string; type: "string"; required?: boolean }>;
  }>;
  state: () => Record<string, unknown>;
  run: (
    id: string,
    params?: Record<string, unknown>,
  ) => { ok: boolean; message: string };
} {
  const canMutate = input.ready && input.hasSource && !input.readOnly;
  return {
    editorId: "richdoc",
    describe() {
      return [
        {
          id: "richdoc.describe-hosted",
          label: "专业编辑状态",
          summary: "看这份文档在 Umo 里是否已经载入、是不是只读。",
          mutates: false,
        },
        ...(canMutate
          ? [
              {
                id: "richdoc.selection-command",
                label: "转发选区命令",
                summary: "把一条已校验的选区命令交给 Umo；代理来源会先审阅。",
                mutates: true,
                params: [
                  {
                    key: "command",
                    label: "选区命令",
                    type: "string" as const,
                    required: true,
                  },
                ],
              },
            ]
          : []),
      ];
    },
    state() {
      return {
        ready: input.ready,
        readOnly: input.readOnly,
        hasSource: input.hasSource,
        kernel: "umo-hosted",
        hostEditBar: richDocHostedHostEditBarActive({
          mode: "normal",
          ready: input.ready,
          hasSource: input.hasSource,
          readOnly: input.readOnly,
        }),
      };
    },
    run(id, params) {
      if (id === "richdoc.describe-hosted") {
        return {
          ok: true,
          message: input.ready
            ? input.readOnly
              ? "专业编辑已载入，当前只读。"
              : "专业编辑已载入，可以改。"
            : "专业编辑还没载入。",
        };
      }
      if (id !== "richdoc.selection-command") {
        return { ok: false, message: "专业编辑没有这条指令。" };
      }
      const result = sendRichDocHostedSelectionCommand({
        command: params,
        selection: input.selection,
        ready: input.ready,
        readOnly: input.readOnly,
        origin: "agent",
        gate: input.gate,
        send: input.send,
      });
      return { ok: result.ok, message: result.message };
    },
  };
}
