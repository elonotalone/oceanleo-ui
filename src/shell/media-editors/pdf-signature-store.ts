/**
 * 签名（D4）：手写或打字生成的签名图片，存在**本机** localStorage，按用户 id 分开，
 * 下次一点就用。不上传、不进素材库——签名是个人的，只在这台设备上。
 */

export interface PdfSavedSignature {
  id: string;
  /** `data:image/png;base64,…` */
  dataUrl: string;
  width: number;
  height: number;
  createdAt: number;
}

export const PDF_SIGNATURE_LIMIT = 6;
/** 单个签名的上限（字符数）。手写签名 PNG 一般 10–60KB。 */
export const PDF_SIGNATURE_MAX_CHARS = 400_000;

export function pdfSignatureStorageKey(userId: string): string {
  return `oceanleo.pdf-signatures.${userId || "anonymous"}`;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function valid(value: unknown): value is PdfSavedSignature {
  const entry = value as PdfSavedSignature | null;
  return Boolean(
    entry &&
      typeof entry.id === "string" &&
      typeof entry.dataUrl === "string" &&
      entry.dataUrl.startsWith("data:image/png;base64,") &&
      entry.dataUrl.length <= PDF_SIGNATURE_MAX_CHARS &&
      Number.isFinite(entry.width) &&
      Number.isFinite(entry.height),
  );
}

export function readPdfSignatures(userId: string, store = storage()): PdfSavedSignature[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(pdfSignatureStorageKey(userId)) || "[]");
    return Array.isArray(parsed) ? parsed.filter(valid).slice(0, PDF_SIGNATURE_LIMIT) : [];
  } catch {
    return [];
  }
}

/** 新签名放最前；同一张图不重复存；超过上限丢最旧的。存不下时抛出原因。 */
export function savePdfSignature(
  userId: string,
  signature: Omit<PdfSavedSignature, "id" | "createdAt">,
  store = storage(),
): PdfSavedSignature {
  if (!valid({ ...signature, id: "x" })) throw new Error("签名图片太大或格式不对。");
  const entry: PdfSavedSignature = {
    ...signature,
    id: globalThis.crypto?.randomUUID?.() || `sig-${Date.now().toString(36)}`,
    createdAt: Date.now(),
  };
  const next = [
    entry,
    ...readPdfSignatures(userId, store).filter((item) => item.dataUrl !== signature.dataUrl),
  ].slice(0, PDF_SIGNATURE_LIMIT);
  if (!store) throw new Error("这个浏览器不允许保存签名。");
  try {
    store.setItem(pdfSignatureStorageKey(userId), JSON.stringify(next));
  } catch {
    throw new Error("本机存储空间不够，签名没有存下来。");
  }
  return entry;
}

export function removePdfSignature(userId: string, id: string, store = storage()): void {
  if (!store) return;
  const next = readPdfSignatures(userId, store).filter((item) => item.id !== id);
  try {
    store.setItem(pdfSignatureStorageKey(userId), JSON.stringify(next));
  } catch {
    /* 删不掉也不影响使用 */
  }
}

/** data URL → 字节（作为图章批注的图片内容）。 */
export function pdfDataUrlBytes(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
