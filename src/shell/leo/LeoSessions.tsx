"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { FloatingMenu, FloatingMenuItem } from "../../ui/menu/FloatingMenu";
import { leoSessions, leoCreateSession, leoRenameSession, leoDeleteSession, type LeoApiError, type LeoSession } from "./leo-api";

export function useLeoSessions(open: boolean, siteId: string) {
  const [sessions, setSessions] = useState<LeoSession[]>([]);
  const [selected, setSelected] = useState<string>();
  const [supported, setSupported] = useState(false);
  const [capabilityError, setCapabilityError] = useState<LeoApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void leoSessions().then((res) => {
      if (!alive) return;
      setSupported(res.ok);
      setCapabilityError(res.ok ? null : res.error);
      if (res.ok) {
        setSessions(res.data);
        setSelected((id) => res.data.some((s) => s.id === id) ? id : res.data[0]?.id);
      } else setSelected(undefined);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [open]);
  const upsert = (row: LeoSession) => {
    setSessions((rows) => [row, ...rows.filter((s) => s.id !== row.id)].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  };
  const mutate = async (action: () => Promise<boolean>) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(false);
    try { const ok = await action(); setError(!ok); return ok; }
    finally { lock.current = false; setBusy(false); }
  };
  return { sessions, selected, supported, capabilityError, loading, busy, error, upsert,
    select: (id: string) => { setError(false); setSelected(id); },
    create: () => mutate(async () => {
      const res = await leoCreateSession(siteId);
      if (!res.ok) return false;
      upsert(res.data); setSelected(res.data.id); return true;
    }),
    rename: (id: string, title: string) => mutate(async () => {
      const res = await leoRenameSession(id, title);
      if (!res.ok) return false;
      upsert(res.data); return true;
    }),
    remove: (id: string) => mutate(async () => {
      const res = await leoDeleteSession(id);
      if (!res.ok) return false;
      setSessions((rows) => rows.filter((s) => s.id !== id));
      if (selected === id) setSelected(sessions.find((s) => s.id !== id)?.id);
      return true;
    }),
  };
}
export type LeoSessionsState = ReturnType<typeof useLeoSessions>;

function relativeTime(date: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(date)) / 1000));
  if (!Number.isFinite(seconds)) return "";
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en";
  const [amount, unit] = seconds < 3600 ? [Math.floor(seconds / 60), "minute"] as const
    : seconds < 86400 ? [Math.floor(seconds / 3600), "hour"] as const : [Math.floor(seconds / 86400), "day"] as const;
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-amount, unit);
}

export function LeoSessionList({ state, disabled, compact = false, onSelect, onExpand }: {
  state: LeoSessionsState; disabled: boolean; compact?: boolean; onSelect?: () => void; onExpand?: () => void;
}) {
  const tt = useUI();
  return <div data-leo-session-list className="flex min-h-0 flex-1 flex-col text-neutral-800 dark:text-neutral-100">
    <button disabled={disabled} className="shrink-0 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800" onClick={() => { void state.create().then((ok) => { if (ok) onSelect?.(); }); }}>+ {tt("新会话")}</button>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {(compact ? state.sessions.slice(0, 20) : state.sessions).map((session) => <SessionRow key={session.id} session={session} state={state} disabled={disabled} onSelect={onSelect} />)}
    </div>
    {compact && <button className="shrink-0 px-3 py-2 text-xs" onClick={onExpand}>{tt("查看全部")}</button>}
    {state.error && <p role="alert" className="px-3 py-2 text-xs text-rose-600">{tt("记录暂时不可用，稍后再试。")}</p>}
  </div>;
}
function SessionRow({ session, state, disabled, onSelect }: { session: LeoSession; state: LeoSessionsState; disabled: boolean; onSelect?: () => void }) {
  const tt = useUI();
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState(session.title);
  return <div data-leo-session-row className="group px-1 py-0.5">
    <div className={`flex items-center rounded-lg ${state.selected === session.id ? "bg-indigo-50 dark:bg-indigo-950" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
      <button disabled={disabled} aria-current={state.selected === session.id ? "true" : undefined} className="min-w-0 flex-1 px-2 py-2 text-left disabled:opacity-50" onClick={() => { state.select(session.id); onSelect?.(); }}>
        <span className="block truncate text-[13px]">{session.title || tt("新对话")}</span>
        <time dateTime={session.updated_at} className="block text-[11px] text-neutral-500">{relativeTime(session.updated_at)}</time>
      </button>
      <button ref={anchor} disabled={disabled} aria-label={tt("更多")} aria-expanded={menu} className="rounded px-2 py-1 opacity-50 hover:opacity-100 focus:opacity-100 group-hover:opacity-100" onClick={() => setMenu(!menu)}>⋯</button>
    </div>
    <FloatingMenu open={menu} anchorRef={anchor} onClose={() => setMenu(false)}>
      <FloatingMenuItem label={tt("重命名")} onSelect={() => { setTitle(session.title); setEdit("rename"); setMenu(false); }} />
      <FloatingMenuItem danger label={tt("删除")} onSelect={() => { setEdit("delete"); setMenu(false); }} />
    </FloatingMenu>
    {edit && <form className="space-y-2 rounded-lg border border-neutral-200 p-2 dark:border-neutral-700" onSubmit={(e) => { e.preventDefault(); void (edit === "rename" ? state.rename(session.id, title.trim()) : state.remove(session.id)).then((ok) => { if (ok) setEdit(null); }); }}>
      {edit === "rename" ? <input autoFocus aria-label={tt("重命名")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-xs" /> : <p className="text-xs">{tt("删除此 leo 会话及全部记录？")}</p>}
      <div className="flex gap-3 text-xs"><button type="submit" disabled={disabled || (edit === "rename" && !title.trim())}>{edit === "rename" ? tt("保存") : tt("删除")}</button><button type="button" onClick={() => setEdit(null)}>{tt("取消")}</button></div>
    </form>}
  </div>;
}
