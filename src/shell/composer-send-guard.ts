// Composer send / Stop guards (2026-11-02 stop-button wave, F3).
//
// 1. Text and its attachments go out together: while a file is still uploading
//    the send waits; when one failed nothing is sent — the text stays and the
//    failure is said with a retry / remove (before: the text went out alone).
// 2. Accidental Stop: the send key turns into Stop in the same spot, so a
//    double click on Send used to stop the turn it had just started. Stop only
//    acts on a press that began on the Stop key itself, at least STOP_ARM_MS
//    after it appeared; a keyboard activation only needs the delay.

/** Stop ignores presses for this long after it replaced the send key. */
export const STOP_ARM_MS = 800;

export function stopPressArmed(shownAt: number, now: number): boolean {
  return shownAt > 0 && now - shownAt >= STOP_ARM_MS;
}

/**
 * Whether a click on the Stop key stops. `pressArmed`: the pointer press that
 * produced this click started on the Stop key after it was armed (false when the
 * press began on the send key, or within STOP_ARM_MS of Stop appearing).
 */
export function stopClickAllowed(input: { shownAt: number; now: number; keyboard: boolean; pressArmed: boolean }): boolean {
  if (input.keyboard) return stopPressArmed(input.shownAt, input.now);
  return input.pressArmed;
}

export type GuardedAttachment = {
  id: string; name?: string; mime?: string; uploading?: boolean; failed?: boolean; failedReason?: string;
};

function imageLike(item: GuardedAttachment): boolean {
  return (item.mime ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|bmp|svg)$/i.test(item.name ?? "");
}

/** Attachments whose upload failed (they block the send until retried or removed). */
export function failedAttachments<T extends GuardedAttachment>(attachments: readonly T[] | undefined): T[] {
  return (attachments ?? []).filter((item) => item.failed === true);
}

type GuardTranslate = (zh: string, vars?: Record<string, string | number>) => string;

/** The line said above the composer while a failed file blocks the send, else null. */
export function attachmentFailureText(tt: GuardTranslate, attachments: readonly GuardedAttachment[] | undefined): string | null {
  const failed = failedAttachments(attachments);
  if (!failed.length) return null;
  const reason = failed.map((item) => item.failedReason?.trim()).find(Boolean) || tt("上传出错");
  return failed.every(imageLike)
    ? tt("图片没有上传成功（{reason}）", { reason })
    : tt("文件没有上传成功（{reason}）", { reason });
}

/** Upload error codes worth trying again by themselves (the computer was briefly busy or away). */
const TRANSIENT_UPLOAD_CODES = new Set([
  "node_busy",
  "computer_reconnecting",
  "computer_offline",
  "client_network_error",
  "gateway_error",
  "client_http_502",
  "client_http_503",
  "client_http_504",
]);

export function isTransientUploadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code: unknown }).code ?? "") : "";
  const status = "status" in error ? Number((error as { status: unknown }).status) : NaN;
  if (TRANSIENT_UPLOAD_CODES.has(code)) return true;
  // 409 node_busy may arrive with its code in the message only; 0 = network.
  return status === 409 || status === 0 || status === 502 || status === 503 || status === 504;
}

/** Automatic upload tries before the failure is shown (first try included). */
export const UPLOAD_TRIES = 3;

/** Wait before automatic try `attempt` (1-based count of tries already made). */
export function uploadRetryDelay(attempt: number): number {
  return Math.min(4_000, 600 * 2 ** Math.max(0, attempt - 1));
}

/** A short readable reason for a failed upload (the gateway's code / message). */
export function uploadFailureReason(tt: GuardTranslate, error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = "code" in error ? String((error as { code: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message: unknown }).message ?? "").trim() : "";
  if (code === "node_busy") return tt("电脑正忙");
  if (code === "computer_reconnecting" || code === "computer_offline") return tt("电脑暂时连不上");
  if (code === "client_network_error") return tt("网络出错");
  return (message || code).slice(0, 60);
}
