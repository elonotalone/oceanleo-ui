"use client";

// ============================================================================
// @oceanleo/ui — 本标签页自己提交过的 revision head（保存基线兜底）
// ----------------------------------------------------------------------------
// 10-23 实测：编辑器第 1 次保存成了新版本，之后每一次都拿「打开时那一版」当
// CAS 基线，服务端 409，上传的字节留成孤儿。根因是路由把保存回执合进 item 时
// 只换了 id、没换 revisionId（`advancedSavedItem`）。
//
// 这里记两件事，只记本标签页**自己**成功提交的：
//   - 每个 artifact 当前的 head（以及服务端返回的完整 item）；
//   - 这条 head 的谱系：从哪一版起，本页连续提交到了哪一版。
// 用途：
//   1. `advancedSavedItem` 拿回执里的 versionId 找到完整 item，把 revisionId /
//      artifact 投影一起前移，9 个路由不改代码就对；
//   2. doc-io 提交 409 时，若这次的基线是本页谱系里更早的一版，就用记下的
//      head 重试一次。别人提交的版本不在谱系里，冲突照报，CAS 由服务端守。
// 只在内存里：刷新页面后编辑器会从服务端重新取当前版本，不需要它。
// ============================================================================

import type { LibraryItem } from "../library-data";

export interface OwnCommittedHead {
  artifactId: string;
  revisionId: string;
  item?: LibraryItem;
}

interface Lineage {
  head: OwnCommittedHead;
  /** Every revision of this artifact this tab started from or produced, in order. */
  revisions: string[];
}

const MAX_ARTIFACTS = 128;
const MAX_LINEAGE = 256;
const lineages = new Map<string, Lineage>();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 600) : "";
}

/** Record a revision this tab committed on top of `previousRevisionId`. */
export function noteOwnCommittedHead(
  artifactId: string,
  previousRevisionId: string,
  revisionId: string,
  item?: LibraryItem,
): void {
  const id = text(artifactId);
  const previous = text(previousRevisionId);
  const next = text(revisionId);
  if (!id || !next || next === previous) return;
  const existing = lineages.get(id);
  // A commit whose base is not in this tab's chain started a new chain (the
  // editor was reopened on a version someone else produced).
  const revisions =
    existing && previous && existing.revisions.includes(previous)
      ? [...existing.revisions]
      : previous
        ? [previous]
        : [];
  if (!revisions.includes(next)) revisions.push(next);
  lineages.delete(id);
  lineages.set(id, {
    head: { artifactId: id, revisionId: next, item },
    revisions: revisions.slice(-MAX_LINEAGE),
  });
  while (lineages.size > MAX_ARTIFACTS) {
    const oldest = lineages.keys().next().value;
    if (oldest === undefined) break;
    lineages.delete(oldest);
  }
}

export function ownCommittedHead(artifactId: string): OwnCommittedHead | null {
  return lineages.get(text(artifactId))?.head ?? null;
}

/**
 * The head this tab committed after `baseRevisionId`, or null when the base is
 * already the head or is not part of this tab's own chain.
 */
export function ownHeadAfter(
  artifactId: string,
  baseRevisionId: string,
): OwnCommittedHead | null {
  const lineage = lineages.get(text(artifactId));
  const base = text(baseRevisionId);
  if (!lineage || !base || lineage.head.revisionId === base) return null;
  return lineage.revisions.includes(base) ? lineage.head : null;
}

/** The full committed item whose revision is `revisionId`, if this tab made it. */
export function ownCommittedItem(
  artifactId: string,
  revisionId: string,
): LibraryItem | null {
  const head = ownCommittedHead(artifactId);
  return head && head.revisionId === text(revisionId) ? head.item ?? null : null;
}

export function resetOwnCommittedHeadsForTests(): void {
  lineages.clear();
}
