"use client";

// ============================================================================
// @oceanleo/ui — 企业版组织的唯一 API 客户端（契约 `_COMMON.md §3.8`）
// ----------------------------------------------------------------------------
// 组织页（OrgPage）、付费主体选择器（PayerSelector）、成员侧面板（OrgMembership）、
// 插件页的组织连接都从这里取数。**全波只有这一份 fetch**：谁再写第二份，401 的处理、
// 「端点还没上线」的判定、snake_case → camelCase 的归一化就会各说一套，而这三件事
// 每一件做错都不是崩，是界面安静地说谎。
//
// 网关基址与 token 取法复用共享包里已有的那一套（`./auth/config` 的 GATEWAY_BASE
// ＋ `./auth/client` 的 accessToken），不新建一套：cookie 域、家族判定、.cn/.com 的
// 网关分流全在那两个模块里，绕过去就等于把境内版的会话模型重写一遍。
//
// 三条本模块的纪律：
//
// 1. **失败只抛码，不抛句子。** 句子由渲染处 `tt()` 取当前语言 —— 直接把中文当
//    error 甩出去，17 语里就有 16 语看到汉字。码表见 `OrgApiCode`，人话见
//    `orgErrorCopy()`。这与 `./auth/account-security.ts` 是同一口径。
//
// 2. **端点没上线 ≠ 没权限 ≠ 没登录。** 企业版这 10 个路由模块由 9 个 owner 并行
//    落地，`wiring.py` 在 ImportError 时会跳过（`_COMMON §3.7`），所以前端一定会
//    遇到「整条路由 404」。它必须走成 `not_available`（界面说「还没上线」），
//    不能走成 `forbidden`（界面说「你没权限」）—— 后者会让负责人以为自己被降权了。
//
// 3. **后端字段可能缺失 / 为 null / 是字符串。** 每个字段都过一次归一化，网关返回
//    什么形状都不许把组织页打白。金额一律 minor（分 / 美分，`_COMMON §3.1`），
//    前端不做任何货币换算。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

/** `_COMMON §3.3` 的 ROLES。认不出来的角色一律当 `member`（最小权限），不猜。 */
export type OrgRole = "owner" | "admin" | "member";

export const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "member"];

