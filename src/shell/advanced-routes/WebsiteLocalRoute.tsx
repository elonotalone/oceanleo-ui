"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { parseWebsiteSource } from "../website-source-carrier/website-source-validate";
import {
  WEBSITE_SECTION_KINDS,
  WEBSITE_SOURCE_FORMAT,
  type WebsiteSectionKind,
  type WebsiteSource,
} from "../website-source-carrier/website-source-schema";
import { blankWebsiteSource } from "../website-local/blank-website-source";
import { websitePuckConfig, WebsiteStrictThemeContext } from "../website-local/website-puck-config";
import { WebsitePuckStage } from "../website-local/WebsitePuckStage";
import { websiteFaceForMode } from "../website-local/website-puck-faces";
import { setPluginMode } from "../plugin-chrome/plugin-mode-store";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor";
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
import { createWebsiteCommandSurface } from "../website-local/website-command-surface";
import {
  hydrateWebsiteLocalSource,
  planWebsiteLocalSource,
  websiteLocalSourceFromItem,
} from "./non-richdoc-source-gate";
import { usePluginCommandSurface } from "../plugin-command";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { refreshArtifactRendition } from "../artifact-client";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import { siteEnvelopeOf, type SiteEnvelope } from "../website-local/website-site-doc";
import { WebsiteSiteWorkbench } from "../website-local/WebsiteSiteWorkbench";
import { unwrapStoredEditorProject } from "./stored-editor-project";
import { saveStrictWebsiteRevision } from "../website-local/website-strict-save";
import { recordUserMutation, userEditItemKey } from "../user-edit-session";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import { SitePuckBridgeContext, SitePuckBridgeHost } from "../website-local/WebsiteSitePuckBridge";
import { strictWebsiteSelection, applyStrictWebsiteCommand } from "../website-local/website-strict-bar";
import { WebsiteWorkbenchPanels } from "../website-platform/WebsiteWorkbenchPanels";
import { WebsiteCodeFace } from "../website-platform/WebsiteCodeFace";
import {
  websiteCodeProjectFromText,
  type WebsiteCodeProject,
} from "../website-platform/website-code-project";
import { usePluginPage } from "../plugin-chrome/plugin-page-store";

const WEBSITE_AUX_PANELS = [
  ["code", "源码"],
  ["dashboard", "仪表盘"],
  ["database", "数据库"],
  ["storage", "文件存储"],
  ["settings", "设置"],
] as const;

/**
 * Code websites (git repo) open on the code face: 「编辑」 is Source + preview,
 * and the platform pages follow. Visual sites keep WEBSITE_AUX_PANELS.
 */
const WEBSITE_CODE_AUX_PANELS = [
  ["history", "历史"],
  ["publish", "发布"],
  ["database", "数据库"],
  ["storage", "文件存储"],
  ["dashboard", "仪表盘"],
  ["settings", "设置"],
] as const;
type WebsiteCodeAuxPanel = (typeof WEBSITE_CODE_AUX_PANELS)[number][0];

/** Entry text → site-document envelope (bundle `site.json` or structured), else null. */
export function websiteSiteEnvelopeFromText(text: string): SiteEnvelope | null {
  try {
    const unwrapped = unwrapStoredEditorProject(text);
    return siteEnvelopeOf(typeof unwrapped === "string" ? unwrapped : JSON.stringify(unwrapped));
  } catch {
    return null;
  }
}

export { websiteLocalSourceFromItem, planWebsiteLocalSource, hydrateWebsiteLocalSource };

