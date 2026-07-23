"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AdvancedContentWorkbenchProps } from "./advanced-workbench-types";
import { UnsupportedRoute } from "./advanced-routes/UnsupportedRoute";
import { WorkbenchRouteLoading } from "./advanced-routes/WorkbenchRouteLoading";
import { editorCapabilityFor, editorRouteFor } from "./workbench-routes";
import { WorkbenchErrorBoundary } from "./WorkbenchErrorBoundary";
import {
  WorkspaceSessionProvider,
  useOptionalWorkspaceSession,
  useWorkspaceSession,
} from "./WorkspaceSession";
import {
  ADVANCED_SESSION_SCHEMA_VERSION,
  advancedItemFromSession,
  advancedRootItemId,
  advancedSessionAppId,
  advancedSessionSnapshot,
  withInlineEditorHistoryHead,
} from "./advanced-session";
import {
  advancedFeatureForItem,
  advancedFeatureHref,
} from "./advanced-features";
import {
  AdvancedSessionContext,
  type AdvancedFlushResult,
} from "./advanced-session-context";
import type { LibraryItem } from "./library-data";
import { WorkbenchMaterialProvider } from "./workbench-material-provider";
import {
  AdvancedEditorHostProvider,
  useAdvancedEditorHost,
} from "./advanced-editor-host-context";

export type { AdvancedContentWorkbenchProps } from "./advanced-workbench-types";

