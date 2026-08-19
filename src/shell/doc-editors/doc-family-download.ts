"use client";

/**
 * 文档家族的「下载成另一个格式」。
 *
 * 浏览器本地能出的（docx / md / html / txt / csv / xlsx / pptx / json）各条路由自己出；
 * 出不了的（PDF）把本地已经能生成的那份 OOXML 交给后端 `/v1/convert/office` 转一次。
 * 这里只是把两者接起来，并保证失败时用户拿到的是一句原因，不是一个 0 字节文件。
 */

import { downloadBlob } from "./doc-io";
import {
  convertOfficeBlob,
  OfficeConvertError,
  type OfficeConvertTarget,
} from "./office-convert-client";

export interface ConvertDownloadInput {
  /** 本地已经能生成的源文件（例如 docx / xlsx / pptx）。 */
  source: Blob;
  /** 送给转换服务的文件名，后缀必须是 `source` 真正的格式。 */
  sourceName: string;
  /** 要落地的格式。 */
  target: OfficeConvertTarget;
  /** 落地文件名（不含后缀）。 */
  baseName: string;
}

/**
 * 转一次并直接落盘。成功给空串，失败给一句能显示的中文（不抛）。
 * 调用方把返回值放进状态栏即可。
 */
export async function downloadConvertedCopy(
  input: ConvertDownloadInput,
): Promise<string> {
  try {
    const blob = await convertOfficeBlob(
      input.source,
      input.sourceName,
      input.target,
    );
    downloadBlob(`${input.baseName || "document"}.${input.target}`, blob);
    return "";
  } catch (caught) {
    if (caught instanceof OfficeConvertError) return caught.message;
    return caught instanceof Error && caught.message
      ? caught.message
      : `导出 ${input.target.toUpperCase()} 失败。`;
  }
}
