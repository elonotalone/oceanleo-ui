import { uploadFile } from "../../lib/database";
import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import {
  absoluteMediaUrl,
  canvasSafeUrl,
  fetchMediaBlob,
} from "../../lib/media-proxy";
import {
  assertBlobSource,
  gltfDependencyUris,
  parseGltfDocument,
} from "./source-integrity.mjs";
import {
  Model3DHttpError,
  materializeModel3DGltfDependencies,
  model3DDependencyGrantPath,
  model3DDependencyPath,
  model3DSourceGrantPath,
  normalizeModel3DArtifactIdentity,
  model3DIdentityFromAccessUrl,
  validateModel3DGrant,
  withModel3DRetry,
  type Model3DArtifactIdentity,
} from "./model3d-dependency-runtime.mjs";
import {
  Model3DClosureError,
  model3DDependencyRefs,
  resolveModel3DDependencyClosure,
  type Model3DClosureEntry,
} from "./model3d-closure";

export type { Model3DArtifactIdentity } from "./model3d-dependency-runtime.mjs";

export const MAX_MODEL_BYTES = 512 * 1024 * 1024;

export function safeModelStem(title: string): string {
  const stem = title
    .replace(/\.(?:glb|gltf)$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
  return stem || "oceanleo-model";
}

export function modelExtension(url: string, title: string): "glb" | "gltf" {
  const hint = `${url} ${title}`.toLowerCase();
  return /\.gltf(?:$|[?#\s])/.test(hint) ? "gltf" : "glb";
}

export function triggerModelDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface PreparedModelRuntimeSource {
  url: string;
  format: "glb" | "gltf";
  sourceUrl: string;
  dependencyBaseUrl: string;
  /** §3.3 闭包凭据:实际取回的外部依赖条数与字节合计。 */
  closure: {
    dependencyCount: number;
    closureBytes: number;
    sourceBytes: number;
  };
  release: () => void;
}

/**
 * §3.3 受控失败:任何一件闭包依赖取不回来时,把它按 buffer / image 分类成
 * §3.2 的 `invalid`(无几何即无模型)或 `degraded`(缺贴图),并在错误里点名
 * 具体是哪一件。调用方 MUST 把这条错误显示出来,MUST NOT 静默渲空场景。
 */
function closureFailure(
  document: unknown,
  failedUri: string,
  cause: unknown,
): Model3DClosureError {
  const available: Model3DClosureEntry[] = model3DDependencyRefs(
    document as Record<string, unknown>,
  )
    .filter((ref) => ref.uri !== failedUri)
    .map((ref) => ({ path: ref.uri, bytes: 1 }));
  const resolution = resolveModel3DDependencyClosure(
    document as Record<string, unknown>,
    available,
  );
  const detail = cause instanceof Error ? cause.message : String(cause || "");
  const error = new Model3DClosureError({
    ...resolution,
    message: detail
      ? `${resolution.message}（原因：${detail}）`
      : resolution.message,
  });
  return error;
}

function modelGrantError(payload: unknown, status: number): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return `3D source grant failed HTTP ${status}`;
  }
  const record = payload as Record<string, unknown>;
  const detail =
    record.detail && typeof record.detail === "object" &&
      !Array.isArray(record.detail)
      ? record.detail as Record<string, unknown>
      : null;
  const message =
    (typeof detail?.message === "string" && detail.message) ||
    (typeof record.message === "string" && record.message) ||
    (typeof record.detail === "string" && record.detail);
  return message || `3D source grant failed HTTP ${status}`;
}

async function modelGrantToken(): Promise<string> {
  let token: string | null = null;
  try {
    token = await accessToken();
  } catch (caught) {
    throw new Error(
      caught instanceof Error ? caught.message : "无法读取 3D 素材访问凭据",
    );
  }
  if (!token) throw new Error("登录后才能加载完整 3D 模型依赖");
  return token;
}

async function requestModelGrant(
  path: string,
  identity: Model3DArtifactIdentity,
  token: string,
  signal: AbortSignal | undefined,
  dependencyPath = "",
) {
  const response = await fetch(`${GATEWAY_BASE.replace(/\/+$/, "")}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
    credentials: "include",
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The status-specific error below remains authoritative.
  }
  if (!response.ok) {
    throw new Model3DHttpError(
      modelGrantError(payload, response.status),
      response.status,
    );
  }
  return validateModel3DGrant(
    payload,
    identity,
    GATEWAY_BASE,
    dependencyPath,
  );
}

async function fetchGrantedModelBlob(
  url: string,
  token: string,
  signal: AbortSignal | undefined,
): Promise<Blob> {
  const requestUrl = canvasSafeUrl(absoluteMediaUrl(url));
  let sendAuthorization = false;
  try {
    sendAuthorization =
      new URL(requestUrl, window.location.href).origin ===
        new URL(GATEWAY_BASE).origin;
  } catch {
    // Invalid URLs fail in fetch without leaking the bearer token.
  }
  const response = await fetch(requestUrl, {
    headers: sendAuthorization
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
    signal,
    ...(sendAuthorization ? { credentials: "include" as const } : {}),
  });
  if (!response.ok) {
    throw new Model3DHttpError(
      `3D 素材加载失败 HTTP ${response.status}`,
      response.status,
    );
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_MODEL_BYTES) {
    throw new Error("3D 素材超过 512MB 安全上限");
  }
  const blob = await response.blob();
  if (blob.size > MAX_MODEL_BYTES) {
    throw new Error("3D 素材超过 512MB 安全上限");
  }
  return blob;
}

/**
 * Loads and validates the entrypoint, then materializes one self-contained
 * browser object-URL closure. Typed artifacts refresh the source grant and
 * issue one authenticated, revision-pinned grant per external glTF dependency.
 */
export async function prepareModelRuntimeSource(
  url: string,
  signal?: AbortSignal,
  dependencyBaseUrl = url,
  artifactIdentity?: Model3DArtifactIdentity | null,
  expectedArtifactId = "",
): Promise<PreparedModelRuntimeSource> {
  const sourceUrl = absoluteMediaUrl(url);
  const resolvedDependencyBaseUrl = absoluteMediaUrl(
    dependencyBaseUrl || sourceUrl,
  );
  let identity = normalizeModel3DArtifactIdentity(artifactIdentity);
  const hint = identity ? null : model3DIdentityFromAccessUrl(sourceUrl, GATEWAY_BASE, expectedArtifactId);
  identity ||= hint;
  let token = "";
  let grantedFormat = "";
  if (identity) {
    token = await modelGrantToken();
  }
  if (hint) {
    // Resolve only this exact old checkpoint, never head: its journal may still
    // contain unsaved clone/delete operations which cannot be replayed on head.
    const response = await fetch(`${GATEWAY_BASE.replace(/\/+$/, "")}/v1/library/items/${encodeURIComponent(hint.artifactId)}?revisionId=${encodeURIComponent(hint.revisionId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal, credentials: "include",
    });
    if (!response.ok) throw new Model3DHttpError("无法恢复 3D 检查点版本", response.status);
    const projection = await response.json();
    const digest = String(projection.source?.digest || "");
    if (projection.artifactId !== hint.artifactId || projection.revisionId !== hint.revisionId ||
      !["glb", "gltf"].includes(projection.sourceFormat) || !/^[a-f0-9]{64}$/i.test(digest)) {
      throw new Error("3D 检查点来源身份无法确认");
    }
    identity = { ...hint, sourceDigest: digest.toLowerCase() };
  }
  // Grant and download retry together: a gateway restart ("Failed to fetch") or
  // an expired 5-minute signed URL (410) is cured by a fresh grant, no Reload.
  const blob = identity
    ? await withModel3DRetry(async () => {
        const sourceGrant = await requestModelGrant(
          model3DSourceGrantPath(identity),
          identity,
          token,
          signal,
        );
        grantedFormat = sourceGrant.format;
        return fetchGrantedModelBlob(sourceGrant.url, token, signal);
      }, { signal })
    : await withModel3DRetry(
        () =>
          fetchMediaBlob(sourceUrl, {
            maxBytes: MAX_MODEL_BYTES,
            signal,
          }),
        { signal },
      );
  const format = await assertBlobSource(blob, "model3d");
  if (hint && identity?.sourceDigest) {
    const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const actual = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== identity.sourceDigest) throw new Error("3D 检查点内容校验失败");
  }
  if (format !== "glb" && format !== "gltf") {
    throw new Error("3D 模型源格式校验失败");
  }
  if (grantedFormat && grantedFormat !== format) {
    throw new Error("3D source grant format disagrees with the validated bytes");
  }

  let dependencyRelease: (() => void) | null = null;
  let totalBytes = blob.size;
  let runtimeBlob = blob;
  let closureBytes = 0;
  let dependencyCount = 0;
  if (format === "gltf") {
    const document = parseGltfDocument(await blob.text());
    gltfDependencyUris(document);
    dependencyCount = new Set(
      model3DDependencyRefs(document).map((ref) => ref.uri),
    ).size;
    const materialized = await materializeModel3DGltfDependencies(
      document,
      async (uri) => {
        let dependency: Blob;
        try {
          if (identity) {
            const dependencyPath = model3DDependencyPath(uri);
            dependency = await withModel3DRetry(async () => {
              const grant = await requestModelGrant(
                model3DDependencyGrantPath(identity, dependencyPath),
                identity,
                token,
                signal,
                dependencyPath,
              );
              return fetchGrantedModelBlob(grant.url, token, signal);
            }, { signal });
          } else {
            let resolved: URL;
            try {
              resolved = new URL(uri, resolvedDependencyBaseUrl);
            } catch {
              throw new Error(`glTF 依赖地址无法解析：${uri.slice(0, 160)}`);
            }
            if (!["http:", "https:"].includes(resolved.protocol)) {
              throw new Error(`glTF 依赖协议不受支持：${resolved.protocol}`);
            }
            const href = resolved.href;
            dependency = await withModel3DRetry(
              () =>
                fetchMediaBlob(href, {
                  maxBytes: MAX_MODEL_BYTES,
                  signal,
                }),
              { signal },
            );
          }
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError") {
            throw caught;
          }
          throw closureFailure(document, uri, caught);
        }
        if (!dependency.size) throw closureFailure(document, uri, null);
        totalBytes += dependency.size;
        closureBytes += dependency.size;
        if (totalBytes > MAX_MODEL_BYTES) {
          throw new Error("3D 模型依赖闭包超过 512MB 安全上限");
        }
        return dependency;
      },
    );
    dependencyRelease = materialized.release;
    runtimeBlob = new Blob([JSON.stringify(materialized.document)], {
      type: "model/gltf+json",
    });
  }
  let runtimeUrl = "";
  try {
    runtimeUrl = URL.createObjectURL(runtimeBlob);
  } catch (caught) {
    dependencyRelease?.();
    throw caught;
  }
  let released = false;
  return {
    url: runtimeUrl,
    format,
    sourceUrl,
    dependencyBaseUrl: resolvedDependencyBaseUrl,
    closure: { dependencyCount, closureBytes, sourceBytes: blob.size },
    release: () => {
      if (released) return;
      released = true;
      URL.revokeObjectURL(runtimeUrl);
      dependencyRelease?.();
    },
  };
}