/** `_COMMON §3.3` 的 PERMISSIONS。`setMemberPermission` 的第三个参数取自这里。 */
export const ORG_PERMISSIONS = [
  "view_org_page",
  "view_all_tasks",
  "manage_members",
  "manage_wallet",
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

/**
 * 成员行上那两个布尔列（`_COMMON §3.2`）。勾选权限时 PATCH 的就是这两个列名 ——
 * 列名是契约，不是本模块能改的东西（红线 4）。
 */
const PERMISSION_COLUMN: Partial<Record<string, string>> = {
  view_org_page: "can_view_org_page",
  view_all_tasks: "can_view_all_tasks",
};

/** 邀请链接的落地路由（W13 的 `oceanleo/app/join/page.tsx`，取码方式 `?code=`）。 */
export const INVITE_LANDING_PATH = "/join";

// ---------------------------------------------------------------------------
// 失败的码与人话
// ---------------------------------------------------------------------------

export type OrgApiCode =
  | "signed_out"
  | "forbidden"
  | "not_available"
  | "not_found"
  | "offline"
  | "rate_limited"
  | "server_error"
  | "unknown";

/** 取数失败时抛的东西。`§3.8` 的签名返回的是裸数据，所以失败只能靠抛。 */
export class OrgApiError extends Error {
  readonly code: OrgApiCode;
  readonly status: number;

  constructor(code: OrgApiCode, status = 0) {
    super(`org-api: ${code} (HTTP ${status})`);
    this.name = "OrgApiError";
    this.code = code;
    this.status = status;
  }
}

/** 任何 catch 到的东西 → 一个码。不是 OrgApiError 的（TypeError 之类）当断网。 */
export function orgApiCode(error: unknown): OrgApiCode {
  if (error instanceof OrgApiError) return error.code;
  return "offline";
}

/** 码 → 中文原文（词典 key）。渲染处 `tt()` 一下就是当前语言。 */
export function orgErrorCopy(code: OrgApiCode | undefined): string {
  switch (code) {
    case "signed_out":
      return "登录状态失效了，请重新登录。";
    case "forbidden":
      return "你没有查看这个组织的权限。";
    case "not_available":
      return "这一块还没上线，过些天再来看。";
    case "not_found":
      return "这个组织已经不在了。";
    case "offline":
      return "连不上服务器，检查一下网络再试。";
    case "rate_limited":
      return "操作太频繁了，缓一会儿再试。";
    case "server_error":
      return "服务器出了点问题，稍后再试。";
    default:
      return "这一步没有完成，请稍后重试。";
  }
}

/**
 * 状态码 → 码。两处刻意与直觉不同：
 *   · 403 是 `forbidden` 而不是 `signed_out` —— `roles.require()` 不满足时抛的就是
 *     403（`_COMMON §3.3`），把它当成掉登录会让被授权的成员被莫名踢去登录页；
 *   · 404 / 405 / 501 在「读一整条路由」时是 `not_available`（那个 router 还没
 *     import 进去），在「读某一条具体资源」时才是 `not_found`。由调用处指定。
 */
function codeForStatus(status: number, notFoundMeans: OrgApiCode): OrgApiCode {
  if (status === 401) return "signed_out";
  if (status === 403) return "forbidden";
  if (status === 404 || status === 405 || status === 501) return notFoundMeans;
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "unknown";
}

// ---------------------------------------------------------------------------
// 归一化小零件
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

/** 多个键名里第一个真的有值的（新旧网关键名不一致时用）。 */
function firstPresent(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

function roleOf(value: unknown): OrgRole {
  const role = str(value).trim().toLowerCase();
  return (ORG_ROLES as readonly string[]).includes(role) ? (role as OrgRole) : "member";
}

/** 整分金额；缺失 / 非法 → null（「不限」，与「0 = 一分都不许花」是两件事）。 */
function minorOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = num(value, Number.NaN);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** ISO 时间串；拿不到就 null，让界面说「还没活动过」而不是印一个 `undefined`。 */
function isoOrNull(value: unknown): string | null {
  const text = str(value).trim();
  return text ? text : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * 从响应里取那一串行。后端可能给裸数组，也可能包一层（`{"orgs": [...]}`、
 * `{"members": [...]}`、`{"items": [...]}`）。9 个 owner 并行落地，包哪一层不由
 * 前端决定，所以这里按名字找一遍再退到通用名 —— 少了这一步，某个 owner 用了
 * `items` 而不是 `orgs`，界面就是一张空表加一句「还没有成员」，没有任何报错。
 */
function rowsOf(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const body = record(data);
  for (const key of [...keys, "items", "rows", "data", "results"]) {
    const value = body[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

// ---------------------------------------------------------------------------
// 一次请求
// ---------------------------------------------------------------------------

interface CallResult<T> {
  ok: boolean;
  data?: T;
  code?: OrgApiCode;
  status: number;
}

async function call<T>(
  path: string,
  init: RequestInit | undefined,
  notFoundMeans: OrgApiCode,
): Promise<CallResult<T>> {
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
      credentials: "include",
    });
  } catch {
    return { ok: false, code: "offline", status: 0 };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON（网关 502 的 HTML 之类）：当空响应，按状态码分流 */
  }
  if (res.ok) return { ok: true, data: (body ?? {}) as T, status: res.status };
  return { ok: false, code: codeForStatus(res.status, notFoundMeans), status: res.status };
}

/** 失败就抛。主请求用这个；补充请求用 `call()` 自己吞掉失败。 */
async function must<T>(
  path: string,
  init: RequestInit | undefined = undefined,
  notFoundMeans: OrgApiCode = "not_available",
): Promise<T> {
  const res = await call<T>(path, init, notFoundMeans);
  if (!res.ok || res.data === undefined) {
    throw new OrgApiError(res.code || "unknown", res.status);
  }
  return res.data;
}

function orgPath(orgId: string, suffix = ""): string {
  return `/v1/orgs/${encodeURIComponent(orgId)}${suffix}`;
}

// ---------------------------------------------------------------------------
// 1 组织与成员（W01 / W05）
// ---------------------------------------------------------------------------

export interface OrgSummary {
  id: string;
  name: string;
  role: OrgRole;
  canViewOrgPage: boolean;
  canViewAllTasks: boolean;
  currency: string;
}

function normalizeSummary(raw: unknown): OrgSummary {
  const row = record(raw);
  const role = roleOf(firstPresent(row.role, row.my_role));
  return {
    id: str(firstPresent(row.id, row.org_id)),
    name: str(row.name),
    role,
    // owner 恒真（`_COMMON §3.3`）。网关漏给这两个布尔列时，owner 也必须进得去
    // 自己的组织页 —— 否则建组织的人第一次打开就看到「你没有权限」。
    canViewOrgPage: role === "owner" || bool(firstPresent(row.can_view_org_page, row.canViewOrgPage)),
    canViewAllTasks: role === "owner" || bool(firstPresent(row.can_view_all_tasks, row.canViewAllTasks)),
    currency: str(row.currency).trim().toUpperCase(),
  };
}

/** 我的全部活跃组织（`GET /v1/orgs`）。一个人可能同时是 A 的 owner、B 的成员。 */
export async function listMyOrgs(): Promise<OrgSummary[]> {
  const data = await must<unknown>("/v1/orgs");
  return rowsOf(data, "orgs")
    .map(normalizeSummary)
    .filter((org) => Boolean(org.id));
}

/**
 * 一个组织的详情 + 钱包（`GET /v1/orgs/{id}` ＋ `GET /v1/orgs/{id}/overview`）。
 *
 * 余额与最低起充在 W05 的 overview 里；那条路由没上线时**不让整页失败** ——
 * 组织名、我的角色、权限位是 W01 给的，拿到了就该渲染，充值那一块自己说
 * 「还没上线」。所以 overview 走 `call()` 吞失败，只有 W01 那条失败才抛。
 */
export async function getOrg(orgId: string): Promise<OrgDetail> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const [base, overview] = await Promise.all([
    must<unknown>(orgPath(orgId), undefined, "not_found"),
    call<unknown>(orgPath(orgId, "/overview"), undefined, "not_available"),
  ]);
  const summary = normalizeSummary(base);
  const baseRow = record(base);
  const overviewRow = record(overview.ok ? overview.data : {});
  return {
    ...summary,
    id: summary.id || orgId,
    currency: summary.currency || str(overviewRow.currency).trim().toUpperCase(),
    balanceMinor: num(
      firstPresent(
        overviewRow.balanceMinor,
        overviewRow.balance_minor,
        overviewRow.balance,
        baseRow.balance_minor,
      ),
      0,
    ),
    // 0 = 网关没说门槛，界面就不摆那句起充提示（而不是印一个「最低 ¥0.00」）。
    minTopupMinor: num(
      firstPresent(
        overviewRow.minTopupMinor,
        overviewRow.min_topup_minor,
        baseRow.minTopupMinor,
        baseRow.min_topup_minor,
        overviewRow.min_topup,
      ),
      0,
    ),
    legalName: str(firstPresent(baseRow.legalName, baseRow.legal_name)),
    taxId: str(firstPresent(baseRow.taxId, baseRow.tax_id)),
    status: str(baseRow.status) || "active",
    requireApproval: firstPresent(baseRow.requireApproval, baseRow.require_approval) !== false,
    monthMinor: num(firstPresent(overviewRow.monthMinor, overviewRow.month_minor), 0),
    memberCount: num(firstPresent(overviewRow.memberCount, overviewRow.member_count), 0),
    pendingCount: num(firstPresent(overviewRow.pendingCount, overviewRow.pending_count), 0),
    overviewAvailable: overview.ok,
  };
}

/**
 * `getOrg()` 的返回：`§3.8` 钉死的 `OrgSummary & { balanceMinor; minTopupMinor }`
 * 再加组织页顶部要的开票抬头与概览数字（W01 `GET /{org}` 与 W05 `/overview` 里
 * 真有的字段）。只加不改：契约那几列一个不少、类型不变。
 */
export interface OrgDetail extends OrgSummary {
  balanceMinor: number;
  minTopupMinor: number;
  legalName: string;
  taxId: string;
  /** `active` | `suspended`。 */
  status: string;
  requireApproval: boolean;
  /** 本月组织总花费（minor）；overview 没上线时 0。 */
  monthMinor: number;
  memberCount: number;
  pendingCount: number;
  /** W05 的 `/overview` 到底上线了没 —— 界面靠它区分「余额 0」与「还没上线」。 */
  overviewAvailable: boolean;
}

/**
 * 改组织名 / 开票抬头 / 税号 / 审批开关（`PATCH /v1/orgs/{org}`，W01）。
 * 名称、抬头、税号只有 owner 能改；`requireApproval` owner 与 admin 都能改 ——
 * 权限判在网关，这里只负责把没给的字段不发出去。
 */
export async function updateOrg(
  orgId: string,
  patch: { name?: string; legalName?: string; taxId?: string; requireApproval?: boolean },
): Promise<OrgSummary> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const body: Record<string, unknown> = {};
  if (typeof patch.name === "string") body.name = patch.name.trim();
  if (typeof patch.legalName === "string") body.legalName = patch.legalName.trim();
  if (typeof patch.taxId === "string") body.taxId = patch.taxId.trim();
  if (typeof patch.requireApproval === "boolean") body.requireApproval = patch.requireApproval;
  const data = await must<unknown>(
    orgPath(orgId),
    { method: "PATCH", body: JSON.stringify(body) },
    "not_found",
  );
  return normalizeSummary(data);
}

export interface OrgMemberRow {
  userId: string;
  email: string;
  role: OrgRole;
  status: string;
  monthlyMinor: number;
  taskCount: number;
  assetCount: number;
  lastActiveAt: string | null;
  capMinor: number | null;
  /**
   * 成员行上的两个权限布尔（`_COMMON §3.2` 的列；W01 `GET /members` 与 W05
   * `/members/usage` 都回）。组织页的权限勾就画它们。契约里的七列一个不少，这两个
   * 是**只加**的可选项：网关没回时是 `undefined`，不是 `false`（勾就不乱画）。
   */
  canViewOrgPage?: boolean;
  canViewAllTasks?: boolean;
}

function normalizeMemberRow(raw: unknown): OrgMemberRow {
  const row = record(raw);
  const viewPage = firstPresent(row.canViewOrgPage, row.can_view_org_page);
  const viewTasks = firstPresent(row.canViewAllTasks, row.can_view_all_tasks);
  return {
    userId: str(firstPresent(row.user_id, row.userId, row.id)),
    email: str(firstPresent(row.email, row.user_email)),
    role: roleOf(row.role),
    status: str(row.status) || "active",
    ...(viewPage === undefined ? {} : { canViewOrgPage: bool(viewPage) }),
    ...(viewTasks === undefined ? {} : { canViewAllTasks: bool(viewTasks) }),
    monthlyMinor: num(firstPresent(row.monthly_minor, row.monthlyMinor, row.month_minor), 0),
    taskCount: num(firstPresent(row.task_count, row.taskCount), 0),
    assetCount: num(firstPresent(row.asset_count, row.assetCount), 0),
    lastActiveAt: isoOrNull(firstPresent(row.last_active_at, row.lastActiveAt)),
    capMinor: minorOrNull(
      firstPresent(row.cap_minor, row.capMinor, row.monthly_cap_minor),
    ),
  };
}

/**
 * 成员表（七列 + 上限）。三条来源合并，**谁挂了都不让整张表消失**：
 *   · `GET /members`（W01）——身份：角色、状态、email；
 *   · `GET /members/usage`（W05）——用量：本月花费、任务数、成果数、最后活跃；
 *   · `GET /caps`（W04）——每月上限（只有 `manage_wallet` 读得到，admin 看这一列
 *     会 403，那不该把整页判成无权限，所以它也是补充请求）。
 * 三条并发发出（常数次往返，不是每个成员一次），三条全挂才抛。
 */
export async function listMembers(orgId: string): Promise<OrgMemberRow[]> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const [members, usage, caps] = await Promise.all([
    call<unknown>(orgPath(orgId, "/members"), undefined, "not_available"),
    call<unknown>(orgPath(orgId, "/members/usage"), undefined, "not_available"),
    call<unknown>(orgPath(orgId, "/caps"), undefined, "not_available"),
  ]);
  // 没登录 / 没权限是整页的结论，不是某一块的结论：三条里只要有一条这么说就抛。
  for (const res of [members, usage, caps]) {
    if (res.code === "signed_out" || res.code === "forbidden") {
      throw new OrgApiError(res.code, res.status);
    }
  }
  if (!members.ok && !usage.ok) {
    throw new OrgApiError(members.code || usage.code || "unknown", members.status);
  }

  const merged = new Map<string, OrgMemberRow>();
  const absorb = (rows: unknown[], take: (into: OrgMemberRow, from: OrgMemberRow) => void) => {
    for (const raw of rows) {
      const row = normalizeMemberRow(raw);
      if (!row.userId) continue;
      const into = merged.get(row.userId);
      if (!into) merged.set(row.userId, row);
      else take(into, row);
    }
  };

  absorb(rowsOf(members.ok ? members.data : [], "members"), (into, from) => {
    into.role = from.role;
    into.status = from.status;
    if (from.email) into.email = from.email;
    if (from.canViewOrgPage !== undefined) into.canViewOrgPage = from.canViewOrgPage;
    if (from.canViewAllTasks !== undefined) into.canViewAllTasks = from.canViewAllTasks;
  });
  absorb(rowsOf(usage.ok ? usage.data : [], "members", "usage"), (into, from) => {
    into.monthlyMinor = from.monthlyMinor;
    into.taskCount = from.taskCount;
    into.assetCount = from.assetCount;
    into.lastActiveAt = from.lastActiveAt;
    if (from.capMinor !== null) into.capMinor = from.capMinor;
    if (from.email && !into.email) into.email = from.email;
    if (into.canViewOrgPage === undefined && from.canViewOrgPage !== undefined) {
      into.canViewOrgPage = from.canViewOrgPage;
    }
    if (into.canViewAllTasks === undefined && from.canViewAllTasks !== undefined) {
      into.canViewAllTasks = from.canViewAllTasks;
    }
  });
  absorb(rowsOf(caps.ok ? caps.data : [], "caps"), (into, from) => {
    into.capMinor = from.capMinor;
  });

  // 已移除的成员不该占着表格（`ent_org_members.status` 有 removed 这一档）。
  return [...merged.values()].filter((row) => row.status !== "removed");
}

