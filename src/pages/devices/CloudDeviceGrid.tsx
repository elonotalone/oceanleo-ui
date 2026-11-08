"use client";

import { useEffect, useRef, useState } from "react";
import { cloudComputerApi, type CloudComputerClient, type Computer } from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";
import { ConnectServerDialog } from "../../shell/cloud-computer/ConnectServerDialog";
import { computerDisplayState, isConnectedComputer, type ComputerDisplayState } from "../../shell/cloud-computer/computer-state";
import { DEVICE_PRIMARY_BUTTON } from "./DeviceDialog";
import { DeviceIcon } from "./DeviceCard";
import { DeviceActivityPanel, activityLine } from "./DeviceActivityPanel";
import { computerActivityApi, type ComputerActivity, type ComputerActivityClient } from "../../lib/computer-activity-api";
import { WallpaperSurface } from "./DeviceCover";
import { AuthDialog } from "../AuthDialog";
import { openSettingsModal } from "../settings/settings-tabs";

export const STATE_LABEL: Record<ComputerDisplayState, string> = { ready: "在线", offline: "离线", stopped: "已停机", unpaid: "欠费", provisioning: "正在开通", pending_install: "等待安装", pending_confirm: "待确认", error: "连接失败", gone: "已移除" };

/** Paired local clients and cloud nodes share a card grid, not their authority. */
export function CloudDeviceGrid({ client = cloudComputerApi, activityClient = computerActivityApi, autoFocus = false, onUnauthorized }: { client?: CloudComputerClient; activityClient?: ComputerActivityClient; autoFocus?: boolean; onUnauthorized?: () => void }) {
  const tt = useUI();
  const [computers, setComputers] = useState<Computer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [resume, setResume] = useState<Computer | null>(null);
  // What runs on each connected computer, read with the list (the card line) and by the open panel.
  const [activity, setActivity] = useState<Record<string, ComputerActivity>>({});
  const [activityId, setActivityId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const firstCard = useRef<HTMLElement | null>(null);
  const focused = useRef(false);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;
  useEffect(() => { if (autoFocus && !focused.current && firstCard.current?.scrollIntoView) { focused.current = true; firstCard.current.scrollIntoView({ block: "start" }); } }, [autoFocus, computers]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    function showActivity(id: string, next: ComputerActivity | null) {
      if (!alive) return;
      setActivity((current) => {
        const copy = { ...current };
        if (next) copy[id] = next; else delete copy[id];
        return copy;
      });
    }
    async function refresh() {
      try {
        const result = await client.listComputers();
        if (!alive) return;
        const items = (result.items ?? []).filter((item) => computerDisplayState(item) !== "gone");
        setComputers(items);
        setLoginRequired(false);
        setError(null);
        if (typeof document === "undefined" || !document.hidden) {
          for (const item of items.filter(isConnectedComputer)) {
            activityClient.getActivity(item.id).then((next) => showActivity(item.id, next), () => showActivity(item.id, null));
          }
        }
      } catch (cause) {
        if (!alive) return;
        const failure = cause as {status?: number; code?: string} | null;
        if (failure?.status === 401 || (!failure?.status && failure?.code === "client_unauthorized")) {
          setComputers([]); setResume(null); setError(null); setLoginRequired(true); setActivity({}); setActivityId(null);
          unauthorized.current?.();
        } else setError("云电脑暂时无法加载。");
      }
      finally { if (alive) timer = setTimeout(refresh, 15_000); }
    }
    void refresh();
    return () => { alive = false; clearTimeout(timer); };
  }, [client, activityClient, revision]);
  const activityComputer = computers.find((item) => item.id === activityId);
  function updated() { setRevision((value) => value + 1); }
  return <>
    {loginRequired && <div role="status" className="col-span-full flex items-center gap-3 rounded-xl bg-neutral-100 px-4 py-3 text-sm"><span>{tt("请先登录")}</span><button type="button" className={DEVICE_PRIMARY_BUTTON} onClick={() => setShowAuth(true)}>{tt("登录")}</button></div>}
    {error && <p role="alert" className="col-span-full rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{tt(error)} <button type="button" onClick={updated} className="underline underline-offset-2">{tt("重试")}</button></p>}
    {computers.map((computer, index) => {
      const state = computerDisplayState(computer);
      const live = activity[computer.id]?.online ? activity[computer.id] : null;
      return <article ref={index === 0 ? firstCard : undefined} key={computer.id} className="min-w-0 overflow-hidden rounded-[20px] border border-neutral-200 bg-white" data-oceanleo-cc-card={computer.id} data-oceanleo-cc-display-state={state}>
        <WallpaperSurface placeholder="此云电脑未提供桌面壁纸">
          {(state === "pending_install" || state === "pending_confirm") ? <button type="button" onClick={() => setResume(computer)} className="absolute bottom-4 left-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50">{tt(state === "pending_confirm" ? "核对并确认" : "继续连接")}</button> : null}
        </WallpaperSurface>
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-start gap-3"><DeviceIcon className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-neutral-900">{computer.name}</h3><p className="mt-1 text-xs text-neutral-500">{tt("云电脑")}{computer.node_os ? ` · ${computer.node_os}` : ""}</p>{live && <div className="mt-1.5 flex flex-wrap items-center gap-2"><button type="button" onClick={() => setActivityId(computer.id)} className="text-left text-xs text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline" data-device-activity-open={computer.id}>{activityLine(tt, live)}</button>{live.update_available && <button type="button" onClick={() => setActivityId(computer.id)} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100" data-device-update-badge={computer.id}>{tt("有更新")}</button>}</div>}</div></div>
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-neutral-500"><span className={`h-2 w-2 rounded-full ${state === "ready" ? "bg-emerald-500" : state === "error" || state === "unpaid" ? "bg-red-400" : "bg-neutral-400"}`} />{tt(STATE_LABEL[state])}</span>
        </div>
        <div className={`grid ${isConnectedComputer(computer) ? "grid-cols-2" : "grid-cols-1"} border-t border-neutral-100 py-1.5`}><button type="button" data-device-server-settings={computer.id} onClick={() => openSettingsModal("device-settings", { deviceId: computer.id })} className="px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">{tt("设置")}</button>{isConnectedComputer(computer) && <button type="button" data-device-dashboard-open={computer.id} onClick={() => setActivityId(computer.id)} className="px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">{tt("看板")}</button>}</div>
      </article>;
    })}
    {activityComputer && <DeviceActivityPanel key={activityComputer.id} computerId={activityComputer.id} name={activityComputer.name} client={activityClient} initial={activity[activityComputer.id] ?? null} onActivity={(next) => setActivity((current) => ({ ...current, [activityComputer.id]: next }))} onClose={() => setActivityId(null)} />}
    {resume && <ConnectServerDialog key={resume.id} client={client} resumeComputer={resume} onClose={() => setResume(null)} onCreated={() => { setResume(null); updated(); }} />}
    {showAuth && <AuthDialog onClose={() => setShowAuth(false)} onSuccess={() => { setShowAuth(false); updated(); }} />}
  </>;
}
