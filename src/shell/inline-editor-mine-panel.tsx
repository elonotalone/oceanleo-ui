"use client";

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { Button } from "../ui/Button";
import { humanErrorMessage } from "./human-error-message";
import { libraryItemIdentityKey } from "./inline-editor-mine-activate";
import type { LibraryItem } from "./library-data";

export interface MineActivationResult {
  ok: boolean;
  /** 留在原处的原因（人话）；ok 时为空。 */
  error?: string;
}

/**
 * 编辑器里的「我的库」：列出我的文件，当前这份高亮。点另一份时先保存当前改动，
 * 保存成功才换；保存失败就留在原处并写明原因（10-23 W02，D2）。
 */
export function InlineEditorMinePanel({
  siteId = "",
  currentItem = null,
  onActivateItem,
}: {
  siteId?: string;
  currentItem?: LibraryItem | null;
  onActivateItem: (
    item: LibraryItem,
  ) => MineActivationResult | void | Promise<MineActivationResult | void>;
}) {
  const tt = useUI();
  const [switching, setSwitching] = useState("");
  const [switchError, setSwitchError] = useState("");
  const activate = async (entry: LibraryItem) => {
    if (switching) return;
    setSwitchError("");
    setSwitching(libraryItemIdentityKey(entry) || entry.title);
    try {
      const result = await onActivateItem(entry);
      if (result && !result.ok) {
        setSwitchError(
          tt("当前改动没有保存成功，先留在这份文件：{reason}", {
            reason: tt(humanErrorMessage(result.error, tt("保存失败，请重试"))),
          }),
        );
      }
    } catch (caught) {
      setSwitchError(humanErrorMessage(caught, tt("切换失败，请重试")));
    } finally {
      setSwitching("");
    }
  };
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
      {switching ? (
        <p
          role="status"
          data-inline-editor-mine-switching
          className="px-2 pb-2 text-[12px] text-[var(--awb-muted,#737373)]"
        >
          {tt("正在保存当前改动…")}
        </p>
      ) : null}
      {switchError ? (
        <p
          role="alert"
          data-inline-editor-mine-switch-error
          className="px-2 pb-2 text-[12px] text-[var(--awb-danger,#dc2626)]"
        >
          {switchError}
        </p>
      ) : null}
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
                  selected={current}
                  disabled={Boolean(switching)}
                  aria-busy={switching === id || undefined}
                  title={entry.title}
                  onClick={() => void activate(entry)}
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
