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
import { editorRouteFor } from "./workbench-routes";
import { WorkbenchErrorBoundary } from "./WorkbenchErrorBoundary";
import {
  WorkspaceSessionProvider,
  useOptionalWorkspaceSession,
  useWorkspaceSession,
} from "./WorkspaceSession";
import {
  ADVANCED_SESSION_SCHEMA_VERSION,
  advancedSessionAppId,
  advancedSessionSnapshot,
} from "./advanced-session";
import { AdvancedSessionContext } from "./advanced-session-context";
import { historySessionHref } from "./workspace-route";

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

export function AdvancedContentWorkbench(
  props: AdvancedContentWorkbenchProps,
) {
  const [mounted, setMounted] = useState(false);
  const inherited = useOptionalWorkspaceSession();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const route = editorRouteFor(props.item);
  const siteId = props.siteId || props.item.siteId || "oceanleo";
  const appId = advancedSessionAppId(props.item, route.type);
  const canReuseInherited =
    inherited?.siteId === siteId && inherited.appId === appId;
  if (canReuseInherited) {
    return <AdvancedContentWorkbenchRuntime {...props} />;
  }
  return (
    <WorkspaceSessionProvider
      key={appId}
      siteId={siteId}
      appId={appId}
      title={props.item.title}
      resumeLatest={false}
    >
      <AdvancedContentWorkbenchRuntime {...props} />
    </WorkspaceSessionProvider>
  );
}

function AdvancedContentWorkbenchRuntime(
  props: AdvancedContentWorkbenchProps,
) {
  const router = useRouter();
  const workspace = useWorkspaceSession();
  const flushRef = useRef<(() => Promise<boolean> | boolean) | null>(null);
  const route = editorRouteFor(props.item);
  const makeSnapshot = useCallback(
    (taskId?: string | null) =>
      advancedSessionSnapshot(
        props.item,
        route.type,
        taskId || workspace.taskId,
      ),
    [props.item, route.type, workspace.taskId],
  );
  const navigate = useCallback(
    (sessionId: string) => {
      router.replace(historySessionHref(sessionId));
    },
    [router],
  );
  const ensure = useCallback(
    async (taskId?: string | null) => {
      const snapshot = makeSnapshot(taskId);
      const session = await workspace.ensureActive({
        title: props.item.title,
        snapshot,
        schemaVersion: ADVANCED_SESSION_SCHEMA_VERSION,
      });
      if (!session) return null;
      if (taskId) await workspace.bindTask(taskId, props.item.title);
      const saved = await workspace.saveSnapshot(
        snapshot,
        ADVANCED_SESSION_SCHEMA_VERSION,
        { expectedSessionId: session.id, title: props.item.title },
      );
      return saved.session || session;
    },
    [makeSnapshot, props.item.title, workspace],
  );
  const startNew = useCallback(async () => {
    const flushed = await flushRef.current?.();
    if (flushed === false) return null;
    const current = workspace.session;
    if (current) {
      const saved = await workspace.saveSnapshot(
        makeSnapshot(workspace.taskId),
        ADVANCED_SESSION_SCHEMA_VERSION,
        { expectedSessionId: current.id, title: props.item.title },
      );
      if (!saved.ok) return null;
    }
    const next = await workspace.startNew({
      title: props.item.title,
      snapshot: makeSnapshot(null),
      schemaVersion: ADVANCED_SESSION_SCHEMA_VERSION,
    });
    if (next) navigate(next.id);
    return next;
  }, [makeSnapshot, navigate, props.item.title, workspace]);
  const registerFlush = useCallback(
    (flush: (() => Promise<boolean> | boolean) | null) => {
      flushRef.current = flush;
    },
    [],
  );
  const sessionActions = useMemo(
    () => ({
      snapshot: makeSnapshot,
      ensure,
      navigate,
      startNew,
      registerFlush,
    }),
    [ensure, makeSnapshot, navigate, registerFlush, startNew],
  );

  const routeKey = `${props.item.kind}:${props.item.id}:${props.item.url || props.item.previewUrl || ""}`;
  let editor: ReactNode;
  switch (route.type) {
    case "video-timeline":
      editor = <VideoTimelineRoute {...props} />;
      break;
    case "audio":
      editor = <AudioRoute {...props} />;
      break;
    case "image":
      editor = <ImageRoute {...props} />;
      break;
    case "office":
      editor = <OfficeRoute {...props} />;
      break;
    case "pdf":
      editor = <PdfRoute {...props} />;
      break;
    case "threed":
      editor = <Model3DRoute {...props} />;
      break;
    case "richdoc":
      editor = <RichDocRoute {...props} />;
      break;
    case "grid":
      editor = <GridRoute {...props} />;
      break;
    case "deck":
      editor = <DeckRoute {...props} />;
      break;
    case "embed":
      editor = <EmbeddedRoute {...props} />;
      break;
    case "none":
    default:
      editor = <UnsupportedRoute {...props} />;
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