const VideoTimelineRoute = dynamic(
  () =>
    import("./advanced-routes/VideoTimelineRoute").then(
      (module) => module.VideoTimelineRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const AudioRoute = dynamic(
  () =>
    import("./advanced-routes/AudioRoute").then(
      (module) => module.AudioRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const ImageRoute = dynamic(
  () =>
    import("./advanced-routes/ImageRoute").then(
      (module) => module.ImageRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const PdfRoute = dynamic(
  () =>
    import("./advanced-routes/PdfRoute").then(
      (module) => module.PdfRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const Model3DRoute = dynamic(
  () =>
    import("./advanced-routes/Model3DRoute").then(
      (module) => module.Model3DRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const RichDocRoute = dynamic(
  () =>
    import("./advanced-routes/RichDocRoute").then(
      (module) => module.RichDocRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const GridRoute = dynamic(
  () =>
    import("./advanced-routes/GridRoute").then(
      (module) => module.GridRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const DeckRoute = dynamic(
  () =>
    import("./advanced-routes/DeckRoute").then(
      (module) => module.DeckRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const EmbeddedRoute = dynamic(
  () =>
    import("./advanced-routes/EmbeddedRoute").then(
      (module) => module.EmbeddedRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const ChartRoute = dynamic(
  () =>
    import("./advanced-routes/ChartRoute").then(
      (module) => module.ChartRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);

export function AdvancedContentWorkbench(
  props: AdvancedContentWorkbenchProps,
) {
  const [mounted, setMounted] = useState(false);
  const inheritedWorkspace = useOptionalWorkspaceSession();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const route = editorRouteFor(props.item);
  const siteId = props.siteId || props.item.siteId || "oceanleo";
  const appId =
    props.initialSession?.app_id ||
    advancedSessionAppId(props.item, route.type);
  const feature = advancedFeatureForItem(props.item);
  const materialAppId = props.embedded
    ? inheritedWorkspace?.appId || props.appId || siteId
    : feature
      ? `advanced:${feature.id}`
      : appId;
  const editor = (
    <AdvancedEditorHostProvider
      value={{
        embedded: props.embedded === true,
        onSavedItem: props.onSavedItem,
      }}
    >
      <WorkbenchMaterialProvider siteId={siteId} appId={materialAppId}>
        <AdvancedContentWorkbenchRuntime {...props} />
      </WorkbenchMaterialProvider>
    </AdvancedEditorHostProvider>
  );
  if (props.embedded) {
    if (inheritedWorkspace) return editor;
    return (
      <WorkspaceSessionProvider
        siteId={siteId}
        appId={props.appId || "library"}
        mode={props.mode || "workspace"}
        resumeLatest={false}
      >
        {editor}
      </WorkspaceSessionProvider>
    );
  }
  return (
    <WorkspaceSessionProvider
      key={`${appId}:${props.sessionId || "live"}`}
      siteId={siteId}
      appId={appId}
      surface="advanced"
      title={props.item.title}
      sessionId={props.sessionId || undefined}
      initialSession={props.initialSession}
      mode={props.mode || (props.sessionId ? "history" : "workspace")}
      resumeLatest={!props.sessionId}
    >
      {editor}
    </WorkspaceSessionProvider>
  );
}

function AdvancedContentWorkbenchRuntime(
  props: AdvancedContentWorkbenchProps,
) {
  const router = useRouter();
  const workspace = useWorkspaceSession();
  const editorHost = useAdvancedEditorHost();
  const restoredItem = editorHost.embedded
    ? null
    : advancedItemFromSession(workspace.session);
  const [item, setItem] = useState<LibraryItem>(
    () => restoredItem || props.item,
  );
  const loadedSessionIdRef = useRef(workspace.session?.id || "");
  const restoredSessionId = workspace.session?.id || "";
  const activeItem =
    restoredItem &&
    restoredSessionId &&
    loadedSessionIdRef.current !== restoredSessionId
      ? restoredItem
      : item;
  useEffect(() => {
    const sessionId = restoredSessionId;
    if (!sessionId || loadedSessionIdRef.current === sessionId) return;
    loadedSessionIdRef.current = sessionId;
    const restored = advancedItemFromSession(workspace.session);
    if (restored) setItem(restored);
  }, [restoredSessionId, workspace.session]);
  const materialRef = useRef<LibraryItem>(activeItem);
  const materialSessionIdRef = useRef(restoredSessionId);
  const embeddedPinnedRevisionChanged = Boolean(
    editorHost.embedded &&
      props.item.artifactId &&
      props.item.revisionId &&
      advancedRootItemId(props.item) ===
        advancedRootItemId(materialRef.current) &&
      (materialRef.current.artifactId !== props.item.artifactId ||
        materialRef.current.revisionId !== props.item.revisionId),
  );
  if (
    (restoredSessionId &&
      materialSessionIdRef.current !== restoredSessionId) ||
    advancedRootItemId(materialRef.current) !== advancedRootItemId(activeItem) ||
    materialRef.current.kind !== activeItem.kind ||
    materialRef.current.siteId !== activeItem.siteId ||
    embeddedPinnedRevisionChanged
  ) {
    materialRef.current = embeddedPinnedRevisionChanged
      ? props.item
      : activeItem;
    materialSessionIdRef.current = restoredSessionId;
  }
  const flushRef = useRef<
    (() => Promise<AdvancedFlushResult> | AdvancedFlushResult) | null
  >(null);
  const capability = editorCapabilityFor(activeItem);
  const route = capability.route;
  // RichDoc publishes a canonical artifact revision while retaining its
  // mounted in-memory document. On the parent callback render, use the newly
  // pinned identity for the next CAS without replacing the editor source.
  const routeItem =
    editorHost.embedded && route.type === "richdoc"
      ? materialRef.current
      : activeItem;
  const makeSnapshot = useCallback(
    (taskId?: string | null) =>
      advancedSessionSnapshot(
        materialRef.current,
        route.type,
        taskId === undefined ? workspace.taskId : taskId,
      ),
    [route.type, workspace.taskId],
  );
  const navigate = useCallback(
    (sessionId: string) => {
      if (editorHost.embedded) return;
      const feature = advancedFeatureForItem(materialRef.current);
      if (feature) {
        router.replace(advancedFeatureHref(feature, { sessionId }));
      }
    },
    [editorHost.embedded, router],
  );
  const ensure = useCallback(
    async (taskId?: string | null) => {
      if (editorHost.embedded) {
        const active =
          workspace.session ||
          (await workspace.ensureActive({
            title: materialRef.current.title,
          }));
        if (active && taskId && workspace.taskId !== taskId) {
          return workspace.bindTask(taskId, materialRef.current.title);
        }
        return active;
      }
      const snapshot = makeSnapshot(taskId);
      const session = await workspace.ensureActive({
        title: materialRef.current.title,
        snapshot,
        schemaVersion: ADVANCED_SESSION_SCHEMA_VERSION,
      });
      if (!session) return null;
      if (taskId) {
        const bound = await workspace.bindTask(
          taskId,
          materialRef.current.title,
        );
        if (!bound) return null;
      }
      const saved = await workspace.saveSnapshot(
        snapshot,
        ADVANCED_SESSION_SCHEMA_VERSION,
        { expectedSessionId: session.id, title: materialRef.current.title },
      );
      return saved.ok ? saved.session || session : null;
    },
    [editorHost.embedded, makeSnapshot, workspace],
  );
  const recordSavedItem = useCallback(
    async (savedItem: LibraryItem) => {
      materialRef.current = savedItem;
      if (editorHost.embedded) {
        const active =
          workspace.session ||
          (await workspace.ensureActive({ title: savedItem.title }));
        if (!active) return false;
        const mergedSnapshot = withInlineEditorHistoryHead(
          active.snapshot,
          savedItem,
          route.type,
          workspace.taskId,
        );
        const stored = await workspace.saveSnapshot(
          mergedSnapshot,
          active.schema_version || 1,
          {
            expectedSessionId: active.id,
            title: active.title || savedItem.title,
          },
        );
        if (!stored.ok) return false;
        // Keep the mounted editor runtime on its in-memory document. Replacing
        // its input URL here remounts the route and can discard edits made
        // while the save request was in flight.
        editorHost.onSavedItem?.(savedItem);
        return true;
      }
      setItem(savedItem);
      editorHost.onSavedItem?.(savedItem);
      const snapshot = makeSnapshot(workspace.taskId);
      const session = await workspace.ensureActive({
        title: savedItem.title,
        snapshot,
        schemaVersion: ADVANCED_SESSION_SCHEMA_VERSION,
      });
      if (!session) return false;
      const saved = await workspace.saveSnapshot(
        snapshot,
        ADVANCED_SESSION_SCHEMA_VERSION,
        { expectedSessionId: session.id, title: savedItem.title },
      );
      return saved.ok;
    },
    [editorHost, makeSnapshot, route.type, workspace],
  );
  const renameTitle = useCallback(
    async (title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return false;
      const nextItem = { ...materialRef.current, title: nextTitle };
      materialRef.current = nextItem;
      setItem(nextItem);
      editorHost.onSavedItem?.(nextItem);
      if (editorHost.embedded) return true;
      const snapshot = makeSnapshot(workspace.taskId);
      const session = await workspace.ensureActive({
        title: nextTitle,
        snapshot,
        schemaVersion: ADVANCED_SESSION_SCHEMA_VERSION,
      });
      if (!session) return false;
      const saved = await workspace.saveSnapshot(
        snapshot,
        ADVANCED_SESSION_SCHEMA_VERSION,
        { expectedSessionId: session.id, title: nextTitle },
      );
      return saved.ok;
    },
    [editorHost, makeSnapshot, workspace],
  );
  const startNew = useCallback(async () => {
    if (editorHost.embedded) return null;
    const flushed = (await flushRef.current?.()) || { ok: true as const };
    if (!flushed.ok) return null;
    if (flushed.item) materialRef.current = flushed.item;
    const next = await workspace.startNew({
      title: materialRef.current.title,
      snapshot: makeSnapshot(null),
      schemaVersion: ADVANCED_SESSION_SCHEMA_VERSION,
    });
    if (next && workspace.mode === "history") navigate(next.id);
    return next;
  }, [editorHost.embedded, makeSnapshot, navigate, workspace]);
  const registerFlush = useCallback(
    (
      flush:
        | (() => Promise<AdvancedFlushResult> | AdvancedFlushResult)
        | null,
    ) => {
      flushRef.current = flush;
    },
    [],
  );
  const firstUseEnsuredRef = useRef(false);
  useEffect(() => {
    if (
      editorHost.embedded ||
      workspace.availability !== "ready" ||
      firstUseEnsuredRef.current ||
      workspace.session ||
      props.sessionId
    ) {
      return;
    }
    firstUseEnsuredRef.current = true;
    void ensure(null);
  }, [
    ensure,
    editorHost.embedded,
    props.sessionId,
    workspace.availability,
    workspace.session,
  ]);
  const sessionActions = useMemo(
    () => ({
      sessionId: workspace.sessionId,
      taskId: workspace.taskId,
      snapshot: makeSnapshot,
      ensure,
      navigate,
      startNew,
      renameTitle,
      recordSavedItem,
      registerFlush,
    }),
    [
      ensure,
      makeSnapshot,
      navigate,
      renameTitle,
      recordSavedItem,
      registerFlush,
      startNew,
      workspace.sessionId,
      workspace.taskId,
    ],
  );

  const activeProps: AdvancedContentWorkbenchProps = {
    ...props,
    item: routeItem,
    previewContent: routeItem.content ?? props.previewContent,
    linkUrl: routeItem.url || routeItem.previewUrl || props.linkUrl,
    taskId: workspace.taskId,
  };
  const routeKey =
    editorHost.embedded && route.type === "richdoc"
      ? `${capability.adapter}:${routeItem.kind}:${advancedRootItemId(routeItem)}`
      : `${capability.adapter}:${activeItem.kind}:${activeItem.id}:${activeItem.url || activeItem.previewUrl || ""}`;
  let editor: ReactNode;
  if (capability.adapter === "chart-editor@1") {
    editor = <ChartRoute {...activeProps} />;
  } else switch (route.type) {
    case "video-timeline":
      editor = <VideoTimelineRoute {...activeProps} />;
      break;
    case "audio":
      editor = <AudioRoute {...activeProps} />;
      break;
    case "image":
      editor = <ImageRoute {...activeProps} />;
      break;
    case "pdf":
      editor = <PdfRoute {...activeProps} />;
      break;
    case "threed":
      editor = <Model3DRoute {...activeProps} />;
      break;
    case "richdoc":
      editor = <RichDocRoute {...activeProps} />;
      break;
    case "grid":
      editor = <GridRoute {...activeProps} />;
      break;
    case "deck":
      editor = <DeckRoute {...activeProps} />;
      break;
    case "embed":
      editor = <EmbeddedRoute {...activeProps} />;
      break;
    case "none":
    default:
      editor = <UnsupportedRoute {...activeProps} />;
      break;
  }

  if (!editorHost.embedded && workspace.availability === "loading") {
    return <WorkbenchRouteLoading />;
  }

  return (
    <AdvancedSessionContext.Provider value={sessionActions}>
      <WorkbenchErrorBoundary
        key={routeKey}
        item={props.item}
        onClose={props.onClose}
      >
        {editor}
      </WorkbenchErrorBoundary>
    </AdvancedSessionContext.Provider>
  );
}
