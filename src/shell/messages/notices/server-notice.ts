import type { NotificationItem } from "../../../api/notifications";

export const SERVER_NOTICE_KIND = "cloud_computer.notice";

/** Server scripts may supply text and an https URL, never executable markup or local routes. */
export function serverNoticeLink(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 1024 || !/^https:\/\//i.test(raw.trim())) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function serverNoticeIdentity(item: Pick<NotificationItem, "meta">): string {
  return [item.meta?.machine_name, item.meta?.source].filter((part) => typeof part === "string" && part.trim()).join(" · ");
}

export function serverNoticeCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}
