"use client";

// ============================================================================
// @oceanleo/ui — 企业版「组织页」（负责人看板，W11）
// ----------------------------------------------------------------------------
// 负责人打开一页看完：组织余额与充值入口、每个成员一行（用量 / 任务数 / 成果数 /
// 最后活跃 / 每月上限）、待审批的入组申请、近 1/7/30 天用量趋势与按模型分布、
// 邀请链接生成。四块从上到下：① 顶部 ② 成员表 ③ 审批与邀请 ④ 用量。
//
// **这一页不是只有 owner 能进。** 被授予 `view_org_page` 的任何成员都能进（操作员要求；
// `_COMMON §3.3`：owner 恒真，其余看 `ent_org_members.can_view_org_page`）。没这个权限的人
// 看到的是一句「你没有查看这个组织的权限」——**不渲染空表**，也不发成员表的请求。
//
// 多组织：一个人可能同时是 A 的 owner、B 的普通成员。顶部一个切换器（`listMyOrgs()`），
// 当前组织写进 URL 的 `?org=<id>`，刷新后保持；URL 没带时选第一个能进的组织。
//
// 取数只走 `../lib/org-api`（全波唯一的 /v1/orgs 出口，`_COMMON §3.8`）。每一块各自
// 加载、各自失败：W05 的 overview 没上线时余额那一块说「还没上线」，成员表照常；
// W09 的充值路由本波没落，充值按钮在没人接 `onTopup` 时显示「充值还没上线」。
// 失败只显示 `orgErrorCopy(code)` 的人话，不把英文 error 甩到页面上。
//
// 谁能改什么（权限判在网关，这里只决定画不画控件，画错了网关会 403）：
//   · 抬头 / 税号 / 组织名：owner；
//   · 成员的两个权限勾：owner / admin（`manage_members`）；
//   · 每月上限：owner（`manage_wallet`）；
//   · 通过 / 驳回申请、生成邀请：owner / admin。
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createInvite,
  decideJoinRequest,
  getOrg,
  getOrgUsage,
  listJoinRequests,
  listMembers,
  listMyOrgs,
  normalizeOrgUsage,
  orgApiCode,
  orgErrorCopy,
  setMemberCap,
  setMemberPermission,
  updateOrg,
  type OrgApiCode,
  type OrgDetail,
  type OrgJoinRequestRow,
  type OrgMemberRow,
  type OrgRole,
  type OrgSummary,
  type OrgUsage,
} from "../lib/org-api";
import { formatMinor } from "../lib/money";
import { useUI } from "../i18n/ui/useUI";
import { PageHeader } from "./PageHeader";

// ---------------------------------------------------------------------------
// 纯函数（测试直接判这些；组件只是把它们画出来）
// ---------------------------------------------------------------------------

/** URL 参数名。`/org?org=<id>`；不用 `?id=`，那太容易与别的页撞名。 */
export const ORG_QUERY_KEY = "org";

/** 用量趋势的三个窗口（天）。 */
export const USAGE_WINDOWS: readonly number[] = [1, 7, 30];

