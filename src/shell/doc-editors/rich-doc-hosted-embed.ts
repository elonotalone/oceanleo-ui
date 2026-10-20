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

export function buildRichDocHostedSelectionCommand(
  instanceId: string,
  command: Record<string, unknown>,
): Record<string, unknown> {
  if (!instanceId || instanceId.length > 128) {
    throw new TypeError("richdoc hosted: instanceId 必须非空且 ≤128");
  }
  return {
    protocol: EDITOR_PROTOCOL,
    type: "selection-command",
    instanceId,
    command,
  };
}

type RichDocHostedCommandSink = (command: Record<string, unknown>) => boolean;

const hostedCommandSinks = new Map<string, RichDocHostedCommandSink>();

export function bindRichDocHostedCommandSink(
  instanceId: string,
  sink: RichDocHostedCommandSink,
): () => void {
  if (!instanceId) return () => {};
  hostedCommandSinks.set(instanceId, sink);
  return () => {
    if (hostedCommandSinks.get(instanceId) === sink) {
      hostedCommandSinks.delete(instanceId);
    }
  };
}

export function dispatchRichDocHostedCommand(
  instanceId: string,
  command: Record<string, unknown>,
): boolean {
  return hostedCommandSinks.get(instanceId)?.(command) === true;
}

export function resetRichDocHostedCommandSinksForTests(): void {
  hostedCommandSinks.clear();
}

export function buildRichDocHostedCommandSurface(input: {
  ready: boolean;
  readOnly: boolean;
  hasSource: boolean;
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
                summary: "把编辑栏的一条选区命令交给 Umo。",
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
      if (!canMutate) {
        return { ok: false, message: "文档还没载入或正在只读，不能改。" };
      }
      let command: Record<string, unknown>;
      const raw = params?.command;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        command = raw as Record<string, unknown>;
      } else if (typeof raw === "string" && raw.trim()) {
        try {
          command = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return { ok: false, message: "选区命令不是合法 JSON。" };
        }
      } else {
        return { ok: false, message: "缺少选区命令。" };
      }
      const sent = input.send({ type: "selection-command", command });
      return sent
        ? { ok: true, message: "已把这条选区命令交给专业编辑。" }
        : { ok: false, message: "专业编辑还没握手成功，命令没有送出。" };
    },
  };
}
