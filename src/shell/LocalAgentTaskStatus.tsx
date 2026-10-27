"use client";
import {lazy, Suspense, useEffect, useRef, useState} from "react";
import {useUI} from "../i18n/ui/useUI";
import {getAgentObservation, getAgentSession, type AgentSessionView} from "../lib/cloud-agent-api";
import {CLOUD_AGENT_COPY, cloudHealthTone, cloudOwnerLine, cloudRunActions, cloudRunStatus, formatClock, localAgentCanControl,
  localAgentRunLive, localAgentStateText, remoteDesktopAgentBanner, type CloudRunAction, type LocalAgentControl, type LocalAgentRun,
  type LocalTaskArtifact} from "../lib/local-agent-task";
import {useRemoteConsent} from "../pages/devices/use-device-cloud-agent";
import {remoteDesktopTicket, type RemoteDesktopTicket} from "../pages/remote-desktop-ticket";

// Loaded only when the person takes over the computer from this page.
const RemoteDesktopPanel = lazy(() => import("../pages/RemoteDesktopPanel").then(module => ({default: module.RemoteDesktopPanel})));

/** The session route and the screen image are read at most this often (memory only, never cached). */
const SCREEN_POLL_MS = 10_000;

type StatusProps = {
  run: LocalAgentRun | null; artifacts: LocalTaskArtifact[]; busy: boolean; readOnly: boolean; onControl: (action: LocalAgentControl) => void;
};

export function LocalAgentTaskStatus(props: StatusProps) {
  // A cloud-assistant run (device-link protocol §13) gets health, owner, the
  // latest screen and takeover; every other run keeps exactly today's block.
  return props.run?.driver === "cloud" ? <CloudAgentRunStatus {...props} run={props.run} /> : <DeviceAgentRunStatus {...props} />;
}

function DeviceAgentRunStatus({run, artifacts, busy, readOnly, onControl}: StatusProps) {
  const tt = useUI();
  return <section data-local-agent-state={run?.state || "unknown"} className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm">
    <p role="status">{tt(localAgentStateText(run))}</p>
    <p className="mt-1 text-xs text-stone-500">{tt("由所选电脑的本地 AI 执行。关闭此页面不会停止任务；权限确认仍在电脑端完成。")}</p>
    {!readOnly && <div className="mt-2 flex flex-wrap gap-2">
      {(["pause", "resume", "stop"] as const).filter(action => localAgentCanControl(run, action)).map(action =>
        <button key={action} type="button" disabled={busy} onClick={() => onControl(action)}
          className="rounded border border-stone-300 bg-white px-3 py-1 disabled:opacity-50">
          {tt(action === "pause" ? "暂停电脑任务" : action === "resume" ? "让 AI 重新观察并继续" : "停止电脑任务")}
        </button>)}
    </div>}
    <LocalTaskArtifactList artifacts={artifacts} />
  </section>;
}

