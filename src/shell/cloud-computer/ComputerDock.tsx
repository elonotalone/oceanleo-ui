"use client";

import { PROGRAM_LABEL } from "./agent-dialog/types";
import { createComputerTaskSession } from "../../lib/computer-task-api";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cloudComputerApi, type CloudComputerClient, type Computer, writeMountedComputerId, writeMountedComputerName } from "../../lib/cloud-computer-api";
import { listDevices, type Device } from "../../api/devices";
import { listCloudAgentAvailability, type CloudAgentAvailabilityResult } from "../../lib/cloud-agent-api";
import { getUserId } from "../../lib/auth/client";
import { portalHref } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import { EXECUTION_TARGET_EVENT, computerRunMode, readExecutionTarget, withRunMode, writeExecutionTarget, type CloudAgentAvailability, type ExecutionTarget } from "../../lib/execution-target";
import { CLOUD_AGENT_COPY, LOCAL_AGENT_COPY, formatClock } from "../../lib/local-agent-task";
import { AnchoredPopover } from "../anchored-popover";
import { computerDisplayState, isConnectedComputer } from "./computer-state";

const DESKTOP_PLATFORMS = ["windows", "macos", "linux"];
/** Only an explicit `false` from the gateway counts; an older gateway's missing field says nothing. */
function localExecOff(device: Device | null | undefined): boolean {
  return device?.local_exec_enabled === false;
}

/**
 * What the picker knows about the cloud assistant (`GET /v1/devices/cloud-agent`).
 * `unknown`: not read yet, or the last read failed: keep the current choice.
 * `absent`: the gateway predates the route: today's labels, never a driver.
 */
type CloudAgentState = { status: "unknown" } | { status: "absent" } | { status: "ok"; devices: Map<string, CloudAgentAvailability> };
const UNKNOWN: CloudAgentState = { status: "unknown" };
function nextCloudAgentState(current: CloudAgentState, result: CloudAgentAvailabilityResult): CloudAgentState {
  if (result.kind === "ok") return { status: "ok", devices: result.devices };
  return result.kind === "absent" ? { status: "absent" } : current;
}
/** The mode a computer row stands for; null shows today's row. */
function runModeOf(state: CloudAgentState, deviceId: string, device: Device | null | undefined, now: number) {
  return state.status === "ok" ? computerRunMode(device, state.devices.get(deviceId), now) : null;
}
/**
 * One entry per computer: the target carries `driver:"cloud"` exactly while
 * that computer allows the cloud assistant, so the label the person sees and
 * the mode that is sent never differ.
 */
function deriveTarget(target: ExecutionTarget, state: CloudAgentState, device: Device | null, now: number): ExecutionTarget {
  if (target.kind !== "device" || state.status === "unknown") return target;
  return withRunMode(target, state.status === "absent" ? null : computerRunMode(device, state.devices.get(target.id), now));
}

/** undefined is a fresh draft; null is an existing task whose binding is not loaded yet. */
export function ComputerDock({boundTarget, ...props}: {
  client?: CloudComputerClient; computers?: Computer[]; onTargetChange?: (target: ExecutionTarget) => void;
  boundTarget?: ExecutionTarget | null; onBeforeNavigate?: () => void | Promise<void>;
}) {
  const tt = useUI();
  if (boundTarget === undefined) return <DraftComputerDock {...props} />;
  const scope = boundTarget?.kind === "device" && boundTarget.driver === "cloud" && typeof boundTarget.gui === "boolean"
    ? tt(CLOUD_AGENT_COPY[boundTarget.gui ? "scopeGui" : "scopeFiles"]) : null;
  return <div className="max-w-[360px] truncate px-2 text-[12px] text-neutral-600" data-task-bound-target
    title={`${scope ? `${scope} · ` : ""}${tt(CLOUD_AGENT_COPY.scopeNewTask)}`}>
    {boundTarget ? (boundTarget.kind === "cloud" ? tt("云端") : boundTarget.name) : tt("正在加载…")}
    {scope ? ` · ${scope}` : ""} · {tt(CLOUD_AGENT_COPY.scopeNewTask)}
  </div>;
}

