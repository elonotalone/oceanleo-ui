"use client";

/**
 * 视频画布（`oceanleo.video.project.v2`）的原生编辑面。
 *
 * 库里在用的视频画布全是 v2（10-23 实测 96/96），官方模板含 `prompt` / `generate`
 * 节点。这里直接编辑 v2 文档本身：拖节点、连线、改参数、加 / 复制 / 删节点、锁定，
 * 每一步进撤销栈；保存 = 一个新的 typed revision（`video-project-save.ts`）。
 * 文档里 head 节点图以外的内容一个字节都不动。
 *
 * v1 本地草稿图仍走 `VideoCanvasStage`（路由按 source format 分流）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Connection } from "@xyflow/react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { SelectionToolbar } from "../SelectionToolbar";
import type { SelectionCommand } from "../selection-context-types";
import { usePluginTheme } from "../plugin-theme";
import { useUI } from "../../i18n/ui/useUI";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { useLockedEditCollab } from "../collab/adapters/use-entity-collab";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { recordUserMutation, userEditItemKey } from "../user-edit-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedRootItemId } from "../advanced-session";
import type { LibraryItem } from "../library-data";
import { useWorkbenchMaterialAdapter } from "../workbench-material-provider";
import { withEditorHistoryCommand } from "../workbench-material-command";
import type { WorkbenchMaterialAdapter } from "../workbench-material-registry";
import { VideoCanvasGraphHistory } from "./video-canvas-history";
import { videoKindAccent, videoKindSpec } from "./video-canvas-kinds";
import {
  VIDEO_PROJECT_V2_SCHEMA,
  addVideoDocNode,
  connectVideoDocNodes,
  moveVideoDocNodes,
  parseVideoProjectDoc,
  removeVideoDocElements,
  videoDocGraph,
  type VideoProjectDoc,
} from "./video-project-doc";
import { videoNodeLocked, videoNodeSummary } from "./video-project-node-fields";
import {
  EMPTY_VIDEO_SELECTION,
  applyVideoProjectSelectionCommand,
  pruneVideoSelection,
  videoProjectSelectionContext,
} from "./video-project-selection";
import { saveVideoProject } from "./video-project-save";
import { renderVideoProjectPreview } from "./video-project-preview";
import {
  videoMaterialKind,
  videoMaterialNodeInput,
  videoMaterialThumb,
} from "./video-project-material";
import { loadVideoProjectDoc } from "./workflow-graph-source";
import { VideoAddNodeDrawer } from "./VideoAddNodeDrawer";
import {
  VideoProjectCanvas,
  type VideoCanvasSelection,
  type VideoCanvasViewApi,
  type VideoCanvasViewNode,
} from "./VideoProjectCanvas";

/** New nodes per kind: the fields the v2 core reads, so the node is usable at once. */
function newNodeFields(kind: string): Record<string, unknown> {
  if (kind === "script" || kind === "subtitle") return { text: "" };
  if (kind === "video") return { prompt: "", durationSeconds: 5, ratio: "16:9" };
  if (kind === "image") return { prompt: "", ratio: "16:9" };
  if (kind === "audio") return { prompt: "", durationSeconds: 10 };
  if (kind === "delivery") return { ratio: "16:9" };
  return {};
}

function identityOf(item: LibraryItem | null | undefined) {
  return {
    rootId: String(item?.artifactId || item?.key || item?.id || ""),
    revisionId: String(item?.revisionId || item?.meta?.revision_id || ""),
  };
}