export interface UploadedModelSource {
  url: string;
  format: "glb" | "gltf";
  dependencyBaseUrl: string;
}

export async function uploadImportedModel(
  file: File,
  siteId: string,
  translate: (value: string) => string,
): Promise<UploadedModelSource> {
  if (file.size > MAX_MODEL_BYTES) {
    throw new Error(translate("3D 模型超过 512MB 安全上限"));
  }
  const extension = file.name.toLowerCase().split(".").pop() || "";
  if (extension !== "glb" && extension !== "gltf") {
    throw new Error(translate("只支持 GLB 或 glTF 模型"));
  }
  const actualFormat = await assertBlobSource(file, "model3d");
  if (actualFormat !== extension) {
    throw new Error(
      translate(
        `3D 模型扩展名与真实内容不一致：文件名是 ${extension}，内容是 ${actualFormat}`,
      ),
    );
  }
  if (extension === "gltf") {
    const source = parseGltfDocument(await file.text());
    const dependencies = gltfDependencyUris(source);
    if (
      dependencies.some(
        (uri) =>
          !uri.startsWith("data:") &&
          !uri.startsWith("https://") &&
          !uri.startsWith("http://"),
      )
    ) {
      throw new Error(
        translate("这个 glTF 依赖本地纹理或 .bin 文件，请先打包为单文件 GLB"),
      );
    }
  }
  const canonicalFile = new File([file], file.name, {
    type: extension === "gltf" ? "model/gltf+json" : "model/gltf-binary",
    lastModified: file.lastModified,
  });
  const uploaded = await uploadFile(canonicalFile, {
    siteId: siteId || "threed",
    title: file.name,
  });
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    throw new Error(uploaded.error || translate("3D 模型上传失败"));
  }
  return {
    url,
    format: extension,
    dependencyBaseUrl: url,
  };
}

export async function uploadModel3DPoster(
  blob: Blob,
  siteId: string,
  title: string,
): Promise<string> {
  if (!(blob instanceof Blob) || !blob.size || blob.type !== "image/png") {
    throw new Error("3D 模型海报必须是非空 PNG");
  }
  const file = new File([blob], `${safeModelStem(title)}-poster.png`, {
    type: "image/png",
  });
  const uploaded = await uploadFile(file, {
    siteId: siteId || "threed",
    title: file.name,
  });
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    throw new Error(uploaded.error || "3D 模型海报上传失败");
  }
  return url;
}
