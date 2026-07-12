"use client";

import { useEffect, useRef, useState } from "react";
import { browserClient } from "../lib/auth/client";
import { useUI } from "../i18n/ui/useUI";

export function HistoryRowMenu({
  open,
  onOpenChange,
  active,
  pinned,
  favorite,
  canDelete,
  href,
  onRename,
  onTogglePin,
  onToggleFavorite,
  onMove,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: boolean;
  pinned: boolean;
  favorite: boolean;
  canDelete: boolean;
  href: string;
  onRename: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const tt = useUI();
  const ref = useRef<HTMLDivElement>(null);
  const absoluteHref =
    typeof window === "undefined" ? href : new URL(href, window.location.origin).toString();

  useEffect(() => {
    if (!open) return;
    const onDocument = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onDocument);
    return () => document.removeEventListener("mousedown", onDocument);
  }, [open, onOpenChange]);

  const closeAnd = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };
  const copyLink = closeAnd(() => {
    void navigator.clipboard?.writeText(absoluteHref);
  });
  const share = closeAnd(() => {
    if (navigator.share) {
      void navigator.share({ title: document.title, url: absoluteHref });
    } else {
      void navigator.clipboard?.writeText(absoluteHref);
    }
  });
  const item = (label: string, handler: () => void, danger = false) => (
    <button
      type="button"
      onClick={handler}
      className={`flex w-full items-center px-3 py-1.5 text-left text-[12px] transition ${
        danger
          ? "text-rose-600 hover:bg-rose-50"
          : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={tt("更多操作")}
        className={`rounded p-0.5 transition ${
          active
            ? "text-white/70 hover:bg-white/20 hover:text-white"
            : "text-neutral-300 opacity-0 hover:bg-neutral-200 hover:text-neutral-600 group-hover:opacity-100"
        } ${open ? "opacity-100" : ""}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={() => onOpenChange(false)}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-neutral-700 transition hover:bg-neutral-100"
          >
            {tt("在新标签打开")}
          </a>
          {item(tt("复制链接"), copyLink)}
          {item(tt("分享"), share)}
          <div className="my-1 h-px bg-neutral-100" />
          {item(tt("重命名"), closeAnd(onRename))}
          {item(pinned ? tt("取消置顶") : tt("置顶"), closeAnd(onTogglePin))}
          {item(
            favorite ? tt("取消收藏") : tt("收藏"),
            closeAnd(onToggleFavorite),
          )}
          {item(tt("移动到项目"), closeAnd(onMove))}
          {canDelete && (
            <>
              <div className="my-1 h-px bg-neutral-100" />
              {item(tt("删除"), closeAnd(onDelete), true)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ProjectRow {
  id: string;
  name: string;
  icon?: string | null;
}

export function MoveTaskProjectDialog({
  title,
  currentProjectId,
  onSelect,
  onClose,
}: {
  title: string;
  currentProjectId?: string | null;
  onSelect: (projectId: string | null) => void;
  onClose: () => void;
}) {
  const tt = useUI();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const client = browserClient();
    if (!client) {
      setLoading(false);
      setError(tt("项目列表不可用。"));
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
  }, [tt]);

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
        onClick={() => onSelect(id)}
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
              {tt("移动到项目")}
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
            <p className="py-8 text-center text-[12px] text-rose-500">{error}</p>
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
