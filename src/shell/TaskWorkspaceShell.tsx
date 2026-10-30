"use client";

// ============================================================================
// TaskWorkspaceShell: the task page's right sidebar, shared (W7 2026-10-31).
// ----------------------------------------------------------------------------
// `SplitWorkspace` + `ResultCanvas` + the `rightOpen` / `libTab` /
// `workspaceAction` state that `AgentChat` used to assemble inline. The home
// page wraps its own column in the same shell, so an uploaded file opens in
// the very sidebar a conversation shows (one-UI rule: no second custom panel).
// ============================================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  SplitWorkspace,
  type SplitLibraryConfig,
  type SplitWorkspaceProps,
} from "./SplitWorkspace";
import {
  ResultCanvas,
  type CanvasTab,
  type ResultCanvasProps,
  type TaskWorkspaceOpenItem,
  type TaskWorkspaceOpenState,
} from "./ResultCanvas";
import type { WorkspaceActionEnvelope } from "./workspace-actions";
import type { LibraryItem, LibraryKind } from "./library-data";
import { editorCapabilityFor } from "./workbench-routes";
import { WorkspaceSessionProvider } from "./WorkspaceSession";
import { useOptionalWorkspaceSession } from "./workspace-session-context";

export type { TaskWorkspaceOpenItem, TaskWorkspaceOpenState } from "./ResultCanvas";

/** What a host hands a freshly mounted shell (e.g. the home's open item carried into the new task). */
export interface TaskWorkspaceInitial {
  open?: boolean;
  tab?: string;
  action?: WorkspaceActionEnvelope | null;
  item?: TaskWorkspaceOpenItem | null;
}

export interface TaskWorkspaceState {
  rightOpen: boolean;
  setRightOpen: Dispatch<SetStateAction<boolean>>;
  libTab: string;
  setLibTab: Dispatch<SetStateAction<string>>;
  workspaceAction: WorkspaceActionEnvelope | null;
  setWorkspaceAction: Dispatch<SetStateAction<WorkspaceActionEnvelope | null>>;
  /** The last direct-open request (consumed once by ResultCanvas, by nonce). */
  openItem: TaskWorkspaceOpenItem | null;
  /** Open the sidebar on this exact item, without waiting for any library list. */
  openWorkspaceItem: (
    item: LibraryItem,
    mode?: TaskWorkspaceOpenItem["mode"],
    options?: { bindTask?: boolean },
  ) => void;
}

let openSeq = 0;

export function useTaskWorkspaceState({
  defaultOpen = false,
  defaultTab = "home",
  initial,
}: {
  defaultOpen?: boolean;
  defaultTab?: string;
  initial?: TaskWorkspaceInitial | null;
} = {}): TaskWorkspaceState {
  const [libTab, setLibTab] = useState(initial?.tab ?? defaultTab);
  const [workspaceAction, setWorkspaceAction] =
    useState<WorkspaceActionEnvelope | null>(initial?.action ?? null);
  const [rightOpen, setRightOpen] = useState(
    initial?.open ?? (initial?.item ? true : defaultOpen),
  );
  const [openItem, setOpenItem] = useState<TaskWorkspaceOpenItem | null>(
    initial?.item ?? null,
  );
  const openWorkspaceItem = useCallback<TaskWorkspaceState["openWorkspaceItem"]>(
    (item, mode = "preview", options) => {
      openSeq += 1;
      setRightOpen(true);
      setOpenItem({
        nonce: `open-item:${item.key}:${Date.now()}:${openSeq}`,
        item,
        mode,
        ...(options?.bindTask ? { bindTask: true } : {}),
      });
    },
    [],
  );
  return {
    rightOpen,
    setRightOpen,
    libTab,
    setLibTab,
    workspaceAction,
    setWorkspaceAction,
    openItem,
    openWorkspaceItem,
  };
}

/**
 * Closed + `plainWhenClosed`: the split keeps one stable tree (no remount on
 * open) but draws no card chrome and no fixed height, so the host page looks
 * exactly as it does without a sidebar.
 */
export const TASK_WORKSPACE_PLAIN_CLOSED_CLASS = [
  "h-auto!",
  "p-0!",
  "bg-transparent!",
  "[&>[data-workspace-pane=left]]:overflow-visible!",
  "[&>[data-workspace-pane=left]]:rounded-none!",
  "[&>[data-workspace-pane=left]]:border-0!",
  "[&>[data-workspace-pane=left]]:bg-transparent!",
  "[&>[data-workspace-pane=left]>div]:overflow-visible!",
].join(" ");

/**
 * Binds the editor's own work session to the canvas's task once both exist
 * (the home's open file carried into the task its first prompt started).
 */
function WorkspaceTaskBinder({ taskId, title }: { taskId: string | null; title: string }) {
  const workspace = useOptionalWorkspaceSession();
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const titleRef = useRef(title);
  titleRef.current = title;
  const sessionId = workspace?.session?.id || "";
  const boundTaskId = workspace?.taskId || null;
  useEffect(() => {
    const current = workspaceRef.current;
    if (!current || !taskId || !sessionId || boundTaskId === taskId) return;
    void current.bindTask(taskId, titleRef.current).catch(() => undefined);
  }, [boundTaskId, sessionId, taskId]);
  return null;
}