/**
 * 勾一个成员的权限（`PATCH /v1/orgs/{org}/members/{user}`）。
 *
 * body 用的是 `ent_org_members` 上的列名（`can_view_org_page` / `can_view_all_tasks`，
 * `_COMMON §3.2`）—— 列名是契约里钉死的那一份，不是这里发明的。
 */
export async function setMemberPermission(
  orgId: string,
  userId: string,
  permission: string,
  value: boolean,
): Promise<void> {
  if (!orgId || !userId) throw new OrgApiError("not_found", 404);
  const column = PERMISSION_COLUMN[permission] || permission;
  // W01 盘上的 `PatchMemberBody` 收的是 camelCase（`canViewOrgPage`），契约 §3.2 写的是
  // 列名。两种都发：pydantic 默认忽略多余键，而只发其中一种、猜错了就是「勾了没反应」。
  const camel = column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  await must<unknown>(
    orgPath(orgId, `/members/${encodeURIComponent(userId)}`),
    { method: "PATCH", body: JSON.stringify({ [column]: value, [camel]: value }) },
    "not_found",
  );
}

/** 每月上限（`PUT /v1/orgs/{org}/caps/{user}`）。`null` = 不限，`0` = 一分不许花。 */
export async function setMemberCap(
  orgId: string,
  userId: string,
  capMinor: number | null,
): Promise<void> {
  if (!orgId || !userId) throw new OrgApiError("not_found", 404);
  const value = capMinor === null ? null : Math.max(0, Math.floor(num(capMinor, 0)));
  await must<unknown>(
    orgPath(orgId, `/caps/${encodeURIComponent(userId)}`),
    // W04 盘上的 `PutCapBody` 键是 `capMinor`；列名 `monthly_cap_minor` 一并发（同上）。
    { method: "PUT", body: JSON.stringify({ capMinor: value, monthly_cap_minor: value }) },
    "not_available",
  );
}

