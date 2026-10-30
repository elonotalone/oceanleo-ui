"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getComputer, listComputers, type Computer } from "../../../lib/cloud-computer-api";
import { createComputerTaskSession, listComputerTaskSessions, type ComputerTaskSession } from "../../../lib/computer-task-api";
import { ComputerSessionView } from "../task-workspace/ComputerSessionView";
import { computerDisplayState } from "../computer-state";
import { AnchoredPopover } from "../../anchored-popover";
const programs = ["oceanleo", "cursor", "claude", "codex", "hermes"] as const;
export function ComputerTaskWorkspace({taskId, cloud, settingsOpen, onSettingsOpenChange, onSettingsContent, onTaskCreated}: {
  taskId?: string|null; cloud: ReactNode; settingsOpen: boolean;
  onSettingsOpenChange:(open:boolean)=>void; onSettingsContent:(content:ReactNode|null)=>void;
  onTaskCreated?:(taskId:string)=>void;
}) {
  const router=useRouter();
  const [computers,setComputers]=useState<Computer[]>([]);
  const [sessions,setSessions]=useState<ComputerTaskSession[]>([]);
  const [active,setActive]=useState<string|null>(null);
  const [machine,setMachine]=useState<string|null>(null);
  const [program,setProgram]=useState<ComputerTaskSession["program"]>("oceanleo");
  const [open,setOpen]=useState(false);
  const [error,setError]=useState(""); const [creating,setCreating]=useState(false);
  const anchor=useRef<HTMLButtonElement>(null); const panel=useRef<HTMLDivElement>(null);
  const scope=useRef(taskId); scope.current=taskId;
  useEffect(()=>{ let alive=true; void listComputers().then(r=>{if(alive)setComputers(r.items);}).catch(()=>{if(alive)setError("设备列表暂不可用，已保存会话仍可读取。");});return()=>{alive=false;};},[]);
  useEffect(()=>{
    let alive=true; setSessions([]);setActive(null);onSettingsOpenChange(false);
    if(taskId)void listComputerTaskSessions(taskId).then(async r=>{
      if(!alive)return;setSessions(r.sessions);
      const requested=new URLSearchParams(window.location.search).get("computerSession");
      setActive(r.sessions.find(s=>s.id===requested)?.id || r.sessions[0]?.id || null);
      const missing=[...new Set(r.sessions.map(s=>s.computer_id))];
      const rows=await Promise.allSettled(missing.map(id=>getComputer(id)));
      if(alive)setComputers(current=>{const map=new Map(current.map(c=>[c.id,c]));rows.forEach(r=>{if(r.status==="fulfilled")map.set(r.value.id,r.value);});return [...map.values()];});
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:"读取会话失败");});
    return()=>{alive=false;};
  },[taskId]);
  const choose=useCallback((id:string|null)=>{
    setActive(id);onSettingsOpenChange(false);
    if(taskId){const url=new URL(window.location.href);if(id)url.searchParams.set("computerSession",id);else url.searchParams.delete("computerSession");window.history.replaceState(window.history.state,"",url);}
  },[taskId,onSettingsOpenChange]);
  async function create(kind:ComputerTaskSession["kind"], chosenProgram = program, reuse = false){
    if(!machine || creating)return;const existing = reuse && sessions.find(s=>s.computer_id===machine && s.program===chosenProgram && s.kind===kind);
    if(existing){choose(existing.id);setOpen(false);return;}
    const selectedTask=taskId;setCreating(true);setError("");
    try{const result=await createComputerTaskSession(machine,{kind,program:kind==="terminal"?null:chosenProgram, ...(taskId?{task_id:taskId}:{}),request_id:crypto.randomUUID()});
      if(scope.current!==selectedTask)return;
      setSessions(current=>[...current,result.session]);choose(result.session.id);
      if(!taskId){onTaskCreated?.(result.task_id);router.push(`/tasks/${encodeURIComponent(result.task_id)}?computerSession=${encodeURIComponent(result.session.id)}`);}
    }catch(e){setError(e instanceof Error?e.message:"新建会话失败");}finally{setCreating(false);}
  }
  const selected=sessions.find(s=>s.id===active);
  const button="rounded-lg px-2 py-1.5 text-xs hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 disabled:opacity-40";
  return <div className="flex h-full min-h-0 flex-col" data-computer-task-workspace>
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-stone-200 p-2" aria-label="设备与会话">
      <button ref={anchor} type="button" className={button} aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(!open)}>设备 · {selected?.computer_name || "云端 OceanLeo"} ▾</button>
      <AnchoredPopover open={open} anchorRef={anchor} panelRef={panel} onClose={()=>setOpen(false)} role="dialog" ariaLabel="选择设备与程序" className="z-[80] w-80 rounded-xl border bg-white p-2 shadow-xl">
        {!machine?<><button type="button" className={`${button} block w-full text-left`} onClick={()=>{choose(null);setOpen(false);}}>云端 OceanLeo · 默认</button>{computers.map(c=><button type="button" key={c.id} className={`${button} block w-full text-left`} onClick={()=>setMachine(c.id)}>{c.name} · {computerDisplayState(c)==="ready"?"在线":"离线 / 未就绪"} ›</button>)}<button type="button" className={button} onClick={()=>router.push("/settings/devices")}>管理设备</button></>:<><button type="button" className={button} onClick={()=>setMachine(null)}>‹ 返回设备</button><p className="px-2 text-xs text-stone-500">{computers.find(c=>c.id===machine)?.name} · 选择程序不会执行任务</p>{programs.map(p=><button type="button" key={p} aria-pressed={program===p} className={button} onClick={()=>{setProgram(p);void create("acp",p,true);setOpen(false);}}>{p}</button>)}<div className="mt-2 border-t pt-2"><button type="button" className={button} disabled={creating} onClick={()=>void create("acp")}>新建图形对话</button><button type="button" className={button} disabled={creating} onClick={()=>void create("cli")}>新建独立 CLI 会话</button><button type="button" className={button} disabled={creating} onClick={()=>void create("terminal")}>新建终端</button></div><p className="px-2 text-xs text-stone-500">CLI 是独立会话，不会接续图形对话。离线时可查看已保存内容。</p></>}
      </AnchoredPopover>
      <button type="button" className={button} aria-pressed={!active} onClick={()=>choose(null)}>云端 OceanLeo</button>
      {sessions.map(s=><button type="button" key={s.id} className={button} aria-pressed={active===s.id} onClick={()=>choose(s.id)}>{s.computer_name} · {s.program || "终端"} · {s.kind==="acp"?"图形":s.kind==="cli"?"独立 CLI":"终端"}</button>)}
      {selected&&<button type="button" className={`${button} ml-auto`} aria-pressed={settingsOpen} onClick={()=>onSettingsOpenChange(!settingsOpen)}>⚙ 会话设置</button>}
    </div>
    {error&&<p role="alert" className="px-3 py-2 text-xs text-red-700">{error}</p>}
    <div className="min-h-0 flex-1" hidden={Boolean(active)}>{cloud}</div>
    {sessions.map(s=>{const computer=computers.find(c=>c.id===s.computer_id) || ({id:s.computer_id,name:s.computer_name,status:"removed",node_online:false} as Computer);return <div key={s.id} hidden={active!==s.id} className="min-h-0 flex-1"><ComputerSessionView computer={computer} session={s} active={active===s.id} settingsOpen={settingsOpen&&active===s.id} onSettingsContent={onSettingsContent} onNativeSessionChange={(id:string)=>setSessions(current=>current.map(row=>row.id===s.id?{...row,native_session_id:id}:row))} /></div>;})}
  </div>;
}
