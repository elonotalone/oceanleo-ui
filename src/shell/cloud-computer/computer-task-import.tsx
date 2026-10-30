"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUI } from "../../i18n/ui/useUI";
import { portalHref } from "../../contracts/domain-family";
import { createComputerTaskSession, type ComputerTaskSession } from "../../lib/computer-task-api";

const PROGRAMS = ["oceanleo", "cursor", "claude", "codex", "hermes"];

/**
 * Legacy deep links (`/computers/<id>?card=…&program=…&session=…`, old `shell`
 * tasks) import only the native session they name into a task, then forward
 * once to `/tasks/<id>?computerSession=<managed id>`. It never enumerates CLI
 * history and never starts anything.
 */
export function ComputerTaskImport({ computerId, taskId, nativeSessionId, kind, program }: {
  computerId: string; taskId?: string; nativeSessionId?: string;
  kind?: ComputerTaskSession["kind"]; program?: ComputerTaskSession["program"];
}) {
  const tt = useUI();
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);
  const request = useRef<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    request.current ??= crypto.randomUUID();
    const card = params.get("card");
    const chosenKind = kind || (card === "terminal" ? "terminal" : card === "cli" ? "cli" : "acp");
    const raw = program || params.get("program") || "oceanleo";
    const chosenProgram = (PROGRAMS.includes(raw) ? raw : "oceanleo") as ComputerTaskSession["program"];
    const native = nativeSessionId || params.get("session") || undefined;
    void createComputerTaskSession(computerId, {
      kind: chosenKind, program: chosenKind === "terminal" ? null : chosenProgram,
      ...(taskId ? { task_id: taskId } : {}), ...(native ? { native_session_id: native } : {}),
      request_id: request.current,
    }).then((result) => router.replace(`/tasks/${encodeURIComponent(result.task_id)}?computerSession=${encodeURIComponent(result.session.id)}`))
      .catch(() => setFailed(true));
  }, [computerId, params, router, taskId, nativeSessionId, kind, program]);
  return <div className="grid h-full place-items-center p-6" data-computer-task-import>
    <div className="flex flex-col items-center gap-3 text-center text-[13px] text-stone-500" role={failed ? "alert" : "status"}>
      <span>{failed ? tt("这段对话暂时打不开，请稍后再试。") : tt("正在打开对话…")}</span>
      {failed ? <a href={portalHref("/devices")}
        className="rounded-xl border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-stone-50">{tt("管理设备")}</a> : null}
    </div>
  </div>;
}
