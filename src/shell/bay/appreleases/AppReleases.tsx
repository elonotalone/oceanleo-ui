"use client";

// 作品页介绍下方的最近更新。标题和正文只当文本渲染，不解析链接、不当 HTML。
import { useEffect, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { listBayAppReleases, type BayAppRelease } from "../../../lib/bay/app-releases";
import { openBay } from "../shell/bay-state";
import { errorText } from "../supply/use-bay-resource";
import { applyFollowFromReleasePage } from "./follow-store";
import {
  RELEASE_PAGE_FIRST,
  RELEASE_PAGE_MORE,
  foldedReleaseBody,
  formatReleaseDay,
  releaseBodyNeedsFold,
} from "./releases-model";

export function AppReleases({ appId, isOwner }: { appId: string; isOwner: boolean }): ReactElement | null {
  const tt = useUI();
  const [items, setItems] = useState<BayAppRelease[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!appId) return;
    let live = true;
    setLoading(true);
    setError("");
    listBayAppReleases(appId, { limit: RELEASE_PAGE_FIRST }).then(
      (page) => {
        if (!live) return;
        applyFollowFromReleasePage(appId, page);
        setItems(page.items || []);
        setNextOffset(page.next_offset);
        setLoading(false);
      },
      (err: unknown) => {
        if (!live) return;
        setError(errorText(err) || "没读到更新日志，请稍后再试。");
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [appId]);

  async function loadMore() {
    if (!appId || loadingMore || nextOffset == null) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await listBayAppReleases(appId, { offset: nextOffset, limit: RELEASE_PAGE_MORE });
      applyFollowFromReleasePage(appId, page);
      setItems((prev) => [...prev, ...(page.items || [])]);
      setNextOffset(page.next_offset);
    } catch (err) {
      setError(errorText(err) || tt("没读到更新日志，请稍后再试。"));
    } finally {
      setLoadingMore(false);
    }
  }

  if (!appId) return null;
  if (loading) {
    if (!isOwner) return null;
    return (
      <section data-bay-app-releases className="mt-5">
        <p className="text-[13px] text-neutral-500">{tt("正在读取更新日志…")}</p>
      </section>
    );
  }
  if (!isOwner && items.length === 0) return null;

  return (
    <section data-bay-app-releases className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-semibold text-neutral-900">{tt("更新日志")}</h3>
        {isOwner ? (
          <button
            type="button"
            data-bay-action="write-release"
            onClick={() => openBay({ kind: "app-manage", appId, tab: "releases" })}
            className="rounded-full border border-neutral-900 px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
          >
            {tt("写更新")}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-neutral-500">{tt("还没有更新日志。写一条，让访客知道作品还在维护")}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {items.map((release) => {
            const open = Boolean(expanded[release.id]);
            const fold = releaseBodyNeedsFold(release.body);
            const version = release.version.trim();
            const day = formatReleaseDay(release.created_at);
            return (
              <li key={release.id} data-bay-app-release={release.id} className="py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {version ? <span className="text-[12px] font-medium text-neutral-500">{version}</span> : null}
                  <span className="break-words text-[13px] font-semibold text-neutral-900">{release.title}</span>
                  {day ? <span className="text-[12px] text-neutral-400">{day}</span> : null}
                </div>
                {release.body ? (
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-700">
                    {open || !fold ? release.body : foldedReleaseBody(release.body)}
                  </p>
                ) : null}
                {fold && !open ? (
                  <button
                    type="button"
                    data-bay-action="expand-release"
                    onClick={() => setExpanded((prev) => ({ ...prev, [release.id]: true }))}
                    className="mt-1 text-[12px] text-neutral-600 hover:underline"
                  >
                    {tt("展开")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {nextOffset != null ? (
        <button
          type="button"
          data-bay-action="load-more-releases"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="mt-3 w-full rounded-lg border border-neutral-200 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {loadingMore ? tt("正在加载…") : tt("查看全部")}
        </button>
      ) : null}
    </section>
  );
}
