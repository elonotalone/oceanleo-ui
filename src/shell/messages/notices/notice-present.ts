// 通知列表 / 收件箱通知行上的时间与摘要（纯函数，测试直接加载）。
// 时间的口径与会话行一致（今天 = 时:分，昨天 = 「昨天」，今年 = 月/日，更早 = 年/月/日）；列表里的那一份多带一个时刻，因为它是流水。

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function clock(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** 收件箱通知行右上角：与 `InboxRow` 的 `formatRowTime` 同一口径。 */
export function formatNoticeRowTime(iso: string | null | undefined, now: Date, yesterdayLabel: string): string {
  const at = new Date(iso ?? "");
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return clock(at);
  if (days === 1) return yesterdayLabel;
  if (at.getFullYear() === now.getFullYear()) return at.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  return at.toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" });
}

/** 通知列表里一条的时间：今天 时:分；昨天 昨天 时:分；今年 月/日 时:分；更早 年/月/日。 */
export function formatNoticeTime(iso: string | null | undefined, now: Date, yesterdayLabel: string): string {
  const at = new Date(iso ?? "");
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return clock(at);
  if (days === 1) return `${yesterdayLabel} ${clock(at)}`;
  if (at.getFullYear() === now.getFullYear()) {
    return `${at.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })} ${clock(at)}`;
  }
  return at.toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" });
}
