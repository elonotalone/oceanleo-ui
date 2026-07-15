import { uploadFile } from "../../lib/database";

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

export async function uploadImportedModel(
  file: File,
  siteId: string,
  translate: (value: string) => string,
): Promise<string> {
  if (file.size > MAX_MODEL_BYTES) {
    throw new Error(translate("3D 模型超过 512MB 安全上限"));
  }
  const extension = file.name.toLowerCase().split(".").pop() || "";
  if (extension !== "glb" && extension !== "gltf") {
    throw new Error(translate("只支持 GLB 或 glTF 模型"));
  }
  if (extension === "gltf") {
    let source: {
      buffers?: Array<{ uri?: unknown }>;
      images?: Array<{ uri?: unknown }>;
    };
    try {
      source = JSON.parse(await file.text()) as typeof source;
    } catch {
      throw new Error(translate("glTF 文件格式无效"));
    }
    const dependencies = [
      ...(source.buffers || []),
      ...(source.images || []),
    ]
      .map((entry) =>
        typeof entry.uri === "string" ? entry.uri.trim() : "",
      )
      .filter(Boolean);
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
  const uploaded = await uploadFile(file, {
    siteId: siteId || "threed",
    title: file.name,
  });
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    throw new Error(uploaded.error || translate("3D 模型上传失败"));
  }
  return url;
}