/** 从 href 取 `?org=`；取不到给空串。服务端渲染没有 window 时调用方传空串。 */
export function orgIdFromHref(href: string): string {
  try {
    return new URL(href, "https://oceanleo.com").searchParams.get(ORG_QUERY_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

/** 把 `?org=<id>` 写进 href（保留其余参数与 hash）；`orgId` 为空时删掉这个参数。 */
export function withOrgParam(href: string, orgId: string): string {
  try {
    const url = new URL(href, "https://oceanleo.com");
    if (orgId) url.searchParams.set(ORG_QUERY_KEY, orgId);
    else url.searchParams.delete(ORG_QUERY_KEY);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

/** 这个人能不能进这家的组织页（owner 恒真；其余看 `can_view_org_page`）。 */
export function canViewOrgPage(org: Pick<OrgSummary, "role" | "canViewOrgPage"> | null | undefined): boolean {
  if (!org) return false;
  return org.role === "owner" || org.canViewOrgPage === true;
}

/** 能不能管成员（勾权限、审批、发邀请）：owner / admin。 */
export function canManageMembers(role: OrgRole | string): boolean {
  return role === "owner" || role === "admin";
}

/** 能不能管钱（设每月上限、改抬头税号）：只有 owner。 */
export function canManageWallet(role: OrgRole | string): boolean {
  return role === "owner";
}

/**
 * 从「我的组织」里挑当前要看的那一家：
 *   1. URL / props 点名的那家，只要它在列表里（哪怕没权限——那要显示的是「没权限」，不是悄悄换一家）；
 *   2. 否则第一家能进的；
 *   3. 否则第一家（会显示「没权限」）；一家都没有给 null。
 */
export function pickOrg(orgs: readonly OrgSummary[], requestedId: string): OrgSummary | null {
  if (!orgs.length) return null;
  if (requestedId) {
    const hit = orgs.find((org) => org.id === requestedId);
    if (hit) return hit;
  }
  return orgs.find(canViewOrgPage) || orgs[0];
}

/** 上限输入框的文本 → minor。空串 = 不限（null）；非法 / 负数 = null。整分。 */
export function parseCapInput(text: string): number | null {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  const major = Number(trimmed.replace(/[,\s]/g, ""));
  if (!Number.isFinite(major) || major < 0) return null;
  return Math.round(major * 100);
}

/** 趋势条的相对高度（0–100）。全为 0 时全 0，不除零。 */
export function trendHeights(points: readonly { minor: number }[]): number[] {
  const max = points.reduce((m, p) => Math.max(m, p.minor), 0);
  if (max <= 0) return points.map(() => 0);
  return points.map((p) => Math.round((Math.max(0, p.minor) / max) * 100));
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

type Loaded<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; code: OrgApiCode };

export interface OrgPageProps {
  /** 点名要看的组织（优先级低于 URL 的 `?org=`）。 */
  orgId?: string;
  /** 充值按钮的去处。不传时按钮显示「充值还没上线」并禁用（W09 的充值路由本波未落）。 */
  onTopup?: (org: OrgDetail) => void;
  /** 页头返回行为（i18n 站用自己的 router）。 */
  onBack?: () => void;
  /** 不带页头（嵌进别的页时）。 */
  embedded?: boolean;
  className?: string;
}

function roleCopy(role: OrgRole): string {
  if (role === "owner") return "负责人";
  if (role === "admin") return "管理员";
  return "成员";
}

function whenCopy(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function currentHref(): string {
  return typeof window === "undefined" ? "" : window.location.href;
}

export function OrgPage({ orgId: orgIdProp = "", onTopup, onBack, embedded = false, className = "" }: OrgPageProps) {
  const tt = useUI();

  const [orgs, setOrgs] = useState<Loaded<OrgSummary[]>>({ status: "loading" });
  const [requestedId, setRequestedId] = useState<string>(() => orgIdFromHref(currentHref()) || orgIdProp);

  const [detail, setDetail] = useState<Loaded<OrgDetail>>({ status: "loading" });
  const [members, setMembers] = useState<Loaded<OrgMemberRow[]>>({ status: "loading" });
  const [requests, setRequests] = useState<Loaded<OrgJoinRequestRow[]>>({ status: "loading" });
  const [days, setDays] = useState<number>(30);
  const [usage, setUsage] = useState<Loaded<OrgUsage>>({ status: "loading" });

  const [invite, setInvite] = useState<{ url: string; expiresAt: string; copied: boolean } | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", legalName: "", taxId: "" });
  const [capDraft, setCapDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");

  // ① 我的组织
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listMyOrgs();
        if (!cancelled) setOrgs({ status: "ok", data: rows });
      } catch (error) {
        if (!cancelled) setOrgs({ status: "error", code: orgApiCode(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const orgRows = orgs.status === "ok" ? orgs.data : [];
  const current = useMemo(() => pickOrg(orgRows, requestedId), [orgRows, requestedId]);
  const currentId = current?.id || "";
  const allowed = canViewOrgPage(current);
  const role: OrgRole = current?.role || "member";
  const manageMembers = canManageMembers(role);
  const manageWallet = canManageWallet(role);

  // 选定后写回 URL（刷新后保持）。
  useEffect(() => {
    if (!currentId || typeof window === "undefined") return;
    const href = currentHref();
    if (orgIdFromHref(href) === currentId) return;
    try {
      window.history.replaceState(window.history.state, "", withOrgParam(href, currentId));
    } catch {
      /* 某些内嵌环境不许改 history：URL 不同步不影响页面 */
    }
  }, [currentId]);

  const reloadDetail = useCallback(async (id: string) => {
    try {
      const d = await getOrg(id);
      setDetail({ status: "ok", data: d });
      setDraft({ name: d.name, legalName: d.legalName, taxId: d.taxId });
    } catch (error) {
      setDetail({ status: "error", code: orgApiCode(error) });
    }
  }, []);

  const reloadMembers = useCallback(async (id: string) => {
    try {
      const rows = await listMembers(id);
      setMembers({ status: "ok", data: rows });
      setCapDraft(
        Object.fromEntries(rows.map((row) => [row.userId, row.capMinor === null ? "" : String(row.capMinor / 100)])),
      );
    } catch (error) {
      setMembers({ status: "error", code: orgApiCode(error) });
    }
  }, []);

  const reloadRequests = useCallback(async (id: string) => {
    try {
      setRequests({ status: "ok", data: await listJoinRequests(id) });
    } catch (error) {
      setRequests({ status: "error", code: orgApiCode(error) });
    }
  }, []);

  // ②③ 组织详情 / 成员 / 待审批 —— 只在有权限时发。没权限的人一条请求都不发。
  useEffect(() => {
    if (!currentId || !allowed) return;
    setDetail({ status: "loading" });
    setMembers({ status: "loading" });
    setRequests({ status: "loading" });
    setInvite(null);
    setNotice(null);
    setEditing(false);
    void reloadDetail(currentId);
    void reloadMembers(currentId);
    if (manageMembers) void reloadRequests(currentId);
  }, [currentId, allowed, manageMembers, reloadDetail, reloadMembers, reloadRequests]);

  // ④ 用量（窗口切换时重取）
  useEffect(() => {
    if (!currentId || !allowed) return;
    let cancelled = false;
    setUsage({ status: "loading" });
    void (async () => {
      try {
        const u = normalizeOrgUsage(await getOrgUsage(currentId, days));
        if (!cancelled) setUsage({ status: "ok", data: u });
      } catch (error) {
        if (!cancelled) setUsage({ status: "error", code: orgApiCode(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentId, allowed, days]);

  async function run(key: string, work: () => Promise<void>, okText?: string) {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    try {
      await work();
      if (okText) setNotice({ tone: "ok", text: okText });
    } catch (error) {
      setNotice({ tone: "error", text: tt(orgErrorCopy(orgApiCode(error))) });
    } finally {
      setBusy("");
    }
  }

  const saveHeader = () =>
    run(
      "header",
      async () => {
        await updateOrg(currentId, draft);
        setEditing(false);
        await reloadDetail(currentId);
      },
      tt("已保存"),
    );

  const togglePermission = (row: OrgMemberRow, permission: "view_org_page" | "view_all_tasks", value: boolean) =>
    run(`perm:${row.userId}:${permission}`, async () => {
      await setMemberPermission(currentId, row.userId, permission, value);
      await reloadMembers(currentId);
    });

  const saveCap = (row: OrgMemberRow) =>
    run(
      `cap:${row.userId}`,
      async () => {
        await setMemberCap(currentId, row.userId, parseCapInput(capDraft[row.userId] ?? ""));
        await reloadMembers(currentId);
      },
      tt("上限已更新"),
    );

  const decide = (row: OrgJoinRequestRow, approve: boolean) =>
    run(
      `decide:${row.userId}`,
      async () => {
        await decideJoinRequest(currentId, row.userId, approve);
        await Promise.all([reloadRequests(currentId), reloadMembers(currentId)]);
      },
      approve ? tt("已通过") : tt("已驳回"),
    );

  const makeInvite = () =>
    run("invite", async () => {
      const created = await createInvite(currentId);
      setInvite({ url: created.url, expiresAt: created.expiresAt, copied: false });
    });

  async function copyInvite() {
    if (!invite?.url) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setInvite({ ...invite, copied: true });
    } catch {
      setNotice({ tone: "error", text: tt("复制失败，请手动选中链接复制。") });
    }
  }

  const sectionClass = "mt-6 rounded-xl border border-neutral-200 p-4";
  const titleClass = "text-[13px] font-semibold text-neutral-900";
  const subtleClass = "text-[12px] text-neutral-500";
  const buttonClass =
    "rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50";
  const primaryClass =
    "rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50";
  const inputClass =
    "rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[13px] text-neutral-900 outline-none focus:border-neutral-400";

  const currency = current?.currency || undefined;
  const money = (minor: number) => formatMinor(minor, currency);

  return (
    <section className={className} data-org-page="1">
      {!embedded && <PageHeader title="组织" onBack={onBack} />}

      {/* 组织切换器 */}
      {orgs.status === "loading" && <p className={`mt-4 ${subtleClass}`}>…</p>}
      {orgs.status === "error" && (
        <p className={`mt-4 ${subtleClass}`} data-org-page-state="error">
          {tt(orgErrorCopy(orgs.code))}
        </p>
      )}
      {orgs.status === "ok" && orgRows.length === 0 && (
        <p className={`mt-4 ${subtleClass}`} data-org-page-state="none">
          {tt("你还不属于任何组织。拿到负责人发的邀请链接后，在账户页申请加入。")}
        </p>
      )}
      {orgs.status === "ok" && orgRows.length > 1 && (
        <div className="mt-4 flex items-center gap-2" data-org-switcher="1">
          <label className={subtleClass} htmlFor="org-page-switcher">
            {tt("当前组织")}
          </label>
          <select
            id="org-page-switcher"
            value={currentId}
            onChange={(e) => setRequestedId(e.target.value)}
            className={inputClass}
          >
            {orgRows.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name || org.id} · {tt(roleCopy(org.role))}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 无权限：一句话，不渲染空表 */}
      {current && !allowed && (
        <p className="mt-4 text-[13px] text-neutral-700" role="status" data-org-page-state="forbidden">
          {tt("你没有查看这个组织的权限。")}
        </p>
      )}

      {current && allowed && (
        <>
          {notice && (
            <p
              className={`mt-4 text-[13px] ${notice.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}
              role="status"
              data-org-notice={notice.tone}
            >
              {notice.text}
            </p>
          )}

          {/* ① 顶部：组织名、抬头 / 税号、余额、充值 */}
          <div className={sectionClass} data-org-section="header">
            {detail.status === "loading" && <p className={subtleClass}>…</p>}
            {detail.status === "error" && <p className={subtleClass}>{tt(orgErrorCopy(detail.code))}</p>}
            {detail.status === "ok" && !editing && (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[18px] font-semibold text-neutral-900" data-org-name="1">
                    {detail.data.name || detail.data.id}
                  </p>
                  <p className={`mt-1 ${subtleClass}`}>
                    {tt("我的身份")}：{tt(roleCopy(role))}
                    {detail.data.status !== "active" && <> · {tt("已暂停")}</>}
                  </p>
                  <p className={`mt-1 ${subtleClass}`} data-org-legal="1">
                    {tt("开票抬头")}：{detail.data.legalName || "—"} · {tt("税号")}：{detail.data.taxId || "—"}
                  </p>
                  {manageWallet && (
                    <button type="button" className={`mt-2 ${buttonClass}`} onClick={() => setEditing(true)}>
                      {tt("编辑抬头")}
                    </button>
                  )}
                </div>
                <div className="text-right">
                  <p className={subtleClass}>{tt("组织余额")}</p>
                  <p className="text-[20px] font-semibold tabular-nums text-neutral-900" data-org-balance="1">
                    {detail.data.overviewAvailable ? money(detail.data.balanceMinor) : tt("还没上线")}
                  </p>
                  {detail.data.overviewAvailable && (
                    <p className={subtleClass}>
                      {tt("本月已花")} {money(detail.data.monthMinor)} · {tt("成员")} {detail.data.memberCount}
                    </p>
                  )}
                  {manageWallet && (
                    <button
                      type="button"
                      className={`mt-2 ${primaryClass}`}
                      disabled={!onTopup}
                      title={onTopup ? undefined : tt("充值还没上线")}
                      onClick={() => detail.status === "ok" && onTopup?.(detail.data)}
                      data-org-topup={onTopup ? "ready" : "unavailable"}
                    >
                      {onTopup ? tt("充值") : tt("充值还没上线")}
                    </button>
                  )}
                  {manageWallet && detail.data.minTopupMinor > 0 && (
                    <p className={`mt-1 ${subtleClass}`}>
                      {tt("最低起充 {amount}", { amount: money(detail.data.minTopupMinor) })}
                    </p>
                  )}
                </div>
              </div>
            )}
            {detail.status === "ok" && editing && (
              <form
                className="grid gap-2 sm:grid-cols-3"
                data-org-header-form="1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveHeader();
                }}
              >
                <label className="grid gap-1">
                  <span className={subtleClass}>{tt("组织名")}</span>
                  <input
                    className={inputClass}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={subtleClass}>{tt("开票抬头")}</span>
                  <input
                    className={inputClass}
                    value={draft.legalName}
                    onChange={(e) => setDraft({ ...draft, legalName: e.target.value })}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={subtleClass}>{tt("税号")}</span>
                  <input
                    className={inputClass}
                    value={draft.taxId}
                    onChange={(e) => setDraft({ ...draft, taxId: e.target.value })}
                  />
                </label>
                <div className="flex gap-2 sm:col-span-3">
                  <button type="submit" className={primaryClass} disabled={busy === "header"}>
                    {tt("保存")}
                  </button>
                  <button type="button" className={buttonClass} onClick={() => setEditing(false)}>
                    {tt("取消")}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ② 成员表 */}
          <div className={sectionClass} data-org-section="members">
            <p className={titleClass}>{tt("成员")}</p>
            {members.status === "loading" && <p className={`mt-2 ${subtleClass}`}>…</p>}
            {members.status === "error" && (
              <p className={`mt-2 ${subtleClass}`}>{tt(orgErrorCopy(members.code))}</p>
            )}
            {members.status === "ok" && members.data.length === 0 && (
              <p className={`mt-2 ${subtleClass}`}>{tt("还没有成员。生成一条邀请链接发给同事。")}</p>
            )}
            {members.status === "ok" && members.data.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[12px]" data-org-members-table="1">
                  <thead className="text-neutral-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">{tt("成员")}</th>
                      <th className="py-1.5 pr-3 font-medium">{tt("角色")}</th>
                      <th className="py-1.5 pr-3 font-medium">{tt("本月花费")}</th>
                      <th className="py-1.5 pr-3 font-medium">{tt("任务")}</th>
                      <th className="py-1.5 pr-3 font-medium">{tt("成果")}</th>
                      <th className="py-1.5 pr-3 font-medium">{tt("最后活跃")}</th>
                      <th className="py-1.5 pr-3 font-medium">{tt("每月上限")}</th>
                      {manageMembers && <th className="py-1.5 pr-3 font-medium">{tt("权限")}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-900">
                    {members.data.map((row) => {
                      const capped = row.capMinor !== null && row.monthlyMinor >= row.capMinor;
                      return (
                        <tr key={row.userId} data-org-member={row.userId}>
                          <td className="py-2 pr-3">
                            <span className="block max-w-[220px] truncate">{row.email || row.userId}</span>
                            {row.status !== "active" && <span className={subtleClass}>{row.status}</span>}
                          </td>
                          <td className="py-2 pr-3">{tt(roleCopy(row.role))}</td>
                          <td className="py-2 pr-3 tabular-nums" data-org-member-spend="1">
                            {money(row.monthlyMinor)}
                            {capped && <span className="ml-1 text-rose-700">{tt("已达上限")}</span>}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{row.taskCount}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.assetCount}</td>
                          <td className="py-2 pr-3 tabular-nums">{whenCopy(row.lastActiveAt)}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {manageWallet ? (
                              <span className="flex items-center gap-1">
                                <input
                                  className={`w-24 ${inputClass}`}
                                  inputMode="decimal"
                                  placeholder={tt("不限")}
                                  aria-label={tt("每月上限")}
                                  value={capDraft[row.userId] ?? ""}
                                  onChange={(e) => setCapDraft({ ...capDraft, [row.userId]: e.target.value })}
                                  data-org-cap-input={row.userId}
                                />
                                <button
                                  type="button"
                                  className={buttonClass}
                                  disabled={busy === `cap:${row.userId}`}
                                  onClick={() => void saveCap(row)}
                                >
                                  {tt("保存")}
                                </button>
                              </span>
                            ) : row.capMinor === null ? (
                              tt("不限")
                            ) : (
                              money(row.capMinor)
                            )}
                          </td>
                          {manageMembers && (
                            <td className="py-2 pr-3">
                              <label className="mr-3 inline-flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={row.role === "owner" || row.canViewOrgPage === true}
                                  disabled={row.role === "owner" || busy.startsWith(`perm:${row.userId}:`)}
                                  onChange={(e) => void togglePermission(row, "view_org_page", e.target.checked)}
                                  data-org-perm="view_org_page"
                                />
                                {tt("看组织页")}
                              </label>
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={row.role === "owner" || row.canViewAllTasks === true}
                                  disabled={row.role === "owner" || busy.startsWith(`perm:${row.userId}:`)}
                                  onChange={(e) => void togglePermission(row, "view_all_tasks", e.target.checked)}
                                  data-org-perm="view_all_tasks"
                                />
                                {tt("看全部任务")}
                              </label>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ③ 待审批 + 邀请链接（只有能管成员的人看得到） */}
          {manageMembers && (
            <div className={sectionClass} data-org-section="requests">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={titleClass}>{tt("待审批的入组申请")}</p>
                <button
                  type="button"
                  className={primaryClass}
                  disabled={busy === "invite"}
                  onClick={() => void makeInvite()}
                  data-org-invite-create="1"
                >
                  {tt("生成邀请链接")}
                </button>
              </div>
              {invite && (
                <div className="mt-2 flex flex-wrap items-center gap-2" data-org-invite="1">
                  <code className="min-w-0 flex-1 truncate rounded bg-neutral-50 px-2 py-1 text-[12px]">{invite.url}</code>
                  <button type="button" className={buttonClass} onClick={() => void copyInvite()}>
                    {invite.copied ? tt("已复制") : tt("复制")}
                  </button>
                  {invite.expiresAt && (
                    <span className={subtleClass}>
                      {tt("有效期至")} {whenCopy(invite.expiresAt)}
                    </span>
                  )}
                </div>
              )}
              {requests.status === "loading" && <p className={`mt-2 ${subtleClass}`}>…</p>}
              {requests.status === "error" && (
                <p className={`mt-2 ${subtleClass}`}>{tt(orgErrorCopy(requests.code))}</p>
              )}
              {requests.status === "ok" && requests.data.length === 0 && (
                <p className={`mt-2 ${subtleClass}`} data-org-requests-empty="1">
                  {tt("没有待审批的申请")}
                </p>
              )}
              {requests.status === "ok" && requests.data.length > 0 && (
                <ul className="mt-2 divide-y divide-neutral-100">
                  {requests.data.map((row) => (
                    <li
                      key={row.userId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                      data-org-request={row.userId}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-neutral-900">{row.email || row.userId}</p>
                        <p className={subtleClass}>{row.requestedAt ? whenCopy(row.requestedAt) : "—"}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={primaryClass}
                          disabled={busy === `decide:${row.userId}`}
                          onClick={() => void decide(row, true)}
                          data-org-decide="approve"
                        >
                          {tt("通过")}
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={busy === `decide:${row.userId}`}
                          onClick={() => void decide(row, false)}
                          data-org-decide="reject"
                        >
                          {tt("驳回")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ④ 用量：1/7/30 天趋势 + 按模型 */}
          <div className={sectionClass} data-org-section="usage">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={titleClass}>{tt("用量")}</p>
              <div className="flex gap-1" role="tablist" data-org-usage-windows="1">
                {USAGE_WINDOWS.map((window) => (
                  <button
                    key={window}
                    type="button"
                    role="tab"
                    aria-selected={days === window}
                    className={`${buttonClass} ${days === window ? "bg-neutral-900 text-white hover:bg-neutral-900" : ""}`}
                    onClick={() => setDays(window)}
                    data-org-usage-window={window}
                  >
                    {tt("{n} 天", { n: window })}
                  </button>
                ))}
              </div>
            </div>
            {usage.status === "loading" && <p className={`mt-2 ${subtleClass}`}>…</p>}
            {usage.status === "error" && <p className={`mt-2 ${subtleClass}`}>{tt(orgErrorCopy(usage.code))}</p>}
            {usage.status === "ok" && (
              <>
                <p className={`mt-2 ${subtleClass}`}>
                  {tt("合计")} <span className="tabular-nums text-neutral-900">{money(usage.data.totalMinor)}</span>
                </p>
                {!usage.data.trendAvailable && <p className={`mt-2 ${subtleClass}`}>{tt("趋势这一块还没上线")}</p>}
                {usage.data.trendAvailable && usage.data.trend.length === 0 && (
                  <p className={`mt-2 ${subtleClass}`}>{tt("这段时间没有花费")}</p>
                )}
                {usage.data.trendAvailable && usage.data.trend.length > 0 && (
                  <div className="mt-3 flex h-24 items-end gap-1" data-org-usage-trend="1">
                    {trendHeights(usage.data.trend).map((height, i) => (
                      <div
                        key={usage.data.trend[i]?.date || i}
                        className="flex-1 rounded-t bg-neutral-800"
                        style={{ height: `${Math.max(2, height)}%` }}
                        title={`${usage.data.trend[i]?.date || ""} · ${money(usage.data.trend[i]?.minor || 0)}`}
                      />
                    ))}
                  </div>
                )}
                {!usage.data.byModelAvailable && (
                  <p className={`mt-3 ${subtleClass}`}>{tt("按模型分布还没上线")}</p>
                )}
                {usage.data.byModelAvailable && usage.data.byModel.length > 0 && (
                  <table className="mt-3 w-full text-left text-[12px]" data-org-usage-models="1">
                    <thead className="text-neutral-500">
                      <tr>
                        <th className="py-1 pr-3 font-medium">{tt("模型")}</th>
                        <th className="py-1 pr-3 font-medium">{tt("花费")}</th>
                        <th className="py-1 pr-3 font-medium">{tt("次数")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-neutral-900">
                      {usage.data.byModel.map((row) => (
                        <tr key={row.model}>
                          <td className="py-1.5 pr-3">{row.model || "—"}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{money(row.minor)}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{row.calls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
