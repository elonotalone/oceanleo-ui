"use client";

// ============================================================================
// @oceanleo/ui — 账号安全中心的取数层（契约 §2 的四个端点，只消费不改签名）
// ----------------------------------------------------------------------------
// 网关 `https://api.oceanleo.com`，全部要求 `Authorization: Bearer <access_token>`：
//
//   GET  /v1/account/security/events?limit=&before=   最近活动（登录 + 事件表合并）
//   GET  /v1/account/security/sessions                登录中的设备
//   POST /v1/account/security/sessions/revoke         踢掉某一台
//   GET  /PUT /v1/account/security/wallet-limit       每日消费上限
//
// 三条本模块自己的纪律：
//
// 1. **失败一律返回码，不返回句子。** account.ts 那一层把「未登录」「网络错误：
//    无法连接到 AI 网关。」这样的中文句子直接当 error 返回，实测这两句在 17 份
//    词典里一条都没有（`grep -c` = 0），于是英文用户看到的就是中文。这里改成
//    枚举码，句子留在渲染处由 `tt()` 取——这也是这个仓 §7 码表刚刚收敛到的写法。
//
// 2. **IP 在前端再脱敏一次。** 契约说完整 IP 不出网关，那是服务端的承诺；这里
//    的 `maskIp()` 是第二道，任何看起来像完整 IP 的字符串在进 DOM 之前都会被
//    打成 `1.2.*.*`。承诺与实现各守一遍，网关哪天回归了也不会当场泄露给用户。
//
// 3. **后端字段可能缺失 / 为 null / 是字符串**（account.ts 的 `num()` 就是为此
//    存在的）。这里每个字段都过一次归一化，接口返回什么形状都不许把账号页打白。
// ============================================================================

import { accessToken } from "./client";
import { GATEWAY_BASE } from "./config";
import { ledgerCurrency, rememberLedgerCurrency, type LedgerCurrency } from "../money";

/** 失败原因的码。句子在 `../../i18n/ui/messages/account-security-copy-base.ts`。 */
export type SecurityApiCode =
  | "signed_out"
  | "offline"
  | "not_available"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "unknown";

export interface SecurityApiResult<T> {
  ok: boolean;
  data?: T;
  code?: SecurityApiCode;
  status?: number;
}

/** 后端返回的数值可能是 null / 字符串 / 干脆缺失；`.toFixed()` 之前必须过这里。 */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const IPV4 = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/;
const IPV6ISH = /^[0-9a-f:]{4,}$/i;

/**
 * 第二道脱敏：把任何还带着完整地址的字符串打回 `1.2.*.*`。
 *
 * 已经脱敏过的（`1.2.*.*`）原样返回；认不出来的形状返回空串，让界面显示
 * 「地址未知」而不是把一串来路不明的东西照抄进 DOM。
 */
export function maskIp(raw: unknown): string {
  const value = str(raw).trim();
  if (!value) return "";
  const v4 = value.match(IPV4);
  if (v4) {
    const octets = [v4[1], v4[2], v4[3], v4[4]].map((o) => Number(o));
    if (octets.every((o) => o >= 0 && o <= 255)) return `${octets[0]}.${octets[1]}.*.*`;
    return "";
  }
  // 服务端约定的形状，原样放行。
  if (/^\d{1,3}\.\d{1,3}\.\*\.\*$/.test(value)) return value;
  if (value.includes(":") && IPV6ISH.test(value)) {
    const groups = value.split(":").filter(Boolean);
    if (groups.length >= 2) return `${groups[0]}:${groups[1]}:*`;
    return "";
  }
  // 已经是别的形式的掩码（`1.2.x.x` 之类）：只要不含完整四段就放行。
  if (value.includes("*") || /x{1,3}/i.test(value)) return value;
  return "";
}

/**
 * 设备名。网关解析不出 UA 时按契约回中文的「未知设备」——那是一句中文，
 * 直接渲染会让 16 个语种露出汉字。这里把它归一成空串，由渲染处走 `tt()` 取
 * 当前语言的兜底名。**契约本身不改**，只是不把它那句中文当成最终文案。
 */
