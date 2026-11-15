"use client";

import { type Connection, type EdgeChange, type NodeChange, type ReactFlowInstance, type Viewport, type XYPosition } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n";
import { canvasExecutionAvailable, EXECUTION_UNAVAILABLE_MESSAGE, type CanvasProviderProgress } from "./canvas-gateway";
import { CANVAS_COMMAND_REGISTRY, NODE_MENU_CAPABILITIES, commandAvailability, commandDisclosure, executeCanvasCommand, newCommandRequestId, type CanvasCommandAvailability, type CanvasCommandEnvironment, type CanvasCommandRequest, type CanvasCommandResult, type CanvasCommandStatus, type CanvasCommandSurface, type NodeMenuEntryId } from "./command-registry";
import { effectiveCanvasNode, CANVAS_EDGE_LIMIT, compareProjectVersions, projectPreviewAtCurrentHead, projectHead, projectProjection, projectToFlow, replaceProjectGraph, stableId, updateProjectNode, workspaceViewForNodeKind, type CanvasEdgeDefinition, type CanvasFlowEdge, type CanvasFlowNode, type CanvasNodeDefinition, type CanvasWorkspaceView, type ProjectVersionComparison, type VideoProject } from "./project-model";
import type { CanvasMenuPoint } from "./CanvasCreateMenu";
import { canvasSelectionContext, canvasSelectionDispatch } from "./canvas-selection-adapter";
import { WorkflowGraphHistory, workflowHistoryActionForCommand } from "./workflow-graph-history";
import { durableVideoCapability, startDurableVideoPolling, prepareVideoQuote, getPreparedVideoQuote } from "./durable-video-adapter";
import type { CanvasCollabPort } from "./canvas-collab";
import { recordUserMutation } from "../../user-edit-session";

const COMMAND_HISTORY_LIMIT = 100;
const IMAGE_MODE_SESSION_KEY = "leovideo.canvas.image-mode.v1";

function initialImageMode(): "retouch" | "generate" {
  if (typeof window === "undefined") return "retouch";
  return window.sessionStorage.getItem(IMAGE_MODE_SESSION_KEY) === "generate"
    ? "generate"
    : "retouch";
}

interface ProjectSnapshotReceipt {
  saveId: string;
  projectVersionId: string;
  revision: number;
  url: string;
}

export interface CommandViewState {
  requestId: string;
  commandId: string;
  status: CanvasCommandStatus;
  message?: string;
  phase?: CanvasProviderProgress["phase"];
  progress?: number;
  cancelable?: boolean;
  externalRunId?: string;
}

interface CanvasSelectionTransaction {
  selectionId: string;
  controlId: string;
  projectVersionId: string;
  selectionEpoch: number;
  baseProject: VideoProject;
  previewProject: VideoProject;
  queue: Promise<void>;
}

export interface LibraryCanvasSession {
  initialProject: VideoProject;
  userEditKey: string;
  readOnly: boolean;
  save: () => Promise<void>;
  runtimeUrls?: Record<string, string>;
  uploadMedia: (file: File) => Promise<boolean>;
  openMaterials: () => void;
}

