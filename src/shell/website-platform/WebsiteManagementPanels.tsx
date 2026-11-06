"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  websitePlatformApi,
  type WebsiteAnalyticsSummary,
  type WebsiteDomain,
  type WebsitePlatformApi,
} from "../../lib/website-platform-api";
import { useUI } from "../../i18n/ui/useUI";

function usePanelData<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<{ value?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    load(controller.signal).then(value => {
      if (!controller.signal.aborted) setState({ value, loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ error: error instanceof Error ? error.message : String(error), loading: false });
    });
    return () => controller.abort();
    // Dependencies are supplied by each panel and intentionally stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function PanelState({ loading, error, children }: { loading: boolean; error?: string; children: ReactNode }) {
  if (loading) return <p role="status">加载中…</p>;
  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  return <>{children}</>;
}

function DomainPanel({ projectId, api }: { projectId: string; api: WebsitePlatformApi }) {
  const tt = useUI();
  const [reload, setReload] = useState(0);
  const state = usePanelData(signal => api.domains(projectId, signal), [api, projectId, reload]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const refresh = async () => { setReload(value => value + 1); };
  const verify = async (domain: WebsiteDomain) => {
    if (busy) return;
    setBusy(`verify:${domain.domain}`); setNotice("");
    try { await api.verifyDomain(projectId, domain.domain); setNotice(tt("DNS 状态已刷新。")); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(""); }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard?.writeText(value); setNotice(tt("已复制。")); }
    catch { setNotice(tt("复制失败，请手动复制。")); }
  };
  const add = async () => {
    const domain = draft.trim();
    if (!domain || busy) return;
    setBusy("add"); setNotice("");
    try { await api.addDomain(projectId, domain); setDraft(""); setNotice(tt("域名已添加，请按记录完成 DNS 配置。")); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(""); }
  };
  return <section className="rounded border p-3" data-testid="website-management-domain">
    <h3 className="font-medium">{tt("域名")}</h3>
    <p className="mt-1 text-xs opacity-70">{tt("添加域名后，将 CNAME 和 TXT 记录复制到你的 DNS 服务商。")}</p>
    <PanelState {...state}>
      <div className="mt-3 space-y-2">{(state.value?.domains || []).map((domain: WebsiteDomain) => <div key={domain.id || domain.domain} className="rounded border px-2 py-2 text-xs">
        <div className="flex items-center justify-between gap-2"><span className="break-all">{domain.domain}</span><span>{domain.status || domain.verification_status || "—"}</span></div>
        {domain.dns_records?.map(record => <div key={`${record.type}:${record.name}`} className="mt-1 flex items-center justify-between gap-2 break-all opacity-70"><span>{record.type} {record.name} → {record.value}</span><button type="button" className="shrink-0 underline" onClick={() => void copy(record.value)}>{tt("复制")}</button></div>)}
        {(domain.status === "pending" || domain.verification_status === "pending") && <button type="button" className="mt-2 underline" disabled={!!busy} onClick={() => void verify(domain)}>{busy === `verify:${domain.domain}` ? tt("验证中…") : tt("验证 DNS")}</button>}
      </div>)}</div>
    </PanelState>
    <div className="mt-3 flex gap-2"><input aria-label={tt("域名")} className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs" value={draft} onChange={event => setDraft(event.target.value)} placeholder="example.com" /><button type="button" disabled={!draft.trim() || !!busy} className="rounded bg-[var(--awb-accent)] px-2 py-1 text-xs text-white" onClick={() => void add()}>{busy === "add" ? tt("添加中…") : tt("添加")}</button></div>
    {notice && <p role="status" className="mt-2 text-xs">{notice}</p>}
  </section>;
}

function LoginPanel({ projectId, api }: { projectId: string; api: WebsitePlatformApi }) {
  const tt = useUI();
  const state = usePanelData(signal => api.capabilities(projectId, signal), [api, projectId]);
  return <section className="rounded border p-3" data-testid="website-management-login">
    <h3 className="font-medium">{tt("登录")}</h3>
    <p className="mt-1 text-xs opacity-70">{tt("使用网站配置中的托管后端认证服务。")}</p>
    <PanelState {...state}><p className="mt-3 text-xs">{tt("登录与认证")}: {state.value?.permissions?.auth ? tt("已启用") : tt("请在配置中启用")}</p></PanelState>
  </section>;
}

function UsersPanel({ projectId, api }: { projectId: string; api: WebsitePlatformApi }) {
  const tt = useUI();
  const state = usePanelData(signal => api.authUsers(projectId, signal), [api, projectId]);
  return <section className="rounded border p-3" data-testid="website-management-users">
    <h3 className="font-medium">{tt("注册用户")}</h3>
    <PanelState {...state}><div className="mt-3 space-y-1 text-xs">{(state.value?.users || []).map(user => <div key={user.id || user.email} className="flex justify-between gap-2 rounded border px-2 py-1"><span>{user.email || user.id || "—"}</span><span className="opacity-60">{user.created_at || ""}</span></div>)}{!(state.value?.users || []).length && <p className="opacity-70">{tt("还没有注册用户。")}</p>}</div></PanelState>
  </section>;
}

function StatisticsPanel({ projectId, api }: { projectId: string; api: WebsitePlatformApi }) {
  const tt = useUI();
  const state = usePanelData<WebsiteAnalyticsSummary>(signal => api.analytics(projectId, undefined, undefined, signal), [api, projectId]);
  return <section className="rounded border p-3" data-testid="website-management-statistics">
    <h3 className="font-medium">{tt("访问统计")}</h3>
    <PanelState {...state}><dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{Object.entries(state.value?.metrics || {}).map(([key, value]) => <div key={key}><dt className="opacity-70">{key}</dt><dd className="text-lg font-medium">{value == null ? "—" : String(value)}</dd></div>)}</dl></PanelState>
  </section>;
}

export function WebsiteManagementPanels({ projectId, api = websitePlatformApi }: { projectId: string; api?: WebsitePlatformApi }) {
  return <div className="space-y-3" data-testid="website-management-panels">
    <DomainPanel projectId={projectId} api={api} />
    <LoginPanel projectId={projectId} api={api} />
    <UsersPanel projectId={projectId} api={api} />
    <StatisticsPanel projectId={projectId} api={api} />
  </div>;
}
