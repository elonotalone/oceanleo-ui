/** Client keys the typed-upload registrar will accept without a 400. */
export function isLegalUploadIdempotencyKey(key: string): boolean {
  if (!key || key.length > 200) return false;
  for (const character of key) {
    const code = character.charCodeAt(0);
    if (code < 33 || code === 127) return false;
  }
  return true;
}

function hexSha256(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build a registrar-legal idempotency key. Filenames with spaces used to be
 * sent raw (`library-upload-v1:home:my file.png:…`) and the gateway answered
 * 400 `invalid idempotency key`.
 */
export async function normalizeUploadIdempotencyKey(
  parts: Array<string | number>,
): Promise<string> {
  const raw = parts.map(String).join(":");
  if (isLegalUploadIdempotencyKey(raw)) return raw;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return hexSha256(digest);
}

/** FastAPI `{detail}` or the artifact-catalog `{code,message,requestId}` envelope. */
export function gatewayErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const record = data as {
      detail?: unknown;
      message?: unknown;
      code?: unknown;
    };
    if (typeof record.detail === "string" && record.detail.trim()) {
      return record.detail.trim();
    }
    if (record.detail && typeof record.detail === "object") {
      const inner = record.detail as { message?: unknown; detail?: unknown };
      if (typeof inner.message === "string" && inner.message.trim()) {
        return inner.message.trim();
      }
      if (typeof inner.detail === "string" && inner.detail.trim()) {
        return inner.detail.trim();
      }
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
  }
  return `HTTP ${status}`;
}

export function humanLibraryUploadError(
  error: unknown,
  status?: number,
): string {
  const raw =
    typeof error === "string"
      ? error.trim()
      : gatewayErrorMessage(error, status ?? 0);
  if (status === 413 || /超过.*上限|too large|20\s*mb/i.test(raw)) {
    return "文件超过 20MB 上限。";
  }
  if (status === 401 || raw === "未登录") return "请先登录后再上传。";
  if (/empty file/i.test(raw)) return "不能上传空文件。";
  if (/idempotency/i.test(raw) || /^HTTP\s*400$/i.test(raw)) {
    return "文件没传上去，请稍后重试。";
  }
  if (/quota|空间不足|存储配额/i.test(raw)) {
    return /[\u4e00-\u9fff]/.test(raw) ? raw : "资料库空间不足，请先删一些文件。";
  }
  if (status != null && status >= 500) {
    return "上传服务暂时不可用，请稍后重试。";
  }
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  if (status === 422 || status === 409) {
    return "这个文件的格式不被资料库接受。";
  }
  if (raw && !/^HTTP\s*\d+$/i.test(raw)) return raw;
  return "文件没传上去，请稍后重试。";
}