export function WebsiteLocalRoute({
  item,
  taskId,
  siteId = "",
  accent = "#1F6FEB",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const projectId = String(
    (item as any)?.meta?.website_id ||
      (item as any)?.meta?.project_id ||
      (item as any)?.metadata?.website_id ||
      (item as any)?.metadata?.project_id ||
      (item as any)?.websiteProjectId ||
      "",
  );
  const { pageId: pluginPageId, setPage: setPluginPage } = usePluginPage("website");
  const activePanel = WEBSITE_AUX_PANELS.some(([id]) => id === pluginPageId)
    ? (pluginPageId as "code" | "dashboard" | "database" | "storage" | "settings")
    : null;
  const websitePages = useMemo(
    () => ({
      activePageId: pluginPageId,
      onSelectPage: (next: string) => setPluginPage(next),
      aux: WEBSITE_AUX_PANELS.map(([id, label]) => ({
        id,
        label,
        kind: "aux" as const,
        ...(projectId
          ? {}
          : { disabled: true, unavailableReason: "网站项目尚未关联" }),
      })),
    }),
    [pluginPageId, projectId, setPluginPage],
  );
  const [reloadNonce, setReloadNonce] = useState(0);
  const itemIdentity = `${item?.key || item?.id || ""}:${item?.revisionId || ""}:${item?.artifactId || ""}:${reloadNonce}`;
  const plan = useMemo(
    () => planWebsiteLocalSource(item || { title: "本地可编辑的网站工程" }),
    // itemIdentity pins key/revision/retry; avoid parent object-identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemIdentity],
  );
  const [remoteSource, setRemoteSource] = useState<WebsiteSource | null>(null);
  const [remoteError, setRemoteError] = useState("");
  const [remoteLoading, setRemoteLoading] = useState(plan.kind === "remote");
  const loadedIdentityRef = useRef("");
  // Site documents (bundle `site.json` / structured entry): the format of
  // nearly every stored website. Revisions this tab saved must not reload it.
  const [siteEntry, setSiteEntry] = useState<{
    envelope: SiteEnvelope;
    artifactId: string;
    revisionId: string;
  } | null>(null);
  const ownSavedRevisionsRef = useRef(new Set<string>());
  // Git/code websites: the Library entry is a website-project manifest.
  const [codeProject, setCodeProject] = useState<WebsiteCodeProject | null>(null);
  const activeCodePanel = WEBSITE_CODE_AUX_PANELS.some(([id]) => id === pluginPageId)
    ? (pluginPageId as WebsiteCodeAuxPanel)
    : null;
  const websiteCodePages = useMemo(
    () => ({
      activePageId: pluginPageId,
      onSelectPage: (next: string) => setPluginPage(next),
      proUnavailableReason: "代码网站在「编辑」页里改源码",
      aux: WEBSITE_CODE_AUX_PANELS.map(([id, label]) => ({
        id,
        label,
        kind: "aux" as const,
      })),
    }),
    [pluginPageId, setPluginPage],
  );

  useEffect(() => {
    if (plan.kind !== "remote") {
      setRemoteSource(null);
      setRemoteError("");
      setRemoteLoading(false);
      return;
    }
    if (loadedIdentityRef.current === itemIdentity) return;
    if (
      ownSavedRevisionsRef.current.has(String(item?.revisionId || ""))
    ) {
      loadedIdentityRef.current = itemIdentity;
      return;
    }
    let cancelled = false;
    const abort = new AbortController();
    setRemoteLoading(true);
    setRemoteError("");
    setRemoteSource(null);
    setSiteEntry(null);
    setCodeProject(null);
    let entryText = "";
    // The source URL is a 300 s signed grant and the gateway can restart under
    // an open editor: re-sign through the gateway on 410, retry transient
    // network failures, never fall back to a blank draft.
    const artifactId = String(item?.artifactId || "");
    const revisionId = String(
      item?.revisionId || item?.artifact?.revisionId || "",
    );
    void hydrateWebsiteLocalSource(
      plan,
      async (url) => {
        const blob = await fetchMediaBlob(url, {
          cache: "no-store",
          maxBytes: 20_000_000,
          signal: abort.signal,
        });
        entryText = await blob.text();
        return entryText;
      },
      {
        signal: abort.signal,
        refreshUrl:
          artifactId && revisionId
            ? async () => {
                const refreshed = await refreshArtifactRendition(
                  { artifactId, revisionId },
                  "source",
                  abort.signal,
                );
                return refreshed.ok ? refreshed.data?.url || null : null;
              }
            : undefined,
      },
    ).then((result) => {
      if (cancelled) return;
      setRemoteLoading(false);
      if (result.ok) {
        loadedIdentityRef.current = itemIdentity;
        setRemoteSource(result.source);
        return;
      }
      // A git/code website is not a visual website-source: open its code face
      // instead of reporting the visual editor's §3.1 schema failure.
      const code = entryText ? websiteCodeProjectFromText(entryText) : null;
      if (code) {
        loadedIdentityRef.current = itemIdentity;
        setCodeProject(code);
        return;
      }
      const envelope = entryText ? websiteSiteEnvelopeFromText(entryText) : null;
      if (envelope && artifactId && revisionId) {
        loadedIdentityRef.current = itemIdentity;
        setSiteEntry({ envelope, artifactId, revisionId });
        return;
      }
      setRemoteError(result.error);
    });
    return () => {
      cancelled = true;
      abort.abort();
    };
    // plan.kind/url are derived from itemIdentity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIdentity, plan]);

  const admitted =
    plan.kind === "ready" || plan.kind === "blank"
      ? { ok: true as const, source: plan.source }
      : plan.kind === "remote" && remoteSource
        ? { ok: true as const, source: remoteSource }
        : {
            ok: false as const,
            error:
              plan.kind === "fail"
                ? plan.error
                : remoteError || "正在读取远程网站工程，未改用空白稿覆盖原件。",
          };
  const initial = admitted.ok
    ? admitted.source
    : blankWebsiteSource(item?.title || "本地可编辑的网站工程");
  const sourceFailed = !admitted.ok;
  const sourceFailureReason = admitted.ok ? "" : admitted.error;
  const history = useMemo(() => createWebsiteSourceHistory(initial), [initial]);
  const [source, setSource] = useState(initial);
  const [pageId, setPageId] = useState(initial.pages[0]?.id || "home");
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const baseItemRef = useRef(item);
  if (baseItemRef.current?.artifactId !== item?.artifactId) baseItemRef.current = item;
  const [editorKey, setEditorKey] = useState(0);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Normal = composed light UI, Pro = Puck's default UI; one Puck instance, same data.
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [addKind, setAddKind] = useState<WebsiteSectionKind>("content");
  const online = typeof navigator === "undefined" ? false : navigator.onLine !== false;
  const preview = cloudBuildPreviewAvailable(online);
  const currentPage = source.pages.find((page) => page.id === pageId) || source.pages[0];
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  useEffect(() => {
    if (sourceFailed || revision > 0) return;
    setSource(initial);
    setPageId(initial.pages[0]?.id || "home");
  }, [initial, revision, sourceFailed]);

  const syncHistory = useCallback(() => {
    setCanUndo(history.canUndo());
    setCanRedo(history.canRedo());
  }, [history]);

  const commit = useCallback(
    (next: WebsiteSource, fromPuck = false) => {
      if (sourceFailed) return;
      if (JSON.stringify(next) === JSON.stringify(sourceRef.current)) return;
      recordUserMutation(userEditItemKey(item));
      const stored = history.commit(next);
      setSource(stored);
      setRevision((value) => value + 1);
      if (!fromPuck) setEditorKey(value => value + 1);
      if (!stored.pages.some((page) => page.id === pageId)) {
        setPageId(stored.pages[0]?.id || "home");
        setEditorKey((value) => value + 1);
      }
      syncHistory();
    },
    [history, item, pageId, sourceFailed, syncHistory],
  );

  usePluginCommandSurface(
    useMemo(
      () =>
        createWebsiteCommandSurface({
          source: () => sourceRef.current,
          revision: () => revisionRef.current,
          sourceReady: () => !sourceFailed && !remoteLoading,
          apply: (next) => commit(next),
          pageId: () => pageId,
          target: () => pluginTargetForLibraryItem(item, "website", revisionRef.current),
        }),
      [commit, item, pageId, remoteLoading, sourceFailed],
    ),
  );

  const undo = () => {
    recordUserMutation(userEditItemKey(item));
    const next = history.undo();
    setSource(next);
    setRevision((value) => value + 1);
    setEditorKey((value) => value + 1);
    syncHistory();
  };
  const redo = () => {
    recordUserMutation(userEditItemKey(item));
    const next = history.redo();
    setSource(next);
    setRevision((value) => value + 1);
    setEditorKey((value) => value + 1);
    syncHistory();
  };

  const strictBridge = useMemo(() => ({
    pushToken: editorKey,
    data: () => websiteSourceToPuck(sourceRef.current, pageId),
    onSelectedSection: setSelectedSection,
    selectToken: 0, selectId: "",
  }), [editorKey, pageId]);
  const strictSelection = strictWebsiteSelection(source, pageId, selectedSection || "", tt);

  if (!item) {
    return <div data-testid="website-missing-item">没有打开的网站工程。</div>;
  }

  if (codeProject) {
    const codeProjectId = codeProject.projectId || projectId;
    return (
      <AdvancedWorkbenchShell
        item={item}
        taskId={taskId}
        siteId={siteId}
        accent={accent}
        adapter={{
          id: "website",
          label: "网站",
          pages: websiteCodePages,
          stage: activeCodePanel ? (
            <div
              className="flex h-full min-h-0 flex-col bg-[var(--awb-stage-bg)]"
              data-testid={`website-${activeCodePanel}-stage`}
            >
              <WebsiteWorkbenchPanels projectId={codeProjectId} panel={activeCodePanel} hideTabs />
            </div>
          ) : (
            <WebsiteCodeFace projectId={codeProjectId} />
          ),
        }}
        onClose={onClose}
      />
    );
  }

  if (siteEntry) {
    return (
      <WebsiteSiteWorkbench
        key={siteEntry.artifactId}
        item={item}
        taskId={taskId}
        siteId={siteId}
        accent={accent}
        onClose={onClose}
        envelope={siteEntry.envelope}
        identity={{ artifactId: siteEntry.artifactId, revisionId: siteEntry.revisionId }}
        projectId={projectId || undefined}
        onSavedRevision={(revisionId) => ownSavedRevisionsRef.current.add(revisionId)}
      />
    );
  }

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "website",
        label: "网站",
        history: { canUndo, canRedo, undo, redo },
        contextToolbar: strictSelection ? <SelectionToolbar context={strictSelection} accent={accent} onCommand={command => {
          if (command.selectionId === strictSelection.id) commit(applyStrictWebsiteCommand(source, pageId, strictSelection.id, command));
        }} /> : null,
        mode: {
          current: mode,
          setMode: (next) => {
            setMode(next);
            setPluginMode("website", next);
          },
        },
        pages: websitePages,
        stage: remoteLoading ? (
          <div className="flex h-full items-center justify-center p-8 text-sm" data-testid="website-remote-loading">
            正在读取远程网站工程。
          </div>
        ) : activePanel && projectId ? (
          <div className="flex h-full min-h-0 flex-col bg-[var(--awb-stage-bg)]" data-testid={`website-${activePanel}-stage`}>
            <WebsiteWorkbenchPanels
              projectId={projectId}
              stack={String((item as any)?.meta?.stack || (item as any)?.metadata?.stack || "static")}
              commit={String((item as any)?.meta?.git_commit || (item as any)?.metadata?.git_commit || "") || undefined}
              panel={activePanel}
              hideTabs
            />
          </div>
        ) : sourceFailed ? (
          <EditorSourceFailurePanel
            message={sourceFailureReason}
            onReload={() => {
              loadedIdentityRef.current = "";
              setRemoteSource(null);
              setReloadNonce((value) => value + 1);
            }}
            variant="surface"
          />
        ) : (
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
              <WebsiteStrictThemeContext.Provider value={source.theme}>
              <SitePuckBridgeContext.Provider value={strictBridge}>
              <WebsitePuckStage
                key={currentPage?.id || "home"}
                face={websiteFaceForMode(mode)}
                config={websitePuckConfig}
                data={websiteSourceToPuck(source, currentPage?.id)}
                onChange={(data) =>
                  commit(puckToWebsiteSource(data, source, currentPage?.id), true)
                }
                puckWrapper={SitePuckBridgeHost}
              />
              </SitePuckBridgeContext.Provider>
              </WebsiteStrictThemeContext.Provider>
            </div>
          </div>
        ),
        persistence: {
          userEditKey: userEditItemKey(item),
          dirty: !sourceFailed && !remoteLoading && revision > savedRevision,
          editRevision: revision,
          flush: async () => {
            if (sourceFailed || remoteLoading || !baseItemRef.current) {
              return { ok: false as const, error: sourceFailureReason || "网站工程尚未载入完成。" };
            }
            const savingRevision = revisionRef.current;
            try {
              const result = await saveStrictWebsiteRevision(baseItemRef.current, sourceRef.current, siteId, savingRevision);
              if (!result.ok) return result;
              if (result.item) baseItemRef.current = result.item;
              const revisionId = String(result.item?.revisionId || result.revisionId || "");
              if (revisionId) ownSavedRevisionsRef.current.add(revisionId);
              setSavedRevision(value => Math.max(value, savingRevision));
              return { ok: true as const, item: result.item };
            } catch (error) {
              return { ok: false as const, error: error instanceof Error ? error.message : "网站没能保存成新版本。" };
            }
          },
          recovery: {
            draftSchema: WEBSITE_SOURCE_FORMAT,
            key: advancedRecoveryKey("website", item),
            ready: !sourceFailed && !remoteLoading,
            capture: () => (sourceFailed || remoteLoading ? null : source),
            restore: (payload) => {
              try {
                setSource(parseWebsiteSource(JSON.stringify(payload)));
                setRevision(value => value + 1);
                setEditorKey(value => value + 1);
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
