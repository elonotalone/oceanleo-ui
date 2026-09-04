/**
 * 音频托管 iframe 的 URL 与 init 信封（W10 判据 2）。
 *
 * 默认 origin 是 W18 分给音频件的 `https://audio.oceanleo.app`。
 * 音频字节不放进查询串，只走 init 的自由载荷（ArrayBuffer → base64）。
 */
import { EDITOR_PROTOCOL, buildEditorEmbedUrl } from "../editor-protocol";
import { HOSTED_EDITOR_ORIGINS } from "../hosted-editor-origins";
import { isTrustedEmbedEditorBase } from "../editor-sandbox-origin";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor/index";

export const AUDIO_HOSTED_EMBED_ORIGIN = "https://audio.oceanleo.app";

const ORIGIN_SET = new Set<string>(
  HOSTED_EDITOR_ORIGINS.filter(
    (origin) => origin === AUDIO_HOSTED_EMBED_ORIGIN,
  ),
);

export function audioHostedEmbedBase(override?: string): string {
  if (!override) return AUDIO_HOSTED_EMBED_ORIGIN;
  try {
    const url = new URL(override);
    if (!ORIGIN_SET.has(url.origin)) return AUDIO_HOSTED_EMBED_ORIGIN;
    if (url.search || url.hash || url.username || url.password) {
      return AUDIO_HOSTED_EMBED_ORIGIN;
    }
    return (
      `${url.origin}${url.pathname.replace(/\/+$/, "")}` ||
      AUDIO_HOSTED_EMBED_ORIGIN
    );
  } catch {
    return AUDIO_HOSTED_EMBED_ORIGIN;
  }
}

export function canBuildAudioEmbedUrl(base: string): boolean {
  return isTrustedEmbedEditorBase(base);
}

export function buildAudioEmbedUrl(opts: {
  instanceId: string;
  hostOrigin: string;
  assetTitle?: string;
  extra?: Record<string, string>;
  base?: string;
}): string {
  const base = audioHostedEmbedBase(opts.base);
  if (!canBuildAudioEmbedUrl(base)) {
    throw new TypeError("audio.oceanleo.app 还不在宿主可信 embed 白名单里");
  }
  const extra = { ...(opts.extra || {}) };
  for (const key of Object.keys(extra)) {
    if (/(token|secret|key|password|cookie|authorization)/i.test(key)) {
      throw new TypeError("音频 iframe URL 不许携带凭据字段");
    }
  }
  return buildEditorEmbedUrl(base, {
    instanceId: opts.instanceId,
    hostOrigin: opts.hostOrigin,
    assetTitle: opts.assetTitle,
    assetKind: "audio",
    extra,
  });
}

/**
 * init 自由载荷：wav/mp3 用 base64。iframe 内零凭据，不带 cookie、不带 API token。
 */
export function buildAudioInitEnvelope(
  instanceId: string,
  payload: {
    audioBase64: string;
    mime: string;
    readOnly: boolean;
    title?: string;
    trackCount?: number;
  },
): Record<string, unknown> {
  if (!instanceId || instanceId.length > 128) {
    throw new TypeError("audio hosted: instanceId 必须非空且 ≤128");
  }
  if (!payload.audioBase64) {
    throw new TypeError("audio hosted: init 必须带 audioBase64");
  }
  return {
    protocol: EDITOR_PROTOCOL,
    type: "init",
    instanceId,
    audioBase64: payload.audioBase64,
    mime: payload.mime || "audio/wav",
    readOnly: payload.readOnly === true,
    mode: DEFAULT_EDITOR_MODE,
    trackCount:
      typeof payload.trackCount === "number" ? payload.trackCount : 1,
    ...(payload.title ? { title: payload.title } : {}),
  };
}

export function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function defaultHostedMode(): EditorMode {
  return DEFAULT_EDITOR_MODE;
}
