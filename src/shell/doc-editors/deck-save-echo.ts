// ============================================================================
// 演示保存后的「回声」与保存基线（10-23 W07 实测，`signals/W07-journal.md`）
// ----------------------------------------------------------------------------
// 从公共模板打开 → fork → 第 1 次保存成了新版本；宿主随后把保存回执合进 item
// （新 id / 新 url）传回来，载入键变了，编辑器整份重载：遮罩闪一下、选区丢了，
// 重载读到服务端草稿又标脏，第 2 次保存拿「打开时那一版」当 CAS 基线 → 409 →
// 内核重试又撞 blob 摘要冲突 → 保存失败。
//
// 两条规矩：
//   1. 宿主传回的 item 若就是本编辑器自己刚存的那一版（id / revisionId 任一命中），
//      不重载——画布上的就是它，保存基线已经前移。
//   2. 每次保存前，若基线是本标签页自己谱系里更早的一版，先换成自己的 head
//      （`editor-own-heads.ts`），别人提交的版本不在谱系里，冲突照报。
// ============================================================================

import type { LibraryItem } from "../library-data";
import type { PersistedEditorVersion } from "./doc-io";
import { ownHeadAfter } from "./editor-own-heads";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 600) : "";
}

export function deckItemArtifactId(item: LibraryItem): string {
  return (
    text(item.artifactId) ||
    text(item.meta.artifact_id) ||
    text(item.meta.root_asset_id) ||
    text(item.meta.parent_asset_id) ||
    text(item.id)
  );
}

export function deckItemRevision(item: LibraryItem): string {
  return text(item.revisionId) || text(item.meta.revision_id) || text(item.id);
}

/** Every id under which `item` may name the revision it carries. */
export function deckItemRevisionIds(item: LibraryItem): string[] {
  return [text(item.id), text(item.revisionId), text(item.meta.revision_id)].filter(Boolean);
}

/** True when the host handed back the revision this editor itself just saved. */
export function isDeckOwnSaveEcho(
  incoming: LibraryItem,
  persisted: LibraryItem,
  ownRevisions: ReadonlySet<string>,
): boolean {
  if (ownRevisions.size === 0) return false;
  const artifactId = deckItemArtifactId(incoming);
  if (!artifactId || artifactId !== deckItemArtifactId(persisted)) return false;
  return deckItemRevisionIds(incoming).some((id) => ownRevisions.has(id));
}

/** The base to commit on: this tab's own newer head when `item` is an older link of it. */
export function deckSaveBaseItem(item: LibraryItem): LibraryItem {
  const head = ownHeadAfter(deckItemArtifactId(item), deckItemRevision(item));
  if (!head) return item;
  return {
    ...item,
    revisionId: head.revisionId,
    meta: { ...item.meta, revision_id: head.revisionId },
  };
}

/** A loaded durable document already has a version; a clean flush reuses it. */
export function deckExistingVersion(
  item: LibraryItem,
  url: string,
  projectUrl: string,
): PersistedEditorVersion | null {
  const revisionId = text(item.revisionId) || text(item.meta.revision_id);
  const artifactId = text(item.artifactId) || text(item.meta.artifact_id);
  if (!artifactId || !revisionId || !url) return null;
  return {
    url,
    versionId: revisionId,
    artifactId,
    revisionId,
    projectUrl,
    projectSchema: text(item.meta.editor_project_schema) || "oceanleo.deck.v1",
    sourceFormat: text(item.meta.source_format) || "pptx",
    sourceMediaType: text(item.meta.source_media_type) || undefined,
    title: item.title,
    item,
  };
}
