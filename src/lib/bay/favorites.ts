// Bay 收藏（移植自 talent `lib/talent/favorites.ts`）。收藏要登录；查不到（含未登录）一律当作没收藏。

import { bayDelete, bayGet, bayPost } from "./http";
import { bayQuery } from "./directory";

export type BayFavoriteKind = "profile" | "service" | "demand";

export interface BayFavorite {
  id: string;
  target_kind: BayFavoriteKind;
  target_ref: string;
  created_at: string | null;
  target: Record<string, unknown>;
}

export function listBayFavorites(kind?: BayFavoriteKind): Promise<{ items: BayFavorite[]; total: number }> {
  return bayGet<{ items: BayFavorite[]; total: number }>(`/v1/talent/favorites${bayQuery({ target_kind: kind })}`);
}

export function addBayFavorite(kind: BayFavoriteKind, ref: string): Promise<{ favorite: BayFavorite; duplicate: boolean }> {
  return bayPost<{ favorite: BayFavorite; duplicate: boolean }>("/v1/talent/favorites", { target_kind: kind, target_ref: ref });
}

export function removeBayFavorite(kind: BayFavoriteKind, ref: string): Promise<{ ok: boolean }> {
  return bayDelete<{ ok: boolean }>(`/v1/talent/favorites${bayQuery({ target_kind: kind, target_ref: ref })}`);
}

export async function isBayFavorite(kind: BayFavoriteKind, ref: string): Promise<boolean> {
  try {
    const data = await listBayFavorites(kind);
    return (data?.items || []).some((item) => item.target_ref === ref);
  } catch {
    return false;
  }
}

/** 收藏 / 取消收藏，返回新的收藏态。 */
export async function toggleBayFavorite(kind: BayFavoriteKind, ref: string, current: boolean): Promise<boolean> {
  if (current) {
    await removeBayFavorite(kind, ref);
    return false;
  }
  await addBayFavorite(kind, ref);
  return true;
}
