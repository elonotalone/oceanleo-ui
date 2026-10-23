// 「复制诊断信息」：浏览器、系统、设备名、权限状态、统计数字、时间、版别。
// 只按白名单字段拼文本——入参里没有、也不接受任何凭证；最后再过一遍 `redactSecrets` 兜底，
// 即使有人把 token 塞进设备名或错误信息里也不会被复制出去。纯函数，便于单测。
import type { CallStats, NetLevel } from "../engine";
import { formatStat, qualityFromLevel, type NetworkQuality } from "./health";

export type PermissionStateLite = "granted" | "denied" | "prompt" | "unknown";
export type EditionLite = "cn" | "global" | "unknown";
export type ClientLite = "web" | "desktop" | "ios" | "android" | "harmony" | "unknown";
export type TestGrade = "good" | "fair" | "poor" | "unknown" | "failed";

export interface DeviceEntry {
  label: string;
  selected: boolean;
}

export interface ConnectionTestNumbers extends CallStats {
  /** 从发起到入会成功的耗时（ms）。 */
  joinMs: number | null;
}

export interface DiagnosticsReportInput {
  /** 生成时间（ISO 字符串或 Date）。 */
  time: string | Date;
  edition: EditionLite;
  client: ClientLite;
  userAgent: string;
  devices: { microphones: DeviceEntry[]; cameras: DeviceEntry[]; speakers: DeviceEntry[] };
  permissions: { microphone: PermissionStateLite; camera: PermissionStateLite };
  /** 扬声器能否选择输出设备（`setSinkId`）。 */
  speakerSelectable: boolean | null;
  /** 麦克风检测里见过的最大音量（0–1）；没测为 null。 */
  micPeak: number | null;
  call: {
    phase: string;
    network: NetLevel;
    audioOnly: boolean;
    stats: CallStats | null;
    issues: string[];
  } | null;
  test: {
    grade: TestGrade;
    numbers: ConnectionTestNumbers | null;
    error: string | null;
  } | null;
}

export interface ParsedAgent {
  name: string;
  version: string | null;
}

export function parseBrowser(userAgent: string): ParsedAgent {
  const ua = userAgent || "";
  const pick = (re: RegExp, name: string): ParsedAgent | null => {
    const m = ua.match(re);
    return m ? { name, version: m[1] ?? null } : null;
  };
  return (
    pick(/\bEdg(?:e|A|iOS)?\/([\d.]+)/, "Edge") ??
    pick(/\bOPR\/([\d.]+)/, "Opera") ??
    pick(/\bFirefox\/([\d.]+)/, "Firefox") ??
    pick(/\bFxiOS\/([\d.]+)/, "Firefox") ??
    pick(/\bCriOS\/([\d.]+)/, "Chrome") ??
    pick(/\bChrome\/([\d.]+)/, "Chrome") ??
    (/\bSafari\//.test(ua) ? pick(/\bVersion\/([\d.]+)/, "Safari") : null) ??
    { name: "unknown", version: null }
  );
}

export function parseOs(userAgent: string): ParsedAgent {
  const ua = userAgent || "";
  let m = ua.match(/\b(?:iPhone|iPad|iPod).*?\bOS ([\d_]+)/);
  if (m) return { name: "iOS", version: m[1].replace(/_/g, ".") };
  m = ua.match(/\bAndroid ([\d.]+)/);
  if (m) return { name: "Android", version: m[1] };
  m = ua.match(/\bHarmonyOS(?:[ /]([\d.]+))?/);
  if (m) return { name: "HarmonyOS", version: m[1] ?? null };
  m = ua.match(/\bMac OS X ([\d_.]+)/);
  if (m) return { name: "macOS", version: m[1].replace(/_/g, ".") };
  m = ua.match(/\bWindows NT ([\d.]+)/);
  if (m) return { name: "Windows", version: m[1] };
  if (/\bCrOS\b/.test(ua)) return { name: "ChromeOS", version: null };
  if (/\bLinux\b|\bX11\b/.test(ua)) return { name: "Linux", version: null };
  return { name: "unknown", version: null };
}

const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // JWT（Supabase 会话、ARTC token 都可能是这个形状）
  [/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g, "[redacted]"],
  // Authorization: Bearer xxx
  [/\b(Bearer)\s+[^\s,;]+/gi, "$1 [redacted]"],
  // token=xxx / "token":"xxx" / access_token: xxx / secret / password / signature / auth_key / nonce
  [
    /\b(access_token|refresh_token|token|secret|password|passwd|signature|auth_key|authorization|nonce|app_key|appkey)(["']?\s*[:=]\s*["']?)(?!Bearer\b|Basic\b|\[redacted\])[^\s"',;&}]+/gi,
    "$1$2[redacted]",
  ],
  // 很长的不透明串（≥40 位 base64/hex），常见凭证形状
  [/[A-Za-z0-9+/_-]{40,}={0,2}/g, "[redacted]"],
];

