"use client";

// 作品页标题旁的关注。和 AppReleases 共用 follow-store，避免各请求一遍。
import { useEffect, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { followBayApp, listBayAppReleases, unfollowBayApp } from "../../../lib/bay/app-releases";
import { requireBayLogin } from "../shell/bay-state";
import { errorText } from "../supply/use-bay-resource";
import { applyFollowFromReleasePage, optimisticFollow, rollbackFollow, useFollowSnapshot, writeFollowSnapshot } from "./follow-store";

export function FollowButton({ appId, isOwner }: { appId: string; isOwner: boolean }): ReactElement | null {
  const tt = useUI();
  const snapshot = useFollowSnapshot(appId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);

  useEffect(() => {
    if (!appId || snapshot) return;
    let live = true;
    listBayAppReleases(appId, { limit: 1 }).then(
      (page) => {
        if (live) applyFollowFromReleasePage(appId, page);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [appId, snapshot]);

  const following = snapshot?.following ?? false;
  const count = snapshot?.follower_count ?? 0;

  async function runFollow() {
    if (busy) return;
    if (!requireBayLogin()) return;
    setBusy(true);
    setError("");
    const prev = optimisticFollow(appId, true);
    try {
      const result = await followBayApp(appId);
      writeFollowSnapshot(appId, { following: result.following, follower_count: result.follower_count });
    } catch (err) {
      rollbackFollow(appId, prev);
      setError(errorText(err) || tt("关注没成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  async function runUnfollow() {
    if (busy) return;
    setBusy(true);
    setError("");
    const prev = optimisticFollow(appId, false);
    try {
      const result = await unfollowBayApp(appId);
      writeFollowSnapshot(appId, { following: result.following, follower_count: result.follower_count });
      setConfirmUnfollow(false);
    } catch (err) {
      rollbackFollow(appId, prev);
      setError(errorText(err) || tt("取消关注没成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  if (!appId) return null;

  if (isOwner) {
    return (
      <span data-bay-app-follow data-bay-follow-owner className="text-[12px] text-neutral-500">
        {tt("{n} 人关注", { n: count })}
      </span>
    );
  }

  return (
    <span data-bay-app-follow className="inline-flex flex-col items-start">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {following ? (
          <button
            type="button"
            data-bay-action="unfollow"
            aria-pressed="true"
            disabled={busy}
            onClick={() => {
              setError("");
              setConfirmUnfollow(true);
            }}
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[12px] text-neutral-700 disabled:opacity-60"
          >
            {busy ? tt("正在取消关注…") : confirmUnfollow ? tt("取消关注") : tt("已关注")}
          </button>
        ) : (
          <button
            type="button"
            data-bay-action="follow"
            aria-pressed="false"
            disabled={busy}
            onClick={() => void runFollow()}
            className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {busy ? tt("正在关注…") : tt("关注")}
          </button>
        )}
        <span data-bay-follower-count className="text-[12px] text-neutral-500">
          {tt("{n} 人关注", { n: count })}
        </span>
      </span>
      {confirmUnfollow ? (
        <div data-bay-confirm="unfollow" className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[12px] text-neutral-800">{tt("确定取消关注这个作品？")}</p>
          {error ? <p className="mt-1 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmUnfollow(false)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
            >
              {tt("取消")}
            </button>
            <button
              type="button"
              data-bay-action="confirm-unfollow"
              disabled={busy}
              onClick={() => void runUnfollow()}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
            >
              {busy ? tt("正在取消关注…") : tt("取消关注")}
            </button>
          </div>
        </div>
      ) : error ? (
        <span className="mt-1 text-[12px] text-rose-600">{tt(error)}</span>
      ) : null}
    </span>
  );
}