// ---------------------------------------------------------------------------
// 2 邀请与入组申请（W02）
// ---------------------------------------------------------------------------

export interface OrgJoinRequestRow {
  userId: string;
  email: string;
  requestedAt: string;
}

/** 待审批的入组申请。只回 `pending` 的 —— 已裁决的不该还摆在待办里。 */
export async function listJoinRequests(orgId: string): Promise<OrgJoinRequestRow[]> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const data = await must<unknown>(orgPath(orgId, "/join-requests"));
  return rowsOf(data, "requests", "join_requests")
    .map((raw) => {
      const row = record(raw);
      return {
        userId: str(firstPresent(row.user_id, row.userId)),
        email: str(firstPresent(row.email, row.user_email)),
        requestedAt: str(firstPresent(row.requested_at, row.requestedAt)),
        status: str(row.status) || "pending",
      };
    })
    .filter((row) => Boolean(row.userId) && row.status === "pending")
    .map(({ userId, email, requestedAt }) => ({ userId, email, requestedAt }));
}

/** 通过 / 驳回一条申请。body 形状由 W02 钉死：`{"approve": true|false}`。 */
export async function decideJoinRequest(
  orgId: string,
  userId: string,
  approve: boolean,
): Promise<void> {
  if (!orgId || !userId) throw new OrgApiError("not_found", 404);
  await must<unknown>(
    orgPath(orgId, `/join-requests/${encodeURIComponent(userId)}:decide`),
    { method: "POST", body: JSON.stringify({ approve }) },
    "not_found",
  );
}