export function VideoProjectStage({ item, taskId, siteId = "", accent = "#0d9488", onClose }: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const theme = usePluginTheme("video-canvas").theme ?? "light";
  const [externalItem, setExternalItem] = useState<LibraryItem | null>(null);
  useEffect(() => setExternalItem(null), [item]);
  const shownItem = externalItem ?? item;
  const lockedEdit = useLockedEditCollab({ item, editorKind: "workflow", onExternalItem: setExternalItem });
  const writable = lockedEdit.mayWrite;
  const markSaved = lockedEdit.markSaved;

  const [doc, setDoc] = useState<VideoProjectDoc | null>(null);
  const docRef = useRef<VideoProjectDoc | null>(null);
  docRef.current = doc;
  const historyRef = useRef(new VideoCanvasGraphHistory<VideoProjectDoc>());
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [editRevision, setEditRevision] = useState(0);
  const editRevisionRef = useRef(0);
  editRevisionRef.current = editRevision;
  const [loadError, setLoadError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [selection, setSelection] = useState<VideoCanvasSelection>(EMPTY_VIDEO_SELECTION);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const viewApiRef = useRef<VideoCanvasViewApi | null>(null);
  const baseRef = useRef<LibraryItem | null>(shownItem ?? null);
  const loadedRef = useRef({ rootId: "", revisionId: "", nonce: -1 });
  const ownSavesRef = useRef(new Set<string>());
  const ready = Boolean(doc) && !loadError;
  const canEdit = ready && writable;

  const shownIdentity = identityOf(shownItem);
  useEffect(() => {
    const loaded = loadedRef.current;
    const sameRoot = loaded.rootId === shownIdentity.rootId && loaded.nonce === reloadNonce;
    // Our own save came back as the new item prop: keep the canvas and its undo stack.
    if (sameRoot && (loaded.revisionId === shownIdentity.revisionId || ownSavesRef.current.has(shownIdentity.revisionId))) {
      loadedRef.current = { ...loaded, revisionId: shownIdentity.revisionId };
      if (shownItem) baseRef.current = shownItem;
      return;
    }
    if (!shownItem) return;
    let cancelled = false;
    const abort = new AbortController();
    setDoc(null);
    setLoadError("");
    setSelection(EMPTY_VIDEO_SELECTION);
    setEditRevision(0);
    void loadVideoProjectDoc(shownItem, async (url) => {
      const blob = await fetchMediaBlob(url, { cache: "no-store", maxBytes: 20_000_000, signal: abort.signal });
      return blob.text();
    }).then((parsed) => {
      if (cancelled) return;
      if (!parsed.ok) {
        setLoadError(parsed.error);
        return;
      }
      loadedRef.current = { ...shownIdentity, nonce: reloadNonce };
      baseRef.current = shownItem;
      historyRef.current.reset(parsed.doc);
      setHistoryState({ canUndo: false, canRedo: false });
      setDoc(parsed.doc);
    });
    return () => {
      cancelled = true;
      abort.abort();
    };
    // The identity strings pin the item; object churn must not reload the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownIdentity.rootId, shownIdentity.revisionId, reloadNonce]);

  const noteHistory = useCallback(() => {
    setHistoryState({ canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo });
    setEditRevision((value) => value + 1);
    recordUserMutation(userEditItemKey(shownItem));
  }, [shownItem]);

  const commit = useCallback(
    (next: VideoProjectDoc | null, nextSelection?: VideoCanvasSelection) => {
      const current = docRef.current;
      if (!canEdit || !current || !next || next === current) return false;
      historyRef.current.record(next);
      docRef.current = next;
      setDoc(next);
      if (nextSelection) setSelection(nextSelection);
      noteHistory();
      return true;
    },
    [canEdit, noteHistory],
  );
  const stepHistory = useCallback(
    (direction: "undo" | "redo") => {
      if (!canEdit) return;
      const next = direction === "undo" ? historyRef.current.undo() : historyRef.current.redo();
      if (!next) return;
      docRef.current = next;
      setDoc(next);
      setSelection((current) => pruneVideoSelection(next, current));
      noteHistory();
    },
    [canEdit, noteHistory],
  );

  const addNode = useCallback(
    (kind: string, extra?: Record<string, unknown>, at?: { x: number; y: number }) => {
      const current = docRef.current;
      if (!current) return null;
      const center = at ?? viewApiRef.current?.center() ?? { x: 0, y: 0 };
      const offset = (videoDocGraph(current).nodes.length % 5) * 24;
      const added = addVideoDocNode(current, {
        kind,
        title: tt(videoKindSpec(kind).label),
        position: { x: center.x + offset, y: center.y + offset },
        ...newNodeFields(kind),
        ...extra,
      });
      if (!added || !commit(added.doc, { nodeIds: [added.id], edgeIds: [] })) return null;
      return added.id;
    },
    [commit, tt],
  );

  const viewNodes = useMemo<VideoCanvasViewNode[]>(() => {
    if (!doc) return [];
    return videoDocGraph(doc).nodes.map((node) => ({
      id: node.nodeId,
      kindLabel: tt(videoKindSpec(node.kind).label),
      accent: videoKindAccent(node.kind, theme),
      title: node.title || tt(videoKindSpec(node.kind).label),
      summary: videoNodeSummary(node),
      x: node.position.x,
      y: node.position.y,
      locked: videoNodeLocked(node),
      ...(thumbs[node.nodeId] ? { thumbUrl: thumbs[node.nodeId] } : {}),
    }));
  }, [doc, theme, thumbs, tt]);
  const viewEdges = useMemo(
    () =>
      doc
        ? videoDocGraph(doc).edges.map((edge) => ({ id: edge.edgeId, source: edge.sourceNodeId, target: edge.targetNodeId }))
        : [],
    [doc],
  );

  const selectionContext = useMemo(
    () => videoProjectSelectionContext(doc, selection, { tt, readOnly: !writable }),
    [doc, selection, tt, writable],
  );
  const onSelectionCommand = useCallback(
    (message: SelectionCommand) => {
      const current = docRef.current;
      if (!canEdit || !current || !selectionContext || message.selectionId !== selectionContext.id) return;
      const applied = applyVideoProjectSelectionCommand(current, selection, message);
      if (applied) commit(applied.doc, applied.selection);
    },
    [canEdit, commit, selection, selectionContext],
  );

  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "video-canvas-materials@1",
      actions: ["insert"],
      materialTypes: ["image", "video", "audio"],
      accepts: (material) => canEdit && Boolean(material.artifactId) && videoMaterialKind(material) !== null,
      mutate: (_action, material) => {
        const kind = videoMaterialKind(material);
        if (!kind || !docRef.current) throw new Error("这个素材不能放进视频画布。");
        const center = viewApiRef.current?.center() ?? { x: 0, y: 0 };
        const { kind: nodeKind, position, ...extra } = videoMaterialNodeInput(
          material,
          kind,
          center,
          tt(videoKindSpec(kind).label),
        );
        const id = addNode(nodeKind, extra, position);
        if (!id) throw new Error("没能把素材放进视频画布。");
        const thumb = videoMaterialThumb(material);
        if (thumb) setThumbs((current) => ({ ...current, [id]: thumb }));
      },
    }),
    [addNode, canEdit, tt],
  );
  const materialDocumentId = shownItem ? advancedRootItemId(shownItem) : "";
  const materialBaseRevision = ready ? String(baseRef.current?.revisionId || "") : "";
  useWorkbenchMaterialAdapter(
    useMemo(
      () =>
        withEditorHistoryCommand(materialAdapter, {
          documentId: materialDocumentId,
          targetRevisionId: materialBaseRevision,
        }),
      [materialAdapter, materialBaseRevision, materialDocumentId],
    ),
  );

  const flush = useCallback(async () => {
    if (!writable) return { ok: true as const, item };
    const current = docRef.current;
    const base = baseRef.current;
    if (!current || !base || loadError) {
      return { ok: false as const, error: loadError || "视频画布还没载入，没有保存。" };
    }
    const revisionAtStart = editRevisionRef.current;
    const outcome = await saveVideoProject({
      base,
      doc: current,
      editRevision: revisionAtStart,
      siteId,
      createPreview: () => renderVideoProjectPreview(current, tt),
    });
    if (!outcome.ok) return { ok: false as const, error: outcome.error };
    ownSavesRef.current.add(outcome.revisionId);
    baseRef.current = outcome.item;
    loadedRef.current = { ...loadedRef.current, revisionId: outcome.revisionId };
    markSaved(outcome.revisionId);
    return { ok: true as const, item: outcome.item };
  }, [item, loadError, markSaved, siteId, tt, writable]);

  if (!item) return <div data-testid="workflow-missing-item">{tt("没有打开的视频画布。")}</div>;

  const statusText =
    lockedEdit.readOnly && lockedEdit.lockHolderName
      ? tt("「{name}」正在编辑这个作品，你现在只能看；他保存后这里会自动更新。", { name: lockedEdit.lockHolderName })
      : "";

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      onClose={onClose}
      adapter={{
        collab: lockedEdit.collab,
        id: "video-canvas",
        label: tt("视频画布"),
        status: statusText,
        drawers: canEdit
          ? [
              {
                id: "video-canvas-add-node",
                label: tt("加节点"),
                icon: "add",
                content: <VideoAddNodeDrawer theme={theme} onPick={(kind) => void addNode(kind)} />,
              },
            ]
          : [],
        contextToolbar: selectionContext ? (
          <SelectionToolbar context={selectionContext} onCommand={onSelectionCommand} accent={accent} />
        ) : null,
        history: canEdit
          ? {
              canUndo: historyState.canUndo,
              canRedo: historyState.canRedo,
              undo: () => stepHistory("undo"),
              redo: () => stepHistory("redo"),
            }
          : undefined,
        stage: (
          <div
            data-workflow-stage="true"
            data-workflow-mode="normal"
            data-video-project-stage="v2"
            data-testid="workflow-react-flow-stage"
            className="flex h-full min-h-0 flex-col"
          >
            {loadError ? (
              <EditorSourceFailurePanel
                message={loadError}
                onReload={() => setReloadNonce((value) => value + 1)}
                variant="surface"
              />
            ) : doc ? (
              <VideoProjectCanvas
                nodes={viewNodes}
                edges={viewEdges}
                selection={selection}
                readOnly={!canEdit}
                theme={theme}
                lockedLabel={tt("已锁定")}
                onReady={(api) => {
                  viewApiRef.current = api;
                }}
                onSelectionChange={setSelection}
                onMove={(moves) => commit(docRef.current && moveVideoDocNodes(docRef.current, moves))}
                onConnect={(connection: Connection) =>
                  commit(docRef.current && connectVideoDocNodes(docRef.current, connection))
                }
                onRemove={(nodeIds, edgeIds) =>
                  commit(docRef.current && removeVideoDocElements(docRef.current, nodeIds, edgeIds), EMPTY_VIDEO_SELECTION)
                }
              />
            ) : (
              <div
                data-testid="video-canvas-loading"
                className="flex h-full items-center justify-center text-[13px] text-[var(--awb-muted,#71717a)]"
              >
                {tt("正在载入视频画布…")}
              </div>
            )}
          </div>
        ),
        persistence: {
          dirty: canEdit && editRevision > 0,
          editRevision,
          autoSave: true,
          flush,
          recovery: {
            draftSchema: VIDEO_PROJECT_V2_SCHEMA,
            key: advancedRecoveryKey("video-canvas", item),
            ready: canEdit,
            capture: () => (canEdit ? docRef.current : null),
            restore: (payload) => {
              const parsed = parseVideoProjectDoc(payload);
              if (!canEdit || !parsed.ok) return false;
              return commit(parsed.doc);
            },
          },
        },
      }}
    />
  );
}
