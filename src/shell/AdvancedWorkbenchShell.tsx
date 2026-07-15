"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useUI } from "../i18n/ui/useUI";
import {
  advancedFeatureForItem,
  advancedFeatureHrefForItem,
} from "./advanced-features";
import { AdvancedAgentPanel } from "./AdvancedAgentPanel";
import { AdvancedTasks } from "./AdvancedTasks";
import {
  useAdvancedSession,
  type AdvancedFlushResult,
} from "./advanced-session-context";
import { AdvancedLayoutContext } from "./advanced-layout-context";
import type { LibraryItem } from "./library-data";
import { LibraryItemViewer, libraryKindLabel } from "./library-viewers";
import { MaterialLibrary } from "./MaterialLibrary";
import { MyLibrary } from "./MyLibrary";
import { useWorkbenchMaterials } from "./workbench-material-provider";

type WorkbenchTool =
  | "agent"
  | "edit"
  | "materials"
  | "tasks"
  | "library";

export interface AdvancedWorkbenchShellProps {
  item: LibraryItem;
  previewContent?: ReactNode;
  linkUrl?: string;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
  editorLabel: string;
  editorControls: ReactNode;
  editorStage: ReactNode;
  editorAvailable?: boolean;
  editorStatus?: string;
  editorDirty?: boolean;
  editorOwnsCloseGuard?: boolean;
  /** Embedded editors render their own properties column when the Edit tool is active. */
  editorUsesOwnControls?: boolean;
  /** Persist pending editor changes before Advanced Agent starts a new session. */
  onBeforeNewConversation?:
    | (() => Promise<AdvancedFlushResult> | AdvancedFlushResult);
  /** Latest durable material version produced by an explicit editor save. */
  savedItem?: LibraryItem | null;
  exportPanel?: ReactNode;
  versionRevision?: string | number;
  onClose: () => void;
}

function curatedTypeFor(item: LibraryItem): string {
  const explicit = String(
    item.descriptor?.contentType || item.meta.content_type || item.meta.asset_type || "",
  ).toLowerCase();
  if (explicit === "chart") return "chart";
  const map: Partial<Record<LibraryItem["kind"], string>> = {
    website: "website",
    canvas: "image",
    ppt: "ppt",
    sheet: "sheet",
    document: "document",
    image: "image",
    video: "video",
    video_canvas: "video_workflow",
    audio: "audio",
    xhs: "image",
    threed: "3d",
  };
  return map[item.kind] || "all";
}

function ToolIcon({ tool }: { tool: WorkbenchTool }) {
  const paths: Record<WorkbenchTool, ReactNode> = {
    agent: (
      <>
        <path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1" />
        <rect x="6" y="7" width="12" height="12" rx="4" />
        <path d="M9.5 13h.01M14.5 13h.01M9.5 16h5" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20l4.2-1 10.4-10.4a2 2 0 00-2.8-2.8L5.4 16.2 4 20z" />
        <path d="M14.5 7.1l2.8 2.8" />
      </>
    ),
    materials: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10M7 12h6M7 16h8" />
      </>
    ),
    tasks: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    library: (
      <>
        <path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5v-16z" />
        <path d="M4 18.5A2.5 2.5 0 016.5 16H20" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-5 w-5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[tool]}
    </svg>
  );
}

/**
 * The route-agnostic full-screen shell. Route adapters own the actual editor
 * hook and provide Controls + Stage as slots, so only the selected editor is
 * mounted (no hidden image/video/audio decoders doing work for another kind).
 */
