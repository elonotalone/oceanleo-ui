"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "../../../lib/auth/client";
import { writeExecutionTarget } from "../../../lib/execution-target";
import { useUI } from "../../../i18n/ui/useUI";
import { portalHref } from "../../../contracts/domain-family";
import { PROGRAM_LABEL } from "../agent-dialog/types";
import { getComputer, listComputers, listCliPrograms, type CliProgram, type Computer } from "../../../lib/cloud-computer-api";
import { createComputerTaskSession, listComputerTaskSessions, type ComputerTaskSession } from "../../../lib/computer-task-api";
import { ComputerSessionView } from "../task-workspace/ComputerSessionView";
import { computerDisplayState } from "../computer-state";
import { ComputerDock } from "../ComputerDock";
import type { ExecutionTarget } from "../../../lib/execution-target";
import { AnchoredPopover } from "../../anchored-popover";
const NO_NATIVE_COMPUTERS: Computer[] = [];
const programs = ["oceanleo", "cursor", "claude", "codex", "hermes"] as const;
export function ComputerTaskWorkspace({taskId, devicePickerOpen, onDevicePickerOpenChange, draftExecutionTarget, executionTarget, onExecutionTargetChange, nativeTask = false, taskResolved = true, cloud, settingsOpen, onSettingsOpenChange, onSettingsContent, onTaskCreated}: {
  devicePickerOpen?: boolean; onDevicePickerOpenChange?:(open:boolean)=>void;
  draftExecutionTarget?:ExecutionTarget;
  executionTarget?: ExecutionTarget|null; onExecutionTargetChange?:(target:ExecutionTarget)=>void;
  taskId?: string|null; nativeTask?: boolean; taskResolved?: boolean; cloud: ReactNode; settingsOpen: boolean;
  onSettingsOpenChange:(open:boolean)=>void; onSettingsContent:(content:ReactNode|null)=>void;
  onTaskCreated?:(taskId:string)=>void;
}) {
  const router=useRouter(); const tt=useUI();
  const [discoveryRetry,setDiscoveryRetry]=useState(0);
  const [discoveryFailed,setDiscoveryFailed]=useState(false);
  const [resolvedTask,setResolvedTask]=useState<string|null>(null);
  const [programStatus,setProgramStatus]=useState<CliProgram[]>([]);
  const [computers,setComputers]=useState<Computer[]>([]);
  const [sessions,setSessions]=useState<ComputerTaskSession[]>([]);
  const [active,setActive]=useState<string|null>(null);
  const [machine,setMachine]=useState<string|null>(null);
  const [program,setProgram]=useState<ComputerTaskSession["program"]>("oceanleo");
  const [localOpen,setLocalOpen]=useState(false);
  const open=devicePickerOpen ?? localOpen;
  const setOpen=onDevicePickerOpenChange ?? setLocalOpen;
  const [error,setError]=useState(""); const [creating,setCreating]=useState(false);
  const anchor=useRef<HTMLButtonElement>(null); const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{setProgramStatus([]); if(!machine)return;let alive=true;void listCliPrograms(machine).then(r=>{if(alive)setProgramStatus(r.programs);}).catch(()=>{});return()=>{alive=false;};},[machine]);
  const scope=useRef(taskId); scope.current=taskId;
  useEffect(()=>{ let alive=true; void listComputers().then(r=>{if(alive)setComputers(r.items);}).catch(()=>{if(alive)setError(tt("设备列表暂不可用，已保存会话仍可读取。"));});return()=>{alive=false;};},[]);
  useEffect(()=>{
    let alive=true; setDiscoveryFailed(false);setError("");setSessions([]);setActive(null);onSettingsOpenChange(false);
    if(taskId)void listComputerTaskSessions(taskId).then(async r=>{
      if(!alive)return;setSessions(r.sessions);
      const requested=new URLSearchParams(window.location.search).get("computerSession");
      setActive(requested === "cloud" ? null : r.sessions.find(s=>s.id===requested)?.id || r.sessions[0]?.id || null);
      setResolvedTask(taskId);
      const missing=[...new Set(r.sessions.map(s=>s.computer_id))];
      const rows=await Promise.allSettled(missing.map(id=>getComputer(id)));
      if(alive)setComputers(current=>{const map=new Map(current.map(c=>[c.id,c]));rows.forEach(r=>{if(r.status==="fulfilled")map.set(r.value.id,r.value);});return [...map.values()];});
    }).catch(e=>{if(alive){setDiscoveryFailed(true);setResolvedTask(taskId);setError(e instanceof Error?e.message:tt("读取会话失败"));}});
    return()=>{alive=false;};
  },[taskId,discoveryRetry]);
  const choose=useCallback((id:string|null)=>{
    setActive(id);onSettingsOpenChange(false);
    if(taskId){const url=new URL(window.location.href);if(id)url.searchParams.set("computerSession",id);else url.searchParams.set("computerSession","cloud");window.history.replaceState(window.history.state,"",url);}
  },[taskId,onSettingsOpenChange]);
  async function create(kind:ComputerTaskSession["kind"], chosenProgram = program, reuse = false, computerId = machine){
    if(!computerId || creating)return;const normalizedProgram=kind==="terminal"?null:chosenProgram;
    const existing = reuse && sessions.find(s=>s.computer_id===computerId && s.program===normalizedProgram && s.kind===kind);
    if(existing){choose(existing.id);setOpen(false);return;}
    const selectedTask=taskId;setCreating(true);setError("");
    try{const result=await createComputerTaskSession(computerId,{kind,program:kind==="terminal"?null:chosenProgram, ...(taskId?{task_id:taskId}:{}),request_id:crypto.randomUUID()});
      if(scope.current!==selectedTask)return;
      setSessions(current=>[...current,result.session]);choose(result.session.id);
      if(!taskId){onTaskCreated?.(result.task_id);router.push(`/tasks/${encodeURIComponent(result.task_id)}?computerSession=${encodeURIComponent(result.session.id)}`);}
    }catch(e){setError(e instanceof Error?e.message:tt("新建会话失败"));}finally{setCreating(false);}
  }
  const shownTarget=executionTarget ?? draftExecutionTarget;
  const targetLabel=shownTarget && shownTarget.kind!=="cloud" ? shownTarget.name : tt("云端 OceanLeo");
  const selected=sessions.find(s=>s.id===active);
  function chooseCloud(){ if(nativeTask){router.push(portalHref("/"));return;}if(!taskId){void getUserId().then(owner=>{if(owner){writeExecutionTarget(owner,{kind:"cloud"});onExecutionTargetChange?.({kind:"cloud"});}});}choose(null);setOpen(false); }
  const loading=Boolean(taskId && (resolvedTask!==taskId || !taskResolved));
  const button="shrink-0 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 disabled:opacity-40";
  return <div className="flex h-full min-h-0 flex-col" data-computer-task-workspace>
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-stone-200 p-2" aria-label={tt("设备与会话")}>
      {shownTarget && <ComputerDock boundTarget={shownTarget} />}
      <button ref={anchor} type="button" className={button} aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(!open)}>{tt("设备")} · {selected?.computer_name || targetLabel} ▾</button>
      <AnchoredPopover open={open} anchorRef={anchor} panelRef={panel} onClose={()=>setOpen(false)} role="dialog" ariaLabel={tt("选择设备与程序")} className="z-[80] w-[min(440px,calc(100vw-2rem))] rounded-xl border bg-white p-2 shadow-xl">
        {!machine?<><ComputerDock inline computers={NO_NATIVE_COMPUTERS} boundTarget={executionTarget} onTargetChange={onExecutionTargetChange} /><button type="button" className={`${button} block w-full text-left`} onClick={chooseCloud}>{taskId&&!nativeTask&&shownTarget&&shownTarget.kind!=="cloud" ? `${tt("任务对话")} · ${targetLabel}` : tt('云端 OceanLeo · 默认')}</button>{computers.map(c=><button type="button" key={c.id} className={`${button} block w-full text-left`} onClick={()=>setMachine(c.id)}>{c.name} · {computerDisplayState(c)==="ready"?tt("在线"):tt("离线 / 未就绪")} ›</button>)}<button type="button" className={button} onClick={()=>router.push(portalHref("/devices"))}>{tt('管理设备')}</button></>:<><button type="button" className={button} onClick={()=>setMachine(null)}>{tt('‹ 返回设备')}</button><p className="px-2 text-xs text-stone-500">{computers.find(c=>c.id===machine)?.name} · {tt("选择程序不会执行任务")}</p>{programs.map(p=><button type="button" key={p} aria-pressed={program===p} className={button} onClick={()=>{setProgram(p);void create("acp",p,true);setOpen(false);}}>{PROGRAM_LABEL[p]} · {tt(programStatus.find(row=>row.id===p)?.installed ? "已安装" : programStatus.some(row=>row.id===p) ? "未安装" : "状态未知")}</button>)}<button type="button" className={button} disabled={creating} onClick={()=>void create("terminal",null,true)}>{tt("终端")}</button><div className="mt-2 border-t pt-2"><button type="button" className={button} disabled={creating} onClick={()=>void create("acp")}>{tt('新建图形对话')}</button><button type="button" className={button} disabled={creating} onClick={()=>void create("cli")}>{tt('新建独立 CLI 会话')}</button><button type="button" className={button} disabled={creating} onClick={()=>void create("terminal")}>{tt('新建终端')}</button></div><p className="px-2 text-xs text-stone-500">{tt('CLI 是独立会话，不会接续图形对话。离线时可查看已保存内容。')}</p></>}
      </AnchoredPopover>
      <button type="button" className={button} aria-pressed={!active} onClick={chooseCloud}>{shownTarget&&shownTarget.kind!=="cloud" ? `${tt("任务对话")} · ${targetLabel}` : tt("云端 OceanLeo")}</button>
      {sessions.map(s=><button type="button" key={s.id} className={button} aria-pressed={active===s.id} onClick={()=>choose(s.id)}>{s.computer_name} · {s.program ? PROGRAM_LABEL[s.program] : tt("终端")} · {s.kind==="acp"?tt("图形"):s.kind==="cli"?tt("独立 CLI"):tt("终端")}</button>)}
      {selected&&<><button type="button" className={button} aria-pressed={selected.kind==="acp"} disabled={creating||!selected.program} onClick={()=>void create("acp",selected.program,true,selected.computer_id)}>{tt("对话")}</button><button type="button" className={button} aria-pressed={selected.kind==="cli"} disabled={creating||!selected.program} onClick={()=>void create("cli",selected.program,true,selected.computer_id)}>{tt("命令行")} · {tt("独立会话")}</button><button type="button" className={button} disabled={creating} onClick={()=>void create("terminal",null,true,selected.computer_id)}>{tt("终端")}</button><button type="button" className={`${button} ml-auto`} aria-pressed={settingsOpen} onClick={()=>onSettingsOpenChange(!settingsOpen)}>⚙ {tt("会话设置")}</button></>}
    </div>
    {loading&&<p role="status" className="p-3 text-xs">{tt("正在读取会话…")}</p>}
    {nativeTask&&!loading&&!active&&<button type="button" className={button} onClick={chooseCloud}>{tt("打开云端新任务")}</button>}
    {error&&<div role="alert" className="px-3 py-2 text-xs text-red-700">{error}{discoveryFailed&&<button type="button" className={button} onClick={()=>setDiscoveryRetry(v=>v+1)}>{tt("重试读取会话")}</button>}</div>}
    <div className="min-h-0 flex-1" hidden={Boolean(active)||loading||nativeTask}>{cloud}</div>
    {sessions.map(s=>{const computer=computers.find(c=>c.id===s.computer_id) || ({id:s.computer_id,name:s.computer_name,status:"removed",node_online:false} as Computer);return <div key={s.id} hidden={active!==s.id} className="min-h-0 flex-1"><ComputerSessionView computer={computer} session={s} active={active===s.id} settingsOpen={settingsOpen&&active===s.id} onSettingsContent={onSettingsContent} onNativeSessionChange={(id:string)=>setSessions(current=>current.map(row=>row.id===s.id?{...row,native_session_id:id}:row))} /></div>;})}
  </div>;
}
