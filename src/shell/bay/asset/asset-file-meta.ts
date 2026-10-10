// 素材详情用的纯函数：文件名 / 格式 / 大小 / 像素尺寸 / 官方文书编号。

/** 官方发布编号。合同示范文本是 `GF-2026-2621` / `HF-2025-04` / `SDF-2025-0003`；最高法样式是 `SPC民-C01-003`；证监会公告是 `证监会公告〔2022〕36号`。 */
const CONTRACT_DOC_NO = /^[A-Z]{2,5}-\d{4}-\d+$/;
const SPC_DOC_NO = /^SPC[\u4e00-\u9fffA-Za-z0-9]*-.+$/;
const WASH_DOC_NO = /^OL[A-Z]-\d{4}$/;
const CSRC_ANNOUNCEMENT = /^证监会公告〔\d{4}〕\d+号/;

export function officialDocNumbers(tags: readonly string[] | null | undefined): string[] {
  if (!tags) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = typeof raw === "string" ? raw.trim() : "";
    if (!tag || seen.has(tag)) continue;
    if (
      CONTRACT_DOC_NO.test(tag) ||
      SPC_DOC_NO.test(tag) ||
      WASH_DOC_NO.test(tag) ||
      CSRC_ANNOUNCEMENT.test(tag)
    ) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

function lastPathSegment(url: string): string {
  const trimmed = (url || "").split("?")[0].split("#")[0];
  const parts = trimmed.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function extensionOf(url: string): string {
  const name = lastPathSegment(url);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

export interface FileMetaAsset {
  title?: string;
  format?: string | null;
  file_size?: number | null;
  full_url?: string;
  oss_key?: string;
  preview_url?: string;
}

/** 网关投影的 `format`，没有就从 URL / oss_key 取扩展名。文档件常没有宽高，靠这一格识别。 */
export function assetFormat(asset: FileMetaAsset): string {
  const declared = typeof asset.format === "string" ? asset.format.trim().toLowerCase() : "";
  if (declared) return declared.replace(/^\./, "");
  return (
    extensionOf(asset.full_url || "") ||
    extensionOf(asset.oss_key || "") ||
    extensionOf(asset.preview_url || "")
  );
}

/** 给用户看的文件名：oss_key / URL 的末段，再退到「标题.格式」。 */
export function assetFileName(asset: FileMetaAsset): string {
  const fromKey = lastPathSegment(asset.oss_key || "");
  if (fromKey) return fromKey;
  const fromUrl = lastPathSegment(asset.full_url || "");
  if (fromUrl) return fromUrl;
  const title = (asset.title || "").trim() || "未命名";
  const format = assetFormat(asset);
  return format ? `${title}.${format}` : title;
}

/**
 * 字节数 → `12.4 KB`。`null` / 非正数 / 非有限数一律返回 null，
 * 调用方写「未标注」，不许拿 NaN 去拼字。
 */
export function formatByteSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * 像素尺寸文案。宽或高缺一就返回 null —— 文档件 width/height 都是 null，
 * 绝不能拼出 `null × null`。
 */
export function dimensionLabel(
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  const w = typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null;
  const h = typeof height === "number" && Number.isFinite(height) && height > 0 ? height : null;
  if (w == null || h == null) return null;
  return `${w} × ${h}`;
}