export function AdvancedWorkbenchShell({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  editorLabel,
  editorControls,
  editorStage,
  editorAvailable = true,
  editorStatus = "",
  editorDirty = false,
  editorOwnsCloseGuard = false,
  editorUsesOwnControls = false,
  onBeforeNewConversation,
  savedItem = null,
  onClose,
}: AdvancedWorkbenchShellProps) {
  const tt = useUI();
  const router = useRouter();
  const currentFeatureId = advancedFeatureForItem(item)?.id;
  const rootRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const dirtyRecordedRef = useRef(false);
  const portalReady = typeof document !== "undefined";
  const advancedSession = useAdvancedSession();
  const workbenchMaterials = useWorkbenchMaterials();
  const [activeTool, setActiveTool] = useState<WorkbenchTool>(
    editorAvailable ? "edit" : "agent",
  );
  const [panelWidth, setPanelWidth] = useState(340);
  const [panelVisible, setPanelVisible] = useState(
    () =>
      !editorUsesOwnControls &&
      (typeof window === "undefined" || window.innerWidth >= 768),
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const layoutState = useMemo(
    () => ({
      hostPanelVisible: panelVisible,
      editorToolActive: activeTool === "edit",
    }),
    [activeTool, panelVisible],
  );

  const requestClose = useCallback(() => {
    if (
      editorDirty &&
      !editorOwnsCloseGuard &&
      !window.confirm(tt("当前有未保存的修改，确定要离开高级工作台吗？"))
    ) {
      return;
    }
    onClose();
  }, [editorDirty, editorOwnsCloseGuard, onClose, tt]);

  useEffect(() => {
    if (!editorDirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [editorDirty]);

  useEffect(() => {
    if (!editorDirty) {
      dirtyRecordedRef.current = false;
      return;
    }
    if (!advancedSession || dirtyRecordedRef.current) return;
    dirtyRecordedRef.current = true;
    void (async () => {
      const session = await advancedSession.ensure();
      if (!session) dirtyRecordedRef.current = false;
    })();
  }, [advancedSession, editorDirty]);

  useEffect(() => {
    if (!advancedSession || !savedItem) return;
    void advancedSession.recordSavedItem(savedItem);
  }, [advancedSession, savedItem]);

  useEffect(() => {
    if (!advancedSession) return;
    advancedSession.registerFlush(async () => {
      if (!editorDirty) {
        return savedItem ? { ok: true, item: savedItem } : { ok: true };
      }
      if (!onBeforeNewConversation) {
        return { ok: false, error: "当前编辑器无法保存未提交修改" };
      }
      return onBeforeNewConversation();
    });
    return () => advancedSession.registerFlush(null);
  }, [advancedSession, editorDirty, onBeforeNewConversation, savedItem]);

  useEffect(() => {
    if (!portalReady) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const root = rootRef.current;
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => {
        return element instanceof HTMLElement && element !== root;
      })
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    siblings.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    root?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) requestClose();
      if (event.key !== "Tab" || !root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden && element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", close);
    document.addEventListener("fullscreenchange", full);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      siblings.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden == null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      window.removeEventListener("keydown", close);
      document.removeEventListener("fullscreenchange", full);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [portalReady, requestClose]);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    },
    [],
  );

  const tools = useMemo(
    () =>
      [
        { id: "agent" as const, label: tt("Agent") },
        ...(editorAvailable
          ? [{ id: "edit" as const, label: tt(editorLabel) }]
          : []),
        { id: "materials" as const, label: tt("素材") },
        { id: "tasks" as const, label: tt("我的任务") },
        { id: "library" as const, label: tt("我的库") },
      ] satisfies { id: WorkbenchTool; label: string }[],
    [editorAvailable, editorLabel, tt],
  );

  const chooseTool = useCallback(
    (tool: WorkbenchTool) => {
      setActiveTool(tool);
      setPanelVisible(!(tool === "edit" && editorUsesOwnControls));
    },
    [editorUsesOwnControls],
  );

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture?.(pointerId);
    const startX = event.clientX;
    const startWidth = panelWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let frame = 0;
    let nextX = startX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setResizing(true);
    const render = () => {
      frame = 0;
      setPanelWidth(
        Math.min(
          Math.min(620, Math.max(270, window.innerWidth * 0.48)),
          Math.max(270, startWidth + nextX - startX),
        ),
      );
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      nextX = next.clientX;
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      handle.removeEventListener("lostpointercapture", stop);
      if (handle.hasPointerCapture?.(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    handle.addEventListener("lostpointercapture", stop);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await rootRef.current?.requestFullscreen();
      }
    } catch {
      // The portal already covers the viewport. Fullscreen API denial should
      // not make the workbench unusable.
    }
  }

  let panel: ReactNode;
  if (activeTool === "agent") {
    panel = (
      <AdvancedAgentPanel item={item} taskId={taskId} siteId={siteId} accent={accent} />
    );
  } else if (activeTool === "edit") {
    panel = editorAvailable ? (
      editorControls
    ) : (
      <div className="p-4 text-[12px] leading-relaxed text-amber-700">
        {tt("此内容目前可以预览、交给 Agent 处理或保存副本，但没有可安全回写的结构化编辑器。")}
      </div>
    );
  } else if (activeTool === "materials") {
    panel = (
      <div className="h-full min-h-0">
        <MaterialLibrary
          materials={[]}
          featuredEntries={[...(workbenchMaterials?.entries || [])]}
          curatedType={curatedTypeFor(item)}
          curatedSeriesId={siteId === "design" ? "design-materials" : ""}
          accent={accent}
          taskId={taskId}
          siteId={siteId}
          appId={workbenchMaterials?.appId}
          registerRuntimeSource={false}
          materialActions={workbenchMaterials?.actions || []}
          onMaterialAction={workbenchMaterials?.perform}
          materialActionAvailable={workbenchMaterials?.canPerform}
          hideSeeAll
        />
      </div>
    );
  } else if (activeTool === "tasks") {
    panel = (
      <AdvancedTasks
        siteId={siteId}
        accent={accent}
        currentSessionId={advancedSession?.sessionId}
      />
    );
  } else {
    panel = (
      <MyLibrary
        siteId={siteId}
        accent={accent}
        taskId={taskId}
        plain
        itemFilter={(candidate) =>
          advancedFeatureForItem(candidate)?.id === currentFeatureId
        }
        onOpenItem={(nextItem) => {
          const href = advancedFeatureHrefForItem(nextItem);
          if (href) router.push(href);
        }}
      />
    );
  }

  if (!portalReady) return null;

  // Route adapters already render an in-canvas loading state. Raw machine
  // states from third-party editors ("loading" / "ready") are not useful in
  // the title bar and previously remained there after usable content painted.
  const visibleEditorStatus = ["loading", "ready"].includes(
    editorStatus.trim().toLowerCase(),
  )
    ? ""
    : editorStatus;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} · ${tt("高级功能")}`}
      tabIndex={-1}
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-white text-stone-800"
    >
      {resizing && (
        <div
          className="fixed inset-0 z-[2147483600] cursor-col-resize bg-transparent"
          aria-hidden="true"
        />
      )}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-stone-200 px-3">
        <button
          type="button"
          onClick={requestClose}
          className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50"
        >
          ← {tt("返回")}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{item.title}</p>
          <p className="truncate text-[10px] text-stone-400">
            {tt("高级功能")} · {tt(libraryKindLabel(item.kind))}
          </p>
        </div>
        {visibleEditorStatus && (
          <span className="hidden max-w-[28rem] truncate text-[11px] text-stone-400 md:block">
            {visibleEditorStatus}
          </span>
        )}
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50"
        >
          {fullscreen ? tt("退出全屏") : tt("浏览器全屏")}
        </button>
        <button
          type="button"
          onClick={requestClose}
          aria-label={tt("关闭")}
          className="grid h-8 w-8 place-items-center rounded-lg text-lg text-stone-400 hover:bg-stone-100"
        >
          ×
        </button>
      </header>

      <AdvancedLayoutContext.Provider value={layoutState}>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-stone-200 bg-stone-50 py-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => chooseTool(tool.id)}
              className={`group relative grid h-10 w-10 place-items-center rounded-xl transition ${
                activeTool === tool.id
                  ? "bg-white shadow-sm"
                  : "text-stone-400 hover:bg-white hover:text-stone-700"
              }`}
              style={activeTool === tool.id ? { color: accent } : undefined}
              aria-label={tool.label}
            >
              <ToolIcon tool={tool.id} />
              <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
                {tool.label}
              </span>
            </button>
          ))}
        </nav>

        {panelVisible && (
          <>
            <aside
              className="min-h-0 max-w-[48vw] shrink-0 overflow-hidden border-r border-stone-200 bg-white"
              style={{ width: panelWidth }}
            >
              <div className="flex h-10 items-center border-b border-stone-100 px-3 text-[12px] font-semibold">
                <span className="min-w-0 flex-1 truncate">
                  {tools.find((tool) => tool.id === activeTool)?.label}
                </span>
                <button
                  type="button"
                  onClick={() => setPanelVisible(false)}
                  aria-label={tt("收起工具区")}
                  className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                >
                  ×
                </button>
              </div>
              <div className="h-[calc(100%-2.5rem)] min-h-0 overflow-y-auto">
                {panel}
              </div>
            </aside>
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={beginResize}
              className="-ml-1 hidden w-2 shrink-0 cursor-col-resize touch-none bg-transparent transition hover:bg-stone-200/70 md:block"
              title={tt("拖动调整工具区宽度")}
            />
          </>
        )}

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-stone-100">
          {editorAvailable ? (
            <div className="h-full">{editorStage}</div>
          ) : (
            <div className="h-full overflow-auto bg-white">
              <LibraryItemViewer item={item} accent={accent} />
            </div>
          )}
        </main>
      </div>
      </AdvancedLayoutContext.Provider>
    </div>,
    document.body,
  );
}
