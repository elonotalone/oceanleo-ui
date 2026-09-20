"use client";

// ============================================================================
// @oceanleo/ui — 企业版「成员侧」面板（W13）
// ----------------------------------------------------------------------------
// 员工这一侧的全部体验，一个可独立使用的面板，三段：
//   ① 我的组织：每行组织名、我的角色、本月花费 / 上限、状态；
//   ② 加入组织：输入邀请码或从链接自动带入，申请前**必须**看到「加入后这个组织能看到
//      什么」的告知（合规前提，文案见 ORG_JOIN_DISCLOSURE，不许省）；
//   ③ 谁看过我：管理员每次读我的任务详情都留一条记录，这里全列出来。
//
// 三个挂载点：`/join?code=<code>`（主站落地页，W13 的 oceanleo/app/join/page.tsx）、
// 账户页的 extraSections（`AccountPage.tsx`，无组织且无邀请码时**渲染为 null**，
// 让无组织用户的账户页与今天逐字节一致）、以及组织页（W11 的 OrgPage 可直接嵌）。
//
// 取数只走 `../lib/org-api`（W11，全波唯一的 /v1/orgs 出口，`_COMMON §3.8`）。
// 两处契约与本文件并行落地，所以做成**可注入**，默认实现都指向 `org-api.ts`：
//   · `loadMyUsage`       —— 默认调 `getMyOrgUsage(orgId)`（裁定 A2，已在 org-api.ts）。
//   · `loadInvitePreview` —— 默认调 `getInvitePreview(code)`（裁定 A13，W11 r3 在加）；
//     还没落地时不预览，申请成功后用 `requestJoin` 回的 `orgName` 补上。
// 这两个口子只是让「谁先落地」不阻塞谁；测试也靠它们注入替身。
//
// 失败只显示 `orgErrorCopy(code)` 的人话；`not_available`（路由还没 include 进来）
// 显示「还没上线」而不是「你没权限」（`org-api.ts` 纪律 2）。
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import * as orgApi from "../lib/org-api";
import {
  OrgApiError,
  orgApiCode,
  orgErrorCopy,
  type OrgApiCode,
  type OrgRole,
  type OrgSummary,
  type OrgViewRow,
} from "../lib/org-api";
import { formatMinor } from "../lib/money";
import { useUI } from "../i18n/ui/useUI";

// ---------------------------------------------------------------------------
// 契约形状
// ---------------------------------------------------------------------------

/** A2：`GET /v1/orgs/{org_id}/caps/me` 的成员自查（本月已花 / 上限，minor）。 */
export interface MyOrgUsage {
  monthlyMinor: number;
  /** null = 不限（与「0 = 一分都不许花」是两件事）。 */
  capMinor: number | null;
}

/** 邀请码公开预览（W02 的 `GET /v1/orgs/invites/{code}`：只回组织名与是否需审批）。 */
export interface InvitePreview {
  orgName: string;
  requireApproval: boolean;
}

/**
 * 申请入组之后此人所处的状态。五种业务状态各有明确文案（任务书 P4），
 * 外加流程态 idle / submitting / error。
 */
export type JoinState =
  | "idle"
  | "submitting"
  | "pending" // 申请中（等审批）
  | "joined" // 已通过
  | "rejected" // 被驳回
  | "expired" // 链接过期 / 被撤销
  | "already_member" // 你已经在这个组织里了
  | "error";

/**
 * 合规告知（任务书 P1 ②，逐字）。加入前必须完整展示；测试按句断言。
 * 三句拆开只是为了词典 key 短一点，渲染时连成一段。
 */
export const ORG_JOIN_DISCLOSURE: readonly string[] = [
  "用组织钱包付费的任务，组织管理员可以查看全部内容；用你个人钱包付费的任务，组织永远看不到。",
  "每次查看都会留下记录，你可以在下面看到谁看过。",
];

/** 五种状态的文案（中文原文即词典 key）。`{org}` 由渲染处替换。 */
export const JOIN_STATE_COPY: Record<Exclude<JoinState, "idle" | "submitting" | "error">, string> = {
  pending: "申请已提交，等负责人通过。通过后这里会出现这个组织，你也会收到一条站内通知。",
  joined: "已加入「{org}」。现在可以在发任务时选择用这个组织的钱包付费。",
  rejected: "申请没有通过。负责人驳回了你的申请，或这个组织暂停了加入；有疑问请直接联系负责人。",
  expired: "这条邀请链接已经过期或被撤销了。请负责人重新生成一条再发给你。",
  already_member: "你已经在这个组织里了，不需要再申请。",
};

