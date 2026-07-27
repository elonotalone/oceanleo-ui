"use client";

/**
 * 素材卡上的「下载」（合同 §0.6：大卡片删掉的下载入口迁到探索页素材卡）。
 *
 * 交付给 W4 挂载：`WorkspaceLibrary` 的 `entryActions` 透传拿到这个渲染函数后
 * 直接交给 `WorkspaceCard` / `WorkspaceListRow` 已有的 `actions` 插槽即可
 * （合同 §8.9 裁定：shelf-quiet 断言只为「下载」这一个动作放宽）。
 *
 *   <WorkspaceLibrary entryActions={materialEntryDownloadAction} … />
 *
 * 本组件不新造任何错误文案：可见性、可用性与四档拒绝原因全部来自
 * `artifactDownloadEvidence()`，下载动作本身走 `getArtifactDownload()`，
 * 与详情头部 `ArtifactActions` 的 `runDownload` 逐字同源。
 */

import { useState, type MouseEvent, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  artifactDownloadEvidence,
  getArtifactDownload,
} from "./artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import type { WorkspaceLibraryEntry } from "./WorkspaceLibrary";

/** 只有素材货架（探索页 / 更多素材）的条目才带卡片级下载。 */
export function isMaterialDownloadEntry(
  entry: WorkspaceLibraryEntry,
): boolean {
  const item = entry.libraryItem;
  return Boolean(
    item &&
      isDurableLibraryItem(item) &&
      item.meta.workspace_library_surface === "materials" &&
      artifactDownloadEvidence(item).visible,
  );
}

export function MaterialEntryDownload({
  item,
}: {
  item: LibraryItem;
}) {
  const tt = useUI();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const evidence = artifactDownloadEvidence(item);
  const durable = isDurableLibraryItem(item) ? item : null;
  if (!evidence.visible || !durable) return null;

  const run = async (event: MouseEvent<HTMLButtonElement>) => {
    // 卡片主体是同级的另一个 button，别让下载顺带打开预览。
    event.preventDefault();
    event.stopPropagation();
    if (!evidence.available || pending) {
      if (!evidence.available) setStatus(evidence.reason);
      return;
    }
    setPending(true);
    setStatus("正在准备固定 revision 的下载…");
    try {
      const result = await getArtifactDownload(item);
      if (
        !result.ok ||
        !result.data ||
        result.data.artifactId !== durable.artifactId ||
        result.data.revisionId !== durable.revisionId
      ) {
        throw new Error(result.error || "下载 identity 校验失败。");
      }
      const link = document.createElement("a");
      link.href = result.data.url;
      link.download = result.data.filename;
      link.type = result.data.mediaType;
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
      setStatus("下载已开始。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "下载失败。");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        data-material-card-download={durable.artifactId}
        onClick={(event) => void run(event)}
        disabled={!evidence.available || pending}
        aria-disabled={!evidence.available || pending}
        aria-label={tt(
          `下载「${item.title}」revision ${durable.revisionId}`,
        )}
        title={tt(evidence.available ? "下载" : evidence.reason)}
        className="min-h-8 shrink-0 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] disabled:opacity-50"
      >
        {tt(pending ? "处理中…" : "下载")}
      </button>
      {status && (
        <span
          role="status"
          aria-live="polite"
          className="line-clamp-2 min-w-0 text-[10px] leading-tight text-[var(--muted,#a8a29e)]"
        >
          {tt(status)}
        </span>
      )}
    </div>
  );
}

/** W4 直接把这个函数传给 `WorkspaceLibrary` 的 `entryActions`。 */
export function materialEntryDownloadAction(
  entry: WorkspaceLibraryEntry,
): ReactNode {
  const item = entry.libraryItem;
  if (!item || !isMaterialDownloadEntry(entry)) return null;
  return <MaterialEntryDownload key={`download:${entry.id}`} item={item} />;
}
