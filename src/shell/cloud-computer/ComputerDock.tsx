"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cloudComputerApi, type CloudComputerClient, type Computer, writeMountedComputerId, writeMountedComputerName } from "../../lib/cloud-computer-api";
import { listDevices, type Device } from "../../api/devices";
import { getUserId } from "../../lib/auth/client";
import { portalHref } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import { EXECUTION_TARGET_EVENT, readExecutionTarget, writeExecutionTarget, type ExecutionTarget } from "../../lib/execution-target";
import { AnchoredPopover } from "../anchored-popover";
import { computerDisplayState, isConnectedComputer } from "./computer-state";

/** Website/native execution picker. Selecting a machine never navigates away. */
export function ComputerDock({ client = cloudComputerApi, computers: supplied, onTargetChange }: {
  client?: CloudComputerClient; computers?: Computer[]; onTargetChange?: (target: ExecutionTarget) => void;
}) {
  const tt = useUI();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<"cloud" | "device">("cloud");
  const [owner, setOwner] = useState<string | null>(null);
  const [target, setTarget] = useState<ExecutionTarget>({ kind: "cloud" });
  const [computers, setComputers] = useState<Computer[]>(supplied || []);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let revision = 0;
    async function hydrate() {
      const ticket = ++revision;
      const id = await getUserId().catch(() => null);
      if (!alive || ticket !== revision) return;
      const selected = readExecutionTarget(id);
      setOwner(id); setTarget(selected); onTargetChange?.(selected);
      setDevices([]); setComputers(supplied || []); setOpen(false);
    }
    function changed(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string; target?: ExecutionTarget }>).detail;
      if (detail?.userId === owner && detail.target) { setTarget(detail.target); onTargetChange?.(detail.target); }
    }
    void hydrate();
    window.addEventListener("oceanleo:auth-state", hydrate);
    window.addEventListener(EXECUTION_TARGET_EVENT, changed);
    return () => { alive = false; window.removeEventListener("oceanleo:auth-state", hydrate); window.removeEventListener(EXECUTION_TARGET_EVENT, changed); };
  }, [owner, supplied, onTargetChange]);

  useEffect(() => {
    if (!open || !owner) return;
    let alive = true;
    setLoading(true); setError(false);
    void Promise.allSettled([supplied ? Promise.resolve({ items: supplied }) : client.listComputers(), listDevices()])
      .then(([cloudResult, localResult]) => {
        if (!alive) return;
        const local = localResult.status === "fulfilled" ? localResult.value : null;
        setComputers(cloudResult.status === "fulfilled" ? cloudResult.value.items || [] : []);
        setDevices(local?.ok && local.data ? local.data.filter((d) => ["windows", "macos", "linux"].includes(d.platform)) : []);
        setError(cloudResult.status === "rejected" || !local?.ok);
      })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, owner, client, supplied]);

  function choose(next: ExecutionTarget) {
    if (!owner) return;
    writeExecutionTarget(owner, next);
    writeMountedComputerId(next.kind === "computer" ? next.id : null);
    writeMountedComputerName(next.kind === "computer" ? next.name : null);
    onTargetChange?.(next);
    setTarget(next); setOpen(false);
  }
  const row = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none";
  const shown = target.kind === "cloud" ? tt("云端") : target.name;
  return <div className="relative" data-oceanleo-cc-dock data-execution-target={target.kind}>
    <button ref={anchor} type="button" onClick={() => { setGroup(target.kind === "device" ? "device" : "cloud"); setOpen(!open); }}
      aria-label={tt("任务执行位置")} aria-haspopup="dialog" aria-expanded={open} data-oceanleo-cc-dock-trigger
      title={tt("任务执行位置")}
      className="flex h-7 max-w-[180px] items-center gap-1.5 rounded-lg px-2 text-[12px] text-neutral-600 hover:bg-neutral-100">
      <TargetGlyph cloud={target.kind !== "device"} /><span className="truncate">{shown}</span>
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <AnchoredPopover open={open} anchorRef={anchor} panelRef={panel} onClose={() => setOpen(false)} align="start" role="dialog" ariaLabel={tt("任务执行位置")}
      preferredPlacement="above" className="z-[80] w-[min(440px,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl">
      <div ref={panel} className="grid grid-cols-[minmax(110px,0.75fr)_minmax(150px,1fr)]">
        <div className="border-r border-neutral-100 pr-1.5">
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium text-neutral-500">{tt("在此设备上运行任务")}</p>
          <button type="button" className={`${row} ${group === "cloud" ? "bg-neutral-100" : ""}`} onMouseEnter={() => setGroup("cloud")} onFocus={() => setGroup("cloud")} onClick={() => setGroup("cloud")} aria-expanded={group === "cloud"}>
            <TargetGlyph cloud /><span className="flex-1">{tt("云端")}</span>{target.kind !== "device" && <span aria-label={tt("已选择")}>✓</span>}<span aria-hidden>›</span>
          </button>
          <button type="button" className={`${row} ${group === "device" ? "bg-neutral-100" : ""}`} onMouseEnter={() => setGroup("device")} onFocus={() => setGroup("device")} onClick={() => setGroup("device")} aria-expanded={group === "device"}>
            <TargetGlyph /><span className="flex-1">{tt("本地电脑")}</span>{target.kind === "device" && <span aria-label={tt("已选择")}>✓</span>}<span aria-hidden>›</span>
          </button>
        </div>
        <div className="min-w-0 pl-1.5">
          {!owner ? <p className="px-3 py-3 text-[12px] text-neutral-500">{tt("请先登录")}</p> : <>
            {group === "cloud" && <>
              <button type="button" className={row} aria-pressed={target.kind === "cloud"} onClick={() => choose({ kind: "cloud" })}><TargetGlyph cloud /><span className="flex-1">{tt("默认云端")}</span>{target.kind === "cloud" && "✓"}</button>
              {computers.filter(isConnectedComputer).map((item) => {
                const ready = computerDisplayState(item) === "ready";
                const selected = target.kind === "computer" && target.id === item.id;
                return <button key={item.id} type="button" disabled={!ready} className={`${row} disabled:opacity-50`} aria-pressed={selected} data-oceanleo-cc-switch-item={item.id} onClick={() => choose({ kind: "computer", id: item.id, name: item.name })}>
                  <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-neutral-300"}`} /><span className="min-w-0 flex-1 truncate">{item.name}</span>{!ready && <span className="text-[11px] text-neutral-400">{tt("离线")}</span>}{selected && <span aria-label={tt("已选择")}>✓</span>}
                </button>;
              })}
            </>}
            {group === "device" && devices.map((item) => {
              const availability = (item as Device & { availability?: string }).availability;
              const ready = availability === "online" && item.online;
              const selected = target.kind === "device" && target.id === item.device_id;
              return <button key={item.device_id} type="button" disabled={!ready} className={`${row} disabled:opacity-50`} aria-pressed={selected} data-oceanleo-device-client={item.device_id} onClick={() => choose({ kind: "device", id: item.device_id, name: item.device_name })}>
                <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-neutral-300"}`} /><span className="min-w-0 flex-1 truncate">{item.device_name}</span>{!ready && <span className="text-[11px] text-neutral-400">{tt(availability === "offline" ? "离线" : availability === "signed_out" ? "未登录" : "状态未知")}</span>}{selected && <span aria-label={tt("已选择")}>✓</span>}
              </button>;
            })}
            {group === "device" && !devices.length && !loading && <p className="px-3 py-3 text-[12px] text-neutral-500">{tt("暂无已连接的电脑")}</p>}
            {loading && <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载中…")}</p>}
            {error && <p role="status" className="px-3 py-2 text-[12px] text-neutral-500">{tt("设备列表暂不可用")}</p>}
          </>}
          <div className="mt-1 border-t border-neutral-100 pt-1"><button type="button" className={row} onClick={() => { setOpen(false); router.push(portalHref("/devices")); }}><span aria-hidden>☷</span>{tt("管理设备")}</button></div>
        </div>
      </div>
    </AnchoredPopover>
  </div>;
}
function TargetGlyph({ cloud = false }: { cloud?: boolean }) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {cloud ? <path d="M6 18a4 4 0 0 1-.5-8A6.5 6.5 0 0 1 18 8a5 5 0 0 1 0 10Z" /> : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>}
  </svg>;
}