export function deviceLabel(raw: unknown): string {
  const value = str(raw).trim();
  if (!value) return "";
  if (value === "未知设备" || value === "未知裝置") return "";
  // 原始 UA 串不许甩给用户（契约同款要求）。认出来就当没有名字。
  if (/Mozilla\/\d|AppleWebKit\/|\(Windows NT|\(Macintosh;/.test(value)) return "";
  return value;
}

async function call<T>(
  path: string,
  init: RequestInit | undefined,
  /** GET 一整条路由 404 = W3 还没上线；单条资源 404 = 它不是你的。 */
  notFoundMeans: SecurityApiCode,
): Promise<SecurityApiResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, code: "signed_out", status: 401 };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "offline", status: 0 };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON：当空响应处理，下面按状态码分流 */
  }
  if (res.ok) return { ok: true, data: (body ?? {}) as T, status: res.status };
  return { ok: false, code: codeForStatus(res.status, notFoundMeans), status: res.status };
}

function codeForStatus(status: number, notFoundMeans: SecurityApiCode): SecurityApiCode {
  if (status === 401 || status === 403) return "signed_out";
  if (status === 404 || status === 405 || status === 501) return notFoundMeans;
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "unknown";
}

// ---------------------------------------------------------------------------
// 1 最近活动
// ---------------------------------------------------------------------------

/** 契约 §2 写定的 kind 全集。认不出来的一律归到 `unknown`，不猜。 */
export const SECURITY_EVENT_KINDS = [
  "login",
  "password_changed",
  "mfa_enrolled",
  "mfa_unenrolled",
  "key_added",
  "key_revoked",
  "spend_blocked",
  "logout_all",
  "session_revoked",
] as const;

export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number] | "unknown";

export interface SecurityEvent {
  id: string;
  kind: SecurityEventKind;
  at: string;
  ipMasked: string;
  deviceLabel: string;
  result: "ok" | "denied";
}

export interface SecurityEventPage {
  events: SecurityEvent[];
  /** 下一页的游标；null 表示到底了。 */
  nextBefore: string | null;
}

function normalizeEvent(raw: unknown, index: number): SecurityEvent {
  const r = (raw || {}) as Record<string, unknown>;
  const kind = str(r.kind);
  return {
    id: str(r.id) || `${str(r.at)}-${index}`,
    kind: (SECURITY_EVENT_KINDS as readonly string[]).includes(kind)
      ? (kind as SecurityEventKind)
      : "unknown",
    at: str(r.at),
    ipMasked: maskIp(r.ip_masked),
    deviceLabel: deviceLabel(r.device_label),
    result: str(r.result) === "denied" ? "denied" : "ok",
  };
}

export async function getSecurityEvents(
  options: { limit?: number; before?: string } = {},
): Promise<SecurityApiResult<SecurityEventPage>> {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(100, Math.max(1, num(options.limit, 50)))));
  if (options.before) params.set("before", options.before);
  const res = await call<Record<string, unknown>>(
    `/v1/account/security/events?${params.toString()}`,
    undefined,
    "not_available",
  );
  if (!res.ok) return { ...res, data: undefined };
  const list = Array.isArray(res.data?.events) ? (res.data!.events as unknown[]) : [];
  const next = res.data?.next_before;
  return {
    ok: true,
    status: res.status,
    data: {
      events: list.map(normalizeEvent),
      nextBefore: typeof next === "string" && next ? next : null,
    },
  };
}

// ---------------------------------------------------------------------------
// 2 登录中的设备
// ---------------------------------------------------------------------------

export interface SecuritySession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipMasked: string;
  deviceLabel: string;
  /** 这台就是你现在用的。当前设备不给「退出这台」，要退就用「退出所有设备」。 */
  current: boolean;
}