/**
 * 生成一条邀请链接（`POST /v1/orgs/{org}/invites`）。
 *
 * 网关给了 `url` 就用它的（它才知道自己部署在哪个家族的域上）；只给了 code 时
 * 按落地路由自己拼 —— 落地页是 W13 的 `/join?code=<code>`，那是契约里的路径，
 * 不是这里随手起的。
 */
export async function createInvite(
  orgId: string,
): Promise<{ url: string; code: string; expiresAt: string }> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const data = await must<unknown>(orgPath(orgId, "/invites"), { method: "POST", body: "{}" });
  const row = record(data);
  const code = str(firstPresent(row.code, row.invite_code));
  return {
    url: str(row.url) || inviteUrlFor(code),
    code,
    expiresAt: str(firstPresent(row.expires_at, row.expiresAt)),
  };
}

/** `<当前站点 origin>/join?code=<code>`。服务端渲染时没有 window，就给相对路径。 */
export function inviteUrlFor(code: string): string {
  if (!code) return "";
  const suffix = `${INVITE_LANDING_PATH}?code=${encodeURIComponent(code)}`;
  if (typeof window === "undefined") return suffix;
  return `${window.location.origin}${suffix}`;
}

/**
 * 拿邀请码申请入组（`POST /v1/orgs/invites/{code}:request`）。
 * 组织的 `require_approval = false` 时后端直接放人进去，于是 status 是 `joined`。
 */
export async function requestJoin(
  code: string,
): Promise<{ status: "pending" | "joined"; orgName: string }> {
  if (!code) throw new OrgApiError("not_found", 404);
  const data = await must<unknown>(
    `/v1/orgs/invites/${encodeURIComponent(code)}:request`,
    { method: "POST", body: "{}" },
    "not_found",
  );
  const row = record(data);
  const status = str(firstPresent(row.status, row.state)).toLowerCase();
  return {
    status: status === "joined" || status === "approved" || status === "active" ? "joined" : "pending",
    orgName: str(firstPresent(row.org_name, row.orgName, row.name)),
  };
}

