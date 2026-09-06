export const AUTOSAVE_ERROR_LOGIN_EXPIRED = "登录已过期，重新登录后自动继续";
export const AUTOSAVE_ERROR_NETWORK = "网络不通，稍后自动重试";
export const AUTOSAVE_ERROR_SERVER_BUSY = "服务器忙稍后重试";

export type AutosaveErrorInput = {
  error?: string;
  status?: number;
};

/**
 * Map a flush failure to the three fixed product sentences, or a truncated
 * original. Chrome (W01) should `tt()` these Chinese keys.
 */
export function mapAutosaveErrorMessage(
  input: AutosaveErrorInput | null | undefined,
): string | undefined {
  if (!input) return undefined;
  const status = input.status;
  const raw = String(input.error || "").trim();
  if (status == null && !raw) return undefined;
  if (status === 401 || status === 403) return AUTOSAVE_ERROR_LOGIN_EXPIRED;
  if (status === 0) return AUTOSAVE_ERROR_NETWORK;
  if (typeof status === "number" && status >= 500) {
    return AUTOSAVE_ERROR_SERVER_BUSY;
  }
  if (
    /\b(401|403)\b/.test(raw) ||
    /unauthorized|forbidden|登录已过期|未登录|登录后才能/i.test(raw)
  ) {
    return AUTOSAVE_ERROR_LOGIN_EXPIRED;
  }
  if (
    /network-error|failed to fetch|networkerror|网络不通|网络错误|超时|timeout|offline/i.test(
      raw,
    )
  ) {
    return AUTOSAVE_ERROR_NETWORK;
  }
  if (/\b5\d\d\b/.test(raw) || /internal server|bad gateway|服务器忙/i.test(raw)) {
    return AUTOSAVE_ERROR_SERVER_BUSY;
  }
  return raw.slice(0, 80);
}
