"use client";

// 作品页的关注按钮和更新日志共用一份「我是否已关注 / 关注数」，避免两个组件各请求一遍、数字对不上。
import { useCallback, useSyncExternalStore } from "react";
import type { BayAppReleasePage } from "../../../lib/bay/app-releases";

export type FollowSnapshot = {
  following: boolean;
  follower_count: number;
};

const cache = new Map<string, FollowSnapshot>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function normalizeSnapshot(snapshot: FollowSnapshot): FollowSnapshot {
  return {
    following: Boolean(snapshot.following),
    follower_count: Math.max(0, Math.floor(Number(snapshot.follower_count) || 0)),
  };
}

export function subscribeFollowStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFollowSnapshot(appId: string): FollowSnapshot | null {
  if (!appId) return null;
  return cache.get(appId) ?? null;
}

export function writeFollowSnapshot(appId: string, snapshot: FollowSnapshot): void {
  if (!appId) return;
  const next = normalizeSnapshot(snapshot);
  const prev = cache.get(appId);
  if (prev && prev.following === next.following && prev.follower_count === next.follower_count) return;
  cache.set(appId, next);
  emit();
}

export function applyFollowFromReleasePage(
  appId: string,
  page: Pick<BayAppReleasePage, "follower_count" | "viewer_following">,
): void {
  writeFollowSnapshot(appId, {
    following: Boolean(page.viewer_following),
    follower_count: page.follower_count,
  });
}

/** 立刻改本地状态，返回改之前的快照（没有过则 null），失败时交给 rollbackFollow。 */
export function optimisticFollow(appId: string, following: boolean): FollowSnapshot | null {
  const prev = getFollowSnapshot(appId);
  if (!prev) {
    writeFollowSnapshot(appId, { following, follower_count: following ? 1 : 0 });
    return null;
  }
  if (prev.following === following) return prev;
  writeFollowSnapshot(appId, {
    following,
    follower_count: Math.max(0, prev.follower_count + (following ? 1 : -1)),
  });
  return prev;
}

export function rollbackFollow(appId: string, prev: FollowSnapshot | null): void {
  if (!appId) return;
  if (prev) {
    cache.set(appId, normalizeSnapshot(prev));
    emit();
    return;
  }
  if (!cache.has(appId)) return;
  cache.delete(appId);
  emit();
}

export function resetFollowStore(): void {
  if (cache.size === 0) return;
  cache.clear();
  emit();
}

export function useFollowSnapshot(appId: string): FollowSnapshot | null {
  const getSnapshot = useCallback(() => getFollowSnapshot(appId), [appId]);
  return useSyncExternalStore(subscribeFollowStore, getSnapshot, () => null);
}
