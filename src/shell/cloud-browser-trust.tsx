"use client";

import { useId, useRef } from "react";
import { useUI, type UITranslate } from "../i18n/ui/useUI";
import type { BrowserApprovalScope } from "../lib/browser-trust";
import { useCloudBrowserTrust, useCloudBrowserTrustVisible } from "./cloud-browser-trust-state";

const button = "rounded-lg border border-neutral-200 px-3 py-2 text-[12px] font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50";

export function browserTrustActionLabel(kind: string, tt: UITranslate): string {
  const labels: Record<string, string> = {
    send_email: "发送邮件", email_send: "发送邮件", send_message: "发送消息", message_send: "发送消息",
    payment: "付款", pay: "付款", purchase: "购买", place_order: "下单", order: "下单",
    submit_order: "提交订单", submit: "提交信息", irreversible_submit: "提交信息", delete: "删除网站内容",
  };
  return tt(labels[kind] || "提交网站操作");
}

export function browserTrustScopeLabel(scope: BrowserApprovalScope, tt: UITranslate): string {
  return tt(scope === "once" ? "只这一次" : scope === "task" ? "这个任务" : "以后都允许（此网站此动作）");
}

export function browserTrustErrorCopy(status: number, tt: UITranslate): string {
  if (status === 401) return tt("登录状态失效了，请重新登录。");
  if (status === 403) return tt("你没有权限管理这个浏览器的登录或授权。");
  if (status === 404) return tt("这个浏览器的登录与授权暂时不可用。");
  if (status === 409) return tt("这项请求已变化，请刷新后查看当前状态。");
  return tt("未能更新浏览器的登录与授权，请重试。");
}

export function CloudBrowserTrustPanel({
  sessionId, taskId, liveRequested, userTakeover,
}: { sessionId: string; taskId?: string | null; liveRequested: boolean; userTakeover: boolean }) {
  const tt = useUI();
  const headingId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useCloudBrowserTrustVisible(ref);
  const trust = useCloudBrowserTrust({ sessionId, active: liveRequested && visible });
  const approval = trust.data?.pending_approvals[0];
  const login = !approval ? trust.data?.login_candidates[0] : undefined;
  return (
    <div ref={ref} className="pointer-events-none absolute inset-x-3 top-3 z-30 space-y-2" data-cloud-browser-trust>
      {liveRequested && (userTakeover || trust.data?.privacy_active) && (
        <p role="status" className="pointer-events-auto rounded-xl bg-stone-900/95 px-3 py-2 text-[12px] leading-relaxed text-stone-100 shadow" data-cloud-browser-trust-privacy={trust.data?.privacy_active ? "active" : "takeover"}>
          {trust.data?.privacy_active
            ? tt("隐私输入中：画面采集与录制已暂停。密码和付款信息只由你亲自输入，Agent 无法查看。")
            : tt("你正在接管浏览器。密码和付款信息只由你亲自输入；敏感输入期间会暂停画面采集与录制。")}
        </p>
      )}
      {(approval || login) && (
        <section aria-labelledby={headingId} className="pointer-events-auto mx-auto max-h-[60vh] max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-xl" data-cloud-browser-trust-prompt={approval ? "approval" : "login"}>
          <h3 id={headingId} className="text-[14px] font-semibold">{approval ? tt("此操作需要你批准") : tt("保存这个网站的登录吗？")}</h3>
          <p className="break-all text-[13px] font-medium" data-cloud-browser-trust-origin>{approval?.origin || login?.origin}</p>
          {approval ? <>
            <p className="text-[13px] leading-relaxed" data-cloud-browser-trust-summary>{approval.summary || browserTrustActionLabel(approval.action_kind, tt)}</p>
            <p className="text-[12px] leading-relaxed text-neutral-500" data-cloud-browser-trust-reason>{approval.reason || tt("此操作会向网站提交信息，执行后可能无法撤回。")}</p>
            <div className="flex flex-wrap gap-2">
              {(["once", "task", "site_action"] as const).map(scope => (
                <button key={scope} type="button" className={button} disabled={trust.busy || (scope === "task" && !taskId)} data-cloud-browser-approval-scope={scope} onClick={() => void trust.decide("approval", approval.request_id, "approve", scope)}>{browserTrustScopeLabel(scope, tt)}</button>
              ))}
              <button type="button" className={button} disabled={trust.busy} data-cloud-browser-approval-deny onClick={() => void trust.decide("approval", approval.request_id, "deny")}>{tt("拒绝")}</button>
            </div>
            {!taskId && <p className="text-[12px] leading-relaxed text-neutral-500" data-cloud-browser-task-scope-unavailable>{tt("此浏览器未绑定任务，无法按任务授权。")}</p>}
          </> : login ? <>
            <p className="text-[12px] leading-relaxed text-neutral-500">{tt("保存后，下次可以继续使用这个网站的登录。你可以在设置中查看网站记录、删除登录或关闭保存。")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} disabled={trust.busy} data-cloud-browser-login-save onClick={() => void trust.decide("login", login.id, true)}>{tt("保存登录")}</button>
              <button type="button" className={button} disabled={trust.busy} data-cloud-browser-login-dismiss onClick={() => void trust.decide("login", login.id, false)}>{tt("这次不保存")}</button>
            </div>
          </> : null}
          {trust.busy && <p role="status" className="text-[12px] text-neutral-500">{tt("正在提交你的选择…")}</p>}
        </section>
      )}
      {trust.errorStatus !== null && (
        <div className="pointer-events-auto mx-auto flex max-w-lg flex-wrap items-center gap-2 rounded-xl bg-rose-50 p-3 text-[12px] text-rose-700" role="alert">
          <span>{browserTrustErrorCopy(trust.errorStatus, tt)}</span>
          <button type="button" className={button} disabled={trust.busy} onClick={trust.retry}>{tt("刷新状态")}</button>
        </div>
      )}
    </div>
  );
}
