/**
 * 3D 托管 iframe 的 URL 与 init 信封（W11 判据 2）。
 *
 * 默认 origin 是 W18 分给 3D 件的 `https://3d.oceanleo.app`。
 * glTF 不放进查询串（可能带能力 URL），只走 init 的自由载荷。
 */
import { EDITOR_PROTOCOL, buildEditorEmbedUrl } from "../editor-protocol";
import { HOSTED_EDITOR_ORIGINS } from "../hosted-editor-origins";
import { isTrustedEmbedEditorBase } from "../editor-sandbox-origin";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor/index";

export const MODEL3D_HOSTED_EMBED_ORIGIN = "https://3d.oceanleo.app";

const ORIGIN_SET = new Set<string>(
  HOSTED_EDITOR_ORIGINS.filter(
    (origin) => origin === MODEL3D_HOSTED_EMBED_ORIGIN,
  ),
);

export function model3dHostedEmbedBase(override?: string): string {
  if (!override) return MODEL3D_HOSTED_EMBED_ORIGIN;
  try {
    const url = new URL(override);
    if (!ORIGIN_SET.has(url.origin)) return MODEL3D_HOSTED_EMBED_ORIGIN;
    if (url.search || url.hash || url.username || url.password) {
      return MODEL3D_HOSTED_EMBED_ORIGIN;
    }
    return (
      `${url.origin}${url.pathname.replace(/\/+$/, "")}` ||
      MODEL3D_HOSTED_EMBED_ORIGIN
    );
  } catch {
    return MODEL3D_HOSTED_EMBED_ORIGIN;
  }
}

export function canBuildModel3DEmbedUrl(base: string): boolean {
  return isTrustedEmbedEditorBase(base);
}

export function buildModel3DEmbedUrl(opts: {
  instanceId: string;
  hostOrigin: string;
  assetTitle?: string;
  extra?: Record<string, string>;
  base?: string;
}): string {
  const base = model3dHostedEmbedBase(opts.base);
  if (!canBuildModel3DEmbedUrl(base)) {
    throw new TypeError("3d.oceanleo.app 还不在宿主可信 embed 白名单里");
  }
  return buildEditorEmbedUrl(base, {
    instanceId: opts.instanceId,
    hostOrigin: opts.hostOrigin,
    assetTitle: opts.assetTitle,
    assetKind: "model3d",
    extra: opts.extra,
  });
}

/**
 * init 自由载荷：glTF 用 base64。iframe 内零凭据，不带 cookie、不带 API token。
 */
export function buildModel3DInitEnvelope(
  instanceId: string,
  payload: {
    gltfBase64: string;
    format: "glb" | "gltf";
    readOnly: boolean;
    title?: string;
  },
): Record<string, unknown> {
  if (!instanceId || instanceId.length > 128) {
    throw new TypeError("model3d hosted: instanceId 必须非空且 ≤128");
  }
  if (!payload.gltfBase64) {
    throw new TypeError("model3d hosted: init 必须带 gltfBase64");
  }
  return {
    protocol: EDITOR_PROTOCOL,
    type: "init",
    instanceId,
    gltfBase64: payload.gltfBase64,
    format: payload.format,
    readOnly: payload.readOnly === true,
    mode: DEFAULT_EDITOR_MODE,
    ...(payload.title ? { title: payload.title } : {}),
  };
}

export function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
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
