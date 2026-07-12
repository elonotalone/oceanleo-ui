"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "../lib/auth/client";
import { listWorks } from "../lib/database";
import { useUI } from "../i18n/ui/useUI";
import { timeAgo } from "../ui";
import {
  buildLibraryItems,
  libraryItemMatches,
  type LibraryArtifactRow,
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
import {
  LibraryItemViewer,
  LibraryKindIcon,
  libraryKindLabel,
} from "./library-viewers";

export interface CrossSiteLibraryProps {
  kinds?: LibraryKind[];
  favoritesOnly?: boolean;
  accent?: string;
  emptyTitle?: string;
  className?: string;
}

function itemThumb(item: LibraryItem): string {
  if (item.thumbUrl) return item.thumbUrl;
  if (item.kind === "image") return item.previewUrl || item.url || "";
  return "";
}

export function CrossSiteLibrary({
  kinds = [],
  favoritesOnly = false,
  accent = "#4f46e5",
  emptyTitle,
  className = "",
}: CrossSiteLibraryProps) {
  const tt = useUI();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const client = browserClient();
    if (!client) {
      setLoading(false);
      setError(tt("作品库连接尚未配置。"));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      const { data: sessionData } = await client.auth.getSession();
      if (cancelled) return;
      if (!sessionData.session) {
        setAuthMessage(tt("登录后即可查看全系列内容库。"));
        setLoading(false);
        return;
      }
      setAuthMessage("");
      const [worksResult, artifactsResult] = await Promise.all([
        listWorks({ limit: 500 }),
        client
          .from("agent_artifacts")
          .select(
            "id,title,kind,content,url,favorite,created_at,task_id,session_id",
          )
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (cancelled) return;
      if (!worksResult.ok && artifactsResult.error) {
        setError(
          worksResult.error ||
            artifactsResult.error.message ||
            tt("内容库加载失败。"),
        );
        setItems([]);
      } else {
        setItems(
          buildLibraryItems(
            worksResult.data?.items ?? [],
            (artifactsResult.data as LibraryArtifactRow[] | null) ?? [],
          ),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce, tt]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(
      (item) =>
        libraryItemMatches(item, kinds, favoritesOnly) &&
        (!needle ||
          item.title.toLowerCase().includes(needle) ||
          item.siteId.toLowerCase().includes(needle) ||
          libraryKindLabel(item.kind).toLowerCase().includes(needle)),
    );
  }, [items, kinds, favoritesOnly, search]);

  const selected =
    filtered.find((item) => item.key === selectedKey) ?? filtered[0] ?? null;

  const toggleFavorite = useCallback(async (item: LibraryItem) => {
    const client = browserClient();
    if (!client) return;
    const next = !item.favorite;
    setItems((current) =>
      current.map((entry) =>
        entry.key === item.key ? { ...entry, favorite: next } : entry,
      ),
    );
    const updates = [
      client
        .from(
          item.source === "artifact" ? "agent_artifacts" : "user_creations",
        )
        .update({ favorite: next })
        .eq("id", item.id),
    ];
    const mergedArtifactId =
      item.source === "creation" && typeof item.meta.artifact_id === "string"
        ? item.meta.artifact_id
        : "";
    if (mergedArtifactId) {
      updates.push(
        client
          .from("agent_artifacts")
          .update({ favorite: next })
          .eq("id", mergedArtifactId),
      );
    }
    const results = await Promise.all(updates);
    if (results.some((result) => result.error)) {
      setItems((current) =>
        current.map((entry) =>
          entry.key === item.key
            ? { ...entry, favorite: item.favorite }
            : entry,
        ),
      );
    }
  }, []);

  if (loading) {
    return (
      <div
        className={`grid min-h-[520px] place-items-center ${className}`}
        aria-busy
      >
        <div className="flex flex-col items-center gap-3 text-[13px] text-stone-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
          {tt("正在汇集全系列作品…")}
        </div>
      </div>
    );
  }

  if (authMessage || error) {
    return (
      <div className={`grid min-h-[520px] place-items-center ${className}`}>
        <div className="max-w-sm text-center">
          <LibraryKindIcon
            kind={kinds[0] || "file"}
            className="mx-auto h-11 w-11 text-stone-300"
          />
          <p className="mt-3 text-[13px] leading-relaxed text-stone-500">
            {authMessage || error}
          </p>
          {error && (
            <button
              type="button"
              onClick={() => setReloadNonce((value) => value + 1)}
              className="mt-3 rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] text-stone-600 hover:bg-stone-50"
            >
              {tt("重新加载")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white sm:flex-row ${className}`}
    >
      <aside className="flex max-h-44 w-full shrink-0 flex-col border-b border-stone-200 bg-stone-50/70 sm:max-h-none sm:w-52 sm:border-b-0 sm:border-r">
        <div className="shrink-0 border-b border-stone-200 p-2.5">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tt("搜索")}
                className="h-8 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-2 text-[12px] text-stone-700 outline-none focus:border-stone-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setReloadNonce((value) => value + 1)}
              title={tt("刷新")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-400 hover:text-stone-600"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20 11a8 8 0 10-2 5.3M20 5v6h-6" />
              </svg>
            </button>
          </div>
          <p className="mt-2 px-0.5 text-[10px] text-stone-400">
            {tt("共 {count} 项", { count: filtered.length })}
          </p>
        </div>

        <div className="v-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-2 py-12 text-center">
              <LibraryKindIcon
                kind={kinds[0] || "file"}
                className="mx-auto h-8 w-8 text-stone-300"
              />
              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
                {tt(
                  emptyTitle ||
                    (search ? "没有匹配的内容" : "这个库里还没有内容"),
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((item) => {
                const active = selected?.key === item.key;
                const thumb = itemThumb(item);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedKey(item.key)}
                    className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition ${
                      active
                        ? "border-stone-300 bg-white shadow-sm"
                        : "border-transparent hover:bg-white/80"
                    }`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-stone-100 text-stone-400">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <LibraryKindIcon
                          kind={item.kind}
                          className="h-4.5 w-4.5"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-stone-700">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] text-stone-400">
                        {tt(libraryKindLabel(item.kind))}
                        {item.createdAt
                          ? ` · ${timeAgo(item.createdAt, tt)}`
                          : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-stone-200 px-3">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
                style={{ background: accent }}
              >
                <LibraryKindIcon kind={selected.kind} className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-stone-800">
                  {selected.title}
                </span>
                <span className="block truncate text-[10px] text-stone-400">
                  {tt(libraryKindLabel(selected.kind))}
                  {selected.siteId ? ` · ${selected.siteId}` : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void toggleFavorite(selected)}
                aria-label={
                  selected.favorite ? tt("取消收藏") : tt("加入收藏")
                }
                title={selected.favorite ? tt("取消收藏") : tt("加入收藏")}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
                  selected.favorite
                    ? "border-amber-200 bg-amber-50 text-amber-500"
                    : "border-stone-200 text-stone-400 hover:bg-stone-50"
                }`}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill={selected.favorite ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path d="M12 3.5l2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6-4.36-4.25 6.03-.88L12 3.5z" />
                </svg>
              </button>
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50"
                >
                  {tt("打开 / 下载")}
                </a>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              <LibraryItemViewer item={selected} accent={accent} />
            </div>
          </>
        ) : (
          <div className="grid min-h-[520px] flex-1 place-items-center">
            <div className="text-center">
              <LibraryKindIcon
                kind={kinds[0] || "file"}
                className="mx-auto h-12 w-12 text-stone-300"
              />
              <p className="mt-3 text-[13px] text-stone-400">
                {tt(
                  emptyTitle ||
                    (search ? "没有匹配的内容" : "这个库里还没有内容"),
                )}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
