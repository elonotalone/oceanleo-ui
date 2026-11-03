"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { AgentApiResult } from "../../lib/agent";
import {
  cloudBrowserTrustApi,
  type BrowserApprovalGrant,
  type BrowserLoginCandidate,
  type BrowserLoginDeletePreview,
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
type LoginDeleteRequest = {
  target: BrowserLoginCandidate;
  logins: BrowserSavedLogin[];
  lifetime: AbortController;
  controller: AbortController;
  generation: number;
  status: "loading" | "ready" | "failed";
  preview: BrowserLoginDeletePreview | null;
  trigger: HTMLButtonElement | null;
};
type LoginDeleteView = {
  target: BrowserLoginCandidate;
  generation: number;
  status: "loading" | "ready" | "failed";
  preview: BrowserLoginDeletePreview | null;
  changed: boolean;
  errorStatus: number | null;
};

export function CloudBrowserSettingsSection({ flows }: { flows?: ReactNode } = {}) {
  const tt = useUI();
  const headingId = useId();
  const deleteHeadingId = useId();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [detailsId, setDetailsId] = useState("");
  const [confirmAll, setConfirmAll] = useState<"logins" | "approvals" | null>(null);
  const [loginDelete, setLoginDelete] = useState<LoginDeleteView | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const mutating = useRef(false);
  const latestData = useRef(data);
  latestData.current = data;
  const deleteRequest = useRef<LoginDeleteRequest | null>(null);
  const deleteGeneration = useRef(0);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);

  const cancelLoginDelete = useCallback((restoreFocus = false) => {
    const request = deleteRequest.current;
    request?.controller.abort();
    deleteRequest.current = null;
    deleteGeneration.current++;
    setLoginDelete(null);
    if (restoreFocus && request?.trigger?.isConnected) request.trigger.focus();
  }, []);

  const refresh = useCallback(async (signal: AbortSignal) => {
    cancelLoginDelete();
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
  }, [cancelLoginDelete]);

  useEffect(() => { cancelLoginDelete(); }, [data?.logins, cancelLoginDelete]);
  useEffect(() => {
    if (loginDelete) deleteCancelRef.current?.focus();
  }, [loginDelete?.generation, loginDelete?.status]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void refresh(controller.signal);
    return () => {
      controller.abort();
      deleteRequest.current?.controller.abort();
      deleteRequest.current = null;
      deleteGeneration.current++;
      if (lifetime.current === controller) lifetime.current = null;
    };
  }, [refresh]);

  async function run<T>(
    action: (signal: AbortSignal) => Promise<AgentApiResult<T>>,
    apply: (previous: SettingsData, result: T | undefined) => SettingsData,
    message: string,
  ) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || loading || !data || mutating.current) return;
    cancelLoginDelete();
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

  function currentLoginDelete(request: LoginDeleteRequest) {
    return deleteRequest.current === request && request.generation === deleteGeneration.current &&
      lifetime.current === request.lifetime && !request.lifetime.signal.aborted &&
      !request.controller.signal.aborted && latestData.current?.logins === request.logins;
  }

  async function previewLoginDelete(
    target: BrowserLoginCandidate,
    options: { requireChoice?: boolean; changed?: boolean; trigger?: HTMLButtonElement | null } = {},
  ) {
    const controller = lifetime.current;
    const logins = latestData.current?.logins;
    if (!controller || controller.signal.aborted || loading || !logins || mutating.current ||
      !logins.some(login => login.id === target.id && login.origin === target.origin)) return;
    const previous = deleteRequest.current;
    if (previous?.status === "loading" && previous.target.id === target.id && currentLoginDelete(previous)) return;
    previous?.controller.abort();
    const request: LoginDeleteRequest = {
      target, logins, lifetime: controller, controller: new AbortController(),
      generation: ++deleteGeneration.current, status: "loading", preview: null,
      trigger: options.trigger || previous?.trigger || null,
    };
    deleteRequest.current = request;
    setConfirmAll(null); setErrorStatus(null); setNotice("");
    setLoginDelete({ target, generation: request.generation, status: "loading", preview: null, changed: !!options.changed, errorStatus: null });
    const result = await cloudBrowserTrustApi.loginDeletePreview(target.id, AbortSignal.any([controller.signal, request.controller.signal]));
    if (!currentLoginDelete(request)) return;
    const preview = result.data;
    if (!result.ok || !preview || preview.login.id !== target.id || preview.login.origin !== target.origin) {
      request.status = "failed";
      setLoginDelete({ target, generation: request.generation, status: "failed", preview: null, changed: !!options.changed, errorStatus: result.ok ? 502 : result.status ?? 0 });
      return;
    }
    request.status = "ready";
    request.preview = preview;
    setLoginDelete({ target, generation: request.generation, status: "ready", preview, changed: !!options.changed, errorStatus: null });
    if (!preview.related_logins.length && !options.requireChoice) await finishLoginDelete(false, request);
  }

  async function finishLoginDelete(includeRelated: boolean, request = deleteRequest.current) {
    if (!request || !currentLoginDelete(request) || request.status !== "ready" || !request.preview ||
      mutating.current || (includeRelated && !request.preview.related_logins.length)) return;
    const preview = request.preview;
    mutating.current = true;
    setBusy(true); setErrorStatus(null); setNotice("");
    const signal = AbortSignal.any([request.lifetime.signal, request.controller.signal]);
    const result = includeRelated
      ? await cloudBrowserTrustApi.deleteRelatedLogins(request.target.id, preview.revision, signal)
      : await cloudBrowserTrustApi.deleteLogin(request.target.id, signal);
    const current = currentLoginDelete(request);
    if (lifetime.current === request.lifetime && !request.lifetime.signal.aborted) {
      mutating.current = false;
      setBusy(false);
    }
    if (!current) return;
    if (!result.ok) {
      if (result.status === 409) {
        // Refresh metadata only. Even an empty new group requires a new choice.
        await previewLoginDelete(request.target, { requireChoice: true, changed: true, trigger: request.trigger });
      } else {
        request.status = "failed";
        request.preview = null;
        setLoginDelete({ target: request.target, generation: request.generation, status: "failed", preview: null, changed: false, errorStatus: result.status ?? 0 });
      }
      return;
    }
    const removed = new Set([request.target.id, ...(includeRelated ? preview.related_logins.map(login => login.id) : [])]);
    cancelLoginDelete();
    setData(previous => previous ? { ...previous, logins: previous.logins.filter(login => !removed.has(login.id)) } : previous);
    setNotice(tt(includeRelated ? "已删除所选网站和关联网站的登录记录" : "已删除这条保存的登录记录"));
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
          <button type="button" className={button} disabled={disabled || !data?.logins.length} onClick={() => { cancelLoginDelete(); setConfirmAll("logins"); }}>{tt("删除全部登录")}</button>
        </div>
        <p className={description}>{tt("这里只展示网站和保存记录，不展示密码或登录凭据。删除记录不一定会退出网站。")}</p>
        {loginDelete && <section role="dialog" aria-modal="false" aria-labelledby={deleteHeadingId} className="mt-4 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900" data-cloud-browser-login-delete={loginDelete.status}>
          <h4 id={deleteHeadingId} className="text-[14px] font-medium">{tt("删除已保存的网站登录？")}</h4>
          <p className="break-all text-[13px] font-medium" data-cloud-browser-login-delete-target>{loginDelete.target.origin}</p>
          {loginDelete.changed && <p role="status" className="text-[12px] leading-relaxed text-neutral-600">{tt("这些登录记录已变化，请重新选择要删除的范围。")}</p>}
          {loginDelete.status === "loading" && <p role="status" className={description}>{tt("正在确认关联的网站登录…")}</p>}
          {loginDelete.status === "failed" && <p role="alert" className="text-[12px] leading-relaxed text-red-700">{[401, 403].includes(loginDelete.errorStatus ?? 0) ? browserTrustErrorCopy(loginDelete.errorStatus!, tt) : tt("暂时无法确认要删除的登录记录，请重新读取。")}</p>}
          {loginDelete.preview && <>
            {loginDelete.preview.related_logins.length > 0 && <>
              <p className={description}>{tt("这些已保存的网站使用共享登录。你可以只删除此记录，或一起删除关联网站的登录记录。")}</p>
              <ul aria-label={tt("关联的网站")} className="space-y-1 text-[13px]">{loginDelete.preview.related_logins.map(login => <li key={login.id} className="break-all" data-cloud-browser-login-delete-related>{login.origin}</li>)}</ul>
            </>}
            <p className={description}>{tt("删除保存记录不保证退出网站或登录服务；其他仍保留的登录记录也可能继续提供登录。")}</p>
          </>}
          <div className="flex flex-wrap gap-2">
            {loginDelete.status === "ready" && <button type="button" className={button} disabled={busy} data-cloud-browser-login-delete-single onClick={() => void finishLoginDelete(false)}>{tt("仅删除此记录")}</button>}
            {!!loginDelete.preview?.related_logins.length && <button type="button" className={button} disabled={busy} data-cloud-browser-login-delete-together onClick={() => void finishLoginDelete(true)}>{tt("一起删除")}</button>}
            {loginDelete.status === "failed" && <button type="button" className={button} disabled={busy} onClick={() => void previewLoginDelete(loginDelete.target, { requireChoice: true, changed: loginDelete.changed })}>{tt("重新读取")}</button>}
            <button ref={deleteCancelRef} type="button" className={button} disabled={busy} onClick={() => cancelLoginDelete(true)}>{tt("取消")}</button>
          </div>
        </section>}
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
                <button type="button" className={button} disabled={disabled} aria-label={tt("删除 {site} 的登录", { site: login.origin })} onClick={event => void previewLoginDelete(login, { trigger: event.currentTarget })}>{tt("删除")}</button>
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
