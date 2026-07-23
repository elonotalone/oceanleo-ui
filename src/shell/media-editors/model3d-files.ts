import { uploadFile } from "../../lib/database";
import {
  absoluteMediaUrl,
  canvasSafeUrl,
  fetchMediaBlob,
} from "../../lib/media-proxy";
import {
  assertBlobSource,
  gltfDependencyUris,
  parseGltfDocument,
  rewriteGltfDependencyUris,
} from "./source-integrity.mjs";

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
  release: () => void;
}

/**
 * Loads the entrypoint through the controlled media proxy, validates its real
 * bytes, and rewrites every external glTF dependency through that same proxy.
 */
export async function prepareModelRuntimeSource(
  url: string,
  signal?: AbortSignal,
  dependencyBaseUrl = url,
): Promise<PreparedModelRuntimeSource> {
  const sourceUrl = absoluteMediaUrl(url);
  const resolvedDependencyBaseUrl = absoluteMediaUrl(
    dependencyBaseUrl || sourceUrl,
  );
  const blob = await fetchMediaBlob(sourceUrl, {
    maxBytes: MAX_MODEL_BYTES,
    signal,
  });
  const format = await assertBlobSource(blob, "model3d");
  if (format !== "glb" && format !== "gltf") {
    throw new Error("3D 模型源格式校验失败");
  }
  const runtimeBlob =
    format === "gltf"
      ? new Blob(
          [
            JSON.stringify(
              rewriteGltfDependencyUris(
                parseGltfDocument(await blob.text()),
                resolvedDependencyBaseUrl,
                canvasSafeUrl,
              ),
            ),
          ],
          { type: "model/gltf+json" },
        )
      : blob;
  const runtimeUrl = URL.createObjectURL(runtimeBlob);
  let released = false;
  return {
    url: runtimeUrl,
    format,
    sourceUrl,
    dependencyBaseUrl: resolvedDependencyBaseUrl,
    release: () => {
      if (released) return;
      released = true;
      URL.revokeObjectURL(runtimeUrl);
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
