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
  useWorkspaceSession,
} from "./WorkspaceSession";
import {
  ADVANCED_SESSION_SCHEMA_VERSION,
  advancedItemFromSession,
  advancedSessionAppId,
  advancedSessionSnapshot,
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
const OfficeRoute = dynamic(
  () =>
    import("./advanced-routes/OfficeRoute").then(
      (module) => module.OfficeRoute,
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
  const router = useRouter();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const route = editorRouteFor(props.item);
  const siteId = props.siteId || props.item.siteId || "oceanleo";
  const appId = advancedSessionAppId(props.item, route.type);
  const feature = advancedFeatureForItem(props.item);
  const materialAppId = feature ? `advanced:${feature.id}` : appId;
  return (
    <WorkspaceSessionProvider
      key={`${appId}:${props.sessionId || "live"}`}
      siteId={siteId}
      appId={appId}
      surface="advanced"
      title={props.item.title}
      sessionId={props.sessionId}
      initialSession={props.initialSession}
      mode={props.mode || (props.sessionId ? "history" : "workspace")}
      resumeLatest={!props.sessionId}
      onSessionIdChange={(sessionId) => {
        if (sessionId && feature) {
          router.replace(advancedFeatureHref(feature, { sessionId }));
        }
      }}
    >
      <WorkbenchMaterialProvider siteId={siteId} appId={materialAppId}>
        <AdvancedContentWorkbenchRuntime {...props} />
      </WorkbenchMaterialProvider>
    </WorkspaceSessionProvider>
  );
}

function AdvancedContentWorkbenchRuntime(
  props: AdvancedContentWorkbenchProps,
) {
  const router = useRouter();
  const workspace = useWorkspaceSession();
  const restoredItem = advancedItemFromSession(workspace.session);
  const [item, setItem] = useState<LibraryItem>(
    () => restoredItem || props.item,
  );
  const loadedSessionIdRef = useRef(workspace.session?.id || "");
  useEffect(() => {
    const sessionId = workspace.session?.id || "";
    if (!sessionId || loadedSessionIdRef.current === sessionId) return;
    loadedSessionIdRef.current = sessionId;
    const restored = advancedItemFromSession(workspace.session);
    if (restored) setItem(restored);
  }, [workspace.session]);
  const materialRef = useRef<LibraryItem>(item);
  if (
    materialRef.current.id !== item.id ||
    materialRef.current.url !== item.url ||
    materialRef.current.previewUrl !== item.previewUrl
  ) {
    materialRef.current = item;
  }
  const flushRef = useRef<
    (() => Promise<AdvancedFlushResult> | AdvancedFlushResult) | null
  >(null);
  const capability = editorCapabilityFor(item);
  const route = capability.route;
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
      const feature = advancedFeatureForItem(materialRef.current);
      if (feature) {
        router.replace(advancedFeatureHref(feature, { sessionId }));
      }
    },
    [router],
  );
  const ensure = useCallback(
    async (taskId?: string | null) => {
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
    [makeSnapshot, workspace],
  );
  const recordSavedItem = useCallback(
    async (savedItem: LibraryItem) => {
      materialRef.current = savedItem;
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
    [makeSnapshot, workspace],
  );
  const startNew = useCallback(async () => {
    const flushed = (await flushRef.current?.()) || { ok: true as const };
    if (!flushed.ok) return null;
    if (flushed.item) materialRef.current = flushed.item;
    const current = workspace.session;
    if (current) {
      const saved = await workspace.saveSnapshot(
        makeSnapshot(workspace.taskId),
        ADVANCED_SESSION_SCHEMA_VERSION,
        { expectedSessionId: current.id, title: materialRef.current.title },
      );
      if (!saved.ok) return null;
    }
    const next = await workspace.startNew({
      title: materialRef.current.title,
      snapshot: makeSnapshot(null),
      schemaVersion: ADVANCED_SESSION_SCHEMA_VERSION,
    });
    if (next && workspace.mode === "history") navigate(next.id);
    return next;
  }, [makeSnapshot, navigate, workspace]);
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
  const sessionActions = useMemo(
    () => ({
      sessionId: workspace.sessionId,
      taskId: workspace.taskId,
      snapshot: makeSnapshot,
      ensure,
      navigate,
      startNew,
      recordSavedItem,
      registerFlush,
    }),
    [
      ensure,
      makeSnapshot,
      navigate,
      recordSavedItem,
      registerFlush,
      startNew,
      workspace.sessionId,
      workspace.taskId,
    ],
  );

  const activeProps: AdvancedContentWorkbenchProps = {
    ...props,
    item,
    previewContent: item.content ?? props.previewContent,
    linkUrl: item.url || item.previewUrl || props.linkUrl,
    taskId: workspace.taskId,
  };
  const routeKey = `${capability.adapter}:${item.kind}:${item.id}:${item.url || item.previewUrl || ""}`;
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
    case "office":
      editor = <OfficeRoute {...activeProps} />;
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
