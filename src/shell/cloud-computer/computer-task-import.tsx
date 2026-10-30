"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUI } from "../../i18n/ui/useUI";
import { portalHref } from "../../contracts/domain-family";
import { getUserId } from "../../lib/auth/client";
import { getComputer } from "../../lib/cloud-computer-api";
import { writeExecutionTarget } from "../../lib/execution-target";
import { createComputerTaskSession, type ComputerTaskSession } from "../../lib/computer-task-api";

const NATIVE_PROGRAMS = ["cursor", "claude", "codex", "hermes"];

/**
 * A request id that is the same for the same link, so reloading a legacy link
 * returns the session it created instead of making another empty task.
 */
export function legacyImportRequestId(parts: { computerId: string; kind: string; program: string | null; nativeSessionId?: string; taskId?: string }): string {
  const key = [parts.computerId, parts.kind, parts.program ?? "", parts.nativeSessionId ?? "", parts.taskId ?? ""].join("\u0000");
  // Two FNV-1a passes (different seeds) → 64 bits, plenty for one person's links.
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x01000193 + 2) >>> 0;
  }
  return `legacy-import-${parts.kind}-${a.toString(36)}${b.toString(36)}`;
}

/**
 * Legacy deep links (`/computers/<id>?card=…&program=…&session=…`, old `shell`
 * tasks) import only the native session they name into a task, then forward
 * once to `/tasks/<id>?computerSession=<managed id>`. A link without a native
 * program (or program "oceanleo") is the OceanLeo conversation on that computer:
 * it opens a new task with that computer chosen and creates no session. It never
 * enumerates CLI history and never starts anything.
 */
export function ComputerTaskImport({ computerId, taskId, nativeSessionId, kind, program }: {
  computerId: string; taskId?: string; nativeSessionId?: string;
  kind?: ComputerTaskSession["kind"]; program?: ComputerTaskSession["program"];
}) {
  const tt = useUI();
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const card = params.get("card");
    const chosenKind = kind || (card === "terminal" ? "terminal" : card === "cli" ? "cli" : "acp");
    const raw = program || params.get("program") || "";
    const nativeProgram = NATIVE_PROGRAMS.includes(raw) ? raw as ComputerTaskSession["program"] : null;
    const native = nativeSessionId || params.get("session") || undefined;
    if (chosenKind !== "terminal" && !nativeProgram) {
      // The OceanLeo conversation on this computer: the existing computer target, no native session.
      void (async () => {
        if (taskId) { router.replace(`/tasks/${encodeURIComponent(taskId)}`); return; }
        const [owner, computer] = await Promise.all([getUserId().catch(() => null), getComputer(computerId).catch(() => null)]);
        if (!owner || !computer) { setFailed(true); return; }
        writeExecutionTarget(owner, { kind: "computer", id: computer.id, name: computer.name || computer.id });
        router.replace("/");
      })();
      return;
    }
    const chosenProgram = chosenKind === "terminal" ? null : nativeProgram;
    void createComputerTaskSession(computerId, {
      kind: chosenKind, program: chosenProgram,
      ...(taskId ? { task_id: taskId } : {}), ...(native ? { native_session_id: native } : {}),
      request_id: legacyImportRequestId({ computerId, kind: chosenKind, program: chosenProgram, nativeSessionId: native, taskId }),
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
