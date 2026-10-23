/**
 * 素材库 → 视频画布（D2 / _EDITOR.md §E）：点一下图片、视频或音频素材，
 * 画布上多一个对应种类的媒体节点，节点记下来源素材的 artifact / revision。
 *
 * 只记引用、不把字节塞进工程的 `assets`：v2 工程的资产闭包要求每个资产带
 * 可验的私有定位和摘要，并在后续保存里改成 `sourceDependency` 固定路径，
 * 那条链属于视频核心的生成流程；画布这里如实记「这个节点用的是哪份素材」。
 * 缩略图只在本次会话里显示（素材自带的 https 海报图），不写进工程。
 */
import type { LibraryItem } from "../library-data";
import type { VideoDocPosition } from "./video-project-doc";
import { addVideoDocAsset, addVideoDocNode, videoDocNewId, type VideoProjectDoc } from "./video-project-doc";

export type VideoMaterialKind = "image" | "video" | "audio";

const EXTENSIONS: ReadonlyArray<[VideoMaterialKind, RegExp]> = [
  ["image", /\.(?:png|jpe?g|gif|webp|avif|bmp)(?:$|[?#])/i],
  ["video", /\.(?:mp4|mov|webm|m4v|mkv)(?:$|[?#])/i],
  ["audio", /\.(?:mp3|wav|m4a|aac|ogg|flac)(?:$|[?#])/i],
];

export function videoMaterialKind(item: LibraryItem): VideoMaterialKind | null {
  const type = String(item.artifactType || "");
  if (type === "single_file_image" || type === "composite_image" || type === "vector_image") return "image";
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  const kind = String(item.kind || "");
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  const mime = String(item.meta?.mime || item.meta?.source_media_type || "");
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const url = item.url || item.previewUrl || "";
  for (const [candidate, pattern] of EXTENSIONS) if (pattern.test(url)) return candidate;
  return null;
}

/** Session-only thumbnail: a displayable https poster, never a blob/data URL. */
export function videoMaterialThumb(item: LibraryItem): string {
  const candidate = item.posterUrl || "";
  return /^https:\/\//i.test(candidate) ? candidate : "";
}

export function videoMaterialNodeInput(
  item: LibraryItem,
  kind: VideoMaterialKind,
  position: VideoDocPosition,
  fallbackTitle: string,
) {
  const title = String(item.title || "").replace(/\s+/g, " ").trim().slice(0, 80) || fallbackTitle;
  return {
    kind,
    title,
    position,
    materialRef: {
      artifactId: String(item.artifactId || ""),
      revisionId: String(item.revisionId || ""),
      artifactType: String(item.artifactType || item.kind || kind),
      title,
    },
  };
}

export interface VideoMaterialReceipt {
  blobId: string;
  digest: string;
  mediaType: string;
  byteSize: number;
}

/** One insertion is one immutable graph+asset mutation, with complete byte evidence. */
export function insertVideoMaterial(doc: VideoProjectDoc, item: LibraryItem, kind: VideoMaterialKind, position: VideoDocPosition, receipt: VideoMaterialReceipt) {
  if (!receipt.blobId.startsWith("project-assets:") || !/^[a-f0-9]{64}$/.test(receipt.digest) || !receipt.mediaType.startsWith(`${kind}/`) || receipt.byteSize <= 0) {
    throw new Error("素材字节没有通过私有保存校验。");
  }
  const assetId = videoDocNewId("asset", new Set(Object.keys(doc.assets)));
  const asset = { assetId, kind, title: item.title, origin: "import", immutable: true, createdAt: new Date().toISOString(), mime: receipt.mediaType, url: receipt.blobId, contentDigest: receipt.digest, byteSize: receipt.byteSize };
  const withAsset = addVideoDocAsset(doc, asset);
  const node = videoMaterialNodeInput(item, kind, position, kind);
  return addVideoDocNode(withAsset, { ...node, assetId, localEditRecipe: [] });
}

/** Match backend closure paths and replace transient staging locations on open/save. */
export function pinVideoProjectAssets(doc: VideoProjectDoc, artifactId: string, revisionId: string): VideoProjectDoc {
  let changed = false;
  const assets = Object.fromEntries(Object.entries(doc.assets).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([id, asset], index) => {
    const digest = String(asset.contentDigest || "").replace(/^sha256:/, "");
    const mime = String(asset.mime || "");
    const byteSize = Number(asset.byteSize || asset.size || 0);
    const reference = asset.sourceDependency as { path?: unknown } | undefined;
    if (!/^[a-f0-9]{64}$/.test(digest) || !mime || !Number.isSafeInteger(byteSize) || byteSize <= 0) return [id, asset];
    const safeId = id.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "asset";
    const path = typeof reference?.path === "string" ? reference.path : `assets/${String(index + 1).padStart(4, "0")}-${safeId}`;
    const { url: _url, previewUrl: _preview, sourceDependency: _reference, ...rest } = asset;
    changed = true;
    return [id, { ...rest, sourceDependency: { artifactId, revisionId, path, sha256: digest, mediaType: mime, byteSize } }];
  }));
  return changed ? { ...doc, assets } : doc;
}
