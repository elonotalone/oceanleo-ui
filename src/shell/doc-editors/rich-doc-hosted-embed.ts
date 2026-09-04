/**
 * RichDoc 托管 iframe 的 URL 与契约 v2 信封（W08 判据 2）。
 *
 * 默认 origin 是 W18 分给文档件的 `https://docs.oceanleo.app`。
 * 只接受这个 origin（可带路径），不接受任意第三方 URL。
 */

import { EDITOR_PROTOCOL, buildEditorEmbedUrl } from "../editor-protocol";
import { HOSTED_EDITOR_ORIGINS } from "../hosted-editor-origins";
import { isTrustedEmbedEditorBase } from "../editor-sandbox-origin";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor/index";

export const RICHDOC_HOSTED_EMBED_ORIGIN = "https://docs.oceanleo.app";

const DOCS_ORIGIN_SET = new Set<string>(
  HOSTED_EDITOR_ORIGINS.filter((origin) => origin === RICHDOC_HOSTED_EMBED_ORIGIN),
);

export function richDocHostedEmbedBase(override?: string): string {
  if (!override) return RICHDOC_HOSTED_EMBED_ORIGIN;
  try {
    const url = new URL(override);
    if (!DOCS_ORIGIN_SET.has(url.origin)) return RICHDOC_HOSTED_EMBED_ORIGIN;
    if (url.search || url.hash || url.username || url.password) {
      return RICHDOC_HOSTED_EMBED_ORIGIN;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}` || RICHDOC_HOSTED_EMBED_ORIGIN;
  } catch {
    return RICHDOC_HOSTED_EMBED_ORIGIN;
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
 * 默认普通模式由宿主随后发 `set-mode`，这里不另发明开关。
 */
export function buildRichDocInitEnvelope(
  instanceId: string,
  payload: { content: unknown; readOnly: boolean; title?: string },
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
    mode: DEFAULT_EDITOR_MODE,
    ...(payload.title ? { title: payload.title } : {}),
  };
}

export function defaultHostedMode(): EditorMode {
  return DEFAULT_EDITOR_MODE;
}
