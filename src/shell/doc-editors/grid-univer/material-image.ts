/**
 * 表格的素材库插入（D2 / W02 契约，W10 2026-10-23）：点一张图片 = 在当前格子处
 * 插一张浮动图片。
 *
 * - 走 Univer 的 `FWorksheet.insertImage`（插图命令进撤销栈）：撤销能撤回，
 *   编辑判据（撤销栈栈顶变了）把它算成本人改动，于是会保存。
 * - 图片以 data URL 存进工作簿：库里的地址是会过期的签名地址，存地址的话重开就裂图；
 *   XLSX 导出也只认 data URL（`xlsx-export.ts::imageExtension`）。
 * - 只收 PNG / JPEG / GIF：这三种导出 XLSX 时能原样带走；其它格式不出插入。
 * - 整份表格替换（拿另一份 xlsx 换掉当前表）不进撤销历史，不登记为素材库动作；
 *   本地表格仍从顶栏「上传」打开。
 *
 * 本文件不 import Univer：facade 由舞台传进来。
 */
import type { LibraryItem } from "../../library-data";

export const GRID_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
const IMAGE_EXT = /\.(?:png|jpe?g|gif)(?:$|[?#])/i;

export function gridMaterialImageUrl(material: LibraryItem): string {
  return material.url || material.previewUrl || "";
}

/** 素材是不是表格能插、也能原样导出的图片。 */
export function gridAcceptsImageMaterial(material: LibraryItem): boolean {
  const format = String(material.meta?.format || "").toLowerCase();
  const mime = String(material.meta?.mime_type || material.meta?.media_type || "").toLowerCase();
  const url = gridMaterialImageUrl(material);
  if (!url) return false;
  if (["png", "jpg", "jpeg", "gif"].includes(format)) return true;
  if (IMAGE_TYPES.has(mime)) return true;
  return material.kind === "image" && IMAGE_EXT.test(url);
}

/** 按文件头认图片类型（代理回来的 blob 常常没有可信的 type）。 */
export function sniffGridImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  return null;
}

export function bytesToDataUrl(bytes: Uint8Array, type: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

export interface GridImageInsertApi {
  getActiveWorkbook?: () => {
    getActiveSheet?: () => {
      insertImage?: (url: string, column: number, row: number) => Promise<boolean>;
      getSelection?: () => {
        getActiveRange?: () => { getRow?: () => number; getColumn?: () => number } | null;
      } | null;
    } | null;
  } | null;
}

/** 在活动格子处插图；拿不到工作表或插图口返回 false。 */
export async function insertGridImageAtSelection(
  api: GridImageInsertApi | null | undefined,
  dataUrl: string,
): Promise<boolean> {
  const sheet = api?.getActiveWorkbook?.()?.getActiveSheet?.();
  if (!sheet?.insertImage) return false;
  const range = sheet.getSelection?.()?.getActiveRange?.();
  const row = Math.max(0, range?.getRow?.() ?? 0);
  const column = Math.max(0, range?.getColumn?.() ?? 0);
  return sheet.insertImage(dataUrl, column, row);
}

/** 校验类型和大小 → 转 data URL。错误信息是给用户看的原文（调用方 tt）。 */
export async function gridImageDataUrlFromBlob(blob: Blob): Promise<string> {
  if (blob.size > GRID_IMAGE_MAX_BYTES) throw new Error("图片太大，表格里最多插入 5 MB 的图片。");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = sniffGridImageType(bytes);
  if (!type) throw new Error("表格只能插入 PNG、JPEG 或 GIF 图片。");
  return bytesToDataUrl(bytes, type);
}
