"use client";

import { useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { FloatingMenu, FloatingMenuItem } from "../../ui/menu/FloatingMenu";

/** Contract 2026-11-20 §1.2: the effective mode of a task in a project. */
export type ProjectTaskMode = "private" | "view" | "collaborate";

export const PROJECT_TASK_MODES: readonly ProjectTaskMode[] = ["private", "view", "collaborate"];

/** Source keys of rw-tm-copy.ts; the word "Shared" is not used for tasks any more. */
export const PROJECT_TASK_MODE_LABEL: Record<ProjectTaskMode, string> = {
  private: "私有",
  view: "可查看",
  collaborate: "可协作",
};

const MODE_NOTE: Record<ProjectTaskMode, string> = {
  private: "只有你能看到这个任务",
  view: "项目成员可以实时查看",
  collaborate: "项目成员可以继续这个对话，费用由你承担",
};

export function isProjectTaskMode(value: unknown): value is ProjectTaskMode {
  return value === "private" || value === "view" || value === "collaborate";
}

export class ProjectTaskModeError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ProjectTaskModeError";
    this.code = code;
  }
}

/** PATCH /v1/projects/{id}/work/task/{taskId}/mode — only the task owner may call it. */
export async function setProjectTaskMode(projectId: string, taskId: string, mode: ProjectTaskMode, options: {
  fetchImpl?: typeof fetch; tokenImpl?: () => Promise<string | null>; base?: string;
} = {}): Promise<ProjectTaskMode> {
  const token = await (options.tokenImpl ?? accessToken)();
  if (!token) throw new ProjectTaskModeError("unauthorized");
  const url = `${options.base ?? GATEWAY_BASE}/v1/projects/${encodeURIComponent(projectId)}/work/task/${encodeURIComponent(taskId)}/mode`;
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "PATCH", cache: "no-store", credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  const body = await response.json().catch(() => null) as { item?: { project_mode?: unknown }; detail?: { code?: string } } | null;
  if (!response.ok) throw new ProjectTaskModeError(body?.detail?.code || `http_${response.status}`);
  const saved = body?.item?.project_mode;
  if (!isProjectTaskMode(saved)) throw new ProjectTaskModeError("invalid_response");
  return saved;
}

/** The task owner's Private / Can view / Can collaborate switch for a project task. */
export function ProjectTaskModeControl({ projectId, taskId, mode, onChange, save = setProjectTaskMode }: {
  projectId: string; taskId: string; mode: ProjectTaskMode;
  onChange: (mode: ProjectTaskMode) => void;
  save?: typeof setProjectTaskMode;
}) {
  const tt = useUI();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const choose = async (next: ProjectTaskMode) => {
    if (busy) return;
    if (next === mode) { setOpen(false); return; }
    setBusy(true); setFailure("");
    try {
      onChange(await save(projectId, taskId, next));
      setOpen(false);
    } catch (error) {
      const code = error instanceof ProjectTaskModeError ? error.code : "";
      setFailure(code === "project_mode_unavailable" ? "可协作暂不可用，请稍后再试。" : "任务模式未能更改，请重试。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-project-task-mode={mode}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${tt("任务模式")}: ${tt(PROJECT_TASK_MODE_LABEL[mode])}`}
        onClick={() => { setFailure(""); setOpen(value => !value); }}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600"
      >
        {tt(PROJECT_TASK_MODE_LABEL[mode])}
      </button>
      <FloatingMenu open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} ariaLabel={tt("任务模式")} width={260}>
        {PROJECT_TASK_MODES.map(option => (
          <FloatingMenuItem
            key={option}
            role="menuitemradio"
            selected={option === mode}
            disabled={busy}
            label={tt(PROJECT_TASK_MODE_LABEL[option])}
            description={tt(MODE_NOTE[option])}
            wrapDescription
            onSelect={() => void choose(option)}
          />
        ))}
        {failure && <p role="alert" className="px-2.5 py-1.5 text-[12px] text-rose-600">{tt(failure)}</p>}
      </FloatingMenu>
    </>
  );
}
