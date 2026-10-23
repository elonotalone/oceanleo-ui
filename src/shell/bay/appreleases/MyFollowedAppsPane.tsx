"use client";

// 我的 → 我买到的 → 关注的网站或软件。点开前记下是从关注列表进来的。
import { useCallback, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { listFollowedBayApps, unfollowBayApp, type BayFollowedApp } from "../../../lib/bay/app-releases";
import { rememberBayAppEntry } from "../appinsights/app-source";
import { BaySignInPrompt } from "../shell/BayMine";
import { openBay, requireBayLogin, useBaySignedIn } from "../shell/bay-state";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { errorText, useBayResource } from "../supply/use-bay-resource";
import { optimisticFollow, rollbackFollow, writeFollowSnapshot } from "./follow-store";
import { formatReleaseDay } from "./releases-model";

function httpsCover(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const text = url.trim();
  return text.startsWith("https://") ? text : null;
}

export function MyFollowedAppsPane(): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const resource = useBayResource(signedIn ? "bay-followed-apps" : null, () => listFollowedBayApps());
  const [items, setItems] = useState<BayFollowedApp[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rows = items ?? resource.data?.items ?? [];

  const openApp = useCallback((appId: string) => {
    rememberBayAppEntry(appId, "follow");
    openBay({ kind: "app", id: appId });
  }, []);

  async function unfollow(appId: string) {
    if (busyId) return;
    if (!requireBayLogin()) return;
    setBusyId(appId);
    setError("");
    const prev = optimisticFollow(appId, false);
    try {
      const result = await unfollowBayApp(appId);
      writeFollowSnapshot(appId, { following: result.following, follower_count: result.follower_count });
      setItems((current) => (current ?? resource.data?.items ?? []).filter((row) => row.app.id !== appId));
    } catch (err) {
      rollbackFollow(appId, prev);
      setError(errorText(err) || tt("取消关注没成功，请稍后再试。"));
    } finally {
      setBusyId(null);
    }
  }

  if (!signedIn) return <BaySignInPrompt text={tt("登录后查看你关注的网站或软件")} />;
  if (resource.loading && !resource.data) return <PaneLoading />;
  if (!resource.data) {
    const text = resource.error || tt("没读到你关注的网站或软件，请稍后再试。");
    return <PaneMessage text={tt(text)} onRetry={resource.reload} />;
  }

  return (
    <section data-bay-pane="mine-followed-apps" className="space-y-3 p-4">
      {error ? <p className="text-[12px] text-rose-600">{tt(error)}</p> : null}
      {rows.length === 0 ? (
        <div data-bay-empty="followed-apps" className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center">
          <p className="text-[13px] text-neutral-600">{tt("你还没有关注任何网站或软件。在详情页点「关注」，它更新时你会收到通知")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {rows.map((row) => {
            const cover = httpsCover(row.app.cover_url);
            const latest = row.latest_release;
            const day = formatReleaseDay(latest?.created_at);
            return (
              <li key={row.app.id} data-bay-followed-app={row.app.id} className="flex items-center gap-3 py-3">
                {cover ? (
                  <img src={cover} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-neutral-100 text-[13px] font-semibold text-neutral-500">
                    {Array.from(row.app.title.trim())[0] || ""}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    data-bay-action="open-followed-app"
                    onClick={() => openApp(row.app.id)}
                    className="block w-full truncate text-left text-[14px] font-semibold text-neutral-900 hover:underline"
                  >
                    {row.app.title}
                  </button>
                  <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                    {latest ? (
                      <>
                        <span className="text-neutral-700">{latest.title}</span>
                        {day ? <span> · {day}</span> : null}
                      </>
                    ) : (
                      tt("还没有更新")
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  data-bay-action="unfollow-followed"
                  disabled={busyId === row.app.id}
                  onClick={() => void unfollow(row.app.id)}
                  className="shrink-0 rounded-full border border-neutral-900 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                >
                  {busyId === row.app.id ? tt("正在取消关注…") : tt("取消关注")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