function CloudAgentRunStatus({run, artifacts, busy, readOnly, onControl}: StatusProps & {run: LocalAgentRun}) {
  const tt = useUI();
  const live = localAgentRunLive(run);
  const {session, screen} = useCloudAgentScreen(run.deviceId, run.sessionId ?? "", live);
  const now = useClock(live && (run.health?.kind === "offline" || run.health?.kind === "hung" || run.health?.kind === "asleep"));
  // `ticket`: this click's one session request (a remount of the panel never sends another).
  const [remote, setRemote] = useState<{deviceId: string; name: string; ticket: RemoteDesktopTicket} | null>(null);
  const status = cloudRunStatus(run, tt, now, {lastContactAt: session?.lastContactAt, currentElapsedMs: session?.current?.elapsedMs});
  const owner = cloudOwnerLine(run);
  const stuck = live && run.health !== undefined && cloudHealthTone(run.health.kind) === "stuck";
  const actions = readOnly ? [] : cloudRunActions(run);
  const banner = remoteDesktopAgentBanner(run);
  // 接管电脑 says up front whether someone at the computer has to approve (C11 contract §2).
  const consent = useRemoteConsent(run.deviceId, actions.includes("takeOver"));

  const takeOver = () => {
    // People first: ask the AI to stop touching the computer, then open the
    // remote desktop here. Any input there also fences the AI on the computer.
    if (localAgentCanControl(run, "pause")) onControl("pause");
    const deviceId = run.deviceId;
    setRemote({deviceId, name: tt(CLOUD_AGENT_COPY.yourComputer), ticket: remoteDesktopTicket()});
    void import("../api/devices").then(({listDevices}) => listDevices()).then(result => {
      const name = result.ok ? result.data?.find(device => device.device_id === deviceId)?.device_name : undefined;
      if (name) setRemote(current => current && current.deviceId === deviceId ? {...current, name} : current);
    }).catch(() => { /* the generic name stays */ });
  };
  const act = (action: CloudRunAction) => {
    if (action === "takeOver") takeOver();
    else onControl(action === "handBack" ? "resume" : action);
  };
  const label = (action: CloudRunAction) => tt(action === "pause" ? "暂停" : action === "resume" ? "让 AI 重新观察并继续"
    : action === "stop" ? "停止" : action === "handBack" ? CLOUD_AGENT_COPY.handBack : CLOUD_AGENT_COPY.takeOver);

  return <section data-local-agent-state={run.state} data-local-agent-driver="cloud" data-cloud-agent-health={run.health?.kind ?? "ok"}
    className="shrink-0 border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm">
    <p role="status" className={stuck ? "text-amber-800" : undefined}>{status}</p>
    {owner && <p className="mt-1 text-xs text-stone-600" data-cloud-agent-owner="ai">{tt(owner)}</p>}
    <p className="mt-1 text-xs text-stone-500">{tt(CLOUD_AGENT_COPY.subtitle)}</p>
    {live && screen && <figure className="mt-2" data-cloud-agent-screen>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={screen.url} alt={tt(CLOUD_AGENT_COPY.screenAlt)} className="max-h-40 max-w-full rounded border border-stone-200 object-contain" />
      <figcaption className="mt-1 text-xs text-stone-500">{tt(CLOUD_AGENT_COPY.screenCaption, {time: formatClock(screen.at ?? now, now)})}</figcaption>
    </figure>}
    {actions.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
      {actions.map(action => <button key={action} type="button" disabled={busy && action !== "takeOver"} onClick={() => act(action)}
        data-cloud-agent-action={action} className="rounded border border-stone-300 bg-white px-3 py-1 disabled:opacity-50">{label(action)}</button>)}
    </div>}
    {consent === "ask" && actions.includes("takeOver") && <p className="mt-1 text-xs text-stone-500" data-cloud-agent-consent="ask"
      title={tt(CLOUD_AGENT_COPY.takeOverAskHint)}>{tt(CLOUD_AGENT_COPY.takeOverAsk)}</p>}
    <LocalTaskArtifactList artifacts={artifacts} />
    {remote && <Suspense fallback={null}>
      <RemoteDesktopPanel key={remote.deviceId} deviceId={remote.deviceId} deviceName={remote.name} onClose={() => setRemote(null)}
        consent={consent ?? undefined} ticket={remote.ticket}
        agent={banner && !readOnly ? {
          text: banner.text,
          handBack: banner.handBack && localAgentCanControl(run, "resume"),
          busy,
          onHandBack: () => onControl("resume"),
        } : undefined} />
    </Suspense>}
  </section>;
}

/**
 * The live session (§12.1) and the newest screen image (§12.2) of a cloud
 * run. Both are read at most every 10 s while the page is visible; the image
 * is fetched only when the hub has a newer one, kept as an in-memory object
 * URL, and revoked as soon as it is replaced or the block goes away.
 */
