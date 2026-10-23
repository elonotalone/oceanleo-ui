"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useUI } from "../i18n/ui/useUI";
import { listMyArtifacts, searchArtifactLibrary } from "./artifact-client";
import type { ArtifactType } from "./artifact-contract";
import type { LibraryItem } from "./library-data";
import { WorkspaceCard } from "./workspace-library-view";
import { workspaceEntryFromLibraryItem, type WorkspaceLibraryEntry } from "./workspace-library-model";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";

const TYPE_ALIASES: Record<string, readonly string[]> = {
  image: ["single_file_image", "composite_image"], video: ["video"], audio: ["audio"],
  document: ["document"], ppt: ["deck"], sheet: ["grid"], pdf: ["pdf"],
  "3d": ["model_3d"], video_workflow: ["workflow"],
};

export function insertableArtifactTypes(declared: readonly string[]): ArtifactType[] {
  return [...new Set(declared.flatMap(type => TYPE_ALIASES[type] || [type]))] as ArtifactType[];
}

/** Insertable bytes are different from the current app's editable documents.
 * Keep public materials site-scoped; the user's own media may come from any
 * app. Card activation inserts into the current editor, never navigates it. */
export function InlineInsertableMaterialShelf({ types, siteId, currentId, featured, accent, action, perform, canPerform, beginDrag, endDrag }: {
  types: readonly string[]; siteId: string; currentId: string;
  featured: readonly WorkspaceLibraryEntry[]; accent: string; action: WorkbenchMaterialAction;
  perform: (action: WorkbenchMaterialAction, item: LibraryItem) => Promise<{ ok: boolean; error?: string }>;
  canPerform?: (action: WorkbenchMaterialAction, item: LibraryItem) => boolean;
  beginDrag?: (item: LibraryItem) => void; endDrag?: () => void;
}) {
  const tt = useUI();
  const typeKey = insertableArtifactTypes(types).join(",");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const accepted = typeKey.split(",").filter(Boolean) as ArtifactType[];
    const own = accepted.map(artifactType => listMyArtifacts({ artifactType, limit: 40, signal: controller.signal }));
    const publicSite = siteId ? [searchArtifactLibrary({ artifactTypes: typeKey, originSiteKey: siteId, role: "template", limit: 40, signal: controller.signal })] : [];
    void Promise.allSettled([...own, ...publicSite]).then(results => {
      if (controller.signal.aborted) return;
      const loaded: LibraryItem[] = [];
      let failure = "";
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.ok && result.value.data) loaded.push(...result.value.data.items);
        else failure = result.status === "fulfilled" ? result.value.error || "连不上素材服务，请检查网络后重试。" : "连不上素材服务，请检查网络后重试。";
      }
      setItems(loaded); setError(failure); setLoading(false);
    });
    return () => controller.abort();
  }, [typeKey, siteId, attempt]);
  const entries = useMemo(() => {
    const accepted = new Set(typeKey.split(","));
    const unique = new Map<string, WorkspaceLibraryEntry>();
    for (const entry of [...featured, ...items.map(item => workspaceEntryFromLibraryItem(item))]) {
      const item = entry.libraryItem;
      if (!item || !item.artifactType || !accepted.has(item.artifactType)) continue;
      const id = item.artifactId || item.id;
      if (id === currentId || unique.has(id)) continue;
      if (query && !entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) continue;
      unique.set(id, entry);
    }
    return [...unique.values()];
  }, [featured, items, currentId, typeKey, query]);
  return <div data-inline-insertable-materials className="flex h-full min-h-0 flex-col gap-2 p-3">
    <input type="search" aria-label={tt("搜索素材")} placeholder={tt("搜索素材")} value={query} onChange={event => setQuery(event.target.value)}
      className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--fg)]" />
    {loading ? <p role="status" className="text-xs text-[var(--fg-2)]">{tt("加载中…")}</p> : null}
    {error ? <p role="alert" className="text-xs text-[var(--fg-2)]">{tt(error)} <button type="button" className="min-h-11 px-3" onClick={() => setAttempt(value => value + 1)}>{tt("重试")}</button></p> : null}
    <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-2" inert={pending || undefined}>
        {entries.map(entry => {
          const item = entry.libraryItem!;
          const available = canPerform?.(action, item) ?? true;
          if (!available) return null;
          return <WorkspaceCard key={entry.id} entry={entry} accent={accent}
            onOpen={() => { if (!pending) { setPending(true); void perform(action, item).finally(() => setPending(false)); } }}
            dragProps={{ draggable: Boolean(beginDrag), onDragStart: (event: DragEvent<HTMLElement>) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("application/x-oceanleo-material+json", JSON.stringify({ id: item.key, title: item.title, kind: item.kind }));
              beginDrag?.(item);
            }, onDragEnd: () => endDrag?.() }} />;
        })}
      </div>
      {!loading && !error && entries.length === 0 ? <p className="py-3 text-xs text-[var(--fg-2)]">{tt("暂无素材")}</p> : null}
    </div>
  </div>;
}