// ---------------------------------------------------------------------------
// 3 组织任务、查看审计、成果（W06 / W07）
// ---------------------------------------------------------------------------

export interface OrgTaskRow {
  ref: string;
  userId: string;
  email: string;
  title: string;
  siteId: string;
  costMinor: number;
  createdAt: string;
}

/** `listOrgTasks()` 的签名按契约是 `unknown[]`；要类型的调用方过这个归一化（幂等）。 */
export function normalizeOrgTaskRows(value: unknown): OrgTaskRow[] {
  return rowsOf(value, "tasks").map((raw) => {
    const row = record(raw);
    return {
      ref: str(firstPresent(row.task_ref, row.taskRef, row.ref, row.id)),
      userId: str(firstPresent(row.user_id, row.userId)),
      email: str(firstPresent(row.email, row.user_email)),
      title: str(firstPresent(row.title, row.prompt, row.summary)),
      siteId: str(firstPresent(row.site_id, row.siteId)),
      costMinor: num(firstPresent(row.cost_minor, row.costMinor, row.amount), 0),
      createdAt: str(firstPresent(row.created_at, row.createdAt)),
    };
  });
}

/**
 * 组织范围内的任务（`GET /v1/orgs/{org}/tasks`）。
 *
 * **只有扣费事件带 `meta.org_id` 的工作才会出现在这里**（`_COMMON §3.6`，W06 的
 * 判据）。个人钱包付费的东西永远不进这个列表 —— 那是对外承诺，不是过滤条件，
 * 所以前端不加也不减，后端给什么就显示什么。
 */
export async function listOrgTasks(
  orgId: string,
  params: { userId?: string; days?: number } = {},
): Promise<unknown[]> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const query = new URLSearchParams();
  if (params.userId) query.set("user_id", params.userId);
  if (typeof params.days === "number" && params.days > 0) {
    query.set("days", String(Math.floor(params.days)));
  }
  const suffix = query.size ? `/tasks?${query.toString()}` : "/tasks";
  return normalizeOrgTaskRows(await must<unknown>(orgPath(orgId, suffix)));
}

export interface OrgViewRow {
  orgId: string;
  viewerEmail: string;
  viewedAt: string;
}

/**
 * 「谁看过我」（`GET /v1/orgs/me/views`）。任何登录用户都读得到自己的这份记录，
 * 不需要任何组织权限 —— 这是我们敢做全量可见的前提，所以它不能被权限挡住。
 */
export async function listViewsOfMe(): Promise<OrgViewRow[]> {
  const data = await must<unknown>("/v1/orgs/me/views");
  return rowsOf(data, "views", "audit").map((raw) => {
    const row = record(raw);
    return {
      orgId: str(firstPresent(row.org_id, row.orgId)),
      viewerEmail: str(firstPresent(row.viewer_email, row.viewerEmail, row.viewer)),
      viewedAt: str(firstPresent(row.viewed_at, row.viewedAt, row.created_at)),
    };
  });
}

export interface OrgAssetRow {
  id: string;
  kind: string;
  title: string;
  url: string;
  userId: string;
  email: string;
  createdAt: string;
}

/** 同上：签名是 `unknown[]`，要类型的调用方过这个归一化（幂等）。 */
export function normalizeOrgAssetRows(value: unknown): OrgAssetRow[] {
  return rowsOf(value, "assets").map((raw) => {
    const row = record(raw);
    return {
      id: str(firstPresent(row.id, row.asset_id)),
      kind: str(firstPresent(row.kind, row.type)),
      title: str(firstPresent(row.title, row.name)),
      url: str(firstPresent(row.url, row.public_url)),
      userId: str(firstPresent(row.user_id, row.userId)),
      email: str(firstPresent(row.email, row.user_email)),
      createdAt: str(firstPresent(row.created_at, row.createdAt)),
    };
  });
}

/** 组织的成果库（`GET /v1/orgs/{org}/assets`，W07）。 */
export async function listOrgAssets(orgId: string): Promise<unknown[]> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  return normalizeOrgAssetRows(await must<unknown>(orgPath(orgId, "/assets")));
}

// ---------------------------------------------------------------------------
// 4 用量趋势与模型分布（W05）
// ---------------------------------------------------------------------------

export interface OrgUsagePoint {
  date: string;
  minor: number;
}

export interface OrgUsageModelRow {
  model: string;
  minor: number;
  calls: number;
}

