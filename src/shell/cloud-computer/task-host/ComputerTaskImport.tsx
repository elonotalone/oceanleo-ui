"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createComputerTaskSession, type ComputerTaskSession } from "../../../lib/computer-task-api";
/** A legacy URL imports only its named native session; it never enumerates CLI history. */
export function ComputerTaskImport({computerId, taskId, nativeSessionId, kind, program}: {computerId:string;taskId?:string;nativeSessionId?:string;kind?:ComputerTaskSession["kind"];program?:ComputerTaskSession["program"]}) {
 const router=useRouter();const params=useSearchParams();const [error,setError]=useState("");
 const request=useRef<string|null>(null);const started=useRef(false);
 useEffect(()=>{if(started.current)return;started.current=true;request.current??=crypto.randomUUID();
 const card=params.get("card");const chosenKind=kind || (card==="terminal"?"terminal":card==="cli"?"cli":"acp");
 const raw=program || params.get("program") || "oceanleo";
 const chosenProgram=(["oceanleo","cursor","claude","codex","hermes"].includes(raw)?raw:"oceanleo") as ComputerTaskSession["program"];
 const native=nativeSessionId || params.get("session") || undefined;
 void createComputerTaskSession(computerId,{kind:chosenKind,program:chosenKind==="terminal"?null:chosenProgram,...(taskId?{task_id:taskId}:{}),...(native?{native_session_id:native}:{}),request_id:request.current}).then(r=>router.replace(`/tasks/${encodeURIComponent(r.task_id)}?computerSession=${encodeURIComponent(r.session.id)}`)).catch(e=>setError(e instanceof Error?e.message:"读取会话失败"));
 },[computerId,params,router,taskId,nativeSessionId,kind,program]);
 return <div className="grid h-full place-items-center p-6"><div role={error?"alert":"status"}>{error || "正在打开任务会话…"}{error&&<a href="/settings/devices" className="ml-3 underline">管理设备</a>}</div></div>;
}
