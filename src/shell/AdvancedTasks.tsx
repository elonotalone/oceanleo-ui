"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAppSession,
  listAppSessions,
  type AppSession,
} from "../lib/app-session";
import { HISTORY_CHANGED_EVENT } from "../lib/history-events";
import { useUI } from "../i18n/ui/useUI";
import { advancedSnapshotFromSession } from "./advanced-session";
import {
  advancedFeatureById,
  advancedFeatureHref,
} from "./advanced-features";

export interface AdvancedTasksProps {
  siteId?: string;
  accent?: string;
  currentSessionId?: string | null;
}

export function AdvancedTasks({
  siteId = "",
  accent = "#4f46e5",
  currentSessionId,
}: AdvancedTasksProps) {
  const tt = useUI();
  const router = useRouter();
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await listAppSessions({
      surface: "advanced",
      siteId: siteId || undefined,
      includeArchived: true,
      limit: 100,
    });
    if (result.ok) {
      setSessions(result.data?.items || []);
    } else {
      setError(
        result.status === 401
          ? tt("登录后即可查看高级功能任务。")
          : result.error || tt("加载高级功能任务失败"),
      );
    }
    setLoading(false);
  }, [siteId, tt]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener(HISTORY_CHANGED_EVENT, refresh);
    return () =>
      window.removeEventListener(HISTORY_CHANGED_EVENT, refresh);
  }, [load]);

  const entries = useMemo(
    () =>
      sessions.flatMap((session) => {
        const snapshot = advancedSnapshotFromSession(session);
        const feature = advancedFeatureById(snapshot?.feature_id);
        return snapshot && feature ? [{ session, snapshot, feature }] : [];
      }),
    [sessions],
  );

  const remove = async (session: AppSession) => {
    if (deleting) return;
    if (
      !window.confirm(
        tt("确定删除高级功能任务「{title}」吗？", {
          title: session.title || "未命名任务",
        }),
      )
    ) {
      return;
    }
    setDeleting(session.id);
    const result = await deleteAppSession(session.id, "advanced");
    setDeleting("");
    if (result.ok) {
      setSessions((current) =>
        current.filter((entry) => entry.id !== session.id),
      );
    } else {
      setError(result.error || tt("删除失败，请重试。"));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface,#fafaf9)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-[var(--fg,#1c1917)]">
            {tt("高级功能任务")}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--muted,#a8a29e)]">
            {tt("这里只显示高级功能记录，不包含普通 App 任务。")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-1.5 text-[11px] text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)]"
        >
          {tt("刷新")}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-500">
            {error}
          </div>
        ) : loading ? (
          <div className="grid min-h-48 place-items-center text-[12px] text-[var(--muted,#a8a29e)]">
            {tt("加载高级功能任务…")}
          </div>
        ) : entries.length === 0 ? (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-center">
            <div>
              <p className="text-[13px] font-medium text-[var(--fg-2,#57534e)]">
                {tt("还没有高级功能任务")}
              </p>
              <p className="mt-1 text-[11px] text-[var(--muted,#a8a29e)]">
                {tt("打开文件并进行编辑后，任务会独立保存在这里。")}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map(({ session, snapshot, feature }) => {
              const active = session.id === currentSessionId;
              return (
                <div
                  key={session.id}
                  className={`group relative rounded-xl border bg-[var(--card,#fff)] transition hover:-translate-y-0.5 hover:shadow-sm ${
                    active ? "border-current" : "border-[var(--border,#e7e5e4)]"
                  }`}
                  style={active ? { color: accent } : undefined}
                >
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        advancedFeatureHref(feature, {
                          sessionId: session.id,
                        }),
                      )
                    }
                    className="block w-full p-3 pr-10 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: feature.accent }}
                      />
                      <span className="text-[10px] font-medium text-[var(--muted,#a8a29e)]">
                        {tt(feature.title)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] font-semibold leading-snug text-[var(--fg,#292524)]">
                      {snapshot.item.title || session.title}
                    </p>
                    <p className="mt-2 text-[10px] text-[var(--muted,#a8a29e)]">
                      {new Date(
                        session.last_activity_at ||
                          session.updated_at ||
                          session.created_at ||
                          0,
                      ).toLocaleString()}
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={deleting === session.id}
                    onClick={() => void remove(session)}
                    aria-label={tt("删除")}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-[var(--muted,#d6d3d1)] opacity-0 transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50 group-hover:opacity-100 focus:opacity-100"
                  >
                    {deleting === session.id ? "…" : "×"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
