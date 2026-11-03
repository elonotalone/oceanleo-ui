"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale } from "../../i18n/config";
import { CN_HOST_MESSAGES } from "../../i18n/ui/messages/cn-host-copy";
import { cnHostingApi, type CnHostingAccount, type CnHostingStatus, type CnHostingTarget } from "../../lib/cn-hosting-api";
import type { WebsitePlatformApi } from "../../lib/website-platform-api";

const inputClass = "w-full rounded border bg-transparent px-2 py-1 text-xs";
const buttonClass = "rounded bg-[var(--awb-accent)] px-3 py-1 text-xs text-white disabled:opacity-50";

export function CnHostingPanel({ projectId, api }: { projectId: string; api: WebsitePlatformApi }) {
  const locale = normalizeLocale(useLocale());
  // Keep this independently localised while the parent registers the copy file.
  const tt = (key: string) => CN_HOST_MESSAGES[locale][key] || CN_HOST_MESSAGES.en[key] || key;
  const [account, setAccount] = useState<CnHostingAccount>();
  const [status, setStatus] = useState<CnHostingStatus>();
  const [target, setTarget] = useState<CnHostingTarget>({ account_id: "", region: "cn-shanghai", bucket: "", domain: "", icp_number: "" });
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [rotating, setRotating] = useState(false);
  const [certificate, setCertificate] = useState("");
  const [createBucket, setCreateBucket] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const publishKey = useRef<{ revision: string; key: string } | null>(null);
  const refresh = async () => setStatus(await cnHostingApi.list(projectId));

  useEffect(() => {
    const abort = new AbortController();
    setAccount(undefined); setStatus(undefined); setError("");
    setKeyId(""); setKeySecret(""); publishKey.current = null;
    Promise.all([cnHostingApi.account(projectId, abort.signal), cnHostingApi.list(projectId, abort.signal)]).then(([a, s]) => {
      if (abort.signal.aborted) return;
      setAccount(a); setStatus(s);
      setTarget({ account_id: a.account_id || "", region: a.region || "cn-shanghai", bucket: a.bucket || "", domain: a.allocated_domain || s.domain, icp_number: a.icp_number || "" });
    }).catch((e: unknown) => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : tt("托管操作未完成，请检查状态。")); });
    return () => abort.abort();
  }, [projectId]); // locale does not change the request identity

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : tt("托管操作未完成，请检查状态。")); }
    finally {
      try { await refresh(); } catch { /* Preserve the operation's visible error. */ }
      setBusy(false);
    }
  };
  const labels: Array<[keyof CnHostingTarget, string]> = [["account_id", "阿里云账号 ID"], ["region", "中国大陆地域"], ["bucket", "专用私有 OSS Bucket"], ["domain", "此网站的隔离域名"], ["icp_number", "网站备案号"]];
  const stateLabel: Record<string, string> = {
    not_published: "尚未发布", propagating: "CDN 变更正在生效", live: "已发布", reconciliation_required: "云端操作结果需要核对",
    building: "CDN 变更正在生效", ready: "可用", failed: "失败", unpublished: "已删除",
  };

  return <div className="space-y-3 text-xs">
    <p>{tt("中国版网站发布到你自己的阿里云账号，费用由该账号承担。预览仍在隔离沙箱中。")}</p>
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act(async () => {
      try {
        const result = await cnHostingApi.connect(projectId, target, keyId, keySecret, account?.credential_version, createBucket);
        setAccount({ ...result, connected: true });
        setRotating(false);
      } finally { setKeyId(""); setKeySecret(""); }
    }); }}>
      {labels.map(([name, label]) => <label key={name} className="block space-y-1"><span>{tt(label)}</span><input required className={inputClass} value={target[name]} readOnly={name === "domain" || Boolean(account?.connected)} onChange={(e) => setTarget({ ...target, [name]: e.target.value })} /></label>)}
      {!account?.connected || rotating ? <>
        <label className="block">AccessKey ID<input required className={inputClass} type="password" autoComplete="off" value={keyId} onChange={(e) => setKeyId(e.target.value)} /></label>
        <label className="block">AccessKey Secret<input required className={inputClass} type="password" autoComplete="new-password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} /></label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={createBucket} onChange={(e) => setCreateBucket(e.target.checked)} />{tt("如果 Bucket 不存在，我同意在所选地域创建私有 Bucket。")}</label>
        <button disabled={busy} type="submit" className={buttonClass}>{tt(account?.connected ? "更新阿里云密钥" : "连接阿里云账号")}</button>
      </> : <><p>{tt("阿里云账号已连接；密钥已加密保存。")}</p><button type="button" className="underline" disabled={busy || status?.busy} onClick={() => setRotating(true)}>{tt("更新阿里云密钥")}</button></>}
    </form>
    {account?.connected ? <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act(() => cnHostingApi.configure(projectId, Number(certificate), consent)); }}>
      <p>{tt("请先为隔离域名完成备案和阿里云 DNS 归属校验，并在自己的账号中准备匹配的 HTTPS 证书。")}</p>
      <label className="block">{tt("阿里云证书 ID")}<input className={inputClass} required type="number" min="1" value={certificate} onChange={(e) => setCertificate(e.target.value)} /></label>
      <label className="flex items-start gap-2"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />{tt("我同意配置此网站专用的 CDN、私有 OSS 回源和 HTTPS。")}</label>
      <button type="submit" className={buttonClass} disabled={busy || Boolean(status?.busy && !status.can_retry_setup)}>{tt("配置网站托管")}</button>
    </form> : null}
    {status?.cname ? <p>{tt("请将此网站域名的 CNAME 指向：")} <code>{status.cname}</code></p> : null}
    {status ? <p role="status">{tt(stateLabel[status.state] || "托管状态尚未确认")}</p> : null}
    <button type="button" className={buttonClass} disabled={busy || !account?.connected || status?.busy || status?.state === "propagating"} onClick={() => void act(async () => {
      const project = await api.project(projectId);
      const revision = String(project.working_revision_id || "");
      if (!revision) throw new Error(tt("网站还没有可发布的版本。"));
      if (publishKey.current?.revision !== revision) publishKey.current = { revision, key: `cn-ui-${crypto.randomUUID()}` };
      await cnHostingApi.publish(projectId, revision, publishKey.current.key);
    })}>{tt("发布到我的阿里云")}</button>
    {error ? <p role="alert" className="text-red-600">{error}</p> : null}
    {(status?.deployments || []).map((deployment) => <div key={deployment.id} className="space-y-1 rounded border p-2">
      <p>{tt(stateLabel[deployment.status] || "托管状态尚未确认")} · {deployment.id}{deployment.active ? ` · ${tt("当前网站")}` : ""}</p>
      {deployment.error ? <p role="alert">{deployment.error}</p> : null}
      {deployment.pending ? <button type="button" disabled={busy} onClick={() => void act(() => cnHostingApi.refresh(projectId, deployment.id))} className="underline">{tt("检查发布状态")}</button> : null}
      {deployment.active && !deployment.pending ? <button type="button" disabled={busy || status?.busy} className="underline" onClick={() => void act(() => cnHostingApi.unpublish(projectId, deployment))}>{tt("停止公开网站")}</button> : null}
      {deployment.status === "ready" && !deployment.active ? <button type="button" disabled={busy || status?.busy} className="mr-3 underline" onClick={() => void act(() => cnHostingApi.rollback(projectId, deployment))}>{tt("回滚")}</button> : null}
      {!deployment.active && !deployment.pending && deployment.status !== "unpublished" ? <button type="button" disabled={busy || Boolean(status?.busy && status.retry_delete !== deployment.id)} className="underline" onClick={() => void act(() => cnHostingApi.delete(projectId, deployment))}>{tt("删除部署")}</button> : null}
    </div>)}
  </div>;
}
