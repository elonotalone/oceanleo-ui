"use client";

import { useCallback, useMemo, useState } from "react";
import { Puck } from "@puckeditor/core";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { parseWebsiteSource } from "../website-source-carrier/website-source-validate";
import { WEBSITE_SOURCE_FORMAT } from "../website-source-carrier/website-source-schema";
import { blankWebsiteSource } from "../website-local/blank-website-source";
import { websitePuckConfig } from "../website-local/website-puck-config";
import {
  cloudBuildPreviewAvailable,
  createWebsiteSourceHistory,
} from "../website-local/website-source-session";
import {
  puckToWebsiteSource,
  websiteSourceToPuck,
} from "../website-local/website-puck-map";

export function WebsiteLocalRoute({
  item,
  taskId,
  siteId = "",
  accent = "#1F6FEB",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const initial = useMemo(() => {
    const raw = item?.meta && typeof item.meta === "object" ? item.meta.websiteSource : undefined;
    if (raw && typeof raw === "object") {
      try {
        return parseWebsiteSource(JSON.stringify(raw));
      } catch {
        /* blank */
      }
    }
    return blankWebsiteSource(item?.title || "本地可编辑的网站工程");
  }, [item]);
  const history = useMemo(() => createWebsiteSourceHistory(initial), [initial]);
  const [source, setSource] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [editorKey, setEditorKey] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const online = typeof navigator === "undefined" ? false : navigator.onLine !== false;
  const preview = cloudBuildPreviewAvailable(online);

  const syncHistory = useCallback(() => {
    setCanUndo(history.canUndo());
    setCanRedo(history.canRedo());
  }, [history]);

  const commit = useCallback(
    (next: typeof source) => {
      const stored = history.commit(next);
      setSource(stored);
      setRevision((value) => value + 1);
      syncHistory();
    },
    [history, syncHistory],
  );

  if (!item) {
    return <div data-testid="website-missing-item">没有打开的网站工程。</div>;
  }

  const savedItem = {
    ...item,
    title: source.title,
    meta: {
      ...item.meta,
      editor: "website",
      websiteSource: source,
      editor_project_schema: WEBSITE_SOURCE_FORMAT,
    },
  };

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "website",
        label: "网站",
        stage: (
          <div className="flex h-full min-h-0 flex-col" data-testid="website-local-stage">
            {preview.available ? null : (
              <p
                className="border-b px-4 py-2 text-[12px] text-[var(--muted,#78716c)]"
                data-testid="website-offline-preview-notice"
                role="status"
              >
                {preview.notice}
              </p>
            )}
            <div className="flex gap-2 border-b px-4 py-2">
              <button
                type="button"
                data-testid="website-local-undo"
                disabled={!canUndo}
                onClick={() => {
                  setSource(history.undo());
                  setRevision((value) => value + 1);
                  setEditorKey((value) => value + 1);
                  syncHistory();
                }}
              >
                撤销
              </button>
              <button
                type="button"
                data-testid="website-local-redo"
                disabled={!canRedo}
                onClick={() => {
                  setSource(history.redo());
                  setRevision((value) => value + 1);
                  setEditorKey((value) => value + 1);
                  syncHistory();
                }}
              >
                重做
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Puck
                key={editorKey}
                config={websitePuckConfig}
                data={websiteSourceToPuck(source)}
                onChange={(data) => commit(puckToWebsiteSource(data, source))}
              />
            </div>
          </div>
        ),
        persistence: {
          dirty: revision > 0,
          editRevision: revision,
          autoSave: false,
          flush: () => ({ ok: true as const, item: savedItem }),
          recovery: {
            draftSchema: WEBSITE_SOURCE_FORMAT,
            key: advancedRecoveryKey("website", item),
            ready: true,
            capture: () => source,
            restore: (payload) => {
              try {
                setSource(parseWebsiteSource(JSON.stringify(payload)));
                return true;
              } catch {
                return false;
              }
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
