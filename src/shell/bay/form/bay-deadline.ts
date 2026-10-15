// 截止时间：库里存的是一个绝对时刻（ISO，UTC）。填写时可以按任意时区来选，
// 但「几点」永远是同一个时刻；谁来看，都按看的人自己设备的时区显示。

/** 表单里的值：空串，或一个 ISO 时刻（UTC）。 */
export type BayDeadlineValue = string;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export const DEVICE_ZONE = "device";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** 「device」换成设备的 IANA 时区；不认识的时区退回设备时区。 */
export function resolveZone(zone: string): string {
  if (!zone || zone === DEVICE_ZONE) return deviceTimeZone();
  return validZone(zone) ? zone : deviceTimeZone();
}

/** 一个时刻在某时区里的墙上时间。 */
export function zonedParts(ms: number, zone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveZone(zone),
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ms));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour") % 24, minute: pick("minute"), second: pick("second") };
}

/** 该时区在某时刻相对 UTC 的偏移（毫秒，东为正）。 */
export function zoneOffsetMs(ms: number, zone: string): number {
  const p = zonedParts(ms, zone);
  const wall = wallMs(p);
  return wall - Math.floor(ms / 1000) * 1000;
}

function wallMs(parts: ZonedParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

/** 墙上时间 → 时刻。DST 重叠取第一次；空洞向前顺延空洞长度；非法日期返回 NaN。 */
export function zonedToInstant(parts: ZonedParts, zone: string): number {
  if (!Object.values(parts).every(Number.isInteger)) return NaN;
  const wall = wallMs(parts);
  const date = new Date(wall);
  if (!Number.isFinite(wall) || date.getUTCFullYear() !== parts.year || date.getUTCMonth() + 1 !== parts.month ||
      date.getUTCDate() !== parts.day || date.getUTCHours() !== parts.hour ||
      date.getUTCMinutes() !== parts.minute || date.getUTCSeconds() !== parts.second) return NaN;
  // 取切换前后的偏移，不能通过两次迭代猜测（空洞时会在两边来回跳）。
  const offsets = new Set([-2, -1, 0, 1, 2].map((day) => zoneOffsetMs(wall + day * 86400000, zone)));
  const candidates = [...offsets].map((offset) => wall - offset).sort((a, b) => a - b);
  const exact = candidates.find((at) => wallMs(zonedParts(at, zone)) === wall);
  if (exact !== undefined) return exact;
  return candidates.find((at) => wallMs(zonedParts(at, zone)) > wall) ?? NaN;
}

/** 「UTC+8」「UTC+5:30」「UTC」。 */
export function offsetLabel(ms: number, zone: string): string {
  const minutes = Math.round(zoneOffsetMs(ms, zone) / 60000);
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 「2026-10-20 18:30:00」：给定时区里的墙上时间，固定格式，便于核对。 */
export function wallClockText(ms: number, zone: string): string {
  const p = zonedParts(ms, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** 库里的值 / 旧的纯日期 → 毫秒；空或坏值返回 null。纯日期按当地当天结束（23:59:59）。 */
export function deadlineMs(value: string | null | undefined): number | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const day = DATE_ONLY.exec(raw);
  if (day) {
    const at = zonedToInstant(
      { year: Number(day[1]), month: Number(day[2]), day: Number(day[3]), hour: 23, minute: 59, second: 59 },
      DEVICE_ZONE,
    );
    return Number.isFinite(at) ? at : null;
  }
  const at = Date.parse(raw);
  return Number.isFinite(at) ? at : null;
}

/** 表单值 → 发给后端的 deadline_at。 */
export function deadlineToPayload(value: string | null | undefined): string | null {
  const at = deadlineMs(value);
  return at == null ? null : new Date(at).toISOString();
}

/** 后端的 deadline_at → 表单值。 */
export function deadlineFromRow(value: string | null | undefined): BayDeadlineValue {
  const at = deadlineMs(value);
  return at == null ? "" : new Date(at).toISOString();
}

/** 按看的人（设备）的时区显示：「2026-10-20 18:30:00 UTC+8」。写法固定、不分语言，方便核对。 */
export function formatDeadline(value: string | null | undefined, zone: string = DEVICE_ZONE): string {
  const at = deadlineMs(value);
  if (at == null) return "";
  const tz = resolveZone(zone);
  return `${wallClockText(at, tz)} ${offsetLabel(at, tz)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const ZONE_KEY = "oceanleo.bay.deadline-zone";

export function readStoredZone(): string {
  try {
    const stored = typeof localStorage === "undefined" ? "" : localStorage.getItem(ZONE_KEY) || "";
    return stored && (stored === DEVICE_ZONE || validZone(stored)) ? stored : DEVICE_ZONE;
  } catch {
    return DEVICE_ZONE;
  }
}

export function storeZone(zone: string): void {
  try {
    localStorage.setItem(ZONE_KEY, zone);
  } catch {
    // 无痕模式等写不进去就算了，下次回到「按我设备的时间」。
  }
}

const COMMON_ZONES = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** 可选时区：优先用浏览器给出的完整列表，不支持就用常见时区。 */
export function selectableZones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (all && all.length) return Array.from(new Set(["UTC", ...all]));
  } catch {
    // 落到常见时区
  }
  return COMMON_ZONES;
}
