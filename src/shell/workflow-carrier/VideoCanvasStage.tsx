"use client";

/**
 * 工作流叶子：React Flow 画布是唯一编辑面。
 *
 * 本仓没有 React Flow 画布实现（画布在 video 站，经 EmbeddedRoute 注入）。
 * 这里的 stand-in 只把节点和连线画成可断言的 DOM，好让闸锁住
 * 「画布不渲染 / 节点连不上」——不是自研核。
 *
 * 专业编辑页保留，但不可用（点了不动）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { usePluginCommandSurface } from "../plugin-command";
import { rememberEditorChips } from "../agent-review/inbox";
import type { LibraryItem } from "../library-data";
import type {
  VideoCanvasEdge,
  VideoCanvasGraph,
  VideoCanvasNode,
} from "./video-canvas-schema";
import { flushVideoCanvasGraph } from "./video-canvas-leave";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { useUI } from "../../i18n/ui/useUI";
import { useEntityCollab, useLockedEditCollab } from "../collab/adapters/use-entity-collab";
import {
  CanvasCollabLink,
  WORKFLOW_ROOT,
  canvasControlState,
  canvasGraphEquals,
  canvasGraphFromEntities,
  canvasGraphToEntities,
  type CanvasCollabGraph,
  type CanvasRestoreItem,
} from "../collab/adapters/workflow";
import { useImEnabled } from "../../lib/im/client";

export {
  VIDEO_CANVAS_DUAL_ENGINE_HANDOFF,
  flushVideoCanvasGraph,
  videoCanvasLeavePolicy,
} from "./video-canvas-leave";
import {
  WORKFLOW_AGENT_CHIPS,
  WORKFLOW_EDITOR_ID,
  workflowToolsManifestChips,
} from "./l4-chips";
import { dispatchWorkflowAgentChip } from "./agent-route";
import { EmbedEditorPane, embedEditorBase } from "../workbench-embed";
import type { EmbedEditorPaneProps } from "../workbench-embed-types";

// 补丁 / 控制消息的载荷是纯 JSON（测试锁住），协议类型的索引签名比我们的接口更严，在这里一处收口。
type EmbedRecoveryRestore = EmbedEditorPaneProps["recoveryRestore"];

export const WORKFLOW_STAGE_ATTR = "data-workflow-stage";
export const WORKFLOW_MODE_ATTR = "data-workflow-mode";
export const WORKFLOW_CANVAS_ATTR = "data-workflow-canvas-visible";
export const WORKFLOW_PRO_UNAVAILABLE = "专业编辑即将到来";

function emptyGraph(): VideoCanvasGraph {
  return { nodes: [], edges: [] };
}

function graphFromItem(item: LibraryItem | null | undefined): VideoCanvasGraph {
  if (!item) return emptyGraph();
  const meta = item.meta as { graph?: unknown } | undefined;
  const raw = meta?.graph;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyGraph();
  const nodes = (raw as { nodes?: unknown }).nodes;
  const edges = (raw as { edges?: unknown }).edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return emptyGraph();
  return {
    nodes: nodes as VideoCanvasNode[],
    edges: edges as VideoCanvasEdge[],
  };
}

function WorkflowCanvasStandIn({ graph }: { graph: VideoCanvasGraph }) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  return (
    <div
      data-testid="workflow-react-flow-canvas"
      className="h-full min-h-[240px] w-full overflow-auto"
    >
      {nodes.map((node) => (
        <div
          key={node.id}
          data-testid="workflow-node"
          data-node-id={node.id}
          data-node-kind={node.kind}
        >
          {node.label || node.kind}
        </div>
      ))}
      {edges.map((edge) => (
        <div
          key={edge.id}
          data-testid="workflow-edge"
          data-edge-id={edge.id}
          data-from={edge.fromNodeId}
          data-to={edge.toNodeId}
          data-from-port={edge.fromPort}
          data-to-port={edge.toPort}
        />
      ))}
    </div>
  );
}

export function VideoCanvasStage({
  item,
  taskId,
  siteId = "",
  accent = "#0d9488",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  // 别人保存新版后用它换掉画布的来源条目（画布嵌在 video 站里，由条目地址重新载入）。
  const [externalItem, setExternalItem] = useState<LibraryItem | null>(null);
  useEffect(() => {
    setExternalItem(null);
  }, [item]);
  const shownItem = externalItem ?? item;
  const liveCanvasBase = shownItem ? embedEditorBase(shownItem) : "";
  const itemKey = `${shownItem?.key ?? ""}|${shownItem?.revisionId ?? ""}`;

  // ---- 多人同改。真实画布在 video 站的 iframe 里，外壳只经 v1 协议已有的 recovery 消息与它交换
  // 「节点 / 连线」：本端状态靠 recovery-capture 抓回来，别人的改动按字段打成补丁用 recovery-restore 交给画布。
  // 新画布 → collab 模式：两人同时加节点、连线都保留，同一节点按字段合并，查看者可平移缩放、看参数但不能改；
  // 旧画布（不认这套消息）→ lock 模式：沿用「一次一人」，别人持锁时画布不可点。detect = 还没问出来的几秒。
  type Mode = "detect" | "collab" | "lock";
  const [mode, setMode] = useState<Mode>(() => (liveCanvasBase ? "detect" : "lock"));
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [realigning, setRealigning] = useState(false);
  const [local, setLocal] = useState<CanvasCollabGraph | null>(null);
  const localRef = useRef<CanvasCollabGraph | null>(null);
  const [head, setHead] = useState<CanvasRestoreItem | null>(null);
  const [controlReady, setControlReady] = useState(false);
  const [, setNoticeTick] = useState(0);
  const linkRef = useRef<CanvasCollabLink | null>(null);
  if (!linkRef.current) linkRef.current = new CanvasCollabLink();
  const link = linkRef.current;
  const [captureId, setCaptureId] = useState("");
  const timers = useRef<{ capture: number; debounce: number; head: number; retry: number }>({
    capture: 0,
    debounce: 0,
    head: 0,
    retry: 0,
  });
  const dirtyRef = useRef(false);
  const controlKeyRef = useRef("");
  const lastCanSaveRef = useRef<boolean | null>(null);
  const failedPatchRef = useRef(false);
  const realignsRef = useRef(0);
  const latestExternalRef = useRef("");
  const imOn = useImEnabled();

  const setLocalGraph = useCallback((next: CanvasCollabGraph | null) => {
    if (next && localRef.current && canvasGraphEquals(localRef.current, next)) return;
    localRef.current = next;
    setLocal(next);
  }, []);
  const syncHead = useCallback(() => {
    window.clearTimeout(timers.current.head);
    const next = link.head();
    setHead(next);
    if (next) {
      // 画布 8 秒内没回这条：当作没应用上，继续往下发，不让整条队列卡死。
      timers.current.head = window.setTimeout(() => {
        const stuck = link.head();
        if (stuck && stuck.recoveryId === next.recoveryId) {
          if (stuck.snapshot.payload.op === "patch") failedPatchRef.current = true;
          link.receiveRestoreResult({ recoveryId: stuck.recoveryId, ok: false });
          setNoticeTick((n) => n + 1);
          syncHeadRef.current();
        }
      }, 8000);
    }
  }, [link]);
  const syncHeadRef = useRef(syncHead);
  syncHeadRef.current = syncHead;

  const requestCapture = useCallback(() => {
    if (modeRef.current === "lock") return;
    const id = link.beginCapture();
    if (!id) return;
    setCaptureId(id);
    window.clearTimeout(timers.current.capture);
    timers.current.capture = window.setTimeout(() => {
      link.abandonCapture();
      if (modeRef.current === "detect") setMode("lock");
    }, 5000);
  }, [link]);
  const scheduleCapture = useCallback(
    (delay = 300) => {
      if (modeRef.current === "lock") return;
      window.clearTimeout(timers.current.debounce);
      timers.current.debounce = window.setTimeout(requestCapture, delay);
    },
    [requestCapture],
  );

  /** 退出再进房间一次：房间状态重新对齐到画布（画布被重载过、或有补丁没能应用上时用）。 */
  const realign = useCallback(() => {
    setLocalGraph(null);
    setRealigning(true);
  }, [setLocalGraph]);
  useEffect(() => {
    if (!realigning) return undefined;
    const timer = window.setTimeout(() => {
      setRealigning(false);
      scheduleCapture(0);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [realigning, scheduleCapture]);

  /** 画布（重新）载入：基线、队列、画布侧的只读 / 保存闸都要重来。 */
  const resetCanvasState = useCallback(() => {
    link.reset();
    window.clearTimeout(timers.current.head);
    window.clearTimeout(timers.current.capture);
    setHead(null);
    setCaptureId("");
    setControlReady(false);
    controlKeyRef.current = "";
    dirtyRef.current = false;
    failedPatchRef.current = false;
    setLocalGraph(null);
  }, [link, setLocalGraph]);

  useEffect(() => {
    resetCanvasState();
    setMode(liveCanvasBase ? "detect" : "lock");
    // 只在换了条目或版本时重来；liveCanvasBase 随条目走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);
  useEffect(() => {
    if (mode !== "detect" || !liveCanvasBase) return undefined;
    // 画布一直没有任何动静：按旧画布处理。
    const timer = window.setTimeout(() => setMode("lock"), 20000);
    return () => window.clearTimeout(timer);
  }, [mode, liveCanvasBase, itemKey]);
  useEffect(() => {
    const current = timers.current;
    return () => {
      window.clearTimeout(current.capture);
      window.clearTimeout(current.debounce);
      window.clearTimeout(current.head);
      window.clearTimeout(current.retry);
    };
  }, []);

  const lockedEdit = useLockedEditCollab({
    item: mode === "lock" ? item : null,
    editorKind: "workflow",
    onExternalItem: setExternalItem,
  });
  const entity = useEntityCollab<CanvasCollabGraph>({
    item: mode === "collab" && !realigning ? (item ?? {}) : {},
    editorKind: "workflow",
    rootName: WORKFLOW_ROOT,
    toEntities: canvasGraphToEntities,
    fromEntities: canvasGraphFromEntities,
    local,
    applyRemote: (state) => {
      link.applyRemote(state);
      // 补丁发完、重新抓过之前，本端状态是旧的：不能把它当本端改动推回房间。
      setLocalGraph(null);
      setNoticeTick((n) => n + 1);
      syncHead();
    },
  });
  const collabMode = mode === "collab";
  const collabReadOnly = collabMode ? entity.readOnly : lockedEdit.readOnly;
  const mayWrite = collabMode ? !entity.readOnly && entity.saveGate : lockedEdit.mayWrite;
  const markSaved = collabMode ? entity.markSaved : lockedEdit.markSaved;
  const activeCollab = collabMode ? entity.collab : mode === "lock" ? lockedEdit.collab : undefined;

  // 把「只读 / 能不能存」告诉画布；房间还在连时先按只读、不存，连上后按角色放开。
  const room = entity.room;
  const artifactId = String(item?.artifactId || "");
  const control = canvasControlState({
    expectRoom: imOn && Boolean(artifactId),
    status: room?.status ?? null,
    readOnly: entity.readOnly,
    saveGate: entity.saveGate,
  }) ?? { readOnly: false, canSave: true };
  const controlKey = `${control.readOnly}|${control.canSave}`;
  useEffect(() => {
    if (!collabMode || realigning || controlKeyRef.current === controlKey) return;
    controlKeyRef.current = controlKey;
    // 刚当上存档人、且画布报过有没存的改动：让画布把自己标成待保存。
    const flush = control.canSave && lastCanSaveRef.current === false && dirtyRef.current;
    lastCanSaveRef.current = control.canSave;
    link.sendControl({ ...control, flush });
    syncHead();
  }, [collabMode, realigning, controlKey, control, link, syncHead]);

  // 刚当上存档人：若别人已存了更新的版本，换成最新条目重新载入，否则本端保存会被「基线版本不符」挡下。
  const handoffRef = useRef(false);
  useEffect(() => {
    if (!collabMode || !room) return undefined;
    return room.onExternalRevision((revisionId) => {
      latestExternalRef.current = revisionId;
    });
  }, [collabMode, room]);
  useEffect(() => {
    const canSave = collabMode && entity.saveGate && !entity.readOnly;
    const was = handoffRef.current;
    handoffRef.current = canSave;
    const latest = latestExternalRef.current;
    if (!canSave || was || !latest || !artifactId || latest === shownItem?.revisionId) return;
    void import("../artifact-client")
      .then(({ getArtifactItem }) => getArtifactItem(artifactId, latest))
      .then((result) => {
        const data = (result as { data?: unknown }).data;
        if (!data) return;
        setExternalItem(data as LibraryItem);
        realign();
      })
      .catch(() => undefined);
  }, [collabMode, entity.saveGate, entity.readOnly, artifactId, shownItem?.revisionId, realign]);

  // 定时补抓：画布的有些改动不一定带「有改动」信号（例如只挪了位置）。
  useEffect(() => {
    if (!collabMode) return undefined;
    const timer = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") scheduleCapture(0);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [collabMode, scheduleCapture]);

  const onRecoverySnapshot = useCallback(
    (result: { recoveryId: string; ok: boolean; snapshot?: unknown }) => {
      const outcome = link.receiveCapture(result);
      if (outcome.kind === "ignored") return;
      window.clearTimeout(timers.current.capture);
      if (outcome.kind === "legacy") {
        if (modeRef.current === "detect") setMode("lock");
        return;
      }
      if (outcome.kind === "state") {
        if (modeRef.current === "detect") setMode("collab");
        setLocalGraph(outcome.graph);
        return;
      }
      if (outcome.kind !== "failed" && modeRef.current === "detect") setMode("collab");
      // 没载入好 / 期间有补丁 / 抓取失败：稍后再抓。
      window.clearTimeout(timers.current.retry);
      timers.current.retry = window.setTimeout(requestCapture, outcome.kind === "stale" ? 150 : 700);
    },
    [link, requestCapture, setLocalGraph],
  );
  const onRecoveryResult = useCallback(
    (result: { recoveryId: string; ok: boolean }) => {
      const op = link.head()?.recoveryId === result.recoveryId ? link.head()?.snapshot.payload.op : undefined;
      const outcome = link.receiveRestoreResult(result);
      if (!outcome.matched) return;
      if (!outcome.ok && op === "patch") failedPatchRef.current = true;
      if (outcome.ok && op === "control") setControlReady(true);
      syncHead();
      setNoticeTick((n) => n + 1);
      if (!outcome.drained) return;
      if (failedPatchRef.current) {
        failedPatchRef.current = false;
        // 有补丁没能应用上：重新对齐一次（最多两次，不陷入循环）。
        if (realignsRef.current < 2) {
          realignsRef.current += 1;
          realign();
          return;
        }
      }
      scheduleCapture(0);
    },
    [link, realign, scheduleCapture, syncHead],
  );
  const [graph, setGraph] = useState<VideoCanvasGraph>(() => graphFromItem(item));
  const [editRevision, setEditRevision] = useState(0);
  const chipsManifest = useMemo(() => workflowToolsManifestChips(), []);

  useEffect(() => {
    setGraph(graphFromItem(shownItem));
  }, [shownItem]);

  useEffect(() => {
    rememberEditorChips("workflow", chipsManifest.chips);
    rememberEditorChips("video-canvas", chipsManifest.chips);
    return () => {
      rememberEditorChips("workflow", []);
      rememberEditorChips("video-canvas", []);
    };
  }, [chipsManifest.chips]);

  usePluginCommandSurface(
    useMemo(
      () => ({
        editorId: WORKFLOW_EDITOR_ID,
        describe: () =>
          WORKFLOW_AGENT_CHIPS.map((chip) => ({
            id: chip.id,
            label: chip.label,
            summary: chip.prompt.slice(0, 120),
            mutates: true,
          })),
        state: () => ({
          mode: "normal",
          revision: editRevision,
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          chips: chipsManifest.chips.map((chip) => chip.id),
        }),
        run: (id, params) => {
          const proposed =
            params && typeof params.proposedGraph === "object"
              ? (params.proposedGraph as VideoCanvasGraph)
              : undefined;
          const dispatched = dispatchWorkflowAgentChip({
            chipId: id,
            origin: params?.origin,
            graph,
            revision: editRevision,
            proposedGraph: proposed,
          });
          if (dispatched.parked) {
            return {
              ok: true,
              message: "改动已送审阅，你点接受之前流程图一个节点都不会变。",
              revision: editRevision,
            };
          }
          if (dispatched.route.kind === "reject") {
            return {
              ok: false,
              message: dispatched.route.reason,
              revision: editRevision,
            };
          }
          if (dispatched.graph !== graph) {
            setGraph(dispatched.graph);
            setEditRevision((n) => n + 1);
            return {
              ok: true,
              message: "改动已写入画布。",
              revision: editRevision + 1,
            };
          }
          return {
            ok: true,
            message: "这条动作没有改图。",
            revision: editRevision,
          };
        },
      }),
      [chipsManifest.chips, editRevision, graph],
    ),
  );

  const onCanvasChanged = useCallback(() => scheduleCapture(), [scheduleCapture]);
  const onCanvasDirty = useCallback(
    (dirty: boolean) => {
      dirtyRef.current = dirty;
      scheduleCapture();
    },
    [scheduleCapture],
  );
  const markSavedRef = useRef(markSaved);
  markSavedRef.current = markSaved;
  const onCanvasSaved = useCallback((saved: LibraryItem) => {
    dirtyRef.current = false;
    if (saved.revisionId) markSavedRef.current(String(saved.revisionId));
  }, []);
  const onProtocolReset = useCallback(() => {
    // 画布重新载入过：它里头的只读 / 保存闸回到默认，基线作废；已经在房间里就再对齐一次（重载的画布可能比房间旧）。
    const wasCollab = modeRef.current === "collab";
    resetCanvasState();
    if (wasCollab) realign();
  }, [realign, resetCanvasState]);
  // 旧画布不认协同消息，只能整块锁住；新画布的只读由它自己守，仍可平移缩放、打开节点看参数。
  const canvasInert =
    mode === "detect" ? true : mode === "collab" ? !controlReady : lockedEdit.readOnly;
  let statusText = "";
  if (mode === "lock") {
    statusText =
      lockedEdit.readOnly && lockedEdit.lockHolderName
        ? tt("「{name}」正在编辑这个作品，你现在只能看；他保存后这里会自动更新。", {
            name: lockedEdit.lockHolderName,
          })
        : "";
  } else if (collabMode) {
    if (entity.readOnly) {
      statusText = tt("你现在是只读成员：可以平移、缩放、打开节点看参数，不能修改。");
    } else if (link.skipped > 0) {
      statusText = tt("有 {n} 处内容太大，没能同步给同伴；你自己的画布不受影响。", { n: link.skipped });
    } else if (link.failures > 0 && realignsRef.current >= 2) {
      statusText = tt("有同伴的改动没能应用到你的画布；重新打开这张图可以看到。");
    }
  }

  if (!item) {
    return <div data-testid="workflow-missing-item">没有打开的流程图。</div>;
  }

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        collab: activeCollab,
        id: "video-canvas",
        label: "工作流",
        mode: {
          current: "normal",
          setMode: () => {},
          unavailableReason: WORKFLOW_PRO_UNAVAILABLE,
        },
        pages: { proUnavailableReason: WORKFLOW_PRO_UNAVAILABLE },
        stage: (
          <div
            {...{ [WORKFLOW_STAGE_ATTR]: "true" }}
            {...{ [WORKFLOW_MODE_ATTR]: "normal" }}
            {...{ [WORKFLOW_CANVAS_ATTR]: "true" }}
            data-testid="workflow-react-flow-stage"
            className="flex h-full min-h-0 flex-col"
          >
            {liveCanvasBase ? (
              <div
                data-testid="workflow-react-flow-canvas"
                inert={canvasInert || undefined}
                data-collab-readonly={collabReadOnly ? "true" : undefined}
                data-collab-mode={mode}
                className="h-full min-h-[240px] w-full"
              >
                <EmbedEditorPane
                  item={shownItem}
                  editorBase={liveCanvasBase}
                  mediaType="video_canvas"
                  siteId={siteId}
                  recoveryCaptureRequestId={mode === "lock" ? "" : captureId}
                  onRecoverySnapshot={mode === "lock" ? undefined : onRecoverySnapshot}
                  recoveryRestore={mode === "lock" ? null : (head as unknown as EmbedRecoveryRestore)}
                  onRecoveryResult={mode === "lock" ? undefined : onRecoveryResult}
                  onProjectManifest={mode === "lock" ? undefined : onCanvasChanged}
                  onDirtyChange={mode === "lock" ? undefined : onCanvasDirty}
                  onVersionSaved={collabMode ? onCanvasSaved : undefined}
                  onProtocolReset={mode === "lock" ? undefined : onProtocolReset}
                />
              </div>
            ) : (
              <WorkflowCanvasStandIn graph={graph} />
            )}
          </div>
        ),
        status: statusText,
        persistence: {
          dirty: mayWrite ? editRevision > 0 : false,
          editRevision,
          // 保持 true：只读端 dirty 恒为 false 且 flush 不落库，自动保存不会产生任何写入。
          autoSave: true,
          flush: () => {
            // 只读（别人持锁）时不落库；别人保存后这里会自动更新。
            if (!mayWrite) return { ok: true as const, item };
            const saved = flushVideoCanvasGraph(item, graph);
            if (saved.item.revisionId) markSaved(String(saved.item.revisionId));
            return saved;
          },
          recovery: {
            draftSchema: liveCanvasBase ? undefined : "oceanleo.workflow.graph.v1",
            key: advancedRecoveryKey("video-canvas", item),
            ready: !liveCanvasBase,
            capture: () => liveCanvasBase ? null : graph,
            restore: (payload) => {
              const restored = payload as VideoCanvasGraph | null;
              if (!restored || !Array.isArray(restored.nodes) || !Array.isArray(restored.edges)) return false;
              setGraph(restored);
              setEditRevision(value => value + 1);
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
