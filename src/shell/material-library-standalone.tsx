"use client";

import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import type { LibraryItem } from "./library-data";

export function MaterialStandaloneEditor({
  item,
  taskId,
  siteId,
  appId,
  accent,
  className = "",
  onSavedItem,
  onClose,
}: {
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  appId: string;
  accent: string;
  className?: string;
  onSavedItem: (item: LibraryItem) => void;
  onClose: () => void;
}) {
  return (
    <div className={`h-full min-h-0 ${className}`}>
      <AdvancedContentWorkbench
        key={`${item.artifactId || item.id}:${item.revisionId || "transient"}`}
        item={item}
        taskId={taskId}
        siteId={siteId || item.siteId}
        appId={appId}
        accent={accent}
        embedded
        onSavedItem={onSavedItem}
        onClose={onClose}
      />
    </div>
  );
}
