/** 托管站体积：KB 取整，MB 一位小数，与任务书示例 `340 KB` / `1.2 MB` 同形。 */
export function formatHostedBytes(bytes: number): string {
  const value = Number.isFinite(bytes) ? Math.max(0, Math.floor(bytes)) : 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** 只把以 https:// 开头、能解析成 https 的地址做成外链。 */
export function isSafeHostedUrl(url: string): boolean {
  const value = (url || "").trim();
  if (!value.startsWith("https://")) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
