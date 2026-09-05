"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import type { AdvancedContentWorkbenchProps } from "./advanced-workbench-types";
import { AdvancedWorkbenchBlankStage } from "./AdvancedWorkbenchStage";
import { UnsupportedRoute } from "./advanced-routes/UnsupportedRoute";
import {
  WorkbenchRouteChunkError,
  WorkbenchRouteLoading,
} from "./advanced-routes/WorkbenchRouteLoading";
import { chunkRetryLoader, withChunkRetry } from "../lib/lazy-with-retry";
import { reportAutosaveError } from "../lib/telemetry/errors";
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

/**
 * 自动保存失败的上报口（W09 的第三个错误来源）。
 *
 * 这些失败**不是异常**：`workspace.saveSnapshot` 返回 `{ ok: false }`，
 * 所以在此之前它们一声不响地退化成「返回 false」，生产上完全看不见——
 * 用户只知道「我改的东西好像没保存」，我们这边一条记录都没有。
 *
 * 刻意造一个 `Error` 只为拿到稳定的指纹：消息不会进事件，
 * 遥测只带 errorName 与指纹（见 `lib/telemetry/errors.ts`）。
 */
function reportSaveFailure(stage: string, willRetry: boolean): void {
  const error = new Error(`workspace snapshot rejected at ${stage}`);
  error.name = "AutosaveRejected";
  reportAutosaveError({ stage, error, willRetry });
}

/**
 * 11 条编辑器路由的统一装载方式（W09）。
 *
 * 在此之前每条都是裸的
 * `dynamic(() => import(…), { ssr: false, loading: WorkbenchRouteLoading })`，
 * chunk 一挂**没有任何处理**——全仓搜 `ChunkLoadError` 零命中。后果就是操作员
 * 贴出来的那一片：`Model3DRoute_tsx_….js` 撞上
 * `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` 之后，编辑器永远转圈。
 *
 * 现在夹了两层（都在 `lib/lazy-with-retry.tsx`）：
 *
 * - `chunkRetryLoader`：指数退避 + 抖动 + cache-busting 地重试，**永不 reject**。
 *   不 reject 是关键：`React.lazy` 会把 rejected 的 promise 永久钉死，
 *   那样任何「重试」按钮都不可能有用。
 * - `withChunkRetry`：退避耗尽后渲染可操作的失败态，并把重试接回还在 await
 *   的那个循环。失败态区分「网络问题，可重试」与「版本已更新，请刷新」——
 *   后者的信号是 chunk 404，这时重试永远不会成功，只有刷新有用。
 *
 * `dynamic()` 的调用**留在这里**：`import("./advanced-routes/XxxRoute")` 这个
 * 字面量是 webpack 切 chunk 的唯一依据（`01-verified-facts.md` §1.7），
 * 搬进 helper 会让 11 条路由退回单块打包。
 */
