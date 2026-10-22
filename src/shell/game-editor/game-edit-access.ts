/**
 * 游戏编辑权限与「先 fork 再改」的唯一出处。
 *
 * 主站上打开别人的作品（公共模板、他人分享）时，用户看到的编辑器必须能用：
 * 有 fork 权限就在第一次真正修改（保存 / 描述改玩法）前落成自己的二创副本，
 * 之后所有修改只作用在副本上；既不能改也不能 fork 的只读条目，明确告知「只能试玩」，
 * 而不是打开一个保存必失败的编辑器。
 */

import { isDurableLibraryItem, type LibraryItem } from "../library-data";

export type GameEditAccess = "own" | "fork" | "view-only";

export function gameEditAccess(item: LibraryItem): GameEditAccess {
  if (!isDurableLibraryItem(item)) return "own";
  const { canEdit, canFork } = item.artifact.access;
  if (canEdit) return "own";
  return canFork ? "fork" : "view-only";
}

export const GAME_VIEW_ONLY_MESSAGE =
  "这个游戏只开放了试玩，不能修改，也不能创建副本。";
export const GAME_FORK_ON_SAVE_NOTICE =
  "这是别人的作品：你的修改会保存为自己的二创副本，原作不受影响。";

export type GameOwnCopyResult =
  | { ok: true; item: LibraryItem; forked: boolean }
  | { ok: false; error: string };

/** 保证返回的条目是用户可写的：不可写则 fork 一份（失败即原样报错，不静默改原作）。 */
export async function ensureOwnGameCopy(
  item: LibraryItem,
  fork: (
    item: LibraryItem,
  ) => Promise<{ ok: boolean; data?: LibraryItem | null; error?: string }>,
): Promise<GameOwnCopyResult> {
  const access = gameEditAccess(item);
  if (access === "own") return { ok: true, item, forked: false };
  if (access === "view-only") return { ok: false, error: GAME_VIEW_ONLY_MESSAGE };
  const forked = await fork(item);
  if (!forked.ok || !forked.data) {
    return {
      ok: false,
      error: forked.error || "二创副本创建失败，原作保持不变。",
    };
  }
  return { ok: true, item: forked.data, forked: true };
}
