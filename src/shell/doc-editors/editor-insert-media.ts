import { uploadFile } from "../../lib/database";

/** Media becomes durable before it enters an editor document. Capture never uploads. */
export async function uploadEditorMedia(blob: Blob, name: string, siteId: string): Promise<string> {
  const result = await uploadFile(new File([blob], name, { type: blob.type }), {
    privateUpload: true,
    registerAsset: false,
    siteId: siteId || "oceanleo",
    title: name,
  });
  const url = result.data?.file?.url;
  if (!result.ok || !url) throw new Error(result.error || "文件上传失败");
  return url;
}

export async function durableEditorMediaUrl(src: string, siteId: string, name = "image"): Promise<string> {
  if (!/^(?:data:|blob:)/i.test(src)) return src;
  const response = await fetch(src);
  if (!response.ok) throw new Error("图片读取失败");
  return uploadEditorMedia(await response.blob(), name, siteId);
}