function useCloudAgentScreen(deviceId: string, sessionId: string, live: boolean) {
  const [session, setSession] = useState<AgentSessionView | null>(null);
  const [screen, setScreen] = useState<{url: string; at: number | null} | null>(null);
  const urlRef = useRef<string | null>(null);
  const show = (next: {url: string; at: number | null} | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next?.url ?? null;
    setScreen(next);
  };
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; }, []);
  useEffect(() => {
    setSession(null);
    if (!sessionId || !live) { show(null); return; }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shownAt: number | null | undefined;
    const abort = new AbortController();
    const schedule = () => { if (alive) timer = setTimeout(() => void tick(), SCREEN_POLL_MS); };
    const tick = async () => {
      if (!alive) return;
      if (typeof document !== "undefined" && document.hidden) { schedule(); return; }
      const result = await getAgentSession(deviceId, sessionId, abort.signal);
      if (!alive) return;
      if (result.kind === "gone") { setSession(null); shownAt = undefined; show(null); }
      if (result.kind === "ok") {
        setSession(result.session);
        const observation = result.session.observation;
        // Without an `at` there is no way to tell a new frame: read it again (still ≤ once per 10 s).
        if (!observation) { shownAt = undefined; show(null); }
        else if (shownAt === undefined || observation.at === null || observation.at !== shownAt) {
          const picture = await getAgentObservation(deviceId, sessionId, abort.signal);
          if (!alive) return;
          if (picture.kind === "image") { shownAt = observation.at; show({url: URL.createObjectURL(picture.image), at: observation.at}); }
          else if (picture.kind !== "error") { shownAt = undefined; show(null); }
        }
      }
      schedule();
    };
    void tick();
    return () => { alive = false; abort.abort(); if (timer) clearTimeout(timer); };
  // `show` only touches a ref and a setter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, sessionId, live]);
  return {session, screen};
}

/** "Now" for live durations ("你的电脑 2 分钟没有回应"), refreshed every 10 s while it matters. */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), SCREEN_POLL_MS);
    return () => clearInterval(timer);
  }, [active]);
  return active ? now : Date.now();
}

function LocalTaskArtifactList({artifacts}: {artifacts: LocalTaskArtifact[]}) {
  return artifacts.length > 0 ? <ul className="mt-2 space-y-1">{artifacts.map(artifact =>
    <LocalTaskArtifactDownload key={`${artifact.artifactId}:${artifact.revisionId}`} artifact={artifact} />)}</ul> : null;
}

function LocalTaskArtifactDownload({artifact}: {artifact: LocalTaskArtifact}) {
  const tt = useUI();
  const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => abort.current?.abort(), []);
  const download = async () => {
    if (abort.current) return;
    const request = new AbortController();
    abort.current = request;
    setBusy(true); setError("");
    try {
      const {getArtifactItem, getArtifactDownload} = await import("./artifact-client");
      const item = await getArtifactItem(artifact.artifactId, artifact.revisionId, request.signal);
      if (!item.ok || !item.data || request.signal.aborted) throw new Error("unavailable");
      const result = await getArtifactDownload(item.data, request.signal);
      if (!result.ok || !result.data || result.data.artifactId !== artifact.artifactId ||
          result.data.revisionId !== artifact.revisionId || request.signal.aborted) throw new Error("unavailable");
      // Use the canonical private, expiring download grant, never a model URL.
      const link = document.createElement("a");
      link.href = result.data.url;
      link.download = result.data.filename;
      link.type = result.data.mediaType;
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      document.body.append(link); link.click(); link.remove();
    } catch {
      if (!request.signal.aborted) setError(tt("无法下载此任务文件，请到我的库核对权限后重试。"));
    } finally {
      if (!request.signal.aborted) { setBusy(false); abort.current = null; }
    }
  };
  return <li data-local-task-artifact={artifact.artifactId} className="flex flex-wrap items-center gap-2">
    <span className="min-w-0 break-all">{artifact.title || tt("任务文件")}</span>
    <button type="button" onClick={() => void download()} disabled={busy} className="rounded border px-2 py-1 disabled:opacity-50">{tt(busy ? "处理中…" : "下载")}</button>
    {error && <span role="alert" className="text-rose-600">{error}</span>}
  </li>;
}
