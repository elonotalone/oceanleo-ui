"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PROGRAM_LABEL } from "./agent-dialog/types";
import { cloudComputerApi, type CliProgram, type CloudComputerClient, type Computer, writeMountedComputerId, writeMountedComputerName } from "../../lib/cloud-computer-api";
import type { ComputerTaskSession } from "../../lib/computer-task-api";
import type { ConversationTarget, NativeProgram } from "../native-thread/types";
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
/** Menu order of the programs a connected computer can talk through. */
const NATIVE_PROGRAMS: NativeProgram[] = ["codex", "claude", "cursor", "hermes"];
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
function sameTarget(a: ExecutionTarget | null | undefined, b: ExecutionTarget): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind === "cloud" || (b.kind !== "cloud" && a.id === b.id);
}

type SessionKind = ComputerTaskSession["kind"];
/** The task's most recent conversation of this kind on that computer (reused instead of a new one). */
function existingSession(sessions: ComputerTaskSession[], computerId: string, kind: SessionKind, program: NativeProgram | null): ComputerTaskSession | undefined {
  return sessions
    .filter((row) => row.computer_id === computerId && row.kind === kind && (kind === "terminal" || row.program === program))
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))[0];
}
/** `listCliPrograms` row; newer gateways may add the sign-in probe the dialog already reads. */
type ProgramRow = CliProgram & { logged_in?: boolean | null; auth?: string };
type Drill = { id: string; name: string; program?: NativeProgram };

export type ComputerDockProps = {
  client?: CloudComputerClient;
  computers?: Computer[];
  /** The OceanLeo conversation's execution target (draft: remembered per account). */
  onTargetChange?: (target: ExecutionTarget) => void;
  /** undefined is a fresh draft; null is an existing task whose binding is not loaded yet. */
  boundTarget?: ExecutionTarget | null;
  /** The conversation shown now; omitted = the dock's own last pick (OceanLeo by default). */
  conversation?: ConversationTarget;
  /**
   * Given: a connected computer opens its own list (OceanLeo, Codex, Claude Code,
   * Cursor, Hermes, 终端). Not given: picking a computer only sets the OceanLeo
   * execution target, exactly as before. The dock never creates a session or navigates.
   */
  onConversationChange?: (conversation: ConversationTarget) => void;
  /** Conversations this task already has; picking one reuses it (`sessionId`). */
  taskSessions?: ComputerTaskSession[];
  /** Called before the dock's only navigation (管理设备). */
  onBeforeNavigate?: () => void | Promise<void>;
};

