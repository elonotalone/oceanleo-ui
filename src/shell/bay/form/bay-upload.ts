/** 网关幂等键不允许空格等控制字符（ord < 33），文件名里的空格会直接 400。 */
export function safeIdempotencyKey(parts: Array<string | number>): string {
  const raw = parts.map(String).join(":");
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    out += code >= 33 && code <= 126 ? ch : "_";
  }
  if (out.length > 200) out = out.slice(0, 200);
  if (out.length < 8) out = `${out}________`.slice(0, 8);
  return out;
}

function detailText(error: unknown): string {
  if (typeof error === "string") return error.trim();
  if (error == null) return "";
  if (typeof error === "object") {
    const record = error as { detail?: unknown; message?: unknown; msg?: unknown };
    if (typeof record.detail === "string") return record.detail.trim();
    if (Array.isArray(record.detail) && record.detail[0] && typeof record.detail[0] === "object") {
      const first = record.detail[0] as { msg?: unknown; message?: unknown };
      if (typeof first.msg === "string") return first.msg.trim();
      if (typeof first.message === "string") return first.message.trim();
    }
    if (typeof record.message === "string") return record.message.trim();
    if (typeof record.msg === "string") return record.msg.trim();
  }
  const text = String(error).trim();
  return text === "[object Object]" ? "" : text;
}

/** 上传失败给用户看的话：不把 HTTP 400 / 幂等键原文摆出来。 */
export function humanUploadError(error: unknown, status?: number): string {
  const raw = detailText(error);
  if (
    !raw ||
    /^HTTP\s*\d+$/i.test(raw) ||
    /idempotency/i.test(raw) ||
    (status != null && status >= 400 && status < 500 && !/[\u4e00-\u9fff]/.test(raw))
  ) {
    return "文件没传上去，请稍后再试。";
  }
  return raw;
}
