/**
 * PDF 用的中文字形，按需载入。
 *
 * 随包那份有界字集（`pdf-font-data-generated.ts`，压缩后 583 KB）是本包最大的
 * 一块数据。它**只在这里被 `await import()`**：静态引用会让 36 个站的主包都背上
 * 它，而绝大多数用户从不导出 PDF。动态引用之后打包器把它切成独立分块，
 * 点「导出成 PDF」的那一刻才下载，此后进缓存。
 *
 * 这也是 `renderPluginExport()` 必须是异步的唯一原因：其余五种形态都是纯计算，
 * 只有这一种要先把字形取回来。
 */

import { unzlibSync } from "fflate";

import { parseTrueType, type TrueTypeFont } from "./truetype-subset";

export interface LoadedPdfFont {
  /** 写进 PDF 的字体名（前面还会补六字母子集前缀）。 */
  name: string;
  license: string;
  font: TrueTypeFont;
}

export interface PdfFontSet {
  /** 拉丁、数字与西文标点。中日韩那一份**不含任何拉丁字形**，缺了它日期与金额是空白。 */
  latin: LoadedPdfFont;
  /** 汉字与全角标点。 */
  cjk: LoadedPdfFont;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * 自己解 base64，不走 `atob` 也不走 `Buffer`：前者在部分 SSR 运行时里没有，
 * 后者在浏览器里没有，而这条链两侧都要跑得起来。空白字符直接忽略，
 * 生成物为了可读性是按行折过的。
 */
function decodeBase64(text: string): Uint8Array {
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    lookup[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  const out = new Uint8Array(Math.ceil((text.length * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 61) break; // '='
    const value = code < 128 ? lookup[code] : -1;
    if (value < 0) continue; // 换行与空格
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written] = (buffer >> bits) & 0xff;
      written += 1;
    }
  }
  return out.subarray(0, written);
}

let cached: Promise<PdfFontSet> | null = null;

export function loadPdfFonts(): Promise<PdfFontSet> {
  if (!cached) {
    cached = import("./pdf-font-data-generated")
      .then(({ PDF_FONT_ASSETS }) => {
        const load = (key: "latin" | "cjk"): LoadedPdfFont => {
          const asset = PDF_FONT_ASSETS[key];
          const font = parseTrueType(unzlibSync(decodeBase64(asset.deflated)));
          return { name: asset.name, license: asset.license, font };
        };
        return { latin: load("latin"), cjk: load("cjk") };
      })
      .catch((error) => {
        // 载入失败必须让这一轮彻底失败并可重试，不能把一个坏的 Promise 缓存住，
        // 更不能悄悄退化成「PDF 里没有中文」。
        cached = null;
        throw error;
      });
  }
  return cached;
}

/** 只给测试用：清掉缓存，让下一次载入重新走一遍。 */
export function resetPdfFontsForTest(): void {
  cached = null;
}