/** Composer-bar Device control: where the OceanLeo task runs, and which conversation of this task is shown. */
export function ComputerDock({ client = cloudComputerApi, computers: supplied, onTargetChange, boundTarget, conversation, onConversationChange, taskSessions, onBeforeNavigate }: ComputerDockProps) {
  const tt = useUI();
  const router = useRouter();
  const bound = boundTarget !== undefined;
  const drillable = Boolean(onConversationChange);
  const sessions = taskSessions ?? [];
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<"cloud" | "device">("cloud");
  const [drill, setDrill] = useState<Drill | null>(null);
  const [programs, setPrograms] = useState<{ id: string; rows: ProgramRow[] } | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [target, setTarget] = useState<ExecutionTarget>({ kind: "cloud" });
  // A pick made while the host does not control `conversation`.
  const [ownConversation, setOwnConversation] = useState<ConversationTarget | null>(null);
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
  /** The OceanLeo conversation's target: fixed for a task, remembered for a draft. */
  const oceanTarget: ExecutionTarget | null = bound ? boundTarget ?? null : target;
  const current: ConversationTarget | null = conversation ?? ownConversation ?? (oceanTarget ? { kind: "oceanleo", target: oceanTarget } : null);
  const selectedDeviceId = !bound && target.kind === "device" ? target.id : "";

  useEffect(() => {
    let alive = true;
    let revision = 0;
    async function hydrate() {
      const ticket = ++revision;
      const id = await getUserId().catch(() => null);
      if (!alive || ticket !== revision) return;
      // Another account's availability must never decide this account's mode.
      if (id !== owner) setCloudAgent(UNKNOWN);
      setOwner(id);
      if (!bound) { const selected = readExecutionTarget(id); setTarget(selected); onTargetChange?.(selected); }
      setOwnConversation(null); setDrill(null);
      setDevices([]); setComputers(supplied || []); setOpen(false);
    }
    function changed(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string; target?: ExecutionTarget }>).detail;
      if (!bound && detail?.userId === owner && detail.target) { setTarget(detail.target); onTargetChange?.(detail.target); }
    }
    void hydrate();
    window.addEventListener("oceanleo:auth-state", hydrate);
    window.addEventListener(EXECUTION_TARGET_EVENT, changed);
    return () => { alive = false; window.removeEventListener("oceanleo:auth-state", hydrate); window.removeEventListener(EXECUTION_TARGET_EVENT, changed); };
  }, [owner, supplied, onTargetChange, bound]);

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

  // Install / sign-in state of the programs on the computer being browsed.
  const drillId = drill?.id ?? "";
  const drillComputer = drill ? computers.find((item) => item.id === drill.id) ?? null : null;
  const drillReady = drillComputer ? computerDisplayState(drillComputer) === "ready" : null;
  useEffect(() => {
    if (!open || !drillId || drillReady !== true || !client.listCliPrograms) return;
    let alive = true;
    void client.listCliPrograms(drillId)
      .then((result) => { if (alive) setPrograms({ id: drillId, rows: (result.programs || []) as ProgramRow[] }); })
      .catch(() => { /* unknown state: rows stay selectable without a note */ });
    return () => { alive = false; };
  }, [open, drillId, drillReady, client]);

  // Moving between levels keeps keyboard focus inside the panel.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>(drill ? "[data-dock-back]" : 'button[aria-expanded="true"]')?.focus();
  }, [open, drill]);

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
    if (bound || !owner || target.kind !== "device") return;
    const next = deriveTarget(target, cloudAgent, selectedDevice?.device_id === target.id ? selectedDevice : null, Date.now());
    if (next === target) return;
    writeExecutionTarget(owner, next);
    onTargetChange?.(next);
    setTarget(next);
  }, [bound, owner, target, cloudAgent, selectedDevice, clock, onTargetChange]);

  // The permission set at the computer ends at `until`: re-derive right after it.
  useEffect(() => {
    if (bound || target.kind !== "device" || cloudAgent.status !== "ok") return;
    const until = cloudAgent.devices.get(target.id)?.until;
    const delay = until ? until - Date.now() : 0;
    if (delay <= 0 || delay > 86_400_000) return;
    const timer = setTimeout(() => setClock(Date.now()), delay + 500);
    return () => clearTimeout(timer);
  }, [bound, target, cloudAgent]);

  function close() { setOpen(false); setDrill(null); }
  function emit(next: ConversationTarget) {
    setOwnConversation(next.kind === "oceanleo" ? null : next);
    onConversationChange?.(next);
    close();
  }

  function chooseGui(gui: boolean) {
    if (bound || target.kind !== "device" || target.driver !== "cloud") return;
    const next = {...target, gui};
    setTarget(next);
    onTargetChange?.(next);
    if (current?.kind === "oceanleo") onConversationChange?.({ kind: "oceanleo", target: next });
  }

  /** The OceanLeo conversation. A task keeps its own target; only a draft can move it. */
  function choose(next: ExecutionTarget) {
    if (bound) { if (boundTarget && sameTarget(boundTarget, next)) emit({ kind: "oceanleo", target: boundTarget }); return; }
    if (!owner) return;
    const device = next.kind === "device" ? devices.find((d) => d.device_id === next.id) ?? null : null;
    const picked = deriveTarget(next, cloudAgent, device, Date.now());
    writeExecutionTarget(owner, picked);
    writeMountedComputerId(picked.kind === "computer" ? picked.id : null);
    writeMountedComputerName(picked.kind === "computer" ? picked.name : null);
    onTargetChange?.(picked);
    setSelectedDevice(device);
    setTarget(picked);
    emit({ kind: "oceanleo", target: picked });
  }
  function chooseNative(computer: Drill, program: NativeProgram, view: "chat" | "cli") {
    const reuse = existingSession(sessions, computer.id, view === "chat" ? "acp" : "cli", program);
    emit({ kind: "native", computerId: computer.id, computerName: computer.name, program, view, ...(reuse ? { sessionId: reuse.id } : {}) });
  }
  function chooseTerminal(computer: Drill) {
    const reuse = existingSession(sessions, computer.id, "terminal", null);
    emit({ kind: "terminal", computerId: computer.id, computerName: computer.name, ...(reuse ? { sessionId: reuse.id } : {}) });
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
  function programNote(program: NativeProgram): string | null {
    if (drillReady === false) return tt("离线");
    const row = programs?.id === drillId ? programs.rows.find((item) => item.id === program) : undefined;
    if (!row) return null;
    if (!row.installed) return tt("未安装");
    return row.logged_in === false || row.auth === "none" ? tt("需要登录") : null;
  }

  const row = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none";
  const selectedMark = <span aria-label={tt("已选择")}>✓</span>;
  const existsMark = <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" role="img" aria-label={tt("本任务已有")} data-dock-exists />;
  const lockedHint = tt("要换执行位置，请新建任务");
  const onOcean = current?.kind === "oceanleo";
  const onComputer = (id: string) => current !== null && current.kind !== "oceanleo" && current.computerId === id;
  // The OceanLeo row for this target: ✓ while shown; in a task, a dot while another conversation is shown.
  function oceanMark(candidate: ExecutionTarget) {
    if (!sameTarget(oceanTarget, candidate)) return null;
    return onOcean ? selectedMark : bound ? existsMark : null;
  }
  function oceanLocked(candidate: ExecutionTarget): boolean { return bound && !(boundTarget && sameTarget(boundTarget, candidate)); }

  // Before Send, not after a refusal: the chosen computer will not run tasks.
  const selectedLocalOff = !bound && target.kind === "device" && selectedDevice?.device_id === target.id && localExecOff(selectedDevice);
  const localOffLabel = tt(LOCAL_AGENT_COPY.localExecOff);
  const localOffHint = tt(LOCAL_AGENT_COPY.localExecOffHint);
  // Which way the chosen computer will run the task, said before Send (design §7: labelled, never silent).
  const selectedMode = !bound && target.kind === "device" && !selectedLocalOff
    ? runModeOf(cloudAgent, target.id, selectedDevice?.device_id === target.id ? selectedDevice : null, now) : null;
  const selectedModeLabel = !bound && target.kind === "device" ? modeLabel(selectedMode, target.id) : null;
  const scopeLabel = oceanTarget?.kind === "device" && oceanTarget.driver === "cloud" && (!bound || typeof oceanTarget.gui === "boolean")
    ? tt(CLOUD_AGENT_COPY[oceanTarget.gui ? "scopeGui" : "scopeFiles"]) : null;

  // Trigger: the conversation shown now.
  const native = current && current.kind !== "oceanleo" ? current : null;
  const shown = native
    ? [native.computerName, native.kind === "terminal" ? tt("终端") : PROGRAM_LABEL[native.program], native.kind === "native" && native.view === "cli" ? tt("命令行") : null].filter(Boolean).join(" · ")
    : oceanTarget ? (oceanTarget.kind === "cloud" ? tt("云端") : oceanTarget.name) : tt("正在加载…");
  const triggerNote = native ? "" : [selectedLocalOff ? localOffLabel : selectedModeLabel, scopeLabel].filter(Boolean).join(" · ");
  const triggerTitle = native ? tt("任务执行位置")
    : bound ? `${scopeLabel ? `${scopeLabel} · ` : ""}${tt(CLOUD_AGENT_COPY.scopeNewTask)}`
    : selectedLocalOff ? localOffHint : (target.kind === "device" && modeHint(selectedMode, target.id)) || tt("任务执行位置");

  function openPicker() {
    if (open) { close(); return; }
    setGroup(onOcean && oceanTarget?.kind === "device" ? "device" : "cloud");
    setDrill(native && drillable ? { id: native.computerId, name: native.computerName } : null);
    setOpen(true);
  }

  function renderDrill(computer: Drill) {
    const ready = drillReady;
    const offline = ready === false ? <span className="shrink-0 text-[11px] text-neutral-400">{tt("离线")}</span> : null;
    const dot = (ok: boolean) => <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-neutral-300"}`} />;
    if (computer.program) {
      const program = computer.program;
      const views = [["chat", tt("对话"), null], ["cli", tt("命令行"), tt("在这台电脑的命令行里继续，记录和对话分开")]] as const;
      return <div data-dock-level="program" data-dock-program={program}>
        <button type="button" className={`${row} font-medium`} data-dock-back aria-label={`${tt("返回")} · ${computer.name}`} onClick={() => setDrill({ id: computer.id, name: computer.name })}>
          <span aria-hidden="true">‹</span><span className="min-w-0 flex-1 truncate">{PROGRAM_LABEL[program]}</span>
        </button>
        {views.map(([view, label, hint]) => {
          const isCurrent = current?.kind === "native" && current.computerId === computer.id && current.program === program && current.view === view;
          const exists = Boolean(existingSession(sessions, computer.id, view === "chat" ? "acp" : "cli", program));
          return <button key={view} type="button" className={`${row} items-start`} aria-pressed={isCurrent} data-dock-view={view} onClick={() => chooseNative(computer, program, view)}>
            <span className="min-w-0 flex-1"><span className="block">{label}</span>{hint && <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{hint}</span>}</span>
            {offline}{isCurrent ? selectedMark : exists ? existsMark : null}
          </button>;
        })}
      </div>;
    }
    const ocean: ExecutionTarget = { kind: "computer", id: computer.id, name: computer.name };
    const oceanDisabled = bound ? oceanLocked(ocean) : ready !== true;
    const terminalCurrent = current?.kind === "terminal" && current.computerId === computer.id;
    return <div data-dock-level="computer" data-dock-computer={computer.id}>
      <button type="button" className={`${row} font-medium`} data-dock-back aria-label={tt("返回")} onClick={() => setDrill(null)}>
        <span aria-hidden="true">‹</span><span className="min-w-0 flex-1 truncate">{computer.name}</span>
      </button>
      <button type="button" className={`${row} disabled:opacity-50`} disabled={oceanDisabled} aria-pressed={onOcean && sameTarget(oceanTarget, ocean)} data-dock-program-row="oceanleo"
        title={bound && oceanDisabled ? lockedHint : undefined} onClick={() => choose(ocean)}>
        {dot(ready === true)}<span className="min-w-0 flex-1 truncate">OceanLeo</span>{offline}{oceanMark(ocean)}
      </button>
      {NATIVE_PROGRAMS.map((program) => {
        const note = programNote(program);
        const isCurrent = current?.kind === "native" && current.computerId === computer.id && current.program === program;
        const exists = sessions.some((item) => item.computer_id === computer.id && item.program === program && (item.kind === "acp" || item.kind === "cli"));
        return <button key={program} type="button" className={row} aria-pressed={isCurrent} data-dock-program-row={program} onClick={() => setDrill({ ...computer, program })}>
          {dot(ready === true && !note && programs?.id === computer.id)}<span className="min-w-0 flex-1 truncate">{PROGRAM_LABEL[program]}</span>
          {note && <span className="shrink-0 text-[11px] text-neutral-400">{note}</span>}{isCurrent ? selectedMark : exists ? existsMark : null}<span aria-hidden="true">›</span>
        </button>;
      })}
      <button type="button" className={row} aria-pressed={terminalCurrent} data-dock-program-row="terminal" onClick={() => chooseTerminal(computer)}>
        {dot(ready === true)}<span className="min-w-0 flex-1 truncate">{tt("终端")}</span>{offline}
        {terminalCurrent ? selectedMark : existingSession(sessions, computer.id, "terminal", null) ? existsMark : null}
      </button>
    </div>;
  }

  return <div className="relative" data-oceanleo-cc-dock data-execution-target={oceanTarget?.kind ?? "loading"} data-conversation={current?.kind}>
    <button ref={anchor} type="button" onClick={openPicker}
      aria-label={triggerNote ? `${tt("任务执行位置")} · ${triggerNote}` : tt("任务执行位置")} aria-haspopup="dialog" aria-expanded={open} data-oceanleo-cc-dock-trigger
      data-task-bound-target={bound && !native ? "" : undefined} title={triggerTitle}
      className={`flex h-7 ${triggerNote || native ? "max-w-[280px]" : "max-w-[180px]"} items-center gap-1.5 rounded-lg px-2 text-[12px] text-neutral-600 hover:bg-neutral-100`}>
      <TargetGlyph cloud={!native && oceanTarget?.kind !== "device"} /><span className="truncate">{shown}</span>
      {selectedLocalOff && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700" data-local-exec-off>{localOffLabel}</span>}
      {!native && scopeLabel && <span className="min-w-0 max-w-[140px] truncate" title={scopeLabel} data-task-gui-scope>{scopeLabel}</span>}
      {!selectedLocalOff && selectedModeLabel && !native && <span data-cloud-agent={selectedMode ?? undefined}
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${selectedMode === "cloud" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{selectedModeLabel}</span>}
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <AnchoredPopover open={open} anchorRef={anchor} panelRef={panel} onClose={close} align="start" role="dialog" ariaLabel={tt("任务执行位置")}
      preferredPlacement="above" maxHeight={320} style={{ height: 320 }} initialFocusSelector='button[aria-expanded="true"]'
      className="z-[80] flex w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl">
      {/* Keep group controls still while the other column changes or loads. */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
        <div className="min-h-0 min-w-0 overflow-y-auto border-r border-neutral-100 pr-1.5">
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium text-neutral-500">{tt("在此设备上运行任务")}</p>
          <button type="button" className={`${row} ${group === "cloud" ? "bg-neutral-100" : ""}`} onMouseEnter={() => setGroup("cloud")} onFocus={() => setGroup("cloud")} onClick={() => { setGroup("cloud"); setDrill(null); }} aria-expanded={group === "cloud"}>
            <TargetGlyph cloud /><span className="min-w-0 flex-1 break-words">{tt("云端")}</span>{(native || (onOcean && oceanTarget && oceanTarget.kind !== "device")) && selectedMark}<span aria-hidden>›</span>
          </button>
          <button type="button" className={`${row} ${group === "device" ? "bg-neutral-100" : ""}`} onMouseEnter={() => setGroup("device")} onFocus={() => setGroup("device")} onClick={() => setGroup("device")} aria-expanded={group === "device"}>
            <TargetGlyph /><span className="min-w-0 flex-1 break-words">{tt("本地电脑")}</span>{onOcean && oceanTarget?.kind === "device" && selectedMark}<span aria-hidden>›</span>
          </button>
          {!bound && target.kind === "device" && target.driver === "cloud" && <div className="border-t border-neutral-100 pt-1">
            <button type="button" className={row} aria-pressed={target.gui !== true} onClick={() => chooseGui(false)}>{target.gui !== true ? "✓ " : ""}{tt(CLOUD_AGENT_COPY.scopeFiles)}</button>
            <button type="button" className={row} aria-pressed={target.gui === true} onClick={() => chooseGui(true)}>{target.gui === true ? "✓ " : ""}{tt(CLOUD_AGENT_COPY.scopeGui)}</button>
          </div>}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col pl-1.5">
          <div className="min-h-0 flex-1 overflow-y-auto">
          {!owner ? <p className="px-3 py-3 text-[12px] text-neutral-500">{tt("请先登录")}</p> : <>
            {group === "cloud" && (drill && drillable ? renderDrill(drill) : <>
              <button type="button" className={`${row} disabled:opacity-50`} disabled={oceanLocked({ kind: "cloud" })} title={oceanLocked({ kind: "cloud" }) ? lockedHint : undefined}
                aria-pressed={onOcean && oceanTarget?.kind === "cloud"} onClick={() => choose({ kind: "cloud" })}>
                <TargetGlyph cloud /><span className="flex-1">{tt("默认云端")}</span>{oceanMark({ kind: "cloud" })}
              </button>
              {computers.filter(isConnectedComputer).map((item) => {
                const ready = computerDisplayState(item) === "ready";
                const asTarget: ExecutionTarget = { kind: "computer", id: item.id, name: item.name };
                if (drillable) {
                  const here = onComputer(item.id) || (onOcean && sameTarget(oceanTarget, asTarget));
                  return <button key={item.id} type="button" className={row} aria-pressed={here} data-oceanleo-cc-switch-item={item.id} onClick={() => setDrill({ id: item.id, name: item.name })}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? "bg-emerald-500" : "bg-neutral-300"}`} /><span className="min-w-0 flex-1 truncate">{item.name}</span>{!ready && <span className="text-[11px] text-neutral-400">{tt("离线")}</span>}{here && selectedMark}<span aria-hidden>›</span>
                  </button>;
                }
                const locked = oceanLocked(asTarget);
                return <button key={item.id} type="button" disabled={bound ? locked : !ready} title={locked ? lockedHint : undefined} className={`${row} disabled:opacity-50`} aria-pressed={onOcean && sameTarget(oceanTarget, asTarget)} data-oceanleo-cc-switch-item={item.id} onClick={() => choose(asTarget)}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? "bg-emerald-500" : "bg-neutral-300"}`} /><span className="min-w-0 flex-1 truncate">{item.name}</span>{!ready && <span className="text-[11px] text-neutral-400">{tt("离线")}</span>}{oceanMark(asTarget)}
                </button>;
              })}
            </>)}
            {group === "device" && devices.map((item) => {
              const availability = (item as Device & { availability?: string }).availability;
              const ready = availability === "online" && item.online;
              const asTarget: ExecutionTarget = { kind: "device", id: item.device_id, name: item.device_name };
              const locked = oceanLocked(asTarget);
              // Still selectable: the switch lives on that computer and the
              // user may be about to turn it on; Send explains a refusal.
              const off = ready && localExecOff(item);
              // One entry per computer; its label says which way the task will run.
              const mode = ready && !off && !bound ? runModeOf(cloudAgent, item.device_id, item, now) : null;
              const modeText = modeLabel(mode, item.device_id);
              return <button key={item.device_id} type="button" disabled={bound ? locked : !ready} className={`${row} disabled:opacity-50`} aria-pressed={onOcean && sameTarget(oceanTarget, asTarget)} data-oceanleo-device-client={item.device_id} data-local-exec-off={off ? "true" : undefined} data-cloud-agent={mode ?? undefined} title={locked ? lockedHint : off ? localOffHint : modeHint(mode, item.device_id)} onClick={() => choose(asTarget)}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? (off ? "bg-amber-400" : "bg-emerald-500") : "bg-neutral-300"}`} /><span className="min-w-0 flex-1 truncate">{item.device_name}</span>{!ready && <span className="text-[11px] text-neutral-400">{tt(availability === "offline" ? "离线" : availability === "signed_out" ? "未登录" : "状态未知")}</span>}{off && <span className="shrink-0 text-[11px] text-amber-700">{localOffLabel}</span>}{modeText && <span className={`shrink-0 text-[11px] ${mode === "cloud" ? "text-emerald-700" : "text-neutral-500"}`}>{modeText}</span>}{oceanMark(asTarget)}
              </button>;
            })}
            {group === "device" && selectedLocalOff && <p className="px-3 py-2 text-[11px] leading-relaxed text-amber-700" data-local-exec-hint>{localOffHint}</p>}
            {group === "device" && !devices.length && !loading && <p className="px-3 py-3 text-[12px] text-neutral-500">{tt("暂无已连接的电脑")}</p>}
            {loading && <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载中…")}</p>}
            {error && <p role="status" className="px-3 py-2 text-[12px] text-neutral-500">{tt("设备列表暂不可用")}</p>}
          </>}
          </div>
          <div className="mt-1 shrink-0 border-t border-neutral-100 pt-1"><button type="button" className={row} onClick={() => { close(); void Promise.resolve(onBeforeNavigate?.()).catch(() => {}).finally(() => router.push(portalHref("/devices"))); }}><span aria-hidden>☷</span>{tt("管理设备")}</button></div>
        </div>
      </div>
    </AnchoredPopover>
  </div>;
}
export function TargetGlyph({ cloud = false }: { cloud?: boolean }) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {cloud ? <path d="M6 18a4 4 0 0 1-.5-8A6.5 6.5 0 0 1 18 8a5 5 0 0 1 0 10Z" /> : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>}
  </svg>;
}
