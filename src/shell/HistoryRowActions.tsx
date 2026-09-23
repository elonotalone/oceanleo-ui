"use client";

import { useEffect, useRef, useState } from "react";
import { browserClient } from "../lib/auth/client";
import { useUI } from "../i18n/ui/useUI";
import { useToast } from "../ui/Toast";
import { FloatingMenu, FloatingMenuItem, FloatingMenuSeparator } from "../ui/menu/FloatingMenu";

const MENU_ICON_PATHS = {
  open: "M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  share: "M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7",
  rename: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z",
  pin: "m16 3 5 5-4 2-3 5-5-5 5-3zM9 15l-6 6",
  star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  folder: "M3 7V4h6l3 3h9v13H3z",
  delete: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
} as const;

function MenuIcon({ name }: { name: keyof typeof MENU_ICON_PATHS }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={MENU_ICON_PATHS[name]} /></svg>;
}

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
  const anchorRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const absoluteHref =
    typeof window === "undefined" ? href : new URL(href, window.location.origin).toString();
  const closeAnd = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };
  const copyLink = async () => {
    try {
      if (!navigator.clipboard) return;
      await navigator.clipboard.writeText(absoluteHref);
      toast.success(tt("已复制"));
      onOpenChange(false);
    } catch {
      // A denied clipboard request must never announce success.
    }
  };
  const share = () => {
    if (navigator.share) {
      onOpenChange(false);
      void navigator.share({ title: document.title, url: absoluteHref }).catch(() => {});
    } else {
      void copyLink();
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={tt("更多操作")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded p-0.5 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
          active
            ? "text-white/70 hover:bg-white/20 hover:text-white"
            : `text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-100 ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`
        }`}
      >
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      <FloatingMenu open={open} anchorRef={anchorRef} onClose={() => onOpenChange(false)} align="end" ariaLabel={tt("更多操作")}>
        <FloatingMenuItem icon={<MenuIcon name="open" />} label={tt("在新标签打开")} href={href} external onSelect={() => onOpenChange(false)} />
        <FloatingMenuItem icon={<MenuIcon name="link" />} label={tt("复制链接")} onSelect={() => void copyLink()} />
        <FloatingMenuItem icon={<MenuIcon name="share" />} label={tt("分享")} onSelect={share} />
        <FloatingMenuSeparator />
        <FloatingMenuItem icon={<MenuIcon name="rename" />} label={tt("重命名")} onSelect={closeAnd(onRename)} />
        <FloatingMenuItem icon={<MenuIcon name="pin" />} label={pinned ? tt("取消置顶") : tt("置顶")} onSelect={closeAnd(onTogglePin)} />
        <FloatingMenuItem icon={<MenuIcon name="star" />} label={favorite ? tt("取消收藏") : tt("收藏")} onSelect={closeAnd(onToggleFavorite)} />
        <FloatingMenuItem icon={<MenuIcon name="folder" />} label={tt("移动到项目")} onSelect={closeAnd(onMove)} />
        {canDelete && <>
          <FloatingMenuSeparator />
          <FloatingMenuItem icon={<MenuIcon name="delete" />} label={tt("删除")} danger onSelect={closeAnd(onDelete)} />
        </>}
      </FloatingMenu>
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