/**
 * `requestJoin()` 的结果或抛出的错误 → 五种状态之一。
 *
 * 契约（`§3.8`）只给了 `pending | joined` 两档；其余三档按 HTTP 语义从 `OrgApiError.status`
 * 读（`org-api.ts` 对 409 / 410 给的 code 是 `unknown`，但 status 保真）：
 *   · 后端 `status: "rejected"`（W02 `ent_org_join_requests.status`）或 HTTP 403 → 被驳回；
 *   · HTTP 409 → 已经是成员；
 *   · HTTP 404 / 410 → 链接过期或被撤销。
 * 其他失败 → `error`，界面显示 `orgErrorCopy(code)`。
 */
export function joinOutcomeOf(
  input: { status: string } | unknown,
): { state: JoinState; code?: OrgApiCode } {
  if (input instanceof OrgApiError) {
    if (input.status === 409) return { state: "already_member" };
    if (input.status === 404 || input.status === 410) return { state: "expired" };
    if (input.status === 403) return { state: "rejected" };
    return { state: "error", code: input.code };
  }
  if (input instanceof Error) return { state: "error", code: orgApiCode(input) };
  const status =
    input && typeof input === "object" && "status" in input
      ? String((input as { status: unknown }).status || "").toLowerCase()
      : "";
  if (status === "joined") return { state: "joined" };
  if (status === "rejected") return { state: "rejected" };
  if (status === "already_member" || status === "member") return { state: "already_member" };
  if (status === "expired" || status === "revoked") return { state: "expired" };
  return { state: "pending" };
}

// ---------------------------------------------------------------------------
// 邀请码在会话里的落脚点
// ---------------------------------------------------------------------------
// 员工点微信里的链接 → /join?code= → 还没登录 → 登录 → 回到 /join 原地重判；这条路不经过
// 账户页。但如果他中途去了账户页（或登录后被别的页接走），账户页也该看得到「有一条
// 邀请码等你申请」，所以落地页拿到 code 时顺手记到 sessionStorage，账户页据此显示入口。
// **不用 `?code=`**：`/account?code=` 是微信回跳的 OAuth code，两条路撞在同一个参数名上。

export const INVITE_CODE_STORAGE_KEY = "oceanleo:org-invite-code";

export function rememberInviteCode(code: string): void {
  if (typeof window === "undefined" || !code) return;
  try {
    window.sessionStorage.setItem(INVITE_CODE_STORAGE_KEY, code);
  } catch {
    /* 隐私模式下 sessionStorage 可能不可写：记不住就记不住，不影响申请 */
  }
}

export function recallInviteCode(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(INVITE_CODE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function forgetInviteCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(INVITE_CODE_STORAGE_KEY);
  } catch {
    /* 同上 */
  }
}

