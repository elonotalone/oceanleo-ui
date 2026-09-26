"use client";

import { prepareModelRuntimeSource } from "./model3d-files";

export type Model3DSourceFormat = "glb" | "gltf";

export type Model3DSourceBytes = {
  url: string;
  format: Model3DSourceFormat;
  bytes: ArrayBuffer;
};

type SourceRequest = {
  url: string;
  format?: string | null;
  revision?: string | null;
  artifactId?: string | null;
  revisionId?: string | null;
};

const sourcePromises = new Map<string, Promise<Model3DSourceBytes>>();

function sourceKey(source: SourceRequest): string {
  return [
    source.url,
    source.revision || "",
    source.format || "",
    source.artifactId || "",
    source.revisionId || "",
  ].join("\n");
}

function inferFormat(url: string, blobType: string): Model3DSourceFormat {
  return blobType.includes("json") || /\.gltf(?:$|[?#])/i.test(url)
    ? "gltf"
    : "glb";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

async function inlineGltfDependencies(blob: Blob): Promise<Blob> {
  const document = JSON.parse(await blob.text()) as Record<string, unknown>;
  for (const key of ["buffers", "images"] as const) {
    const entries = Array.isArray(document[key]) ? document[key] : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const uri = typeof record.uri === "string" ? record.uri : "";
      if (!uri || uri.startsWith("data:")) continue;
      const response = await fetch(uri, { cache: "no-store" });
      if (!response.ok) throw new Error(`3D 模型依赖闭包读取失败 HTTP ${response.status}`);
      const dependency = await response.blob();
      const bytes = new Uint8Array(await dependency.arrayBuffer());
      if (!bytes.byteLength) throw new Error("3D 模型依赖闭包包含空文件");
      const mime = dependency.type || (key === "images" ? "application/octet-stream" : "application/octet-stream");
      record.uri = `data:${mime};base64,${bytesToBase64(bytes)}`;
    }
  }
  return new Blob([JSON.stringify(document)], { type: "model/gltf+json" });
}

export function preloadModel3DSource(
  source: SourceRequest,
): Promise<Model3DSourceBytes> {
  const url = source.url.trim();
  if (!url) return Promise.reject(new Error("3D 素材没有可读取的源地址。"));
  const key = sourceKey({ ...source, url });
  const existing = sourcePromises.get(key);
  if (existing) return existing;
  const artifactIdentity =
    source.artifactId && source.revisionId
      ? { artifactId: source.artifactId, revisionId: source.revisionId }
      : null;
  const pending = prepareModelRuntimeSource(url, undefined, url, artifactIdentity)
    .then(async (prepared) => {
      try {
        const response = await fetch(prepared.url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`3D 模型闭包读取失败 HTTP ${response.status}`);
        }
        let blob = await response.blob();
        if (prepared.format === "gltf") blob = await inlineGltfDependencies(blob);
        return {
          url,
          format: prepared.format || inferFormat(url, blob.type),
          bytes: await blob.arrayBuffer(),
        };
      } finally {
        prepared.release();
      }
    })
    .catch((error) => {
      sourcePromises.delete(key);
      throw error;
    });
  sourcePromises.set(key, pending);
  return pending;
}

export function clearModel3DSourceCache(): void {
  sourcePromises.clear();
}