function lazyRoute<P extends object>(
  routeId: string,
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> {
  return withChunkRetry(
    routeId,
    dynamic<P>(chunkRetryLoader(routeId, load), {
      ssr: false,
      loading: WorkbenchRouteLoading,
    }),
    WorkbenchRouteChunkError,
  );
}

const VideoTimelineRoute = lazyRoute("video-timeline", () =>
  import("./advanced-routes/VideoTimelineRoute").then(
    (module) => module.VideoTimelineRoute,
  ),
);
const AudioRoute = lazyRoute("audio", () =>
  import("./advanced-routes/AudioRoute").then((module) => module.AudioRoute),
);
const ImageRoute = lazyRoute("image", () =>
  import("./advanced-routes/ImageRoute").then((module) => module.ImageRoute),
);
const PdfRoute = lazyRoute("pdf", () =>
  import("./advanced-routes/PdfRoute").then((module) => module.PdfRoute),
);
const Model3DRoute = lazyRoute("threed", () =>
  import("./advanced-routes/Model3DRoute").then((module) => module.Model3DRoute),
);
const RichDocRoute = lazyRoute("richdoc", () =>
  import("./advanced-routes/RichDocRoute").then((module) => module.RichDocRoute),
);
const GridRoute = lazyRoute("grid", () =>
  import("./advanced-routes/GridRoute").then((module) => module.GridRoute),
);
const DeckRoute = lazyRoute("deck", () =>
  import("./advanced-routes/DeckRoute").then((module) => module.DeckRoute),
);
const EmbeddedRoute = lazyRoute("embed", () =>
  import("./advanced-routes/EmbeddedRoute").then(
    (module) => module.EmbeddedRoute,
  ),
);
const ChartRoute = lazyRoute("chart", () =>
  import("./advanced-routes/ChartRoute").then((module) => module.ChartRoute),
);
const GameRoute = lazyRoute("game", () =>
  import("./advanced-routes/GameRoute").then((module) => module.GameRoute),
);
const VideoCanvasRoute = lazyRoute("video-canvas", () =>
  import("./advanced-routes/VideoCanvasRoute").then(
    (module) => module.VideoCanvasRoute,
  ),
);
/**
 * 空件挂载（合同 §3.2）用的入参形态：`item` 可以先不给。
 *
 * 刻意**不改** `advanced-workbench-types.ts` 里的原类型——那份类型是全仓共用的入口
 * 契约，放宽它等于让每一个调用方都可以不给素材。这里只是本组件多认一种入参：
 * 没有素材时先给一个空框，第一件素材落成之后再走原来那条路。
 */
export type AdvancedContentWorkbenchMountProps = Omit<
  AdvancedContentWorkbenchProps,
  "item"
> & {
  item?: LibraryItem | null;
  /** W9 的「上传整个文件夹 / zip」入口，只在空框上出现。 */
  projectImportSlot?: ReactNode;
};

export function AdvancedContentWorkbench(
  props: AdvancedContentWorkbenchMountProps,
) {
  const [mounted, setMounted] = useState(false);
  const [droppedItem, setDroppedItem] = useState<LibraryItem | null>(null);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const item = props.item || droppedItem;
  if (!item) {
    return (
      <AdvancedWorkbenchBlankStage
        accent={props.accent}
        siteId={props.siteId}
        projectImportSlot={props.projectImportSlot}
        onItemReady={setDroppedItem}
      />
    );
  }
  return <AdvancedContentWorkbenchMounted {...props} item={item} />;
}

/**
 * 素材已经在手上之后的那一段。
 *
 * 空件挂载（合同 §3.2）让「有没有素材」成了两种形态，所以上面那个函数只负责**把素材
 * 弄到手**——调用方给的，或者用户刚拖进来的那一件；从这里往下只认一件已经存在的素材，
 * 路由、会话、编辑器宿主全部照原样按 `props.item` 判，与空框那条路互不干扰。
 * 不拆的话，这里每一处都要写成「调用方给的或拖进来的那个」，判定点就散了。
 */
function AdvancedContentWorkbenchMounted(
  props: AdvancedContentWorkbenchProps,
) {
  const inheritedWorkspace = useOptionalWorkspaceSession();
  const item = props.item;
  const route = editorRouteFor(props.item);
  const siteId = props.siteId || item.siteId || "oceanleo";
  const appId = props.embedded
    ? props.appId || "library"
    : props.initialSession?.app_id || advancedSessionAppId(item, route.type);
  const feature = advancedFeatureForItem(item);
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
      title={item.title}
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
            intent: "attach",
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
        intent: "attach",
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
      if (!saved.ok) {
        reportSaveFailure("ensure-snapshot", true);
        return null;
      }
      return saved.session || session;
    },
    [editorHost.embedded, makeSnapshot, workspace],
  );
  const recordSavedItem = useCallback(
    async (savedItem: LibraryItem) => {
      materialRef.current = savedItem;
      if (editorHost.embedded) {
        const active =
          workspace.session ||
          (await workspace.ensureActive({
            title: savedItem.title,
            intent: "output",
          }));
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
        if (!stored.ok) {
          reportSaveFailure("record-saved-item", true);
          return false;
        }
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
        intent: "output",
      });
      if (!session) return false;
      const saved = await workspace.saveSnapshot(
        snapshot,
        ADVANCED_SESSION_SCHEMA_VERSION,
        { expectedSessionId: session.id, title: savedItem.title },
      );
      if (!saved.ok) reportSaveFailure("record-saved-item", true);
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
        intent: "attach",
      });
      if (!session) return false;
      const saved = await workspace.saveSnapshot(
        snapshot,
        ADVANCED_SESSION_SCHEMA_VERSION,
        { expectedSessionId: session.id, title: nextTitle },
      );
      if (!saved.ok) reportSaveFailure("rename-title", true);
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
      intent: "attach",
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
  if (capability.adapter === "video-canvas") {
    editor = <VideoCanvasRoute {...activeProps} />;
  } else if (capability.adapter === "chart-editor@1") {
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
    case "game":
      editor = <GameRoute {...activeProps} />;
      break;
    case "embed":
      editor = <EmbeddedRoute {...activeProps} />;
      break;
    case "none":
    default:
      editor = <UnsupportedRoute {...activeProps} />;
      break;
  }

  // Session hydration must not hide a canvas that already has material.
  // Gallery embeds already skipped this gate; consumer /advanced and
  // workspace mounts used to swap every plugin for a spinner on 503/SSL.

  // 两级错误边界（W09）。在此之前只有外面这一层，且它的失败态是
  // `createPortal(fallback, document.body)` + `fixed inset-0 z-[2147483000]`
  // ——一条路由崩溃就是一张 max-z 全视口遮罩，外壳、编辑栏、素材库全被盖掉。
  //
  // 内层是**路由级**的：`key` 绑到路由标识 + 素材身份，措辞与呈现都留在编辑器
  // 窗格内。一条编辑器崩了，工作台之外的东西一个都不受影响，用户能直接切别的素材。
  // 外层只接内层看不见的那部分——外壳自己的崩溃（会话 provider、上下文），
  // 那时候窗格里已经没有可信的东西可显示，保留原来的整页接管才是对的。
  return (
    <AdvancedSessionContext.Provider value={sessionActions}>
      <WorkbenchErrorBoundary
        item={props.item}
        onClose={props.onClose}
        contained={editorHost.embedded}
      >
        <WorkbenchErrorBoundary
          key={routeKey}
          scope="route"
          routeId={route.type}
          item={props.item}
          onClose={props.onClose}
        >
          {editor}
        </WorkbenchErrorBoundary>
      </WorkbenchErrorBoundary>
    </AdvancedSessionContext.Provider>
  );
}