export async function getSecuritySessions(): Promise<SecurityApiResult<SecuritySession[]>> {
  const res = await call<Record<string, unknown>>(
    "/v1/account/security/sessions",
    undefined,
    "not_available",
  );
  if (!res.ok) return { ...res, data: undefined };
  const list = Array.isArray(res.data?.sessions) ? (res.data!.sessions as unknown[]) : [];
  return {
    ok: true,
    status: res.status,
    data: list.map((raw) => {
      const r = (raw || {}) as Record<string, unknown>;
      return {
        id: str(r.id),
        createdAt: str(r.created_at),
        lastSeenAt: str(r.last_seen_at),
        ipMasked: maskIp(r.ip_masked),
        deviceLabel: deviceLabel(r.device_label),
        current: r.current === true,
      };
    }),
  };
}

/** 撤销别人那台设备。404 = 这条会话不是你的或已经没了，不是「接口没上线」。 */
export async function revokeSecuritySession(
  sessionId: string,
): Promise<SecurityApiResult<{ ok: boolean }>> {
  if (!sessionId) return { ok: false, code: "not_found" };
  return call<{ ok: boolean }>(
    "/v1/account/security/sessions/revoke",
    { method: "POST", body: JSON.stringify({ session_id: sessionId }) },
    "not_found",
  );
}

// ---------------------------------------------------------------------------
// 3 每日消费上限
// ---------------------------------------------------------------------------

export interface WalletLimit {
  /** 每日上限，账本货币最小单位（分 / 美分）；null = 不限。 */
  dailyFen: number | null;
  /** 今天已花，账本货币最小单位。 */
  spentTodayFen: number;
  /** 账本货币码（"CNY" / "USD"）；旧网关没给时按 CNY。界面用它挑符号，自己不猜。 */
  currency: LedgerCurrency;
}

/** 新键 `*_minor` 优先，旧键 `*_fen` 回落（同一个数）。 */
function firstPresent(...values: unknown[]): unknown {
  for (const v of values) if (v !== null && v !== undefined && v !== "") return v;
  return values.length ? values[values.length - 1] : undefined;
}

function normalizeLimit(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = num(raw, Number.NaN);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export async function getWalletLimit(): Promise<SecurityApiResult<WalletLimit>> {
  const res = await call<Record<string, unknown>>(
    "/v1/account/security/wallet-limit",
    undefined,
    "not_available",
  );
  if (!res.ok) return { ...res, data: undefined };
  const currency = rememberLedgerCurrency(res.data?.currency || ledgerCurrency());
  return {
    ok: true,
    status: res.status,
    data: {
      dailyFen: normalizeLimit(firstPresent(res.data?.daily_minor, res.data?.daily_fen)),
      spentTodayFen: Math.max(
        0,
        Math.floor(num(firstPresent(res.data?.spent_today_minor, res.data?.spent_today_fen), 0)),
      ),
      currency,
    },
  };
}

export async function setWalletLimit(
  dailyFen: number | null,
): Promise<SecurityApiResult<{ dailyFen: number | null; currency: LedgerCurrency }>> {
  const value = dailyFen === null ? null : Math.max(0, Math.floor(num(dailyFen, 0)));
  // 新网关读 `daily_minor`，旧网关只认 `daily_fen`；同一个数两把钥匙都给。
  const res = await call<Record<string, unknown>>(
    "/v1/account/security/wallet-limit",
    { method: "PUT", body: JSON.stringify({ daily_minor: value, daily_fen: value }) },
    "not_available",
  );
  if (!res.ok) return { ...res, data: undefined };
  const currency = rememberLedgerCurrency(res.data?.currency || ledgerCurrency());
  return {
    ok: true,
    status: res.status,
    data: {
      dailyFen: normalizeLimit(firstPresent(res.data?.daily_minor, res.data?.daily_fen)),
      currency,
    },
  };
}

/** 最小单位（分 / 美分）→ 主单位数字文本（不带符号），用于输入框回填。整数分不许出现浮点尾巴。 */
export function fenToYuan(fen: number): string {
  return (Math.round(num(fen, 0)) / 100).toFixed(2);
}

/** 用户输入的主单位金额 → 最小单位。空 / 非法 → null（不限）。 */
export function yuanToFen(input: string): number | null {
  const text = (input || "").trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
