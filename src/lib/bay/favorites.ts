// Bay 收藏（移植自 talent `lib/talent/favorites.ts`）。收藏要登录；查不到（含未登录）一律当作没收藏。

import { bayDelete, bayGet, bayPost } from "./http";
import { bayQuery } from "./directory";
import type { BayTarget } from "../../shell/bay/shell/bay-state";

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 收藏行标题：服务/需求用 `title`，卖家用显示名或 handle。缺字段时退到 `target_ref`。 */
export function favoriteTitle(item: BayFavorite): string {
  const target = asRecord(item.target);
  if (item.target_kind === "profile") {
    return asString(target.display_name) || asString(target.handle) || item.target_ref || "";
  }
  return asString(target.title) || item.target_ref || "";
}

/** 收藏行副标题：服务用摘要或卖家名，卖家用一句话，需求用类目代号（界面上换成类目名再显示）。 */
export function favoriteSubtitle(item: BayFavorite): string {
  const target = asRecord(item.target);
  if (item.target_kind === "service") {
    const summary = asString(target.summary);
    if (summary) return summary;
    const seller = asRecord(target.seller);
    return asString(seller.display_name) || asString(seller.handle);
  }
  if (item.target_kind === "profile") return asString(target.headline);
  if (item.target_kind === "demand") return asString(target.category);
  return "";
}

/** 点收藏行要打开的目标；卖家没有 handle 时打不开。 */
export function favoriteOpenTarget(item: BayFavorite): BayTarget | null {
  const target = asRecord(item.target);
  if (item.target_kind === "service") {
    const id = asString(target.id) || item.target_ref;
    return id ? { kind: "service", id } : null;
  }
  if (item.target_kind === "profile") {
    const handle = asString(target.handle);
    return handle ? { kind: "profile", handle } : null;
  }
  if (item.target_kind === "demand") {
    const id = asString(target.id) || item.target_ref;
    return id ? { kind: "demand", id } : null;
  }
  return null;
}
