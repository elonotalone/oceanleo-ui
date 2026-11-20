"use client";

// Attach menu of the LeoChat / session composer: the task composer's round "+" and the shared FloatingMenu.
// In a project session (`attachTaskCard`) it also offers "Task": a second page of the same popover with a
// searchable list of my tasks; picking one posts a task card (contract §2.2). No dialog.
import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { FloatingMenu, FloatingMenuItem } from "../../../ui/menu/FloatingMenu";
import {
  ArtifactGlyph,
  ChevronLeftGlyph,
  ChevronRightGlyph,
  PlusGlyph,
  ReplayGlyph,
  SearchGlyph,
  TaskGlyph,
  UploadGlyph,
} from "./icons";
import { filterTaskCardChoices, loadTaskCardChoices, type TaskCardChoice } from "./task-card";

export const ATTACH_BUTTON_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

type Page = "root" | "task";

export function AttachMenu({
  disabled,
  attachTaskCard,
  onUpload,
  onShareArtifact,
  onShareReplay,
  onPickTask,
  loadTasks = loadTaskCardChoices,
}: {
  disabled?: boolean;
  attachTaskCard?: boolean;
  onUpload: () => void;
  onShareArtifact: () => void;
  onShareReplay: () => void;
  /** Resolves when the card was posted; rejects to keep the list open. */
  onPickTask: (choice: TaskCardChoice) => Promise<void>;
  loadTasks?: (options: { signal?: AbortSignal }) => Promise<TaskCardChoice[]>;
}) {
  const tt = useUI();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>("root");

  const close = () => {
    setOpen(false);
    setPage("root");
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tt("发文件或作品")}
        title={tt("发文件或作品")}
        disabled={disabled}
        data-composer-attach=""
        className={`${ATTACH_BUTTON_CLASS} ${
          disabled
            ? "cursor-not-allowed border-neutral-200 text-neutral-300"
            : open
              ? "border-neutral-300 bg-neutral-100 text-neutral-800 active:scale-95 active:duration-[var(--leo-dur-1)]"
              : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700 active:scale-95 active:duration-[var(--leo-dur-1)]"
        }`}
      >
        <PlusGlyph />
      </button>
      <FloatingMenu
        open={open && !disabled}
        anchorRef={anchorRef}
        onClose={close}
        align="start"
        preferredPlacement="above"
        width={page === "task" ? 288 : 224}
        role={page === "task" ? "dialog" : "menu"}
        ariaLabel={page === "task" ? tt("选一个任务") : tt("发文件或作品")}
        attributes={{ "data-composer-attach-menu": page }}
        initialFocusSelector={page === "task" ? "input" : undefined}
      >
        {page === "root" ? (
          <>
            <FloatingMenuItem icon={<UploadGlyph />} label={tt("上传文件")} onSelect={run(onUpload)} />
            <FloatingMenuItem icon={<ArtifactGlyph />} label={tt("分享作品")} onSelect={run(onShareArtifact)} />
            <FloatingMenuItem icon={<ReplayGlyph />} label={tt("分享工作回放")} onSelect={run(onShareReplay)} />
            {attachTaskCard ? (
              <FloatingMenuItem
                icon={<TaskGlyph />}
                label={tt("任务")}
                trailing={<ChevronRightGlyph />}
                onSelect={() => setPage("task")}
              />
            ) : null}
          </>
        ) : (
          <TaskPage
            loadTasks={loadTasks}
            onBack={() => setPage("root")}
            onPick={async (choice) => {
              await onPickTask(choice);
              close();
            }}
          />
        )}
      </FloatingMenu>
    </>
  );
}

function TaskPage({
  loadTasks,
  onBack,
  onPick,
}: {
  loadTasks: (options: { signal?: AbortSignal }) => Promise<TaskCardChoice[]>;
  onBack: () => void;
  onPick: (choice: TaskCardChoice) => Promise<void>;
}) {
  const tt = useUI();
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<TaskCardChoice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadTasks({ signal: controller.signal })
      .then((list) => {
        if (!controller.signal.aborted) setChoices(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [loadTasks]);

  const shown = useMemo(() => (choices ? filterTaskCardChoices(choices, query) : []), [choices, query]);

  const pick = async (choice: TaskCardChoice) => {
    if (busyId) return;
    setBusyId(choice.id);
    try {
      await onPick(choice);
    } catch {
      setBusyId(null);
    }
  };

  return (
    <div data-composer-task-picker="">
      <div className="flex items-center gap-1 px-1 pb-1 pt-0.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={tt("返回")}
          className="rounded-lg p-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 active:scale-95"
        >
          <ChevronLeftGlyph />
        </button>
        <span className="text-[13px] font-medium text-neutral-800">{tt("任务")}</span>
      </div>
      <label className="mx-1 mb-1 flex h-8 items-center gap-2 rounded-lg border border-neutral-200 px-2.5 text-neutral-400 focus-within:border-neutral-300">
        <SearchGlyph />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tt("搜索我的任务")}
          aria-label={tt("搜索我的任务")}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
      </label>
      <div className="max-h-64 overflow-y-auto" role="listbox" aria-label={tt("任务")}>
        {failed ? (
          <p className="px-2.5 py-2 text-[12px] text-rose-600" role="alert">{tt("没能加载任务列表")}</p>
        ) : choices === null ? (
          <p className="px-2.5 py-2 text-[12px] text-neutral-400" role="status">{tt("加载中…")}</p>
        ) : shown.length === 0 ? (
          <p className="px-2.5 py-2 text-[12px] text-neutral-400" role="status">{tt("没有找到任务")}</p>
        ) : (
          shown.map((choice) => (
            <FloatingMenuItem
              key={choice.id}
              icon={<TaskGlyph />}
              label={choice.title || tt("未命名任务")}
              description={choice.project ?? undefined}
              disabled={busyId !== null && busyId !== choice.id}
              trailing={busyId === choice.id ? <span className="v-spinner text-[11px]" aria-hidden="true" /> : undefined}
              onSelect={() => void pick(choice)}
            />
          ))
        )}
      </div>
    </div>
  );
}
