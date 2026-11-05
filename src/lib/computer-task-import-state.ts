export type LegacyImportErrorCode = "forbidden" | "not-found" | "try-again";

/** Retry only transient gateway failures, and only once per legacy import. */
export function shouldRetryLegacyImport(status: number | undefined, attempt: number): boolean {
  return attempt === 0 && status !== undefined && status >= 500 && status <= 599;
}

/** Map a failed legacy computer/session handoff to the device-management state. */
export function legacyImportErrorCode(status: number | undefined): LegacyImportErrorCode {
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  return "try-again";
}

/** Build the query used when a legacy computer link resolves to devices. */
export function legacyComputerQuery(computerId: string, known: boolean, status?: number): string {
  const query = `?computer=${encodeURIComponent(computerId)}`;
  return known ? query : `${query}&legacyImportError=${legacyImportErrorCode(status)}`;
}

export function legacyImportErrorCopy(code: LegacyImportErrorCode): string {
  switch (code) {
    case "forbidden": return "你无权访问这台电脑或会话。";
    case "not-found": return "这台电脑或会话不存在。";
    case "try-again": return "暂时无法打开这段对话，请重试。";
  }
}