export function useCanvasWorkflow(session: LibraryCanvasSession) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [editRevision, setEditRevision] = useState(0);
  const editRevisionRef = useRef(0);
  const noteMutation = useCallback(() => {
    recordUserMutation(sessionRef.current.userEditKey);
    editRevisionRef.current += 1;
    setEditRevision(editRevisionRef.current);
  }, []);
  const tt = useUI();
  const [project, setProjectState] = useState(session.initialProject);
  const executionDegraded =
    !canvasExecutionAvailable();
  const [selectedNodeId, setSelectedNodeIdState] = useState<string | null>(null);
  const [selectionEpoch, setSelectionEpochState] = useState(1);
  const [imageMode, setImageMode] =
    useState<"retouch" | "generate">(initialImageMode);
  const [workspaceView, setWorkspaceView] =
    useState<CanvasWorkspaceView>("graph");
  const [mediaUploadRequest, setMediaUploadRequest] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [status, setStatus] = useState(
    "",
  );
  const [dirty, setDirty] = useState(false);
  // 多人同改（F06）：外壳通过 recovery-restore 的 control 载荷告诉画布「只读 / 自己别存」。默认 = 单人：能改、自己存。
  const [collabPolicy, setCollabPolicy] = useState({ readOnly: false, canSave: true });
  const collabPolicyRef = useRef(collabPolicy);
  collabPolicyRef.current = { ...collabPolicy, readOnly: session.readOnly || collabPolicy.readOnly };
  const loadedRef = useRef(true);
  const [projectLoadError, setProjectLoadError] = useState("");
  const projectLoadErrorRef = useRef("");
  projectLoadErrorRef.current = projectLoadError;
  const [saving, setSaving] = useState(false);
  const hostOwnsChrome = true;
  const [inpaintMaskUrl, setInpaintMaskUrl] = useState("");
  const [selectionAnchor, setSelectionAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  const [menuPoint, setMenuPoint] = useState<CanvasMenuPoint | null>(null);
  const [positionOverrides, setPositionOverrides] = useState<
    Record<string, XYPosition>
  >({});
  const [commandState, setCommandState] = useState<CommandViewState | null>(
    null,
  );
  const [commandResults, setCommandResults] = useState<CanvasCommandResult[]>(
    [],
  );
  const [nodeProgress, setNodeProgress] = useState<Record<string, { commandId: string; status: string; message?: string }>>({});
  const [quoteEpoch, setQuoteEpoch] = useState(0);
  const [quoteError, setQuoteError] = useState("");
  const [durableCapability, setDurableCapability] =
    useState<CanvasCommandAvailability>({
      enabled: false,
      reasonCode: "CAPABILITY_DISCOVERY_PENDING",
      missingContract: "GET /v1/video-canvas/capabilities",
      reason: "Checking durable video capability…",
    });
  const projectRef = useRef(project);
  const workflowHistoryRef = useRef<WorkflowGraphHistory | null>(null);
  if (!workflowHistoryRef.current) {
    workflowHistoryRef.current = new WorkflowGraphHistory(100, project);
  }
  const workflowHistory = workflowHistoryRef.current;
  const selectedNodeIdRef = useRef(selectedNodeId);
  const selectionEpochRef = useRef(selectionEpoch);
  const flowRef = useRef<ReactFlowInstance<CanvasFlowNode, CanvasFlowEdge> | null>(
    null,
  );
  const viewportRef = useRef<Viewport | undefined>(undefined);
  const gestureSuppressionRef = useRef(false);
  const moveStartRef = useRef<Viewport | null>(null);
  const moveDidChangeRef = useRef(false);
  const environmentRef = useRef<CanvasCommandEnvironment>(null!);
  const saveRef = useRef<
    (request?: { saveId?: string }) => Promise<ProjectSnapshotReceipt>
  >(null!);
  const requestPromisesRef = useRef(
    new Map<string, Promise<CanvasCommandResult>>(),
  );
  const commandControllersRef = useRef(new Map<string, AbortController>());
  const activeCommandRequestIdRef = useRef<string | null>(null);
  const selectionTransactionsRef = useRef(
    new Map<string, CanvasSelectionTransaction>(),
  );
  const seenSelectionRequestsRef = useRef(new Set<string>());
  const selectionRequestOrderRef = useRef<string[]>([]);

  useEffect(() => () => {
    for (const controller of commandControllersRef.current.values()) controller.abort();
    commandControllersRef.current.clear();
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(IMAGE_MODE_SESSION_KEY, imageMode);
  }, [imageMode]);

  useEffect(() => {
    let active = true;
    if (executionDegraded) {
      setDurableCapability({
        enabled: false,
        reasonCode: "MISSING_DURABLE_PROVIDER",
        missingContract: "host.fetchJson",
        reason: EXECUTION_UNAVAILABLE_MESSAGE,
      });
      return () => {
        active = false;
      };
    }
    void durableVideoCapability().then((capability) => {
      if (!active) return;
      setDurableCapability({
        ...capability,
        ...(!capability.enabled
          ? {
              reasonCode: "MISSING_DURABLE_PROVIDER" as const,
              missingContract: "GET /v1/video-canvas/capabilities",
            }
          : {}),
      });
    });
    return () => {
      active = false;
    };
  }, [executionDegraded]);

  const setProject = useCallback((next: VideoProject, recordHistory = true) => {
    if (collabPolicyRef.current.readOnly) return false;
    selectionTransactionsRef.current.clear();
    if (recordHistory) workflowHistory.record(next);
    projectRef.current = next;
    setProjectState(next);
    setPositionOverrides({});
    noteMutation();
    setDirty(true);
    return true;
  }, [noteMutation, workflowHistory]);

  const setProjectMetadata = useCallback(
    (next: VideoProject) => {
      if (collabPolicyRef.current.readOnly) return;
      projectRef.current = next;
      setProjectState(next);
      noteMutation();
    setDirty(true);
    },
    [noteMutation],
  );

  const setPreviewProject = useCallback((next: VideoProject) => {
    projectRef.current = next;
    setProjectState(next);
    setPositionOverrides({});
  }, []);

  const cancelSelectionTransactions = useCallback(() => {
    const active = selectionTransactionsRef.current.values().next()
      .value as CanvasSelectionTransaction | undefined;
    selectionTransactionsRef.current.clear();
    if (active) setPreviewProject(active.baseProject);
  }, [setPreviewProject]);

  const setSelectedNodeId = useCallback(
    (nodeId: string | null) => {
      if (selectedNodeIdRef.current === nodeId) return;
      cancelSelectionTransactions();
      selectedNodeIdRef.current = nodeId;
      setSelectedNodeIdState(nodeId);
      setInpaintMaskUrl("");
      selectionEpochRef.current += 1;
      setSelectionEpochState(selectionEpochRef.current);
    },
    [cancelSelectionTransactions],
  );

  const applyWorkflowHistory = useCallback(
    (action: "undo" | "redo") => {
      if (collabPolicyRef.current.readOnly) return false;
      const current = projectRef.current;
      const next = action === "undo"
        ? workflowHistory.undo(current)
        : workflowHistory.redo(current);
      if (!next) return false;
      selectionTransactionsRef.current.clear();
      projectRef.current = next;
      setProjectState(next);
      setPositionOverrides({});
      const selected = selectedNodeIdRef.current;
      if (
        selected &&
        !projectHead(next).graph.nodes.some((node) => node.nodeId === selected)
      ) {
        setSelectedNodeId(null);
      }
      noteMutation();
    setDirty(true);
      return true;
    },
    [noteMutation, setSelectedNodeId, workflowHistory],
  );

  const updateSelectionAnchor = useCallback(() => {
    const nodeId = selectedNodeIdRef.current;
    if (!nodeId) {
      setSelectionAnchor(undefined);
      return;
    }
    const element = document.querySelector<HTMLElement>(
      `[data-node-id="${CSS.escape(nodeId)}"]`,
    );
    const rect = element?.getBoundingClientRect();
    setSelectionAnchor(
      rect
        ? {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          }
        : undefined,
    );
  }, []);

  const screenCenter = useCallback(() => {
    const root = document.querySelector("[data-canvas-workflow]");
    const rect = root?.getBoundingClientRect();
    const screen = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const flow = flowRef.current?.screenToFlowPosition(screen) || screen;
    return { x: flow.x - 180, y: flow.y - 110 };
  }, []);

  // The Library shell owns working copies, background revisions and close.
  // No snapshots, timer saves or leave-persistence are owned by the engine.
  const saveProject = useCallback(async (request: { saveId?: string } = {}): Promise<ProjectSnapshotReceipt> => {
    const snapshot = projectRef.current;
    setSaving(true);
    try { await sessionRef.current.save(); if (projectRef.current === snapshot) setDirty(false); }
    finally { setSaving(false); }
    return { saveId: request.saveId || stableId("save"), projectVersionId: snapshot.headVersionId,
      revision: projectHead(snapshot).revision, url: "" };
  }, []);
  saveRef.current = saveProject;

  const reportCommandProgress = useCallback(
    (requestId: string, progress: CanvasProviderProgress) => {
      setCommandState((current) => {
        if (!current || current.requestId !== requestId) return current;
        return {
          ...current,
          status: "pending",
          phase: progress.phase,
          progress: progress.progress,
          message: progress.message,
          externalRunId:
            progress.externalRunId || current.externalRunId,
        };
      });
      if (progress.message) setStatus(progress.message);
    },
    [],
  );

  const cancelActiveCommand = useCallback((): boolean => {
    const requestId = activeCommandRequestIdRef.current;
    if (!requestId) return false;
    const controller = commandControllersRef.current.get(requestId);
    if (!controller || controller.signal.aborted) return false;
    controller.abort();
    setCommandState((current) =>
      current?.requestId === requestId
        ? {
            ...current,
            status: "pending",
            phase: "canceling",
            message: "Canceling provider operation…",
          }
        : current,
    );
    setStatus("Canceling provider operation…");
    return true;
  }, []);

  useEffect(() => {
    if (executionDegraded || projectLoadError) return;
    return startDurableVideoPolling({
      getProject: () => projectRef.current,
      apply: (next) => { if (!collabPolicyRef.current.readOnly) setProject(next, false); },
      onError: () => setStatus(tt("暂时无法读取视频进度，将自动重试。")),
    });
  }, [executionDegraded, projectLoadError, setProject, tt]);

  useEffect(() => {
    let live = true;
    const stored = projectHead(project).graph.nodes.find((item) => item.nodeId === selectedNodeId);
    const node = stored ? effectiveCanvasNode(stored) : undefined;
    if (executionDegraded || node?.kind !== "video" || getPreparedVideoQuote(project, node)) return;
    setQuoteError("");
    void prepareVideoQuote(project, node).then(() => { if (live) setQuoteEpoch((value) => value + 1); })
      .catch((error) => { if (live) setQuoteError(error instanceof Error ? error.message : String(error)); });
    return () => { live = false; };
  }, [executionDegraded, project, selectedNodeId]);

  environmentRef.current = {
    translate: tt,
    getProject: () => projectRef.current,
    setProject,
    getSelectedNodeId: () => selectedNodeIdRef.current,
    setSelectedNodeId,
    getSelectionEpoch: () => selectionEpochRef.current,
    getImageMode: () => imageMode,
    setImageMode,
    getWorkspaceView: () => workspaceView,
    setWorkspaceView: (view) => {
      setWorkspaceView(view);
    },
    openMaterialLibrary: () => sessionRef.current.openMaterials(),
    requestMediaUpload: () => setMediaUploadRequest((value) => value + 1),
    getDurableVideoCapability: () => durableCapability,
    getCommandSignal: (requestId) =>
      commandControllersRef.current.get(requestId)?.signal,
    reportCommandProgress,
    setProjectMetadata,
    resolveAssetUrl: async (asset) => {
      const url = (sessionRef.current.runtimeUrls || {})[asset.assetId] || asset.url;
      if (!url) throw new Error(tt("连接的素材尚未准备好。"));
      return url;
    },
    reportNodeProgress: (nodeId, status, message) => setNodeProgress((current) => ({ ...current, [nodeId]: { commandId: "canvas.chain.run", status, message } })),
    setStatus: (message) => setStatus(message.split("\n").map((part) => tt(part)).join("\n")),
    saveProject: (request) => saveRef.current(request),
    screenCenter,
  };

  const dispatchCommand = useCallback(
    (
      commandId: string,
      args: Record<string, unknown> = {},
      surface: CanvasCommandSurface = "compact",
      incoming?: Pick<
        CanvasCommandRequest,
        "requestId" | "projectVersionId" | "selectionEpoch"
      >,
    ): Promise<CanvasCommandResult> => {
      const request: CanvasCommandRequest = {
        commandId,
        requestId: incoming?.requestId || newCommandRequestId(),
        projectVersionId:
          incoming?.projectVersionId || projectRef.current.headVersionId,
        selectionEpoch:
          incoming?.selectionEpoch ?? selectionEpochRef.current,
        surface,
        args,
      };
      if (projectLoadErrorRef.current) {
        return Promise.resolve({
          ...request,
          status: "disabled",
          message: projectLoadErrorRef.current,
          assetIds: [], runIds: [], receiptIds: [],
          cost: { billing: "none", currency: "USD", estimatedAmount: 0, label: "No charge" },
        });
      }
      if (
        collabPolicyRef.current.readOnly &&
        !commandId.startsWith("canvas.session.") &&
        commandId !== "canvas.run.status.refresh"
      ) {
        return Promise.resolve({
          ...request,
          status: "disabled",
          message: "This canvas is read-only for you right now.",
          assetIds: [], runIds: [], receiptIds: [],
          cost: { billing: "none", currency: "USD", estimatedAmount: 0, label: "No charge" },
        });
      }
      const existing = requestPromisesRef.current.get(request.requestId);
      if (existing) return existing;
      const definition = CANVAS_COMMAND_REGISTRY.get(commandId);
      const cancelable = Boolean(definition?.cancellation);
      if (cancelable) {
        commandControllersRef.current.set(
          request.requestId,
          new AbortController(),
        );
        activeCommandRequestIdRef.current = request.requestId;
      }
      setCommandState({
        requestId: request.requestId,
        commandId,
        status: "pending",
        phase: "validating",
        progress: 0,
        cancelable,
      });
      const promise = executeCanvasCommand(
        request,
        environmentRef.current,
      ).then((result) => {
        setCommandState({
          requestId: result.requestId,
          commandId: result.commandId,
          status: result.status,
          message: result.message,
          phase: result.progress?.phase,
          progress: result.progress?.progress,
          externalRunId: result.progress?.externalRunId,
          cancelable: false,
        });
        setCommandResults((current) => [
          ...current.slice(-(COMMAND_HISTORY_LIMIT - 1)),
          result]);
        return result;
      }).finally(() => {
        commandControllersRef.current.delete(request.requestId);
        if (activeCommandRequestIdRef.current === request.requestId) {
          activeCommandRequestIdRef.current = null;
        }
      });
      requestPromisesRef.current.set(request.requestId, promise);
      if (requestPromisesRef.current.size > COMMAND_HISTORY_LIMIT * 2) {
        const first = requestPromisesRef.current.keys().next().value;
        if (first) requestPromisesRef.current.delete(first);
      }
      return promise;
    },
    [],
  );

  const selectedNode = useMemo(
    () =>
      projectHead(project).graph.nodes.find(
        (node) => node.nodeId === selectedNodeId,
      ) || null,
    [project, selectedNodeId],
  );
  const historyComparison = useMemo<ProjectVersionComparison | null>(() => {
    const current = projectHead(project);
    if (!current.parentVersionId) return null;
    return compareProjectVersions(
      project,
      current.parentVersionId,
      project.headVersionId,
    );
  }, [project]);

  const availability = useCallback(
    (commandId: string, args: Record<string, unknown> = {}) =>
      projectLoadError
        ? { enabled: false, reason: projectLoadError }
        : commandAvailability(commandId, environmentRef.current, args),
    [durableCapability, project, selectedNodeId, imageMode, projectLoadError, quoteEpoch],
  );

  const flow = useMemo(
    () =>
      projectToFlow(project, (node, asset, derivative) => {
        const args = { prompt: node.prompt || node.text || "" };
        const commandAvailabilityMap = Object.fromEntries(
          [...CANVAS_COMMAND_REGISTRY.keys()].map((commandId) => [
            commandId,
            node.nodeId === selectedNodeId
              ? availability(commandId, args)
              : { enabled: false, reason: "Select this node first." }]),
        );
        const commandDisclosureMap = Object.fromEntries(
          [...CANVAS_COMMAND_REGISTRY.keys()].flatMap((commandId) => {
            const disclosure = commandDisclosure(
              commandId,
              environmentRef.current,
              args,
            );
            return disclosure ? [[commandId, disclosure]] : [];
          }),
        );
        return {
          nodeId: node.nodeId,
          kind: node.kind,
          title: node.title,
          asset: asset && (session.runtimeUrls || {})[asset.assetId]
            ? {
                ...asset,
                url: (session.runtimeUrls || {})[asset.assetId],
                previewUrl: (session.runtimeUrls || {})[asset.assetId],
              }
            : asset,
          derivative,
          prompt: node.prompt,
          text: node.text,
          model: node.model,
          ratio: node.ratio,
          durationSeconds: node.durationSeconds,
          sceneId: node.sceneId,
          shotId: node.shotId,
          cameraId: node.cameraId,
          localEditRecipe: node.localEditRecipe,
          selectionEpoch,
          hostOwnsChrome,
          hostProvidesEditBar: true,
          imageMode,
          generateSummary: {
            provider:
              asset?.provider?.provider ||
              (node.kind === "video"
                ? "Durable Run · bailian-video"
                : "OceanLeo gateway"),
            model:
              asset?.provider?.model || node.model || "Platform default",
            input: asset
              ? `Asset ${asset.assetId.slice(0, 16)}… + prompt`
              : "Prompt + Project context",
            estimatedCost:
              (node.kind === "video" && getPreparedVideoQuote(project, node) ? `${getPreparedVideoQuote(project, node)!.amount} ${getPreparedVideoQuote(project, node)!.currency}` : undefined) ||
              (node.kind === "video" && quoteError ? quoteError : undefined) || asset?.provider?.pricing.label ||
              (node.kind === "video"
                ? "Provider-priced · durable receipt"
                : "Provider-metered; exact credits returned in receipt"),
          },
          commandAvailability: commandAvailabilityMap,
          commandDisclosures: commandDisclosureMap,
          commandState: nodeProgress[node.nodeId]?.status === "running" ? nodeProgress[node.nodeId]
            : node.generation ? { commandId: "canvas.node.generate.video", status: node.generation.status, message: node.generation.message?.split("\n").map((part) => tt(part)).join("\n") }
            : nodeProgress[node.nodeId] || (node.nodeId === selectedNodeId && commandState ? commandState : undefined),
          onCommand: (commandId, commandArgs) =>
            dispatchCommand(commandId, commandArgs, "compact"),
        };
      }),
    [
      availability,
      commandState,
      nodeProgress,
      quoteEpoch,
      quoteError,
      tt,
      dispatchCommand,
      false,
      hostOwnsChrome,
      imageMode,
      project,
      session.runtimeUrls,
      selectedNodeId,
      selectionEpoch],
  );

  const renderNodes = useMemo<CanvasFlowNode[]>(
    () =>
      flow.nodes.map((node) => ({
        ...node,
        position: positionOverrides[node.id] || node.position,
        selected: node.id === selectedNodeId,
        dragHandle:
          node.data.kind === "image" ? undefined : ".leo-node-drag-handle",
      })),
    [flow.nodes, positionOverrides, selectedNodeId],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateSelectionAnchor);
    window.addEventListener("resize", updateSelectionAnchor);
    window.addEventListener("scroll", updateSelectionAnchor, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateSelectionAnchor);
      window.removeEventListener("scroll", updateSelectionAnchor, true);
    };
  }, [
    positionOverrides,
    selectedNodeId,
    updateSelectionAnchor]);

  const selectionContext = useMemo(
    () =>
      canvasSelectionContext({
        project,
        node: selectedNode ? effectiveCanvasNode(selectedNode) : null,
        asset: selectedNode?.assetId
          ? project.assets[selectedNode.assetId]
          : undefined,
        selectionEpoch,
        imageMode,
        inpaintMaskUrl,
        anchor: selectionAnchor,
        availability,
        tt,
      }),
    [
      availability,
      imageMode,
      inpaintMaskUrl,
      project,
      selectedNode,
      selectionAnchor,
      selectionEpoch,
      tt],
  );

  const dispatchSelectionCommand = useCallback(
    (command: Parameters<typeof canvasSelectionDispatch>[0]) => {
      const reject = (message: string) => {
        return false;
      };
      if (seenSelectionRequestsRef.current.has(command.requestId)) {
        return reject("Duplicate selection request was rejected.");
      }
      seenSelectionRequestsRef.current.add(command.requestId);
      selectionRequestOrderRef.current.push(command.requestId);
      if (selectionRequestOrderRef.current.length > 256) {
        const oldest = selectionRequestOrderRef.current.shift();
        if (oldest) seenSelectionRequestsRef.current.delete(oldest);
      }
      const historyAction = workflowHistoryActionForCommand(
        command,
        projectRef.current.headVersionId,
        workflowHistory.canUndo,
        workflowHistory.canRedo,
      );
      if (historyAction) {
        const applied = applyWorkflowHistory(historyAction);
        return applied;
      }
      const mapped = canvasSelectionDispatch(command, selectionContext);
      if (!mapped) {
        return reject("Selection changed; the command was not applied.");
      }
      if (mapped.commandId === "canvas.session.inpaint-mask.set") {
        setInpaintMaskUrl(String(mapped.args.maskUrl || ""));
        return true;
      }
      const complete = (result: CanvasCommandResult) => {
        const ok =
          result.status === "succeeded" || result.status === "accepted";
      };
      if (!mapped.phase) {
        void dispatchCommand(
          mapped.commandId,
          mapped.args,
          "protocol",
          mapped.incoming,
        ).then(complete);
        return true;
      }
      const transactionId = mapped.transactionId!;
      if (mapped.phase === "start") {
        if (selectionTransactionsRef.current.has(transactionId)) {
          return reject("Duplicate selection transaction was rejected.");
        }
        const current = projectRef.current;
        selectionTransactionsRef.current.set(transactionId, {
          selectionId: command.selectionId,
          controlId: command.controlId,
          projectVersionId: mapped.incoming.projectVersionId,
          selectionEpoch: mapped.incoming.selectionEpoch,
          baseProject: current,
          previewProject: current,
          queue: Promise.resolve(),
        });
        return true;
      }
      const transaction =
        selectionTransactionsRef.current.get(transactionId);
      if (
        !transaction ||
        transaction.selectionId !== command.selectionId ||
        transaction.controlId !== command.controlId ||
        transaction.projectVersionId !== mapped.incoming.projectVersionId ||
        transaction.selectionEpoch !== mapped.incoming.selectionEpoch
      ) {
        return reject("Selection transaction is stale or unknown.");
      }
      if (mapped.phase === "cancel") {
        transaction.queue = transaction.queue.then(() => {
          if (
            selectionTransactionsRef.current.get(transactionId) !==
            transaction
          ) {
            return;
          }
          selectionTransactionsRef.current.delete(transactionId);
          setPreviewProject(transaction.baseProject);
        });
        return true;
      }
      if (mapped.phase === "update") {
        transaction.queue = transaction.queue.then(async () => {
          if (
            selectionTransactionsRef.current.get(transactionId) !==
            transaction
          ) {
            return;
          }
          let candidate = transaction.baseProject;
          const previewEnvironment: CanvasCommandEnvironment = {
            ...environmentRef.current,
            getProject: () => transaction.baseProject,
            setProject: (next) => {
              candidate = next;
            },
            setProjectMetadata: (next) => {
              candidate = next;
            },
            setStatus: () => undefined,
          };
          const result = await executeCanvasCommand(
            {
              commandId: mapped.commandId,
              requestId: mapped.incoming.requestId,
              projectVersionId: mapped.incoming.projectVersionId,
              selectionEpoch: mapped.incoming.selectionEpoch,
              surface: "protocol",
              args: mapped.args,
            },
            previewEnvironment,
          );
          if (
            selectionTransactionsRef.current.get(transactionId) !==
            transaction
          ) {
            return;
          }
          const ok =
            result.status === "succeeded" || result.status === "accepted";
          if (ok) {
            transaction.previewProject = projectPreviewAtCurrentHead(
              transaction.baseProject,
              candidate,
            );
            setPreviewProject(transaction.previewProject);
          }
          complete(result);
        });
        return true;
      }
      transaction.queue = transaction.queue.then(async () => {
        if (
          selectionTransactionsRef.current.get(transactionId) !== transaction
        ) {
          return;
        }
        projectRef.current = transaction.baseProject;
        const result = await dispatchCommand(
          mapped.commandId,
          mapped.args,
          "protocol",
          mapped.incoming,
        );
        if (
          result.status !== "succeeded" &&
          result.status !== "accepted" &&
          projectRef.current.headVersionId ===
            transaction.baseProject.headVersionId
        ) {
          setPreviewProject(transaction.baseProject);
        }
        selectionTransactionsRef.current.delete(transactionId);
        complete(result);
      });
      return true;
    },
    [
      dispatchCommand,
      applyWorkflowHistory,
      false,
      selectionContext,
      setPreviewProject,
      workflowHistory],
  );

  const createAt = useCallback(
    (
      entryId: NodeMenuEntryId,
      position: XYPosition,
      surface: CanvasCommandSurface,
      asset?: Record<string, unknown>,
    ) =>
      dispatchCommand(
        "canvas.node.create",
        { entryId, x: position.x, y: position.y, ...(asset ? { asset } : {}) },
        surface,
      ),
    [dispatchCommand],
  );

  const uploadMedia = useCallback(async (file: File) => {
    if (collabPolicyRef.current.readOnly) return false;
    setUploadingMedia(true);
    try { return await sessionRef.current.uploadMedia(file); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); return false; }
    finally { setUploadingMedia(false); }
  }, []);

  const applyLoadedProject = useCallback((next: VideoProject) => {
    loadedRef.current = true;
    setProjectLoadError("");
    selectionTransactionsRef.current.clear();
    workflowHistory.reset(next);
    projectRef.current = next;
    setProjectState(next);
    setPositionOverrides({});
    setSelectedNodeId(null);
    setWorkspaceView("graph");
    setDirty(false);
    viewportRef.current = projectHead(next).graph.viewport;
    window.requestAnimationFrame(() => {
      if (viewportRef.current) {
        void flowRef.current?.setViewport(viewportRef.current);
      } else {
        void flowRef.current?.fitView({ padding: 0.18 });
      }
    });
  }, [setSelectedNodeId, workflowHistory]);

  const commitGraph = useCallback(
    (
      nodes: CanvasNodeDefinition[],
      edges: CanvasEdgeDefinition[],
      reason: string,
    ) => {
      const next = replaceProjectGraph(
        projectRef.current,
        nodes,
        edges,
        reason,
        viewportRef.current,
      );
      setProject(next);
    },
    [setProject],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasFlowNode>[]) => {
      for (const change of changes) {
        if (
          change.type === "position" &&
          change.position &&
          typeof change.id === "string"
        ) {
          setPositionOverrides((current) => ({
            ...current,
            [change.id]: change.position!,
          }));
        } else if (change.type === "select" && change.selected) {
          setSelectedNodeId(change.id);
        }
      }
    },
    [setSelectedNodeId],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<CanvasFlowEdge>[]) => {
      const removed = new Set(
        changes
          .filter((change) => change.type === "remove")
          .map((change) => change.id),
      );
      if (!removed.size) return;
      const version = projectHead(projectRef.current);
      commitGraph(
        version.graph.nodes,
        version.graph.edges.filter((edge) => !removed.has(edge.edgeId)),
        "canvas.edge.delete",
      );
    },
    [commitGraph],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        connection.source === connection.target
      ) {
        setStatus("A connection needs two different nodes.");
        return;
      }
      const version = projectHead(projectRef.current);
      if (version.graph.edges.length >= CANVAS_EDGE_LIMIT) {
        setStatus(`Canvas is limited to ${CANVAS_EDGE_LIMIT} edges.`);
        return;
      }
      commitGraph(
        version.graph.nodes,
        [
          ...version.graph.edges,
          {
            edgeId: stableId("edge"),
            sourceNodeId: connection.source,
            targetNodeId: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
          }],
        "canvas.edge.create",
      );
    },
    [commitGraph],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: CanvasFlowNode) => {
      gestureSuppressionRef.current = true;
      const next = updateProjectNode(
        projectRef.current,
        node.id,
        "canvas.node.position",
        { position: node.position },
      );
      setProject(next);
      setPositionOverrides((current) => {
        const copy = { ...current };
        delete copy[node.id];
        return copy;
      });
    },
    [setProject],
  );

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (gestureSuppressionRef.current) {
        gestureSuppressionRef.current = false;
        return;
      }
      setMenuPoint({
        x: event.clientX,
        y: event.clientY,
        openedAt: performance.now(),
      });
    },
    [],
  );

  const createFromMenu = useCallback(
    (entryId: NodeMenuEntryId) => {
      const capability = NODE_MENU_CAPABILITIES[entryId];
      if (capability.commandId !== "canvas.node.create") {
        void dispatchCommand(
          capability.commandId,
          capability.commandArgs || {},
          "node-menu",
        );
        return;
      }
      const point = menuPoint || {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      const position =
        flowRef.current?.screenToFlowPosition(point) || point;
      void createAt(entryId, position, "node-menu");
    },
    [createAt, dispatchCommand, menuPoint],
  );

  const openCreateMenu = useCallback(() => {
    setMenuPoint({
      x: Math.max(12, window.innerWidth / 2 - 300),
      y: Math.max(12, window.innerHeight / 2 - 230),
      openedAt: performance.now(),
    });
  }, []);

  const dropCreate = useCallback(
    (entryId: NodeMenuEntryId, screen: XYPosition) => {
      if (
        NODE_MENU_CAPABILITIES[entryId].commandId !== "canvas.node.create"
      ) {
        return;
      }
      const position = flowRef.current?.screenToFlowPosition(screen) || screen;
      void createAt(entryId, position, "node-menu");
    },
    [createAt],
  );

  const onNodeDoubleClick = useCallback(
    (nodeId: string) => {
      const node = projectHead(projectRef.current).graph.nodes.find(
        (candidate) => candidate.nodeId === nodeId,
      );
      if (!node) return;
      setSelectedNodeId(nodeId);
      setWorkspaceView(workspaceViewForNodeKind(node.kind));
    },
    [setSelectedNodeId],
  );

  // 多人同改（F06）：外壳经 recovery-capture / recovery-restore 读写画布的图；见 canvas-collab.ts / use-canvas-collab.ts。
  const collabPort = useMemo<CanvasCollabPort>(
    () => ({
      getProject: () => projectRef.current,
      isLoaded: () => loadedRef.current && !projectLoadErrorRef.current,
      applyRemote: (fn, markDirty) => {
        if (markDirty && collabPolicyRef.current.readOnly) return false;
        cancelSelectionTransactions();
        const next = fn(projectRef.current);
        if (!next || next === projectRef.current) return false;
        // Remote graph patches establish a new undo baseline so a later host
        // undo cannot restore a snapshot that silently erases another editor.
        workflowHistory.reset(next);
        projectRef.current = next;
        setProjectState(next);
        const selected = selectedNodeIdRef.current;
        if (selected && !projectHead(next).graph.nodes.some((node) => node.nodeId === selected)) {
          setSelectedNodeId(null);
        }
        if (markDirty && collabPolicyRef.current.canSave) {
          noteMutation();
    setDirty(true);
        }
        return true;
      },
      setPolicy: (policy) =>
        setCollabPolicy((current) =>
          current.readOnly === policy.readOnly && current.canSave === policy.canSave ? current : policy,
        ),
      markDirty: () => {
        if (!collabPolicyRef.current.canSave) return;
        noteMutation();
    setDirty(true);
      },
    }),
    [cancelSelectionTransactions, setSelectedNodeId, workflowHistory],
  );

  const displayProject = useMemo(() => ({ ...project, assets: Object.fromEntries(
    Object.entries(project.assets).map(([id, asset]) => [id, session.runtimeUrls?.[id]
      ? { ...asset, url: session.runtimeUrls[id], previewUrl: session.runtimeUrls[id] } : asset]),
  ) }), [project, session.runtimeUrls]);

  return {
    displayProject,
    editRevision,
    currentEditRevision: () => editRevisionRef.current,
    captureProject: () => projectRef.current,
    adoptProject: (next: VideoProject) => { projectRef.current = next; setProjectState(next); },
    restoreProject: applyLoadedProject,
    applyProject: setProject,
    history: { canUndo: workflowHistory.canUndo, canRedo: workflowHistory.canRedo,
      undo: () => { applyWorkflowHistory("undo"); }, redo: () => { applyWorkflowHistory("redo"); } },
    collabPort,
    collabReadOnly: session.readOnly || collabPolicy.readOnly,
    project,
    head: projectHead(project),
    projections: {
      canvas: projectProjection(project, "canvas"),
      storyboard: projectProjection(project, "storyboard"),
      director: projectProjection(project, "director"),
      timeline: projectProjection(project, "timeline"),
    },
    renderNodes,
    edges: flow.edges,
    selectedNode: selectedNode ? effectiveCanvasNode(selectedNode) : undefined,
    selectedAsset:
      selectedNode?.assetId ? project.assets[selectedNode.assetId] : undefined,
    selectionContext: projectLoadError ? null : selectionContext,
    selectionEpoch,
    imageMode,
    workspaceView,
    historyComparison,
    status,
    projectLoadError,
    dirty,
    saving,
    uploadingMedia,
    hostOwnsChrome,
    commandState,
    commandResults,
    availability,
    executionDegraded,
    menuPoint,
    mediaUploadRequest,
    closeCreateMenu: () => setMenuPoint(null),
    openCreateMenu,
    createFromMenu,
    dropCreate,
    uploadMedia,
    openView: (view: CanvasWorkspaceView) =>
      dispatchCommand("canvas.session.view.set", { view }, "toolbar"),
    dispatchCommand,
    cancelActiveCommand,
    dispatchSelectionCommand,
    setFlowInstance: (
      instance: ReactFlowInstance<CanvasFlowNode, CanvasFlowEdge>,
    ) => {
      flowRef.current = instance;
    },
    onMoveStart: (_event: unknown, viewport: Viewport) => {
      moveStartRef.current = viewport;
      moveDidChangeRef.current = false;
    },
    onMove: (_event: unknown, viewport: Viewport) => {
      const start = moveStartRef.current;
      if (
        start &&
        (Math.abs(start.x - viewport.x) > 1 ||
          Math.abs(start.y - viewport.y) > 1 ||
          Math.abs(start.zoom - viewport.zoom) > 0.002)
      ) {
        moveDidChangeRef.current = true;
      }
      updateSelectionAnchor();
    },
    onMoveEnd: (_event: unknown, viewport: Viewport) => {
      if (moveDidChangeRef.current) {
        gestureSuppressionRef.current = true;
      }
      moveStartRef.current = null;
      moveDidChangeRef.current = false;
      viewportRef.current = viewport;
    },
    onConnectStart: () => {
      gestureSuppressionRef.current = true;
    },
    onConnectEnd: () => {
      gestureSuppressionRef.current = true;
    },
    onWheelCapture: (event: React.WheelEvent) => {
      if (event.ctrlKey) gestureSuppressionRef.current = true;
    },
    onPaneDoubleClick,
    onPaneClick: () => setSelectedNodeId(null),
    onNodeClick: (nodeId: string) => setSelectedNodeId(nodeId),
    onNodeDoubleClick,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeDragStart: () => {
      gestureSuppressionRef.current = true;
    },
    onNodeDragStop,
    isValidConnection: (connection: Connection | CanvasFlowEdge) =>
      Boolean(
        connection.source &&
          connection.target &&
          connection.source !== connection.target,
      ),
  };
}
