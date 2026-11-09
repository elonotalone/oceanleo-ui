"use client";

import { useRef, type ReactNode } from "react";
import { runtimePageOrigin } from "../contracts/domain-family";
import { useUI } from "../i18n/ui/useUI";
import { useToast } from "../ui/Toast";
import { FloatingMenu, FloatingMenuItem, FloatingMenuSeparator } from "../ui/menu/FloatingMenu";

const ICONS = {
  open: "M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  share: "M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7",
  quote: "M7 17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6v6H7v6Zm10 0h-2a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6v6h-4v6Z",
  rename: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z",
  pin: "m16 3 5 5-4 2-3 5-5-5 5-3zM9 15l-6 6",
  star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  folder: "M3 7V4h6l3 3h9v13H3z",
  folderOut: "M3 7V4h6l3 3h9v13H3zM9 13.5h6",
  delete: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>;
}

export interface TaskActionCallbacks {
  onRename?: () => void;
  onTogglePin?: () => void;
  onToggleFavorite?: () => void;
  onMove?: () => void;
  onRemoveFromProject?: () => void;
  onDelete?: () => void;
  onQuote?: () => void;
}

export interface TaskActionsMenuProps extends TaskActionCallbacks {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active?: boolean;
  pinned?: boolean;
  favorite?: boolean;
  canDelete?: boolean;
  inProject?: boolean;
  href: string;
  taskId?: string;
  taskTitle?: string;
  /** Header usage supplies its own icon button; row usage may keep the same trigger. */
  trigger?: ReactNode;
}

/** The one task menu used by My Tasks rows and task headers. */
export function TaskActionsMenu({
  open, onOpenChange, active = false, pinned = false, favorite = false,
  canDelete = true, inProject = false, href, taskId, taskTitle = "", trigger,
  onRename, onTogglePin, onToggleFavorite, onMove, onRemoveFromProject, onDelete, onQuote,
}: TaskActionsMenuProps) {
  const tt = useUI();
  const toast = useToast();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const origin = runtimePageOrigin();
  const absoluteHref = origin ? new URL(href, origin).toString() : href;
  const closeAnd = (action?: () => void) => () => { onOpenChange(false); action?.(); };
  const copyLink = async () => {
    try { if (!navigator.clipboard) return; await navigator.clipboard.writeText(absoluteHref); toast.success(tt("已复制")); onOpenChange(false); } catch { /* denied */ }
  };
  const share = () => {
    if (navigator.share) { onOpenChange(false); void navigator.share({ title: document.title, url: absoluteHref }).catch(() => {}); }
    else void copyLink();
  };
  const quote = () => {
    if (!taskId) return;
    try {
      sessionStorage.setItem("oceanleo.composer.quote.v1", JSON.stringify({ url: taskQuoteHref(taskId), taskId, title: taskTitle }));
    } catch { return; }
    onOpenChange(false);
    if (onQuote) onQuote();
    else window.location.assign("/");
  };
  const button = trigger ?? (
    <button ref={anchorRef} type="button" onClick={() => onOpenChange(!open)} aria-label={tt("更多操作")} aria-haspopup="menu" aria-expanded={open}
      className={`rounded p-0.5 transition ${active ? "text-neutral-500 hover:bg-neutral-300/60" : `text-neutral-400 hover:bg-neutral-200 ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}`}>
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
    </button>
  );
  return <div className="relative shrink-0">{button}<FloatingMenu open={open} anchorRef={anchorRef} onClose={() => onOpenChange(false)} align="end" ariaLabel={tt("更多操作")}>
    <FloatingMenuItem icon={<Icon name="open" />} label={tt("在新标签打开")} href={href} external onSelect={() => onOpenChange(false)} />
    <FloatingMenuItem icon={<Icon name="link" />} label={tt("复制链接")} onSelect={() => void copyLink()} />
    <FloatingMenuItem icon={<Icon name="share" />} label={tt("分享")} onSelect={share} />
    {taskId && <FloatingMenuItem icon={<Icon name="quote" />} label={tt("在新任务中引用")} onSelect={quote} />}
    <FloatingMenuSeparator />
    <FloatingMenuItem icon={<Icon name="rename" />} label={tt("重命名")} onSelect={closeAnd(onRename)} />
    <FloatingMenuItem icon={<Icon name="pin" />} label={pinned ? tt("取消置顶") : tt("置顶")} onSelect={closeAnd(onTogglePin)} />
    <FloatingMenuItem icon={<Icon name="star" />} label={favorite ? tt("取消收藏") : tt("收藏")} onSelect={closeAnd(onToggleFavorite)} />
    {inProject ? <><FloatingMenuItem icon={<Icon name="folder" />} label={tt("换项目")} onSelect={closeAnd(onMove)} />{onRemoveFromProject && <FloatingMenuItem icon={<Icon name="folderOut" />} label={tt("移出项目")} onSelect={closeAnd(onRemoveFromProject)} />}</> : <FloatingMenuItem icon={<Icon name="folder" />} label={tt("移动到项目")} onSelect={closeAnd(onMove)} />}
    {canDelete && <><FloatingMenuSeparator /><FloatingMenuItem icon={<Icon name="delete" />} label={tt("删除")} danger onSelect={closeAnd(onDelete)} /></>}
  </FloatingMenu></div>;
}

export function taskQuoteHref(taskId: string): string {
  const origin = runtimePageOrigin() || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}/tasks/${encodeURIComponent(taskId)}`;
}