/** ResultCanvas `renderBoundEditor`: the provider the embedded workbench would create, plus the binder. */
export const renderBoundTaskEditor: NonNullable<ResultCanvasProps["renderBoundEditor"]> = (
  editor,
  { item, rootId, taskId, siteId },
) => (
  <WorkspaceSessionProvider
    key={rootId}
    siteId={siteId}
    appId="library"
    mode="workspace"
    resumeLatest={false}
  >
    <WorkspaceTaskBinder taskId={taskId} title={item.title} />
    {editor}
  </WorkspaceSessionProvider>
);

export interface TaskWorkspaceShellProps
  extends Omit<SplitWorkspaceProps, "left" | "right" | "library"> {
  state: TaskWorkspaceState;
  left: ReactNode;
  tabs: CanvasTab[];
  /** Everything ResultCanvas takes besides the state the shell owns. */
  canvas?: Omit<
    ResultCanvasProps,
    "tabs" | "active" | "onChange" | "action" | "openItem" | "onOpenItemChange" | "renderBoundEditor"
  >;
  /** Wrap (or replace) the canvas in the right pane, e.g. an error boundary + settings pane. */
  renderRight?: (canvas: ReactNode) => ReactNode;
  /** Omitted → a toggle-less library bound to `state.rightOpen`; null → no library (right always shown). */
  library?: SplitLibraryConfig | null;
  /** Mount the canvas only after the sidebar first opens (the home page). */
  lazyRight?: boolean;
  /** See TASK_WORKSPACE_PLAIN_CLOSED_CLASS. */
  plainWhenClosed?: boolean;
  onOpenItemChange?: (open: TaskWorkspaceOpenState | null) => void;
}

export function TaskWorkspaceShell({
  state,
  left,
  tabs,
  canvas,
  renderRight,
  library,
  lazyRight = false,
  plainWhenClosed = false,
  onOpenItemChange,
  className = "",
  ...split
}: TaskWorkspaceShellProps) {
  const effectiveLibrary: SplitLibraryConfig | undefined =
    library === null
      ? undefined
      : library ?? {
          open: state.rightOpen,
          onOpenChange: state.setRightOpen,
          hideToggle: true,
        };
  const open = effectiveLibrary ? effectiveLibrary.open ?? state.rightOpen : true;
  const everOpenedRef = useRef(open);
  if (open) everOpenedRef.current = true;
  const canvasNode =
    lazyRight && !everOpenedRef.current ? null : (
      <ResultCanvas
        {...canvas}
        tabs={tabs}
        active={state.libTab}
        onChange={state.setLibTab}
        action={state.workspaceAction}
        openItem={state.openItem}
        onOpenItemChange={onOpenItemChange}
        renderBoundEditor={renderBoundTaskEditor}
      />
    );
  const closedPlain = plainWhenClosed && !open;
  return (
    <SplitWorkspace
      {...split}
      className={`${className} ${closedPlain ? TASK_WORKSPACE_PLAIN_CLOSED_CLASS : ""}`.trim()}
      left={left}
      right={renderRight ? renderRight(canvasNode) : canvasNode}
      library={effectiveLibrary}
    />
  );
}

/** The composer attachment fields the sidebar can open (C2: `libraryItem` from W6 when present). */
export interface OpenableAttachment {
  id: string;
  name?: string;
  mime?: string;
  url?: string;
  previewUrl?: string;
  libraryItem?: LibraryItem | null;
}

function attachmentKind(att: OpenableAttachment): LibraryKind {
  const mime = (att.mime || "").toLowerCase();
  const name = att.name || "";
  if (mime.startsWith("image/") || (!mime && att.previewUrl && !att.url)) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)) return "image";
  if (/\.(mp4|mov|webm|m4v)$/i.test(name)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)) return "audio";
  if (/\.(pptx?|key)$/i.test(name)) return "ppt";
  if (/\.(xlsx?|csv|tsv)$/i.test(name)) return "sheet";
  return "document";
}

/**
 * The item the sidebar opens for a composer attachment: the typed durable
 * LibraryItem when the upload produced one, otherwise a local preview item
 * read from the tile's own `blob:` URL (never a storage host URL when a local
 * one exists).
 */
export function attachmentWorkspaceItem(
  att: OpenableAttachment,
  siteId = "oceanleo",
): LibraryItem {
  if (att.libraryItem) return att.libraryItem;
  const local = att.previewUrl?.startsWith("blob:") ? att.previewUrl : "";
  const url = local || att.url || att.previewUrl || "";
  const kind = attachmentKind(att);
  return {
    key: `attachment:${att.id}`,
    source: "creation",
    id: att.id,
    title: att.name || "附件",
    kind,
    siteId,
    url: url || undefined,
    previewUrl: url || undefined,
    thumbUrl: kind === "image" ? url || undefined : undefined,
    favorite: false,
    meta: { mime: att.mime || "", local_attachment: true },
  };
}

/**
 * Edit straight away when the upload is a typed Library item with an editor;
 * a local-only preview item (no durable artifact to save a revision onto)
 * always opens as a preview.
 */
export function attachmentOpenMode(item: LibraryItem): TaskWorkspaceOpenItem["mode"] {
  if (item.meta?.local_attachment === true) return "preview";
  return editorCapabilityFor(item).available ? "edit" : "preview";
}
