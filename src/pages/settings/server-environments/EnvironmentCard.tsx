"use client";

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CARD, CARD_DESC, CARD_TITLE, QUIET } from "../personalization/parts";
import {
  environmentApi,
  type EnvironmentApi,
  type EnvironmentGroup,
  type EnvironmentItem,
  type InstallJob,
} from "./api";
import { ENVIRONMENTS_COPY } from "../../../i18n/ui/messages/environments-copy";

function copy(key: keyof typeof ENVIRONMENTS_COPY): string {
  return ENVIRONMENTS_COPY[key].zh;
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "这一步没有完成，请稍后重试。";
}

export function EnvironmentCard({ computerId, online, api = environmentApi }: {
  computerId: string;
  online: boolean;
  api?: EnvironmentApi;
}) {
  const tt = useUI();
  const [groups, setGroups] = useState<EnvironmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<Record<string, InstallJob>>({});
  const [agentMessage, setAgentMessage] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [projectPath, setProjectPath] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<{ found: string[]; missing: string[] } | null>(null);

  async function load() {
    if (!online) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setGroups((await api.listEnvironments(computerId)).groups ?? []); }
    catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [computerId, online, api]);

  async function refreshJob(item: EnvironmentItem, jobId: string) {
    try {
      const next = await api.getEnvironmentInstallJob(computerId, jobId);
      setJobs((current) => ({ ...current, [item.id]: next }));
      if (next.status === "ready") setGroups((current) => current.map((group) => ({ ...group, items: group.items.map((row) => row.id === item.id ? { ...row, installed: true } : row) })));
      if (next.status === "running") window.setTimeout(() => { void refreshJob(item, jobId); }, 900);
    } catch (reason) { setError(errorText(reason)); }
  }

  async function install(item: EnvironmentItem) {
    if (busy[item.id] || !online) return;
    setBusy((current) => ({ ...current, [item.id]: true })); setError(""); setAgentMessage((current) => ({ ...current, [item.id]: "" }));
    try {
      const job = await api.installEnvironment(computerId, item.id);
      setJobs((current) => ({ ...current, [item.id]: job }));
      if (job.status === "running") void refreshJob(item, job.job_id);
      else if (job.status === "ready") setGroups((current) => current.map((group) => ({ ...group, items: group.items.map((row) => row.id === item.id ? { ...row, installed: true } : row) })));
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy((current) => ({ ...current, [item.id]: false })); }
  }

  async function handoff(item: EnvironmentItem) {
    const job = jobs[item.id];
    if (busy[item.id]) return;
    setBusy((current) => ({ ...current, [item.id]: true })); setError("");
    try {
      await api.askAgentToInstall(computerId, item.id, job?.job_id);
      setAgentMessage((current) => ({ ...current, [item.id]: copy("agentStarted") }));
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy((current) => ({ ...current, [item.id]: false })); }
  }

  async function detect() {
    if (!online || !projectPath.trim() || detecting) return;
    setDetecting(true); setError(""); setDetection(null);
    try { setDetection(await api.detectEnvironments(computerId, projectPath.trim())); }
    catch (reason) { setError(errorText(reason)); }
    finally { setDetecting(false); }
  }

  const itemCount = useMemo(() => groups.reduce((total, group) => total + group.items.length, 0), [groups]);
  return <section className={CARD} data-server-environments={computerId}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className={CARD_TITLE}>{tt(copy("title"))}</h3><p className={CARD_DESC}>{tt(copy("description"))}</p></div>
      {itemCount > 0 && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-500">{itemCount}</span>}
    </div>
    {!online && <p className="mt-4 rounded-xl bg-neutral-50 px-3 py-2 text-[13px] text-neutral-500">{tt(copy("offline"))}</p>}
    {loading && <p role="status" className="mt-4 text-sm text-neutral-400">{tt(copy("loading"))}</p>}
    {!loading && online && error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700"><span>{error}</span><button type="button" className={QUIET} onClick={() => void load()}>{tt(copy("retry"))}</button></div>}
    {!loading && online && !error && groups.length === 0 && <p className="mt-4 text-sm text-neutral-400">{tt(copy("empty"))}</p>}
    <div className="mt-4 space-y-5">{groups.map((group) => <div key={group.id} data-environment-group={group.id}>
      <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">{tt(group.title)}</h4>
      <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">{group.items.map((item) => {
        const job = jobs[item.id]; const failed = job?.status === "failed"; const running = job?.status === "running";
        return <div key={item.id} className="p-4" data-environment-item={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[13px] font-medium">{tt(item.title)}</p>{item.installed === true && <span className="text-[12px] text-emerald-600">✓ {tt(copy("installed"))}</span>}{item.installed === null && <span className="text-[11px] text-neutral-400">—</span>}</div><p className={CARD_DESC}>{tt(item.summary)}</p><p className="mt-1 text-[11px] text-neutral-400">{item.version} · {item.size_mb} MB {item.size_mb >= 500 && <span className="text-amber-600">· {tt(copy("large"))}</span>}</p></div><button type="button" className={QUIET} disabled={!online || busy[item.id] || running || item.installed === true} onClick={() => void install(item)}>{running ? tt(copy("installing")) : tt(copy("install"))}</button></div>
          {job && <div className="mt-3 rounded-xl bg-neutral-50 p-3" data-environment-job={job.job_id}><p className="text-[12px] font-medium text-neutral-600">{failed ? tt(copy("failed")) : running ? tt(copy("installing")) : tt(copy("installed"))}</p>{job.lines.length > 0 && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-neutral-500">{job.lines.join("\n")}</pre>}{failed && <><pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-red-600">{job.error_tail.join("\n")}</pre><button type="button" className={`${QUIET} mt-2`} disabled={busy[item.id]} onClick={() => void handoff(item)}>{tt(copy("askAgent"))}</button></>}{agentMessage[item.id] && <p role="status" className="mt-2 text-[12px] text-emerald-700">{tt(agentMessage[item.id])}</p>}</div>}
        </div>;
      })}</div>
    </div>)}</div>
    {online && <div className="mt-5 border-t border-neutral-100 pt-4"><p className="text-[13px] font-medium">{tt(copy("detectTitle"))}</p><div className="mt-2 flex flex-wrap gap-2"><input aria-label={tt(copy("detectPlaceholder"))} value={projectPath} onInput={(event) => setProjectPath(event.currentTarget.value)} placeholder={tt(copy("detectPlaceholder"))} className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px]" /><button type="button" className={QUIET} disabled={!projectPath.trim() || detecting} onClick={() => void detect()}>{detecting ? tt(copy("detecting")) : tt(copy("detect"))}</button></div>{detection && <div role="status" className="mt-3 text-[12px] text-neutral-500"><span>{tt(copy("found"), { n: detection.found.length })}</span><span className="mx-2">·</span><span>{tt(copy("missing"), { n: detection.missing.length })}</span></div>}</div>}
  </section>;
}