/** Website/native execution picker. Selecting a machine never navigates away. */
function DraftComputerDock({ client = cloudComputerApi, computers: supplied, onTargetChange, onBeforeNavigate }: {
  client?: CloudComputerClient; computers?: Computer[]; onTargetChange?: (target: ExecutionTarget) => void; onBeforeNavigate?: () => void | Promise<void>;
}) {
  const tt = useUI();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nativeComputer, setNativeComputer] = useState<Computer | null>(null);
  const [nativePrograms, setNativePrograms] = useState<import("../../lib/cloud-computer-api").CliProgram[]>([]);
  useEffect(() => { setNativePrograms([]); if (!nativeComputer) return; let alive = true; void client.listCliPrograms(nativeComputer.id).then(r => { if(alive)setNativePrograms(r.programs); }).catch(() => {}); return () => { alive=false; }; }, [nativeComputer, client]);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeError, setNativeError] = useState("");
  const [group, setGroup] = useState<"cloud" | "device">("cloud");
  const [owner, setOwner] = useState<string | null>(null);
  const [target, setTarget] = useState<ExecutionTarget>({ kind: "cloud" });
  const [computers, setComputers] = useState<Computer[]>(supplied || []);
  const [devices, setDevices] = useState<Device[]>([]);
  // The selected computer as the gateway last reported it, kept while the
  // picker is closed so its "local execution off" state shows before Send.
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [cloudAgent, setCloudAgent] = useState<CloudAgentState>(UNKNOWN);
  // Bumped when the selected computer's permission runs out, so the mode is re-derived.
  const [clock, setClock] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const selectedDeviceId = target.kind === "device" ? target.id : "";

  useEffect(() => {
    let alive = true;
    let revision = 0;
    async function hydrate() {
      const ticket = ++revision;
      const id = await getUserId().catch(() => null);
      if (!alive || ticket !== revision) return;
      const selected = readExecutionTarget(id);
      // Another account's availability must never decide this account's mode.
      if (id !== owner) setCloudAgent(UNKNOWN);
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
    void Promise.allSettled([supplied ? Promise.resolve({ items: supplied }) : client.listComputers(), listDevices(), listCloudAgentAvailability()])
      .then(([cloudResult, localResult, agentResult]) => {
        if (!alive) return;
        const local = localResult.status === "fulfilled" ? localResult.value : null;
        const listed = local?.ok && local.data ? local.data.filter((d) => DESKTOP_PLATFORMS.includes(d.platform)) : [];
        setComputers(cloudResult.status === "fulfilled" ? cloudResult.value.items || [] : []);
        setDevices(listed);
        if (local?.ok) setSelectedDevice((current) => current && (listed.find((d) => d.device_id === current.device_id) ?? null));
        if (agentResult.status === "fulfilled") setCloudAgent((current) => nextCloudAgentState(current, agentResult.value));
        setError(cloudResult.status === "rejected" || !local?.ok);
      })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, owner, client, supplied]);

  // Read the selected computer's local-execution mirror and its cloud-assistant
  // availability without opening the picker, and again when the page regains
  // focus (e.g. after the user changed a switch at that computer). Display and
  // routing only: the gateway and the computer still decide.
  useEffect(() => {
    if (!owner || !selectedDeviceId) { setSelectedDevice(null); return; }
    let alive = true;
    const load = () => {
      void listDevices().then((result) => {
        if (!alive || !result.ok || !result.data) return;
        setSelectedDevice(result.data.find((d) => d.device_id === selectedDeviceId) ?? null);
      }).catch(() => { /* the hint is optional; the send path still explains a refusal */ });
      void listCloudAgentAvailability().then((result) => {
        if (alive) setCloudAgent((current) => nextCloudAgentState(current, result));
      }).catch(() => { /* unknown keeps the current choice */ });
    };
    load();
    window.addEventListener("focus", load);
    return () => { alive = false; window.removeEventListener("focus", load); };
  }, [owner, selectedDeviceId]);

  // Keep the remembered target's driver equal to what the computer allows now.
  useEffect(() => {
    if (!owner || target.kind !== "device") return;
    const next = deriveTarget(target, cloudAgent, selectedDevice?.device_id === target.id ? selectedDevice : null, Date.now());
    if (next === target) return;
    writeExecutionTarget(owner, next);
    onTargetChange?.(next);
    setTarget(next);
  }, [owner, target, cloudAgent, selectedDevice, clock, onTargetChange]);

  // The permission set at the computer ends at `until`: re-derive right after it.
  useEffect(() => {
    if (target.kind !== "device" || cloudAgent.status !== "ok") return;
    const until = cloudAgent.devices.get(target.id)?.until;
    const delay = until ? until - Date.now() : 0;
    if (delay <= 0 || delay > 86_400_000) return;
    const timer = setTimeout(() => setClock(Date.now()), delay + 500);
    return () => clearTimeout(timer);
  }, [target, cloudAgent]);

  function chooseGui(gui: boolean) {
    if (target.kind !== "device" || target.driver !== "cloud") return;
    const next = {...target, gui};
    setTarget(next);
    onTargetChange?.(next);
  }

  function choose(next: ExecutionTarget) {
    if (!owner) return;
    const device = next.kind === "device" ? devices.find((d) => d.device_id === next.id) ?? null : null;
    const picked = deriveTarget(next, cloudAgent, device, Date.now());
    writeExecutionTarget(owner, picked);
    writeMountedComputerId(picked.kind === "computer" ? picked.id : null);
    writeMountedComputerName(picked.kind === "computer" ? picked.name : null);
    onTargetChange?.(picked);
    setSelectedDevice(device);
    setTarget(picked); setOpen(false);
  }
  async function openNative(program: "oceanleo"|"cursor"|"claude"|"codex"|"hermes"|null) {
    if (!nativeComputer || nativeBusy) return;
    setNativeBusy(true); setNativeError("");
    try {
      await onBeforeNavigate?.();
      const result = await createComputerTaskSession(nativeComputer.id, {kind: program ? "acp" : "terminal", program, request_id: crypto.randomUUID()});
      setOpen(false); router.push(portalHref(`/tasks/${encodeURIComponent(result.task_id)}?computerSession=${encodeURIComponent(result.session.id)}`));
    } catch (error) { setNativeError(error instanceof Error ? error.message : "打开会话失败"); }
    finally { setNativeBusy(false); }
  }
  const now = Date.now();
  /** "云端助手可用至 18:00" / "需要你在电脑前确认"; null on gateways without the route. */
  function modeLabel(mode: "cloud" | "device" | null, deviceId: string): string | null {
    if (mode === "cloud") {
      const until = cloudAgent.status === "ok" ? cloudAgent.devices.get(deviceId)?.until : null;
      return until ? tt(CLOUD_AGENT_COPY.cloudUntil, { time: formatClock(until, now) }) : tt(CLOUD_AGENT_COPY.cloudAvailable);
    }
    return mode === "device" ? tt(CLOUD_AGENT_COPY.needsYou) : null;
  }
  function modeHint(mode: "cloud" | "device" | null, deviceId: string): string | undefined {
    if (mode === "cloud") return tt(CLOUD_AGENT_COPY.cloudHint);
    if (mode !== "device") return undefined;
    const reason = cloudAgent.status === "ok" ? cloudAgent.devices.get(deviceId)?.reason : null;
    return tt(reason === "ai_busy" ? CLOUD_AGENT_COPY.aiBusy : reason === "cleanup_required" ? CLOUD_AGENT_COPY.healthCleanup
      : reason === "envelope_expired" ? CLOUD_AGENT_COPY.healthEnvelope : CLOUD_AGENT_COPY.needsYouHint);
  }
  const row = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none";
  const shown = target.kind === "cloud" ? tt("云端") : target.name;
  // Before Send, not after a refusal: the chosen computer will not run tasks.
  const selectedLocalOff = target.kind === "device" && selectedDevice?.device_id === target.id && localExecOff(selectedDevice);
  const localOffLabel = tt(LOCAL_AGENT_COPY.localExecOff);
  const localOffHint = tt(LOCAL_AGENT_COPY.localExecOffHint);
  // Which way the chosen computer will run the task, said before Send (design §7: labelled, never silent).
  const selectedMode = target.kind === "device" && !selectedLocalOff
    ? runModeOf(cloudAgent, target.id, selectedDevice?.device_id === target.id ? selectedDevice : null, now) : null;
  const selectedModeLabel = target.kind === "device" ? modeLabel(selectedMode, target.id) : null;
  const scopeLabel = target.kind === "device" && target.driver === "cloud" ? tt(CLOUD_AGENT_COPY[target.gui ? "scopeGui" : "scopeFiles"]) : null;
  const triggerNote = [selectedLocalOff ? localOffLabel : selectedModeLabel, scopeLabel].filter(Boolean).join(" · ");
  return <div className="relative" data-oceanleo-cc-dock data-execution-target={target.kind}>
    <button ref={anchor} type="button" onClick={() => { setGroup(target.kind === "device" ? "device" : "cloud"); setOpen(!open); }}
      aria-label={triggerNote ? `${tt("任务执行位置")} · ${triggerNote}` : tt("任务执行位置")} aria-haspopup="dialog" aria-expanded={open} data-oceanleo-cc-dock-trigger
      title={selectedLocalOff ? localOffHint : (target.kind === "device" && modeHint(selectedMode, target.id)) || tt("任务执行位置")}
      className={`flex h-7 ${triggerNote ? "max-w-[280px]" : "max-w-[180px]"} items-center gap-1.5 rounded-lg px-2 text-[12px] text-neutral-600 hover:bg-neutral-100`}>
      <TargetGlyph cloud={target.kind !== "device"} /><span className="truncate">{shown}</span>
      {selectedLocalOff && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700" data-local-exec-off>{localOffLabel}</span>}
      {scopeLabel && <span className="min-w-0 max-w-[140px] truncate" title={scopeLabel} data-task-gui-scope>{scopeLabel}</span>}
      {!selectedLocalOff && selectedModeLabel && <span data-cloud-agent={selectedMode ?? undefined}
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${selectedMode === "cloud" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{selectedModeLabel}</span>}
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <AnchoredPopover open={open} anchorRef={anchor} panelRef={panel} onClose={() => setOpen(false)} align="start" role="dialog" ariaLabel={tt("任务执行位置")}
      preferredPlacement="above" maxHeight={320} style={{ height: 320 }} initialFocusSelector='button[aria-expanded="true"]'
      className="z-[80] flex w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl">
      {/* Keep group controls still while the other column changes or loads. */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
        <div className="min-h-0 min-w-0 overflow-y-auto border-r border-neutral-100 pr-1.5">
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium text-neutral-500">{tt("在此设备上运行任务")}</p>
          <button type="button" className={`${row} ${group === "cloud" ? "bg-neutral-100" : ""}`} onMouseEnter={() => setGroup("cloud")} onFocus={() => setGroup("cloud")} onClick={() => setGroup("cloud")} aria-expanded={group === "cloud"}>
            <TargetGlyph cloud /><span className="min-w-0 flex-1 break-words">{tt("云端")}</span>{target.kind !== "device" && <span aria-label={tt("已选择")}>✓</span>}<span aria-hidden>›</span>
          </button>
          <button type="button" className={`${row} ${group === "device" ? "bg-neutral-100" : ""}`} onMouseEnter={() => setGroup("device")} onFocus={() => setGroup("device")} onClick={() => setGroup("device")} aria-expanded={group === "device"}>
            <TargetGlyph /><span className="min-w-0 flex-1 break-words">{tt("本地电脑")}</span>{target.kind === "device" && <span aria-label={tt("已选择")}>✓</span>}<span aria-hidden>›</span>
          </button>
          {target.kind === "device" && target.driver === "cloud" && <div className="border-t border-neutral-100 pt-1">
            <button type="button" className={row} aria-pressed={target.gui !== true} onClick={() => chooseGui(false)}>{target.gui !== true ? "✓ " : ""}{tt(CLOUD_AGENT_COPY.scopeFiles)}</button>
            <button type="button" className={row} aria-pressed={target.gui === true} onClick={() => chooseGui(true)}>{target.gui === true ? "✓ " : ""}{tt(CLOUD_AGENT_COPY.scopeGui)}</button>
          </div>}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col pl-1.5">
          <div className="min-h-0 flex-1 overflow-y-auto">
          {!owner ? <p className="px-3 py-3 text-[12px] text-neutral-500">{tt("请先登录")}</p> : <>
            {group === "cloud" && <>
              <button type="button" className={row} aria-pressed={target.kind === "cloud"} onClick={() => choose({ kind: "cloud" })}><TargetGlyph cloud /><span className="flex-1">{tt("默认云端")}</span>{target.kind === "cloud" && "✓"}</button>
              {nativeComputer ? <div><button type="button" className={row} onClick={() => setNativeComputer(null)}>‹ {tt("返回设备")}</button><p className="px-3 text-xs text-neutral-500">{nativeComputer.name}</p>{(["oceanleo", "cursor", "claude", "codex", "hermes", null] as const).map(program => <button type="button" key={program || "terminal"} className={row} disabled={nativeBusy} onClick={() => void openNative(program)}>{program ? PROGRAM_LABEL[program] : tt("终端")} · {tt(program ? nativePrograms.find(row=>row.id===program)?.installed ? "已安装" : nativePrograms.some(row=>row.id===program) ? "未安装" : "状态未知" : computerDisplayState(nativeComputer)==="ready" ? "在线" : "离线")}</button>)}{nativeError && <p role="alert" className="px-3 text-xs text-red-600">{nativeError}</p>}</div> : computers.filter(isConnectedComputer).map((item) => {
                const ready = computerDisplayState(item) === "ready";
                const selected = target.kind === "computer" && target.id === item.id;
                return <button key={item.id} type="button" className={`${row} disabled:opacity-50`} aria-pressed={selected} data-oceanleo-cc-switch-item={item.id} onClick={() => setNativeComputer(item)}>
                  <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-neutral-300"}`} /><span className="min-w-0 flex-1 truncate">{item.name}</span>{!ready && <span className="text-[11px] text-neutral-400">{tt("离线")}</span>}{selected && <span aria-label={tt("已选择")}>✓</span>}
                </button>;
              })}
            </>}
            {group === "device" && devices.map((item) => {
              const availability = (item as Device & { availability?: string }).availability;
              const ready = availability === "online" && item.online;
              const selected = target.kind === "device" && target.id === item.device_id;
              // Still selectable: the switch lives on that computer and the
              // user may be about to turn it on; Send explains a refusal.
              const off = ready && localExecOff(item);
              // One entry per computer; its label says which way the task will run.
              const mode = ready && !off ? runModeOf(cloudAgent, item.device_id, item, now) : null;
              const modeText = modeLabel(mode, item.device_id);
              return <button key={item.device_id} type="button" disabled={!ready} className={`${row} disabled:opacity-50`} aria-pressed={selected} data-oceanleo-device-client={item.device_id} data-local-exec-off={off ? "true" : undefined} data-cloud-agent={mode ?? undefined} title={off ? localOffHint : modeHint(mode, item.device_id)} onClick={() => choose({ kind: "device", id: item.device_id, name: item.device_name })}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? (off ? "bg-amber-400" : "bg-emerald-500") : "bg-neutral-300"}`} /><span className="min-w-0 flex-1 truncate">{item.device_name}</span>{!ready && <span className="text-[11px] text-neutral-400">{tt(availability === "offline" ? "离线" : availability === "signed_out" ? "未登录" : "状态未知")}</span>}{off && <span className="shrink-0 text-[11px] text-amber-700">{localOffLabel}</span>}{modeText && <span className={`shrink-0 text-[11px] ${mode === "cloud" ? "text-emerald-700" : "text-neutral-500"}`}>{modeText}</span>}{selected && <span aria-label={tt("已选择")}>✓</span>}
              </button>;
            })}
            {group === "device" && selectedLocalOff && <p className="px-3 py-2 text-[11px] leading-relaxed text-amber-700" data-local-exec-hint>{localOffHint}</p>}
            {group === "device" && !devices.length && !loading && <p className="px-3 py-3 text-[12px] text-neutral-500">{tt("暂无已连接的电脑")}</p>}
            {loading && <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载中…")}</p>}
            {error && <p role="status" className="px-3 py-2 text-[12px] text-neutral-500">{tt("设备列表暂不可用")}</p>}
          </>}
          </div>
          <div className="mt-1 shrink-0 border-t border-neutral-100 pt-1"><button type="button" className={row} onClick={() => { setOpen(false); router.push(portalHref("/devices")); }}><span aria-hidden>☷</span>{tt("管理设备")}</button></div>
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