/** 从 `/join?code=<code>` 这类 href 取邀请码；取不到给空串。 */
export function inviteCodeFromHref(href: string): string {
  try {
    return new URL(href, "https://oceanleo.com").searchParams.get("code")?.trim() || "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// 默认取数（A2：`loadMyUsage` → `getMyOrgUsage`；A13：`loadInvitePreview` → `getInvitePreview`）
// ---------------------------------------------------------------------------

/**
 * 两个默认实现都用命名空间取而不是具名 import：W11 把对应导出加进 `org-api.ts` 之前，
 * 具名 import 会让**任何**编到本文件的模块在加载期就 SyntaxError（连账户页一起打哑）；
 * 命名空间取到的是 undefined，这里判一下就走「还没上线」分支。W11 落地后这段判断
 * 永远为假，不需要再改。经 `unknown` 断言是为了在导出还不存在时也能过 typecheck。
 */
type OrgApiOptional = Partial<{
  getMyOrgUsage: (orgId: string) => Promise<MyOrgUsage>;
  getInvitePreview: (code: string) => Promise<InvitePreview>;
}>;
const orgApiOptional = orgApi as unknown as OrgApiOptional;

async function defaultLoadMyUsage(orgId: string): Promise<MyOrgUsage> {
  const fn = orgApiOptional.getMyOrgUsage;
  if (typeof fn !== "function") throw new OrgApiError("not_available", 404);
  const raw = await fn(orgId);
  const monthly = Number(raw?.monthlyMinor);
  const cap = raw?.capMinor;
  return {
    monthlyMinor: Number.isFinite(monthly) ? Math.max(0, Math.floor(monthly)) : 0,
    capMinor:
      cap === null || cap === undefined || !Number.isFinite(Number(cap))
        ? null
        : Math.max(0, Math.floor(Number(cap))),
  };
}

/**
 * 邀请码公开预览（A13：W02 的 `GET /v1/orgs/invites/{code}`，只回组织名与是否需审批）。
 * 导出还没落地时抛 `not_available`；面板对预览失败的处理是**静默不显示**（申请照常可点），
 * 所以这一条永远不会挡住申请入组。
 */
async function defaultLoadInvitePreview(code: string): Promise<InvitePreview> {
  const fn = orgApiOptional.getInvitePreview;
  if (typeof fn !== "function") throw new OrgApiError("not_available", 404);
  const raw = await fn(code);
  return {
    orgName: String(raw?.orgName ?? "").trim(),
    requireApproval: raw?.requireApproval !== false,
  };
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export interface OrgMembershipProps {
  /** 从邀请链接带进来的邀请码（`/join?code=`）。传了就预填并记进会话。 */
  inviteCode?: string;
  /**
   * 无组织且无邀请码时渲染 null（账户页用，让无组织用户的账户页与今天零差异）。
   * 默认 false：`/join` 与组织页永远渲染完整面板。
   */
  hideWhenEmpty?: boolean;
  /** 「这个面板此刻有没有东西可看」变化时回调（账户页据此决定要不要加「我的组织」菜单项）。 */
  onVisibilityChange?: (visible: boolean) => void;
  /** 申请通过（直接入组）后的回调，带组织名。 */
  onJoined?: (orgName: string) => void;
  /** 成员自查用量。默认 `getMyOrgUsage(orgId)`（A2）。 */
  loadMyUsage?: (orgId: string) => Promise<MyOrgUsage>;
  /** 邀请码公开预览。默认 `getInvitePreview(code)`（A13）；申请前显示组织名与是否需审批。 */
  loadInvitePreview?: (code: string) => Promise<InvitePreview>;
  /** 嵌在别的页里时不带整页的大标题。 */
  embedded?: boolean;
  /** 只渲染这一段（`/join` 落地页只要「加入组织」那一段时用）。默认三段全渲染。 */
  only?: "orgs" | "join" | "views";
  className?: string;
}

type Loaded<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; code: OrgApiCode };

function roleCopy(role: OrgRole): string {
  if (role === "owner") return "负责人";
  if (role === "admin") return "管理员";
  return "成员";
}

function whenCopy(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function OrgMembership({
  inviteCode = "",
  hideWhenEmpty = false,
  onVisibilityChange,
  onJoined,
  loadMyUsage = defaultLoadMyUsage,
  loadInvitePreview = defaultLoadInvitePreview,
  embedded = false,
  only,
  className = "",
}: OrgMembershipProps) {
  const tt = useUI();

  const [orgs, setOrgs] = useState<Loaded<OrgSummary[]>>({ status: "loading" });
  const [usage, setUsage] = useState<Record<string, Loaded<MyOrgUsage>>>({});
  const [views, setViews] = useState<Loaded<OrgViewRow[]>>({ status: "loading" });

  const [code, setCode] = useState(() => inviteCode || recallInviteCode());
  const [preview, setPreview] = useState<Loaded<InvitePreview> | null>(null);
  const [join, setJoin] = useState<{ state: JoinState; orgName: string; code?: OrgApiCode }>({
    state: "idle",
    orgName: "",
  });

  // 链接带来的码：预填 + 记进会话（账户页据此显示入口）。
  useEffect(() => {
    if (!inviteCode) return;
    setCode(inviteCode);
    rememberInviteCode(inviteCode);
  }, [inviteCode]);

  const reloadOrgs = useCallback(async () => {
    try {
      const rows = await orgApi.listMyOrgs();
      setOrgs({ status: "ok", data: rows });
      return rows;
    } catch (error) {
      setOrgs({ status: "error", code: orgApiCode(error) });
      return [] as OrgSummary[];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await reloadOrgs();
      if (cancelled) return;
      // 用量逐组织取，失败只影响那一行的两个数字，不影响别的行、不影响面板。
      await Promise.all(
        rows.map(async (org) => {
          try {
            const u = await loadMyUsage(org.id);
            if (!cancelled) setUsage((prev) => ({ ...prev, [org.id]: { status: "ok", data: u } }));
          } catch (error) {
            if (!cancelled) {
              setUsage((prev) => ({ ...prev, [org.id]: { status: "error", code: orgApiCode(error) } }));
            }
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadOrgs, loadMyUsage]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await orgApi.listViewsOfMe();
        if (!cancelled) setViews({ status: "ok", data: rows });
      } catch (error) {
        if (!cancelled) setViews({ status: "error", code: orgApiCode(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 邀请码预览（有注入才做）。
  useEffect(() => {
    if (!loadInvitePreview || !code.trim()) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreview({ status: "loading" });
    void (async () => {
      try {
        const p = await loadInvitePreview(code.trim());
        if (!cancelled) setPreview({ status: "ok", data: p });
      } catch (error) {
        if (!cancelled) setPreview({ status: "error", code: orgApiCode(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInvitePreview, code]);

  const orgRows = orgs.status === "ok" ? orgs.data : [];
  const hasOrgs = orgRows.length > 0;
  const hasCode = Boolean(code.trim());
  // 「有东西可看」= 至少一个组织，或手里有一条可申请的邀请码。加载完之前按「没有」算，
  // 免得账户页先闪出一块再消失。
  const visible = orgs.status === "loading" ? false : hasOrgs || hasCode;

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of orgRows) map.set(org.id, org.name);
    return map;
  }, [orgRows]);

  async function submitJoin() {
    const trimmed = code.trim();
    if (!trimmed || join.state === "submitting") return;
    setJoin({ state: "submitting", orgName: "" });
    try {
      const result = await orgApi.requestJoin(trimmed);
      const outcome = joinOutcomeOf(result);
      const orgName = result.orgName || (preview?.status === "ok" ? preview.data.orgName : "");
      setJoin({ state: outcome.state, orgName, code: outcome.code });
      if (outcome.state === "joined" || outcome.state === "already_member") {
        forgetInviteCode();
        await reloadOrgs();
        if (outcome.state === "joined") onJoined?.(orgName);
      }
    } catch (error) {
      const outcome = joinOutcomeOf(error);
      const orgName = preview?.status === "ok" ? preview.data.orgName : "";
      setJoin({ state: outcome.state, orgName, code: outcome.code });
      if (outcome.state === "already_member" || outcome.state === "expired") forgetInviteCode();
    }
  }

  if (hideWhenEmpty && !visible) return null;

  const show = (section: "orgs" | "join" | "views") => !only || only === section;
  const sectionClass = "mt-6 rounded-xl border border-neutral-200 p-4";
  const titleClass = "text-[13px] font-semibold text-neutral-900";
  const subtleClass = "text-[12px] text-neutral-500";

  return (
    <section className={className} data-org-membership="1">
      {!embedded && (
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt("我的组织")}</h1>
      )}

      {/* ① 我的组织 */}
      {show("orgs") && (
        <div className={sectionClass} data-org-section="orgs">
          <p className={titleClass}>{tt("我的组织")}</p>
          {orgs.status === "loading" && <p className={`mt-2 ${subtleClass}`}>…</p>}
          {orgs.status === "error" && (
            <p className={`mt-2 ${subtleClass}`}>{tt(orgErrorCopy(orgs.code))}</p>
          )}
          {orgs.status === "ok" && !hasOrgs && (
            <p className={`mt-2 ${subtleClass}`}>{tt("你还不属于任何组织。拿到负责人发的邀请链接后，在下面申请加入。")}</p>
          )}
          {orgs.status === "ok" && hasOrgs && (
            <ul className="mt-2 divide-y divide-neutral-100">
              {orgRows.map((org) => {
                const u = usage[org.id];
                const spent =
                  u?.status === "ok" ? formatMinor(u.data.monthlyMinor, org.currency || undefined) : "—";
                const cap =
                  u?.status === "ok"
                    ? u.data.capMinor === null
                      ? tt("不限")
                      : formatMinor(u.data.capMinor, org.currency || undefined)
                    : "—";
                const reached =
                  u?.status === "ok" && u.data.capMinor !== null && u.data.monthlyMinor >= u.data.capMinor;
                return (
                  <li
                    key={org.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    data-org-row={org.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-neutral-900">{org.name || org.id}</p>
                      <p className={subtleClass}>{tt(roleCopy(org.role))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] tabular-nums text-neutral-900" data-org-usage={org.id}>
                        {spent} / {cap}
                      </p>
                      <p className={subtleClass}>
                        {tt("本月花费 / 上限")}
                        {" · "}
                        <span data-org-status={reached ? "capped" : "active"}>
                          {reached ? tt("已达上限") : tt("正常")}
                        </span>
                        {u?.status === "error" && <> · {tt(orgErrorCopy(u.code))}</>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ② 加入组织 */}
      {show("join") && (
        <div className={sectionClass} data-org-section="join">
          <p className={titleClass}>{tt("加入组织")}</p>
          <p className={`mt-1 ${subtleClass}`}>
            {tt("把负责人发给你的邀请码贴在这里；从邀请链接打开时会自动带入。")}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (join.state !== "idle" && join.state !== "submitting") setJoin({ state: "idle", orgName: "" });
              }}
              placeholder={tt("邀请码")}
              aria-label={tt("邀请码")}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus:border-neutral-400"
            />
            <button
              type="button"
              onClick={submitJoin}
              disabled={!hasCode || join.state === "submitting"}
              className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 disabled:opacity-50"
            >
              {join.state === "submitting" ? tt("申请中…") : tt("申请加入")}
            </button>
          </div>

          {preview?.status === "ok" && (
            <p className="mt-3 text-[13px] text-neutral-900" data-org-preview="1">
              {tt("你将申请加入「{org}」", { org: preview.data.orgName })}
              {preview.data.requireApproval ? tt("（需负责人通过）") : tt("（申请后立即加入）")}
            </p>
          )}

          <div
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900"
            role="note"
            data-org-disclosure="1"
          >
            <p className="font-medium">{tt("加入后这个组织能看到什么")}</p>
            <p className="mt-1">{ORG_JOIN_DISCLOSURE.map((sentence) => tt(sentence)).join("")}</p>
          </div>

          {join.state !== "idle" && join.state !== "submitting" && (
            <p
              className={`mt-3 text-[13px] ${
                join.state === "joined"
                  ? "text-emerald-700"
                  : join.state === "pending"
                    ? "text-neutral-700"
                    : "text-rose-700"
              }`}
              role="status"
              data-org-join-state={join.state}
            >
              {join.state === "error"
                ? tt(orgErrorCopy(join.code))
                : tt(JOIN_STATE_COPY[join.state], { org: join.orgName || tt("这个组织") })}
            </p>
          )}
        </div>
      )}

      {/* ③ 谁看过我 */}
      {show("views") && (
        <div className={sectionClass} data-org-section="views">
          <p className={titleClass}>{tt("谁看过我")}</p>
          <p className={`mt-1 ${subtleClass}`}>
            {tt("组织管理员每次打开你用组织钱包做的任务，都会在这里留一条记录。")}
          </p>
          {views.status === "loading" && <p className={`mt-2 ${subtleClass}`}>…</p>}
          {views.status === "error" && (
            <p className={`mt-2 ${subtleClass}`}>{tt(orgErrorCopy(views.code))}</p>
          )}
          {views.status === "ok" && views.data.length === 0 && (
            <p className={`mt-2 ${subtleClass}`} data-org-views-empty="1">
              {tt("还没有人看过")}
            </p>
          )}
          {views.status === "ok" && views.data.length > 0 && (
            <ul className="mt-2 divide-y divide-neutral-100">
              {views.data.map((row, i) => (
                <li key={`${row.orgId}-${row.viewedAt}-${i}`} className="flex items-center justify-between gap-2 py-2" data-org-view-row="1">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-neutral-900">{row.viewerEmail || tt("管理员")}</p>
                    <p className={subtleClass}>{orgNameById.get(row.orgId) || row.orgId}</p>
                  </div>
                  <p className={`shrink-0 tabular-nums ${subtleClass}`}>{row.viewedAt ? whenCopy(row.viewedAt) : "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