export interface OrgUsage {
  days: number;
  totalMinor: number;
  trend: OrgUsagePoint[];
  byModel: OrgUsageModelRow[];
  /** 这两条各自的路由到底上线了没 —— 界面靠它区分「零花费」与「还没上线」。 */
  trendAvailable: boolean;
  byModelAvailable: boolean;
}

/** 同上：签名是 `unknown`，要类型的调用方过这个归一化（幂等）。 */
export function normalizeOrgUsage(value: unknown): OrgUsage {
  const body = record(value);
  const trend = rowsOf(firstPresent(body.trend, body.points) ?? [], "trend", "points").map((raw) => {
    const row = record(raw);
    return {
      date: str(firstPresent(row.date, row.day, row.bucket)),
      minor: num(firstPresent(row.minor, row.amount, row.spend_minor), 0),
    };
  });
  const byModel = rowsOf(firstPresent(body.byModel, body.by_model, body.models) ?? [], "by_model", "models").map(
    (raw) => {
      const row = record(raw);
      return {
        model: str(firstPresent(row.model, row.name, row.model_id)),
        minor: num(firstPresent(row.minor, row.amount, row.spend_minor), 0),
        calls: num(firstPresent(row.calls, row.count, row.requests), 0),
      };
    },
  );
  return {
    days: num(body.days, 0),
    totalMinor: num(
      firstPresent(body.totalMinor, body.total_minor),
      trend.reduce((sum, point) => sum + point.minor, 0),
    ),
    trend,
    byModel,
    trendAvailable: body.trendAvailable !== false,
    byModelAvailable: body.byModelAvailable !== false,
  };
}

/**
 * 1 / 7 / 30 天的用量（`GET /usage/trend?days=` ＋ `GET /usage/by-model?days=`）。
 *
 * 两条独立取：分布挂了不该把趋势也一起藏掉。两条都挂才抛 —— 那时候界面显示的是
 * 「还没上线」而不是一张零高度的空图（空图会被读成「这个月没花钱」）。
 */
export async function getOrgUsage(orgId: string, days: number): Promise<unknown> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const window = Math.max(1, Math.floor(num(days, 30)));
  const query = `?days=${window}`;
  const [trend, byModel] = await Promise.all([
    call<unknown>(orgPath(orgId, `/usage/trend${query}`), undefined, "not_available"),
    call<unknown>(orgPath(orgId, `/usage/by-model${query}`), undefined, "not_available"),
  ]);
  for (const res of [trend, byModel]) {
    if (res.code === "signed_out" || res.code === "forbidden") {
      throw new OrgApiError(res.code, res.status);
    }
  }
  if (!trend.ok && !byModel.ok) {
    throw new OrgApiError(trend.code || byModel.code || "unknown", trend.status);
  }
  const usage = normalizeOrgUsage({
    days: window,
    trend: trend.ok ? trend.data : [],
    by_model: byModel.ok ? byModel.data : [],
    trendAvailable: trend.ok,
    byModelAvailable: byModel.ok,
  });
  return usage;
}

// ---------------------------------------------------------------------------
// 5 成员自查（裁定 A2，W04 的 `GET /v1/orgs/{org}/caps/me`）
// ---------------------------------------------------------------------------

/**
 * 「我这个月在这家公司花了多少、我的上限是多少」（任何活跃成员可读）。
 *
 * 这一条与 `listMembers()` 是两个面：那条是管理员面（普通成员会 403），这条是
 * 成员自己的。W13 的 `OrgMembership` 默认 `loadMyUsage` 就是它。
 * `capMinor === null` = 没设上限（不是 0）。
 */
export async function getMyOrgUsage(
  orgId: string,
): Promise<{ monthlyMinor: number; capMinor: number | null }> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const row = record(await must<unknown>(orgPath(orgId, "/caps/me")));
  return {
    monthlyMinor: num(
      firstPresent(row.monthly_minor, row.monthlyMinor, row.spent_minor, row.month_minor, row.spent),
      0,
    ),
    capMinor: minorOrNull(firstPresent(row.cap_minor, row.capMinor, row.monthly_cap_minor, row.cap)),
  };
}

// ---------------------------------------------------------------------------
// 6 组织级 MCP 连接（裁定 A3，W08 的 `ent_org_mcp_router.py`）
// ---------------------------------------------------------------------------

/**
 * 一条组织级 MCP 连接（无密文 —— 凭据只在网关里，前端永远拿不到）。
 * 字段名与 W15 已落的 `PluginsPage.tsx` 那份归一化一致，换成 import 时渲染层不动。
 */
export interface OrgMcpConnectionRow {
  orgId: string;
  orgName: string;
  connectorId: string;
  label: string;
  icon: string;
  toolsCount: number;
  enabled: boolean;
  /** 管理员可以把一条连接对普通成员隐藏；成员视角拿到的永远是 true。 */
  memberVisible: boolean;
}

