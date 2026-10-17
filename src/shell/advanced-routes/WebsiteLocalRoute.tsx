"use client";

import { useCallback, useMemo, useState } from "react";
import { Puck } from "@puckeditor/core";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { parseWebsiteSource } from "../website-source-carrier/website-source-validate";
import {
  WEBSITE_SECTION_KINDS,
  WEBSITE_SOURCE_FORMAT,
  type WebsiteSectionKind,
} from "../website-source-carrier/website-source-schema";
import { blankWebsiteSource } from "../website-local/blank-website-source";
import { websitePuckConfig } from "../website-local/website-puck-config";
import {
  addWebsitePage,
  addWebsiteSection,
  cloudBuildPreviewAvailable,
  createWebsiteSourceHistory,
  removeWebsitePage,
  removeWebsiteSection,
  setWebsiteTheme,
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
  const [pageId, setPageId] = useState(initial.pages[0]?.id || "home");
  const [revision, setRevision] = useState(0);
  const [editorKey, setEditorKey] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [addKind, setAddKind] = useState<WebsiteSectionKind>("content");
  const online = typeof navigator === "undefined" ? false : navigator.onLine !== false;
  const preview = cloudBuildPreviewAvailable(online);
  const currentPage = source.pages.find((page) => page.id === pageId) || source.pages[0];

  const syncHistory = useCallback(() => {
    setCanUndo(history.canUndo());
    setCanRedo(history.canRedo());
  }, [history]);

  const commit = useCallback(
    (next: typeof source) => {
      const stored = history.commit(next);
      setSource(stored);
      setRevision((value) => value + 1);
      if (!stored.pages.some((page) => page.id === pageId)) {
        setPageId(stored.pages[0]?.id || "home");
        setEditorKey((value) => value + 1);
      }
      syncHistory();
    },
    [history, pageId, syncHistory],
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
            <div className="flex flex-wrap gap-2 border-b px-4 py-2">
              <button
                type="button"
                data-testid="website-local-undo"
                disabled={!canUndo}
                onClick={() => {
                  const next = history.undo();
                  setSource(next);
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
                  const next = history.redo();
                  setSource(next);
                  setRevision((value) => value + 1);
                  setEditorKey((value) => value + 1);
                  syncHistory();
                }}
              >
                重做
              </button>
            </div>
            <div
              className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[12px]"
              data-testid="website-page-bar"
            >
              {source.pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  data-testid={`website-page-${page.id}`}
                  data-active={page.id === currentPage?.id ? "true" : "false"}
                  onClick={() => {
                    setPageId(page.id);
                    setEditorKey((value) => value + 1);
                  }}
                >
                  {page.title}
                </button>
              ))}
              <button
                type="button"
                data-testid="website-page-add"
                onClick={() => commit(addWebsitePage(source))}
              >
                加页面
              </button>
              <button
                type="button"
                data-testid="website-page-remove"
                disabled={source.pages.length <= 1}
                onClick={() => currentPage && commit(removeWebsitePage(source, currentPage.id))}
              >
                删页面
              </button>
              <label>
                加区块
                <select
                  data-testid="website-section-kind"
                  value={addKind}
                  onChange={(event) => setAddKind(event.target.value as WebsiteSectionKind)}
                >
                  {WEBSITE_SECTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                data-testid="website-section-add"
                onClick={() =>
                  currentPage && commit(addWebsiteSection(source, currentPage.id, addKind))
                }
              >
                加入
              </button>
              <button
                type="button"
                data-testid="website-section-remove"
                onClick={() => {
                  const last = currentPage?.sectionIds.at(-1);
                  if (currentPage && last) {
                    commit(removeWebsiteSection(source, currentPage.id, last));
                    setEditorKey((value) => value + 1);
                  }
                }}
              >
                删末块
              </button>
            </div>
            <div
              className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-[12px]"
              data-testid="website-theme-bar"
            >
              <label>
                强调色
                <input
                  data-testid="website-theme-accent"
                  type="color"
                  value={source.theme.accent}
                  onChange={(event) =>
                    commit(setWebsiteTheme(source, { accent: event.target.value }))
                  }
                />
              </label>
              <label>
                背景
                <input
                  data-testid="website-theme-background"
                  type="color"
                  value={source.theme.background}
                  onChange={(event) =>
                    commit(setWebsiteTheme(source, { background: event.target.value }))
                  }
                />
              </label>
              <label>
                文字
                <input
                  data-testid="website-theme-text"
                  type="color"
                  value={source.theme.text}
                  onChange={(event) =>
                    commit(setWebsiteTheme(source, { text: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="min-h-0 flex-1">
              <Puck
                key={`${editorKey}:${currentPage?.id || "home"}`}
                config={websitePuckConfig}
                data={websiteSourceToPuck(source, currentPage?.id)}
                iframe={{ enabled: false }}
                onChange={(data) =>
                  commit(puckToWebsiteSource(data, source, currentPage?.id))
                }
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
