"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { AgentApiResult } from "../../lib/agent";
import {
  cloudBrowserTrustApi,
  type BrowserApprovalGrant,
  type BrowserSavedLogin,
  type BrowserTrustSettings,
} from "../../lib/browser-trust";
import { browserTrustActionLabel, browserTrustErrorCopy, browserTrustScopeLabel } from "../../shell/cloud-browser-trust";
import { Switch } from "../../ui";
import { CloudBrowserFlowsSection } from "./CloudBrowserFlowsSection";

const card = "rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800";
const button = "rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
const description = "mt-1 text-[12px] leading-relaxed text-neutral-500";
type SettingsData = { settings: BrowserTrustSettings; logins: BrowserSavedLogin[]; approvals: BrowserApprovalGrant[] };

export function CloudBrowserSettingsSection({ flows }: { flows?: ReactNode } = {}) {
  const tt = useUI();
  const headingId = useId();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [detailsId, setDetailsId] = useState("");
  const [confirmAll, setConfirmAll] = useState<"logins" | "approvals" | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const mutating = useRef(false);

  const refresh = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setErrorStatus(null);
    const [settings, logins, approvals] = await Promise.all([
      cloudBrowserTrustApi.settings(signal), cloudBrowserTrustApi.logins(signal), cloudBrowserTrustApi.approvals(signal),
    ]);
    if (signal.aborted) return;
    const failed = [settings, logins, approvals].find(result => !result.ok);
    if (failed || !settings.data || !logins.data || !approvals.data) {
      setErrorStatus(failed?.status ?? 502);
      if (failed && [401, 403].includes(failed.status ?? 0)) setData(null);
    } else {
      setData({ settings: settings.data, logins: logins.data.logins, approvals: approvals.data.approvals });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void refresh(controller.signal);
    return () => { controller.abort(); if (lifetime.current === controller) lifetime.current = null; };
  }, [refresh]);

  async function run<T>(
    action: (signal: AbortSignal) => Promise<AgentApiResult<T>>,
    apply: (previous: SettingsData, result: T | undefined) => SettingsData,
    message: string,
  ) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || loading || !data || mutating.current) return;
    mutating.current = true;
    setBusy(true); setErrorStatus(null); setNotice("");
    const result = await action(controller.signal);
    if (controller.signal.aborted || lifetime.current !== controller) return;
    mutating.current = false;
    setBusy(false);
    if (!result.ok) { setErrorStatus(result.status ?? 0); return; }
    setData(previous => previous ? apply(previous, result.data) : previous);
    setConfirmAll(null);
    setNotice(message);
  }

  function time(value: string | null) {
    return value ? new Date(value).toLocaleString() : tt("尚未使用");
  }

  const disabled = loading || busy || !data;
  return (
    <section data-settings-pane="cloud-browser" aria-labelledby={headingId} className="space-y-5">
      <div>
        <h2 id={headingId} className="text-[18px] font-semibold text-neutral-900">{tt("云浏览器")}</h2>
        <p className={description}>{tt("管理云浏览器记住的网站登录，以及你允许 Agent 执行的网站操作。")}</p>
      </div>

      <div className={card} data-cloud-browser-login-memory>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[14px] font-medium text-neutral-900">{tt("记住网站登录")}</h3>
            <p className={description}>{tt("默认开启。登录成功后，先询问你是否保存；保存后可在以后的云浏览器会话中继续使用。")}</p>
          </div>
          <Switch checked={data?.settings.save_logins ?? true} disabled={disabled} label={tt("记住网站登录")} onChange={next => void run(
            signal => cloudBrowserTrustApi.updateSettings(next, signal),
            (previous, settings) => ({ ...previous, settings: settings || previous.settings }),
            tt(next ? "已开启保存登录前询问" : "已关闭新的登录保存"),
          )} />
        </div>
        {data && !data.settings.save_logins && <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">{tt("已关闭新的登录保存。已有登录保留，可在下面单独删除或全部删除。")}</p>}
      </div>

      {loading && <p role="status" className="text-[13px] text-neutral-500">{tt("正在读取登录与授权…")}</p>}
      {errorStatus !== null && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
        <span>{browserTrustErrorCopy(errorStatus, tt)}</span>
        <button type="button" className={button} disabled={busy || loading} onClick={() => { const controller = lifetime.current; if (controller) void refresh(controller.signal); }}>{tt("重试")}</button>
      </div>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{notice}</p>}

      <div className={card} data-cloud-browser-saved-logins>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[14px] font-medium text-neutral-900">{tt("已保存的网站登录")}{data ? ` (${data.logins.length})` : ""}</h3>
          <button type="button" className={button} disabled={disabled || !data?.logins.length} onClick={() => setConfirmAll("logins")}>{tt("删除全部登录")}</button>
        </div>
        <p className={description}>{tt("只展示网站和保存记录，不展示密码、Cookie 或其他登录凭据。删除后，新会话不再使用这份登录。")}</p>
        {confirmAll === "logins" && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 p-3 text-[12px]">
          <span>{tt("删除全部已保存的网站登录？")}</span>
          <button type="button" className={button} disabled={disabled} onClick={() => void run(signal => cloudBrowserTrustApi.deleteAllLogins(signal), previous => ({ ...previous, logins: [] }), tt("已删除全部保存的登录"))}>{tt("确认删除全部")}</button>
          <button type="button" className={button} disabled={busy} onClick={() => setConfirmAll(null)}>{tt("取消")}</button>
        </div>}
        {data && !data.logins.length && <p className="mt-4 text-[13px] text-neutral-500">{tt("还没有保存的网站登录。")}</p>}
        <ul className="mt-3 divide-y divide-neutral-100">{data?.logins.map(login => (
          <li key={login.id} className="py-3" data-cloud-browser-saved-login>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 break-all text-[13px] font-medium">{login.origin}</p>
              <div className="flex gap-2">
                <button type="button" className={button} aria-expanded={detailsId === login.id} onClick={() => setDetailsId(detailsId === login.id ? "" : login.id)}>{tt(detailsId === login.id ? "收起" : "查看")}</button>
                <button type="button" className={button} disabled={disabled} aria-label={tt("删除 {site} 的登录", { site: login.origin })} onClick={() => void run(signal => cloudBrowserTrustApi.deleteLogin(login.id, signal), previous => ({ ...previous, logins: previous.logins.filter(item => item.id !== login.id) }), tt("已删除这个网站保存的登录"))}>{tt("删除")}</button>
              </div>
            </div>
            {detailsId === login.id && <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[12px] text-neutral-500">
              <dt>{tt("网站")}</dt><dd className="break-all">{login.origin}</dd>
              <dt>{tt("保存于")}</dt><dd>{time(login.saved_at)}</dd>
              <dt>{tt("最近使用")}</dt><dd>{time(login.last_used_at)}</dd>
            </dl>}
          </li>
        ))}</ul>
      </div>

      <div className={card} data-cloud-browser-approval-grants>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[14px] font-medium text-neutral-900">{tt("网站操作授权")}{data ? ` (${data.approvals.length})` : ""}</h3>
          <button type="button" className={button} disabled={disabled || !data?.approvals.length} onClick={() => setConfirmAll("approvals")}>{tt("撤销全部授权")}</button>
        </div>
        <p className={description}>{tt("授权只适用于你选择的操作范围。撤销后，再次执行该操作需要重新询问你。")}</p>
        {confirmAll === "approvals" && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 p-3 text-[12px]">
          <span>{tt("撤销全部网站操作授权？")}</span>
          <button type="button" className={button} disabled={disabled} onClick={() => void run(signal => cloudBrowserTrustApi.revokeAllApprovals(signal), previous => ({ ...previous, approvals: [] }), tt("已撤销全部网站操作授权"))}>{tt("确认撤销全部")}</button>
          <button type="button" className={button} disabled={busy} onClick={() => setConfirmAll(null)}>{tt("取消")}</button>
        </div>}
        {data && !data.approvals.length && <p className="mt-4 text-[13px] text-neutral-500">{tt("还没有网站操作授权。需要时会在云浏览器中询问你。")}</p>}
        <ul className="mt-3 divide-y divide-neutral-100">{data?.approvals.map(approval => (
          <li key={approval.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-cloud-browser-approval-grant>
            <div className="min-w-0">
              <p className="break-all text-[13px] font-medium">{approval.origin}</p>
              <p className="mt-1 text-[12px] text-neutral-600">{browserTrustActionLabel(approval.action_kind, tt)} · {browserTrustScopeLabel(approval.scope, tt)}</p>
              <p className={description}>{tt("授权于 {time}", { time: time(approval.created_at) })}</p>
            </div>
            <button type="button" className={button} disabled={disabled} aria-label={tt("撤销 {site} 的操作授权", { site: approval.origin })} onClick={() => void run(signal => cloudBrowserTrustApi.revokeApproval(approval.id, signal), previous => ({ ...previous, approvals: previous.approvals.filter(item => item.id !== approval.id) }), tt("已撤销这项网站操作授权"))}>{tt("撤销")}</button>
          </li>
        ))}</ul>
      </div>
      {flows === undefined ? <CloudBrowserFlowsSection /> : flows}
    </section>
  );
}