/** 网关的 `{connections:[...]}` → 行。认不出 `connector_id` 的条目直接丢，不抛。 */
export function normalizeOrgMcpConnectionRows(
  value: unknown,
  fallback: { orgId?: string; orgName?: string } = {},
): OrgMcpConnectionRow[] {
  const rows: OrgMcpConnectionRow[] = [];
  for (const raw of rowsOf(value, "connections")) {
    const row = record(raw);
    const connectorId = str(firstPresent(row.connector_id, row.connectorId, row.id));
    if (!connectorId) continue;
    rows.push({
      orgId: str(firstPresent(row.org_id, row.orgId)) || fallback.orgId || "",
      orgName: str(firstPresent(row.org_name, row.orgName)) || fallback.orgName || "",
      connectorId,
      label: str(firstPresent(row.label, row.name)) || connectorId,
      icon: str(row.icon) || "🔌",
      toolsCount: num(firstPresent(row.tools_count, row.toolsCount), 0),
      enabled: row.enabled !== false,
      memberVisible: firstPresent(row.member_visible, row.memberVisible) !== false,
    });
  }
  return rows;
}

/**
 * 我从所在公司继承到的连接（`GET /v1/orgs/mcp/available`，可能来自多家公司，每行带
 * `orgId`）。插件页据此显示「由公司提供，无需填 key」。
 */
export async function listInheritedMcp(): Promise<OrgMcpConnectionRow[]> {
  return normalizeOrgMcpConnectionRows(await must<unknown>("/v1/orgs/mcp/available"));
}

/**
 * 一家公司连过的服务器（`GET /v1/orgs/{org}/mcp/connections`）。管理员看全部；
 * 能看组织页的普通成员只看到 `member_visible` 的那几台（过滤在网关做）。
 */
export async function listOrgMcpConnections(orgId: string): Promise<OrgMcpConnectionRow[]> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  return normalizeOrgMcpConnectionRows(await must<unknown>(orgPath(orgId, "/mcp/connections")), {
    orgId,
  });
}

/** `POST /v1/orgs/{org}/mcp/connections` 的 body（W08 的 `OrgConnectBody`）。 */
export interface OrgMcpConnectBody {
  connectorId: string;
  token?: string;
  endpoint?: string;
  label?: string;
  memberVisible?: boolean;
}

/**
 * 为组织连一台 MCP 服务器（网关先 `tools/list` 探测一次，通了才落库）。
 * 返回落库后的那一行 + 探测到的工具数。需要 `manage_members`。
 */
export async function upsertOrgMcpConnection(
  orgId: string,
  body: OrgMcpConnectBody,
): Promise<{ connection: OrgMcpConnectionRow | null; toolsCount: number }> {
  if (!orgId) throw new OrgApiError("not_found", 404);
  const connectorId = str(body.connectorId).trim();
  if (!connectorId) throw new OrgApiError("unknown", 400);
  const data = record(
    await must<unknown>(
      orgPath(orgId, "/mcp/connections"),
      {
        method: "POST",
        body: JSON.stringify({
          connector_id: connectorId,
          token: str(body.token).trim(),
          endpoint: str(body.endpoint).trim(),
          label: str(body.label).trim() || connectorId,
          member_visible: body.memberVisible !== false,
        }),
      },
      "not_available",
    ),
  );
  const [connection = null] = normalizeOrgMcpConnectionRows(
    data.connection ? [data.connection] : [],
    { orgId },
  );
  return { connection, toolsCount: num(data.tools_count, connection?.toolsCount ?? 0) };
}

/**
 * 停用 / 启用，或改「普通成员能不能用」（`PATCH …/mcp/connections/{connector}`）。
 * 两个都没给时网关回 400，这里先本地挡下，不发一次注定失败的往返。
 */
export async function patchOrgMcpConnection(
  orgId: string,
  connectorId: string,
  patch: { enabled?: boolean; memberVisible?: boolean },
): Promise<void> {
  if (!orgId || !connectorId) throw new OrgApiError("not_found", 404);
  const body: Record<string, boolean> = {};
  if (typeof patch.enabled === "boolean") body.enabled = patch.enabled;
  if (typeof patch.memberVisible === "boolean") body.member_visible = patch.memberVisible;
  if (!Object.keys(body).length) return;
  await must<unknown>(
    orgPath(orgId, `/mcp/connections/${encodeURIComponent(connectorId)}`),
    { method: "PATCH", body: JSON.stringify(body) },
    "not_found",
  );
}

/** 断开（`DELETE …/mcp/connections/{connector}`）。密文行一并删掉。 */
export async function deleteOrgMcpConnection(orgId: string, connectorId: string): Promise<void> {
  if (!orgId || !connectorId) throw new OrgApiError("not_found", 404);
  await must<unknown>(
    orgPath(orgId, `/mcp/connections/${encodeURIComponent(connectorId)}`),
    { method: "DELETE" },
    "not_found",
  );
}