/** 兜底脱敏：凭证形状一律替换成 `[redacted]`。 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function deviceLine(devices: DeviceEntry[]): string {
  if (!devices.length) return "none";
  return devices
    .map((device, index) => {
      const label = (device.label || "").replace(/[\r\n]+/g, " ").trim() || `#${index + 1} (label hidden)`;
      return device.selected ? `${label} [selected]` : label;
    })
    .join("; ");
}

function statsLine(stats: CallStats | null): string {
  if (!stats) return "—";
  return [
    `rtt=${formatStat(stats.rttMs, "ms")}`,
    `up_loss=${formatStat(stats.upLossPct, "%")}`,
    `down_loss=${formatStat(stats.downLossPct, "%")}`,
    `up=${formatStat(stats.upKbps, "kbps")}`,
    `down=${formatStat(stats.downKbps, "kbps")}`,
  ].join(" ");
}

function qualityName(quality: NetworkQuality): string {
  return quality;
}

/** 诊断信息的全部字段名（单测核对「字段齐全」）。 */
export const REPORT_FIELDS = [
  "time",
  "edition",
  "client",
  "browser",
  "os",
  "user_agent",
  "devices.microphone",
  "devices.camera",
  "devices.speaker",
  "speaker.selectable",
  "permission.microphone",
  "permission.camera",
  "mic.peak",
  "call.phase",
  "call.network",
  "call.audio_only",
  "call.stats",
  "call.issues",
  "test.result",
  "test.stats",
  "test.join",
  "test.error",
] as const;

export function buildDiagnosticsReport(input: DiagnosticsReportInput): string {
  const time = input.time instanceof Date ? input.time.toISOString() : String(input.time || "");
  const browser = parseBrowser(input.userAgent);
  const os = parseOs(input.userAgent);
  const call = input.call;
  const test = input.test;
  const rows: Array<[(typeof REPORT_FIELDS)[number], string]> = [
    ["time", time],
    ["edition", input.edition],
    ["client", input.client],
    ["browser", browser.version ? `${browser.name} ${browser.version}` : browser.name],
    ["os", os.version ? `${os.name} ${os.version}` : os.name],
    ["user_agent", (input.userAgent || "unknown").replace(/[\r\n]+/g, " ")],
    ["devices.microphone", deviceLine(input.devices.microphones)],
    ["devices.camera", deviceLine(input.devices.cameras)],
    ["devices.speaker", deviceLine(input.devices.speakers)],
    ["speaker.selectable", input.speakerSelectable === null ? "unknown" : input.speakerSelectable ? "yes" : "no"],
    ["permission.microphone", input.permissions.microphone],
    ["permission.camera", input.permissions.camera],
    ["mic.peak", input.micPeak === null ? "not_tested" : `${Math.round(Math.max(0, Math.min(1, input.micPeak)) * 100)}%`],
    ["call.phase", call ? call.phase : "idle"],
    ["call.network", call ? `${call.network} (${qualityName(qualityFromLevel(call.network))})` : "—"],
    ["call.audio_only", call ? (call.audioOnly ? "yes" : "no") : "—"],
    ["call.stats", call ? statsLine(call.stats) : "—"],
    ["call.issues", call && call.issues.length ? call.issues.join(", ") : "none"],
    ["test.result", test ? test.grade : "not_run"],
    ["test.stats", test && test.numbers ? statsLine(test.numbers) : "—"],
    ["test.join", test && test.numbers ? formatStat(test.numbers.joinMs, "ms") : "—"],
    ["test.error", test && test.error ? test.error : "none"],
  ];
  const text = ["OceanLeo call diagnostics", ...rows.map(([key, value]) => `${key}: ${value}`)].join("\n");
  return redactSecrets(text);
}
