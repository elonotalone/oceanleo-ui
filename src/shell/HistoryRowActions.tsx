"use client";

import { useEffect, useState } from "react";
import { browserClient } from "../lib/auth/client";
import { useUI } from "../i18n/ui/useUI";
import { TaskActionsMenu } from "./TaskActionsMenu";

export function HistoryRowMenu(props: Omit<import("./TaskActionsMenu").TaskActionsMenuProps, "trigger">) {
  return <TaskActionsMenu {...props} />;
}

export interface MoveTaskProjectRow {
  id: string;
  name: string;
  icon?: string | null;
}
type ProjectRow = MoveTaskProjectRow;

export function MoveTaskProjectDialog({
  title,
  currentProjectId,
  onSelect,
  onClose,
}: {
  title: string;
  currentProjectId?: string | null;
  /** 第二个参数是选中的项目行（选「不属于任何项目」时为 null），供调用方乐观显示项目标注。 */
  onSelect: (projectId: string | null, project: MoveTaskProjectRow | null) => void;
  onClose: () => void;
}) {
  const tt = useUI();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 无依赖：项目列表与语言无关，换语言不该重新查一次 `agent_projects`。
  // 这里只存中文原文（词典 key）或 Supabase 原样返回的错误串，翻译推迟到渲染。
  useEffect(() => {
    const client = browserClient();
    if (!client) {
      setLoading(false);
      setError("项目列表不可用。");
      return;
    }
    let alive = true;
    void client
      .from("agent_projects")
      .select("id,name,icon")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!alive) return;
        setLoading(false);
        if (queryError) setError(queryError.message);
        else setProjects((data as ProjectRow[]) || []);
      });
    return () => {
      alive = false;
    };
  }, []);

  const row = (
    label: string,
    id: string | null,
    icon?: string | null,
  ) => {
    const selected = (currentProjectId || null) === id;
    return (
      <button
        key={id || "__none"}
        type="button"
        onClick={() =>
          onSelect(id, id ? projects.find((project) => project.id === id) ?? null : null)
        }
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] ${
          selected
            ? "bg-neutral-900 text-white"
            : "text-neutral-700 hover:bg-neutral-100"
        }`}
      >
        <span className="grid h-6 w-6 place-items-center rounded-md bg-black/5 text-sm">
          {icon || "◇"}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selected && <span className="text-[11px] text-white/70">{tt("当前")}</span>}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-neutral-900">
              {currentProjectId ? tt("换项目") : tt("移动到项目")}
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-neutral-400">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
            aria-label={tt("关闭")}
          >
            ✕
          </button>
        </div>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-[12px] text-neutral-400">
              {tt("加载…")}
            </p>
          ) : error ? (
            <p className="py-8 text-center text-[12px] text-rose-500">{tt(error)}</p>
          ) : (
            <>
              {row(tt("不属于任何项目"), null)}
              {projects.map((project) =>
                row(project.name || tt("未命名项目"), project.id, project.icon),
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
