/** 输入框里显示的金额（主单位）。空着就不写数字；填了 0 才显示 0。 */
export function yuanText(fen: number): string {
  if (!Number.isFinite(fen) || fen < 0) return "";
  const yuan = fen / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

export function formatPriceInput(fen: number | null | undefined): string {
  if (fen == null) return "";
  return yuanText(fen);
}

/** 还在打小数点时不算数，避免把「12.」收成 12。 */
export function parsePriceInput(value: string): number | null | "partial" {
  const text = String(value).replace(/[,\s]/g, "").trim();
  if (!text) return null;
  if (text === "." || /^\d+\.$/.test(text)) return "partial";
  if (!/^\d+(?:\.\d{0,2})?$/.test(text) && !/^\.\d{1,2}$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.min(Math.round(amount * 100), 1_000_000_000);
}

export function isPriceInputText(value: string): boolean {
  return /^(?:\d{0,9}(?:\.\d{0,2})?)?$/.test(String(value).replace(/[,\s]/g, ""));
}

export function toFen(value: string): number {
  const text = String(value).replace(/[,\s]/g, "").trim();
  if (!text) return 0;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.min(Math.round(amount * 100), 1_000_000_000);
}

export function toFenOrNull(value: string): number | null {
  const parsed = parsePriceInput(value);
  return typeof parsed === "number" ? parsed : null;
}
