"use client";

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { Button } from "../ui/Button";
import { humanErrorMessage } from "./human-error-message";
import { libraryItemIdentityKey } from "./inline-editor-mine-activate";
import type { LibraryItem } from "./library-data";

export function InlineEditorMinePanel({
  siteId = "",
  currentItem = null,
  onActivateItem,
}: {
  siteId?: string;
  currentItem?: LibraryItem | null;
  onActivateItem: (item: LibraryItem) => void;
}) {
  const tt = useUI();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { listMyArtifacts } = await import("./artifact-client");
      const result = await listMyArtifacts({ limit: 40 });
      if (!result.ok || !result.data) {
        setError(
          result.status === 401
            ? tt("请先登录")
            : humanErrorMessage(result.error, tt("加载失败")),
        );
        setItems([]);
        return;
      }
      setItems(result.data.items);
    } catch (caught) {
      setError(humanErrorMessage(caught, tt("加载失败")));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, siteId]);
  const currentId = libraryItemIdentityKey(currentItem);
  return (
    <div
      data-inline-editor-mine-panel
      className="flex h-full min-h-0 flex-col overflow-hidden p-2"
    >
      {error ? (
        <div className="grid gap-2 p-2 text-[12px] text-[var(--awb-danger,#dc2626)]">
          <p title={error}>{error}</p>
          <Button
            variant="ghost"
            data-inline-editor-mine-retry
            onClick={() => void load()}
          >
            {tt("重试")}
          </Button>
        </div>
      ) : loading ? (
        <p className="sr-only" aria-busy="true">
          {tt("我的库")}
        </p>
      ) : items.length === 0 ? (
        <p className="p-2 text-[12px] text-[var(--awb-muted,#737373)]">
          {tt("暂无作品")}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.map((entry) => {
            const id = libraryItemIdentityKey(entry);
            const current = Boolean(currentId && id && currentId === id);
            return (
              <li key={id || entry.title}>
                <Button
                  variant="ghost"
                  block
                  align="start"
                  data-inline-editor-mine-item={id}
                  data-inline-editor-mine-action="edit"
                  aria-current={current ? "true" : undefined}
                  title={entry.title}
                  onClick={() => onActivateItem(entry)}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
