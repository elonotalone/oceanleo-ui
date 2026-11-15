"use client";

import {
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbenchMaterialAdapter } from "../../workbench-material-provider";
import { useUI } from "../../../i18n";
import {
  canvasExecutionAvailable,
  EXECUTION_UNAVAILABLE_MESSAGE,
  type CanvasProviderProgress,
} from "./canvas-gateway";
import { useGalleryHost } from "./gallery-host-context";
import { hostExtras, type PrivateProjectSnapshotStage } from "./types";
import {
  CANVAS_AUTOSAVE_MS,
  canvasShouldFlushOnLeave,
} from "./canvas-leave-persist";
import {
  CANVAS_COMMAND_REGISTRY,
  NODE_MENU_CAPABILITIES,
  commandAvailability,
  commandDisclosure,
  executeCanvasCommand,
  newCommandRequestId,
  type CanvasCommandAvailability,
  type CanvasCommandEnvironment,
  type CanvasCommandRequest,
  type CanvasCommandResult,
  type CanvasCommandStatus,
  type CanvasCommandSurface,
  type NodeMenuEntryId,
} from "./command-registry";
import {
  CANVAS_EDITOR_PROTOCOL,
  CANVAS_PROTOCOL_VERSION,
  LEGACY_CANVAS_EDITOR_PROTOCOL,
  parseCanvasHostMessage,
  resolveCanvasEmbedConfig,
  type CanvasEditorAsset,
  type CanvasEmbedConfig,
  type CanvasHostMessage,
} from "./canvas-embed-protocol";
import {
  CANVAS_EDGE_LIMIT,
  addProjectNode,
  compareProjectVersions,
  createVideoProject,
  migrateV1Workflow,
  parseVideoProject,
  recordArtifactRevisionReceipt,
  projectPreviewAtCurrentHead,
  projectHead,
  projectProjection,
  projectToFlow,
  projectForTypedArtifactCommit,
  projectSourceForStorage,
  replaceProjectGraph,
  stableId,
  updateProjectNode,
  canvasViewFromHostPage,
  workspaceViewForNodeKind,
  type CanvasEdgeDefinition,
  type CanvasFlowEdge,
  type CanvasFlowNode,
  type CanvasNodeDefinition,
  type CanvasNodeKind,
  type CanvasWorkspaceView,
  type ProjectVersionComparison,
  type ProjectAsset,
  type VideoCanvasSourceDependency,
  type V1MigrationReport,
  type VideoProject,
} from "./project-model";
import type { CanvasMenuPoint } from "./CanvasCreateMenu";
import {
  applyCanvasArtifactCommand,
  canvasAcceptsArtifactMaterial,
  createCanvasArtifactCommand,
  type DurableCanvasMaterial,
} from "./artifact-material-adapter";
import {
  canvasSelectionContext,
  canvasSelectionDispatch,
} from "./canvas-selection-adapter";
import {
  WorkflowGraphHistory,
  workflowHistoryActionForCommand,
} from "./workflow-graph-history";
import { durableVideoCapability } from "./durable-video-adapter";
import {
  commitDependencyLoadIfCurrent,
  materializeDependencyPairs,
  readBoundedResponse,
} from "./dependency-runtime.mjs";
import type { CanvasCollabPort } from "./canvas-collab";

const COMMAND_HISTORY_LIMIT = 100;
const PROJECT_IMPORT_MAX_BYTES = 4 * 1024 * 1024;
const IMPORT_TIMEOUT_MS = 8_000;
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

interface PendingProjectSave extends ProjectSnapshotReceipt {
  requestedAt: string;
  expectedArtifactId: string;
  expectedRevisionId: string;
}

interface OpenedDependencyGrant extends VideoCanvasSourceDependency {
  assetId: string;
  accessUrl: string;
  expiresAt: string;
  gatewayOrigin: string;
}

const VIDEO_DEPENDENCY_MAX_BYTES = 20_000_000;
const VIDEO_DEPENDENCY_ACCESS_PATH = /^\/v1\/artifact-renditions\/access\/[^/?#]+$/;

function cleanMediaType(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().split(";", 1)[0] : "";
}

function openedDependencyGrants(asset: CanvasEditorAsset): OpenedDependencyGrant[] {
  const value = asset.meta?.video_canvas_dependency_grants;
  if (!Array.isArray(value) || value.length > 4_999) {
    if (value === undefined) return [];
    throw new Error("视频工程素材授权格式无效；未开放编辑面。");
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("视频工程素材授权格式无效；未开放编辑面。");
    }
    const grant = candidate as Record<string, unknown>;
    const identity = { artifactId: String(grant.artifactId || ""), revisionId: String(grant.revisionId || "") };
    const path = String(grant.path || "");
    const digest = String(grant.sha256 || "").toLowerCase().replace(/^sha256:/, "");
    const mediaType = cleanMediaType(grant.mediaType);
    const byteSize = Number(grant.byteSize);
    let access: URL;
    let gateway: URL;
    try {
      access = new URL(String(grant.accessUrl || ""));
      gateway = new URL(String(grant.gatewayOrigin || ""));
    } catch {
      throw new Error("视频工程素材授权无法安全解析；未开放编辑面。");
    }
    if (
      typeof grant.assetId !== "string" || !grant.assetId || grant.assetId.length > 256 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identity.artifactId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identity.revisionId) ||
      path.length > 1_024 || !path.startsWith("assets/") || /[?#%\\\0]/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      !/^(?:image|video|audio)\/[a-z0-9.+-]+$/.test(mediaType) ||
      !Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > VIDEO_DEPENDENCY_MAX_BYTES ||
      gateway.origin !== String(grant.gatewayOrigin) ||
      access.origin !== gateway.origin || access.protocol !== "https:" ||
      !VIDEO_DEPENDENCY_ACCESS_PATH.test(access.pathname) || access.search || access.hash ||
      access.username || access.password ||
      !Number.isFinite(Date.parse(String(grant.expiresAt || ""))) ||
      Date.parse(String(grant.expiresAt || "")) <= Date.now() + 1_000
    ) {
      throw new Error("视频工程素材授权与打开版本不匹配；未开放编辑面。");
    }
    return {
      assetId: String(grant.assetId),
      ...identity,
      path,
      sha256: digest,
      mediaType,
      byteSize,
      accessUrl: access.href,
      expiresAt: new Date(Date.parse(String(grant.expiresAt))).toISOString(),
      gatewayOrigin: gateway.origin,
    };
  });
}

async function digestBlob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("当前环境无法校验视频工程素材。");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const PRIVATE_STAGE_OWNER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function verifyPrivateProjectSnapshotStage(
  stage: PrivateProjectSnapshotStage,
  sourceFile: File,
  previewFile: File,
): Promise<void> {
  for (const [kind, descriptor, file] of [
    ["source", stage?.source, sourceFile],
    ["preview", stage?.preview, previewFile],
  ] as const) {
    const blobId = descriptor?.blobId || "";
    const parts = blobId.split("/");
    const keys = descriptor && typeof descriptor === "object"
      ? Object.keys(descriptor).sort().join(",")
      : "";
    if (
      keys !== "blobId,byteSize,digest,mediaType" ||
      parts.length < 3 ||
      parts[0] !== "project-assets:u" ||
      !PRIVATE_STAGE_OWNER_UUID_RE.test(parts[1] || "") ||
      parts.slice(2).some((part) => !part || part === "." || part === "..") ||
      /[?#%\\\0\s]/.test(blobId) ||
      !/^[a-f0-9]{64}$/i.test(descriptor.digest) ||
      descriptor.mediaType !== file.type ||
      descriptor.byteSize !== file.size ||
      await digestBlob(file) !== descriptor.digest.toLowerCase()
    ) {
      throw new Error(`私有视频工程 ${kind} 暂存回执与文件不匹配；未提交 Library revision。`);
    }
  }
}

async function materializeProjectDependencies(
  project: VideoProject,
  grants: OpenedDependencyGrant[],
  identity: { artifactId: string; revisionId: string },
  signal: AbortSignal,
): Promise<Record<string, string>> {
  const dependencies = Object.values(project.assets).flatMap((asset) =>
    asset.sourceDependency ? [{ assetId: asset.assetId, ...asset.sourceDependency }] : [],
  );
  if (dependencies.length === 0) return {};
  if (dependencies.length !== grants.length) {
    throw new Error("视频工程的 owner-pinned 素材闭包不完整；未开放编辑面。");
  }
  const byAssetId = new Map(grants.map((grant) => [grant.assetId, grant]));
  try {
    return await materializeDependencyPairs(
      dependencies,
      async (dependency, taskSignal) => {
      const grant = byAssetId.get(dependency.assetId);
      if (
        !grant ||
        grant.artifactId !== identity.artifactId ||
        grant.artifactId !== dependency.artifactId ||
        grant.revisionId !== identity.revisionId ||
        grant.path !== dependency.path ||
        grant.sha256 !== dependency.sha256 ||
        grant.mediaType !== cleanMediaType(dependency.mediaType) ||
        grant.byteSize !== dependency.byteSize
      ) {
        throw new Error("视频工程素材授权与稳定依赖引用不一致；未开放编辑面。");
      }
      const response = await fetch(grant.accessUrl, {
        method: "GET",
        signal: taskSignal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error("视频工程素材读取失败。");
      const declaredSize = Number(response.headers.get("content-length") || 0);
      if (declaredSize && declaredSize !== grant.byteSize) {
        throw new Error("视频工程素材长度与固定版本不符。");
      }
      const blob = await readBoundedResponse(response, grant.byteSize);
      if (
        blob.size !== grant.byteSize ||
        cleanMediaType(response.headers.get("content-type")) !== grant.mediaType ||
        await digestBlob(blob) !== grant.sha256
      ) {
        throw new Error("视频工程素材未通过 size/media/SHA-256 校验。");
      }
      if (taskSignal.aborted) {
        throw new Error("视频工程素材读取已取消。");
      }
      const url = URL.createObjectURL(new Blob([blob], { type: grant.mediaType }));
      return { assetId: grant.assetId, url };
      },
      { signal },
    );
  } catch {
    throw new Error("视频工程素材闭包无法安全解析；未开放编辑面。");
  }
}

function bindProjectDependenciesToOpenedRevision(
  project: VideoProject,
  identity: { artifactId: string; revisionId: string },
): VideoProject {
  const assets = Object.fromEntries(Object.entries(project.assets).map(([assetId, asset]) => {
    if (!asset.sourceDependency) return [assetId, asset];
    if (asset.sourceDependency.artifactId !== identity.artifactId) {
      throw new Error("视频工程素材固定到另一个 Library artifact；未开放编辑面。");
    }
    return [assetId, {
      ...asset,
      sourceDependency: {
        ...asset.sourceDependency,
        artifactId: identity.artifactId,
        revisionId: identity.revisionId,
      },
    }];
  }));
  return { ...project, assets };
}

async function renderProjectPreview(project: VideoProject): Promise<File> {
  if (typeof document === "undefined") {
    throw new Error("当前环境无法生成视频工程预览图。");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前环境无法生成视频工程预览图。");
  const graph = projectHead(project).graph;
  const nodes = graph.nodes;
  const minX = Math.min(0, ...nodes.map((node) => node.position.x));
  const minY = Math.min(0, ...nodes.map((node) => node.position.y));
  const maxX = Math.max(1, ...nodes.map((node) => node.position.x + 220));
  const maxY = Math.max(1, ...nodes.map((node) => node.position.y + 110));
  const scale = Math.min(1, 1120 / (maxX - minX), 560 / (maxY - minY));
  const offsetX = 80 + (1120 - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = 120 + (560 - (maxY - minY) * scale) / 2 - minY * scale;
  const point = (nodeId: string) => {
    const node = nodes.find((candidate) => candidate.nodeId === nodeId);
    return node
      ? { x: offsetX + (node.position.x + 220) * scale, y: offsetY + (node.position.y + 55) * scale }
      : null;
  };
  context.fillStyle = "#0b1220";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8fafc";
  context.font = "600 32px sans-serif";
  context.fillText(project.title.slice(0, 48) || "LeoVideo workflow", 64, 66);
  context.fillStyle = "#94a3b8";
  context.font = "18px sans-serif";
  context.fillText(`${nodes.length} nodes · ${graph.edges.length} connections`, 64, 96);
  context.strokeStyle = "#64748b";
  context.lineWidth = 3;
  for (const edge of graph.edges) {
    const from = point(edge.sourceNodeId);
    const to = point(edge.targetNodeId);
    if (!from || !to) continue;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  for (const node of nodes) {
    const x = offsetX + node.position.x * scale;
    const y = offsetY + node.position.y * scale;
    const width = Math.max(112, 220 * scale);
    const height = Math.max(60, 110 * scale);
    context.fillStyle = "#172554";
    context.strokeStyle = "#38bdf8";
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, width, height, 12);
    context.fill();
    context.stroke();
    context.fillStyle = "#bae6fd";
    context.font = `600 ${Math.max(12, 16 * scale)}px sans-serif`;
    context.fillText(node.kind, x + 12, y + 24);
    context.fillStyle = "#f8fafc";
    context.font = `${Math.max(12, 15 * scale)}px sans-serif`;
    context.fillText(node.title.slice(0, 28), x + 12, y + 48);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("视频工程预览编码失败。")), "image/png");
  });
  return new File([blob], `workflow-${project.projectId}.png`, { type: "image/png" });
}

function currentEmbed(): CanvasEmbedConfig {
  if (typeof window === "undefined") {
    return { active: false, requested: false, hostOrigin: "", instanceId: "" };
  }
  return resolveCanvasEmbedConfig(
    window.location.search,
    document.referrer,
    window.parent !== window,
  );
}

function blankRequested(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("blank") === "1"
  );
}

function verifiedMeta(asset: CanvasEditorAsset): {
  verified: boolean;
  contentDigest?: string;
} {
  const meta = asset.meta || {};
  const contentDigest =
    typeof meta.content_digest === "string"
      ? meta.content_digest
      : typeof meta.sha256 === "string"
        ? meta.sha256
        : undefined;
  return {
    verified: meta.verified === true && Boolean(contentDigest),
    contentDigest,
  };
}

function withOpenedArtifactReceipt(
  project: VideoProject,
  asset: CanvasEditorAsset,
): VideoProject {
  const artifactId =
    asset.artifactId ||
    (typeof asset.meta?.artifact_id === "string"
      ? asset.meta.artifact_id
      : "");
  const revisionId =
    asset.revisionId ||
    (typeof asset.meta?.revision_id === "string"
      ? asset.meta.revision_id
      : "");
  const sourceOnly = projectSourceForStorage(project);
  if (!artifactId || !revisionId || !asset.url) return sourceOnly;
  return recordArtifactRevisionReceipt(sourceOnly, {
    saveId: stableId("open-receipt"),
    projectVersionId: project.headVersionId,
    artifactId,
    revisionId,
    url: asset.url,
    receivedAt: new Date().toISOString(),
  });
}

function mediaEntry(asset: CanvasEditorAsset): NodeMenuEntryId | null {
  const hint = `${asset.kind || ""} ${asset.meta?.mime || ""} ${
    asset.url || asset.previewUrl || ""
  }`.toLowerCase();
  if (/\bimage\b|image\/|\.(png|jpe?g|webp|gif|avif)(?:$|\?)/.test(hint)) {
    return "image";
  }
  if (/\bvideo\b|video\/|\.(mp4|webm|mov|m4v)(?:$|\?)/.test(hint)) {
    return "video";
  }
  if (/\baudio\b|audio\/|\.(mp3|wav|m4a|aac|ogg)(?:$|\?)/.test(hint)) {
    return "audio";
  }
  return null;
}

async function readVerifiedProjectAsset(asset: CanvasEditorAsset): Promise<unknown> {
  const inline = asset.meta?.workflow_json ?? asset.meta?.project_json;
  if (inline !== undefined) return inline;
  const verification = verifiedMeta(asset);
  if (!asset.url || !verification.verified) {
    throw new Error(
      "Remote Project import requires verified=true and a content digest from the host.",
    );
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
  try {
    const response = await fetch(asset.url, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      throw new Error(`Project import failed (HTTP ${response.status}).`);
    }
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > PROJECT_IMPORT_MAX_BYTES) {
      throw new Error("Project import exceeds the 4 MB JSON budget.");
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > PROJECT_IMPORT_MAX_BYTES) {
      throw new Error("Project import exceeds the 4 MB JSON budget.");
    }
    return JSON.parse(text);
  } finally {
    window.clearTimeout(timeout);
  }
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

export function useCanvasWorkflow() {
  const { docPath, host } = useGalleryHost();
  const tt = useUI();
  const extras = hostExtras(host);
  const blank = useMemo(blankRequested, []);
  const [project, setProjectState] = useState(() =>
    createVideoProject(
      blank ? "Untitled LeoVideo project" : "LeoVideo production",
      !blank,
    ),
  );
  const executionDegraded =
    typeof host.fetchJson !== "function" && !canvasExecutionAvailable();
  const [selectedNodeId, setSelectedNodeIdState] = useState<string | null>(null);
  const [selectionEpoch, setSelectionEpochState] = useState(1);
  const [imageMode, setImageMode] =
    useState<"retouch" | "generate">(initialImageMode);
  const [workspaceView, setWorkspaceView] =
    useState<CanvasWorkspaceView>("graph");
  const [materialLibraryOpen, setMaterialLibraryOpen] = useState(false);
  const [mediaUploadRequest, setMediaUploadRequest] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [status, setStatus] = useState(
    blank ? "Blank media canvas ready." : "Media-first canvas ready.",
  );
  const [dirty, setDirty] = useState(false);
  // 多人同改（F06）：外壳通过 recovery-restore 的 control 载荷告诉画布「只读 / 自己别存」。默认 = 单人：能改、自己存。
  const [collabPolicy, setCollabPolicy] = useState({ readOnly: false, canSave: true });
  const collabPolicyRef = useRef(collabPolicy);
  collabPolicyRef.current = collabPolicy;
  const loadedRef = useRef(false);
  const [projectLoadError, setProjectLoadError] = useState("");
  const projectLoadErrorRef = useRef("");
  projectLoadErrorRef.current = projectLoadError;
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  dirtyRef.current = dirty;
  savingRef.current = saving;
  const [hostPanelVisible, setHostPanelVisible] = useState(false);
  const [hostOwnsChrome, setHostOwnsChrome] = useState(false);
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
  const [durableCapability, setDurableCapability] =
    useState<CanvasCommandAvailability>({
      enabled: false,
      reasonCode: "CAPABILITY_DISCOVERY_PENDING",
      missingContract: "GET /v1/video-canvas/capabilities",
      reason: "Checking durable video capability…",
    });
  const [migrationReport, setMigrationReport] =
    useState<V1MigrationReport | null>(null);
  const [runtimeDependencyUrls, setRuntimeDependencyUrls] = useState<Record<string, string>>({});
  const runtimeDependencyUrlsRef = useRef<Record<string, string>>({});
  const [embed] = useState(currentEmbed);
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
  const disposedRef = useRef(false);
  const gestureSuppressionRef = useRef(false);
  const moveStartRef = useRef<Viewport | null>(null);
  const moveDidChangeRef = useRef(false);
  const environmentRef = useRef<CanvasCommandEnvironment>(null!);
  const saveRef = useRef<
    (request?: { saveId?: string }) => Promise<ProjectSnapshotReceipt>
  >(null!);
  const pendingSaveReceiptsRef = useRef(
    new Map<string, PendingProjectSave>(),
  );
  const seenArtifactRevisionsRef = useRef(new Map<string, Set<string>>());
  const dependencyLoadControllerRef = useRef<AbortController | null>(null);
  const dependencyLoadGenerationRef = useRef(0);
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

  const rememberArtifactRevision = useCallback((artifactId: string, revisionId: string) => {
    if (!artifactId || !revisionId) return;
    let seen = seenArtifactRevisionsRef.current.get(artifactId);
    if (!seen) {
      seen = new Set<string>();
      seenArtifactRevisionsRef.current.set(artifactId, seen);
    }
    seen.add(revisionId);
  }, []);

  const replaceRuntimeDependencyUrls = useCallback((next: Record<string, string>) => {
    const previous = runtimeDependencyUrlsRef.current;
    for (const url of Object.values(previous)) {
      if (!Object.values(next).includes(url)) URL.revokeObjectURL(url);
    }
    runtimeDependencyUrlsRef.current = next;
    setRuntimeDependencyUrls(next);
  }, []);

  useEffect(() => () => {
    dependencyLoadGenerationRef.current += 1;
    dependencyLoadControllerRef.current?.abort();
    for (const url of Object.values(runtimeDependencyUrlsRef.current)) {
      URL.revokeObjectURL(url);
    }
    runtimeDependencyUrlsRef.current = {};
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

  const postLegacy = useCallback(
    (message: Record<string, unknown>) => {
      if (!embed.active || disposedRef.current) return;
      window.parent.postMessage(
        {
          protocol: LEGACY_CANVAS_EDITOR_PROTOCOL,
          instanceId: embed.instanceId,
          ...message,
        },
        embed.hostOrigin,
      );
    },
    [embed],
  );

  const postV2 = useCallback(
    (message: Record<string, unknown>) => {
      if (!embed.active || disposedRef.current) return;
      window.parent.postMessage(
        {
          protocol: CANVAS_EDITOR_PROTOCOL,
          protocolVersion: CANVAS_PROTOCOL_VERSION,
          instanceId: embed.instanceId,
          projectVersionId: projectRef.current.headVersionId,
          selectionEpoch: selectionEpochRef.current,
          ...message,
        },
        embed.hostOrigin,
      );
    },
    [embed],
  );

  const setProject = useCallback((next: VideoProject, recordHistory = true) => {
    if (collabPolicyRef.current.readOnly) return;
    selectionTransactionsRef.current.clear();
    if (recordHistory) workflowHistory.record(next);
    projectRef.current = next;
    setProjectState(next);
    setPositionOverrides({});
    setDirty(true);
    postLegacy({
      type: "dirty",
      dirty: true,
      revision: projectHead(next).revision,
    });
  }, [postLegacy, workflowHistory]);

  const setProjectMetadata = useCallback(
    (next: VideoProject) => {
      if (collabPolicyRef.current.readOnly) return;
      projectRef.current = next;
      setProjectState(next);
      setDirty(true);
      postLegacy({
        type: "dirty",
        dirty: true,
        revision: projectHead(next).revision,
      });
    },
    [postLegacy],
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
      setDirty(true);
      postLegacy({
        type: "dirty",
        dirty: true,
        revision: projectHead(next).revision,
      });
      return true;
    },
    [postLegacy, setSelectedNodeId, workflowHistory],
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

  const saveProject = useCallback(
    async (
      request: { saveId?: string } = {},
    ): Promise<ProjectSnapshotReceipt> => {
      if (projectLoadErrorRef.current) throw new Error(projectLoadErrorRef.current);
      if (!collabPolicyRef.current.canSave) {
        throw new Error("Another collaborator saves this canvas; your changes are shared with them.");
      }
      if (saving) throw new Error("A Project snapshot is already saving.");
      const snapshot = projectRef.current;
      const head = projectHead(snapshot);
      const artifactReceipt = snapshot.artifactRevisionReceipt;
      if (embed.active && !artifactReceipt) {
        throw new Error("Library video save requires the currently opened artifact/revision pin.");
      }
      const saveId = request.saveId?.trim() || stableId("save");
      if (saveId.length > 128) {
        throw new Error("Project save ID is too long.");
      }
      const pending: PendingProjectSave = {
        saveId,
        projectVersionId: snapshot.headVersionId,
        revision: head.revision,
        url: "",
        requestedAt: new Date().toISOString(),
        expectedArtifactId: artifactReceipt?.artifactId || "",
        expectedRevisionId: artifactReceipt?.revisionId || "",
      };
      setSaving(true);
      setStatus("Uploading immutable Project snapshot…");
      try {
        const purpose = "autosave" as const;
        host.log(`canvas.project.save ${purpose} ${docPath}`);
        const sourceSnapshot = embed.active
          ? projectForTypedArtifactCommit(snapshot, artifactReceipt!.artifactId)
          : projectSourceForStorage(snapshot);
        if (embed.active) {
          const url = artifactReceipt!.url;
          if (!url || !extras.stageProjectSnapshot) {
            throw new Error("Library video save requires owner-private source and preview staging.");
          }
          const sourceFile = new File(
            [JSON.stringify(sourceSnapshot, null, 2)],
            `${snapshot.projectId}-${snapshot.headVersionId}.oceanleo-video-project-v2.json`,
            { type: "application/json" },
          );
          const preview = await renderProjectPreview(sourceSnapshot);
          const staged = await extras.stageProjectSnapshot(sourceFile, preview, {
            artifactId: artifactReceipt!.artifactId,
            expectedRevisionId: artifactReceipt!.revisionId,
            projectId: snapshot.projectId,
            versionId: snapshot.headVersionId,
          });
          await verifyPrivateProjectSnapshotStage(staged, sourceFile, preview);
          const receipt = { ...pending, url };
          pendingSaveReceiptsRef.current.set(saveId, receipt);
          postLegacy({
            type: "artifact-updated",
            url,
            title: snapshot.title,
            saveId,
            revision: head.revision,
            meta: {
              editor: "leovideo-media-canvas-v2",
              schema: snapshot.schema,
              source_format: snapshot.schema,
              source_media_type: "application/json",
              artifact_type: "workflow",
              advanced_feature: "video_canvas",
              editor_capability: "video-canvas",
              requires_typed_artifact_commit: true,
              preview_static_frame: "final",
              preview_revision: head.revision,
              project_id: snapshot.projectId,
              project_version_id: snapshot.headVersionId,
              artifact_id: artifactReceipt!.artifactId,
              expected_artifact_revision_id: artifactReceipt!.revisionId,
              private_blob_commit: staged,
            },
          });
          setStatus("Project snapshot uploaded; awaiting durable save receipt…");
          return receipt;
        }
        await host.writeDoc(docPath, JSON.stringify(sourceSnapshot, null, 2));
        const receipt = { ...pending, url: extras.getLastWriteUrl?.() || "" };
        if (projectRef.current.headVersionId === snapshot.headVersionId) {
          setDirty(false);
          setStatus("Project snapshot saved to the library.");
        }
        return receipt;
      } finally {
        setSaving(false);
      }
    },
    [docPath, embed.active, extras, host, postLegacy, saving],
  );
  saveRef.current = saveProject;

  useEffect(() => {
    if (embed.active || !collabPolicy.canSave || !canvasShouldFlushOnLeave(dirty, saving)) return;
    const timer = window.setTimeout(() => {
      void saveRef.current();
    }, CANVAS_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, embed.active, saving, project.headVersionId, collabPolicy.canSave]);

  useEffect(() => {
    return () => {
      if (
        !embed.active &&
        collabPolicyRef.current.canSave &&
        canvasShouldFlushOnLeave(dirtyRef.current, savingRef.current)
      ) {
        void saveRef.current();
      }
    };
  }, []);

  const exportProjectSource = useCallback(async (): Promise<string> => {
    if (embed.active) {
      throw new Error(
        "Library Project source export is unavailable until an owner-private download path exists; no public copy was created.",
      );
    }
    const snapshot = projectRef.current;
    setStatus("Preparing editable Project source…");
    const purpose = "source-export" as const;
    const serialized = JSON.stringify(projectSourceForStorage(snapshot), null, 2);
    const url = extras.exportDoc
      ? await extras.exportDoc(serialized)
      : (host.log(`canvas.project.export ${purpose}`),
        await host.writeDoc(docPath, serialized),
        extras.getLastWriteUrl?.() || "");
    setStatus("Editable Project source is ready.");
    return url;
  }, [docPath, embed.active, extras, host]);

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

  environmentRef.current = {
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
      setMaterialLibraryOpen(false);
    },
    openMaterialLibrary: () => setMaterialLibraryOpen(true),
    requestMediaUpload: () => setMediaUploadRequest((value) => value + 1),
    getDurableVideoCapability: () => durableCapability,
    getCommandSignal: (requestId) =>
      commandControllersRef.current.get(requestId)?.signal,
    reportCommandProgress,
    setProjectMetadata,
    setStatus,
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
          result,
        ]);
        postV2({ type: "command-result", ...result });
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
    [postV2],
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

  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "video.canvas.artifact-command.v1",
      actions: ["insert", "replace"],
      accepts(item, action) {
        const current = projectRef.current;
        const currentSelected =
          projectHead(current).graph.nodes.find(
            (node) => node.nodeId === selectedNodeIdRef.current,
          ) || null;
        return canvasAcceptsArtifactMaterial(item, action, currentSelected);
      },
      command: {
        version: 1,
        history: "editor-command",
        createCommand(action, item, placement) {
          const current = projectRef.current;
          const currentSelected =
            projectHead(current).graph.nodes.find(
              (node) => node.nodeId === selectedNodeIdRef.current,
            ) || null;
          const point = placement
            ? flowRef.current?.screenToFlowPosition({
                x: placement.clientX || 0,
                y: placement.clientY || 0,
              }) || {
                x: placement.clientX || 0,
                y: placement.clientY || 0,
              }
            : screenCenter();
          return createCanvasArtifactCommand({
            action,
            item: item as DurableCanvasMaterial,
            project: current,
            selectedNode: currentSelected,
            insertPosition: point,
          });
        },
        execute(command, item) {
          const applied = applyCanvasArtifactCommand({
            command,
            item,
            project: projectRef.current,
          });
          setProject(applied.project);
          setSelectedNodeId(applied.selectedNodeId);
        },
      },
      mutate() {
        throw new Error(
          "Video canvas material actions require an artifact editor command.",
        );
      },
    }),
    [screenCenter, setProject, setSelectedNodeId],
  );

  const availability = useCallback(
    (commandId: string, args: Record<string, unknown> = {}) =>
      projectLoadError
        ? { enabled: false, reason: projectLoadError }
        : commandAvailability(commandId, environmentRef.current, args),
    [durableCapability, project, selectedNodeId, imageMode, projectLoadError],
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
              : { enabled: false, reason: "Select this node first." },
          ]),
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
          asset: asset && runtimeDependencyUrls[asset.assetId]
            ? {
                ...asset,
                url: runtimeDependencyUrls[asset.assetId],
                previewUrl: runtimeDependencyUrls[asset.assetId],
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
          hostProvidesEditBar: hostOwnsChrome || !embed.active,
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
              asset?.provider?.pricing.label ||
              (node.kind === "video"
                ? "Provider-priced · durable receipt"
                : "Provider-metered; exact credits returned in receipt"),
          },
          commandAvailability: commandAvailabilityMap,
          commandDisclosures: commandDisclosureMap,
          commandState:
            node.nodeId === selectedNodeId && commandState
              ? commandState
              : undefined,
          onCommand: (commandId, commandArgs) =>
            dispatchCommand(commandId, commandArgs, "compact"),
        };
      }),
    [
      availability,
      commandState,
      dispatchCommand,
      embed.active,
      hostOwnsChrome,
      imageMode,
      project,
      runtimeDependencyUrls,
      selectedNodeId,
      selectionEpoch,
    ],
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
    updateSelectionAnchor,
  ]);

  const selectionContext = useMemo(
    () =>
      canvasSelectionContext({
        project,
        node: selectedNode,
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
      tt,
    ],
  );

  const dispatchSelectionCommand = useCallback(
    (command: Parameters<typeof canvasSelectionDispatch>[0]) => {
      const reject = (message: string) => {
        postLegacy({
          type: "selection-result",
          requestId: command.requestId,
          ok: false,
          message,
        });
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
        if (!embed.active) return reject("History commands require the trusted host embed.");
        const applied = applyWorkflowHistory(historyAction);
        postLegacy({
          type: "selection-result",
          requestId: command.requestId,
          ok: applied,
          message: applied ? `Workflow ${historyAction} applied.` : "Workflow is read-only.",
        });
        return applied;
      }
      const mapped = canvasSelectionDispatch(command, selectionContext);
      if (!mapped) {
        return reject("Selection changed; the command was not applied.");
      }
      if (mapped.commandId === "canvas.session.inpaint-mask.set") {
        setInpaintMaskUrl(String(mapped.args.maskUrl || ""));
        postLegacy({
          type: "selection-result",
          requestId: command.requestId,
          ok: true,
          message: "Inpaint mask URL updated.",
        });
        return true;
      }
      const complete = (result: CanvasCommandResult) => {
        const ok =
          result.status === "succeeded" || result.status === "accepted";
        postLegacy({
          type: "selection-result",
          requestId: command.requestId,
          ok,
          message: result.message,
        });
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
        postLegacy({
          type: "selection-result",
          requestId: command.requestId,
          ok: true,
          message: "Selection preview started.",
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
          postLegacy({
            type: "selection-result",
            requestId: command.requestId,
            ok: true,
            message: "Selection preview cancelled.",
          });
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
      embed.active,
      postLegacy,
      selectionContext,
      setPreviewProject,
      workflowHistory,
    ],
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

  const uploadMedia = useCallback(
    async (file: File): Promise<boolean> => {
      const mime = file.type.toLowerCase();
      const entryId: NodeMenuEntryId | null = mime.startsWith("image/")
        ? "image"
        : mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : null;
      if (!entryId) {
        setStatus("Upload rejected: choose an image, video, or audio file.");
        return false;
      }
      setUploadingMedia(true);
      setStatus(`Uploading ${file.name || entryId} as an immutable Asset…`);
      try {
        if (!extras.uploadMediaFile) {
          throw new Error(EXECUTION_UNAVAILABLE_MESSAGE);
        }
        const item = await extras.uploadMediaFile(file);
        if (!item?.id || !item.url) {
          throw new Error(
            "The shared upload gateway returned no durable Asset identity.",
          );
        }
        const meta = item.meta || {};
        const contentDigest = [
          meta.content_digest,
          meta.sha256,
          meta.digest,
        ].find((value): value is string => typeof value === "string" && !!value);
        const result = await createAt(
          entryId,
          screenCenter(),
          "node-menu",
          {
            assetId: item.artifact_id || item.id,
            title: item.title || file.name || entryId,
            url: item.url,
            previewUrl: item.thumb_url,
            verified: true,
            ...(contentDigest ? { contentDigest } : {}),
          },
        );
        if (result.status !== "succeeded") {
          throw new Error(result.message);
        }
        setStatus(`${file.name || entryId} uploaded and inserted.`);
        return true;
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Media upload failed.",
        );
        return false;
      } finally {
        setUploadingMedia(false);
      }
    },
    [createAt, extras, screenCenter],
  );

  const insertOpenedMedia = useCallback(
    async (
      asset: CanvasEditorAsset,
      point?: { x: number; y: number },
    ): Promise<boolean> => {
      const entryId = mediaEntry(asset);
      const url = asset.url || asset.previewUrl;
      const verification = verifiedMeta(asset);
      if (
        !entryId ||
        !url ||
        !asset.id ||
        !verification.verified
      ) {
        setStatus(
          "Asset rejected: a stable Asset ID, verified=true, and content digest are required.",
        );
        return false;
      }
      const screen = point || {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      const position =
        flowRef.current?.screenToFlowPosition(screen) || screen;
      const result = await createAt(entryId, position, "protocol", {
        assetId: asset.id,
        title: asset.title || entryId,
        url,
        previewUrl: asset.previewUrl,
        verified: true,
        contentDigest: verification.contentDigest,
      });
      return result.status === "succeeded";
    },
    [createAt],
  );

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
    setMaterialLibraryOpen(false);
    setDirty(false);
    setMigrationReport(null);
    viewportRef.current = projectHead(next).graph.viewport;
    window.requestAnimationFrame(() => {
      if (viewportRef.current) {
        void flowRef.current?.setViewport(viewportRef.current);
      } else {
        void flowRef.current?.fitView({ padding: 0.18 });
      }
    });
  }, [setSelectedNodeId, workflowHistory]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const text = await host.readDoc(docPath);
        if (cancelled || !text.trim()) return;
        applyLoadedProject(parseVideoProject(text));
        setStatus(`Project loaded from ${docPath}.`);
      } catch {
        if (!cancelled) {
          host.log(`gallery-editor: keep in-memory project; ${docPath} not loaded`);
        }
      }
    };
    void load();
    const stop = host.watchDoc(docPath, () => {
      void load();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [applyLoadedProject, docPath, host]);

  const loadAsset = useCallback(
    async (asset: CanvasEditorAsset) => {
      const entryId = mediaEntry(asset);
      if (entryId) {
        const inserted = await insertOpenedMedia(asset);
        if (!inserted) postLegacy({ type: "error", message: "Asset import rejected." });
        return;
      }
      dependencyLoadControllerRef.current?.abort();
      const dependencyController = new AbortController();
      const generation = ++dependencyLoadGenerationRef.current;
      const isCurrentLoad = () =>
        !dependencyController.signal.aborted &&
        generation === dependencyLoadGenerationRef.current;
      dependencyLoadControllerRef.current = dependencyController;
      try {
        const payload = await readVerifiedProjectAsset(asset);
        if (!isCurrentLoad()) return;
        const grants = openedDependencyGrants(asset);
        const artifactId =
          asset.artifactId || String(asset.meta?.artifact_id || "");
        const revisionId =
          asset.revisionId || String(asset.meta?.revision_id || "");
        try {
          const next = parseVideoProject(payload);
          const runtimeUrls = await materializeProjectDependencies(
            next,
            grants,
            { artifactId, revisionId },
            dependencyController.signal,
          );
          const openedProject = withOpenedArtifactReceipt(
            bindProjectDependenciesToOpenedRevision(next, { artifactId, revisionId }),
            asset,
          );
          if (!commitDependencyLoadIfCurrent({
            generation,
            currentGeneration: dependencyLoadGenerationRef.current,
            signal: dependencyController.signal,
            runtimeUrls,
            commit: () => {
              replaceRuntimeDependencyUrls(runtimeUrls);
              rememberArtifactRevision(artifactId, revisionId);
              applyLoadedProject(openedProject);
              setStatus(`Project v2 loaded at head ${openedProject.headVersionId.slice(0, 18)}…`);
            },
          })) return;
          return;
        } catch (parseError) {
          // A broken v2 source is not a legacy v1 document. Preserve its
          // diagnostic instead of replacing it with a migration failure.
          if (payload && typeof payload === "object" &&
              "schema" in payload && payload.schema === "oceanleo.video.project.v2") {
            throw parseError;
          }
          const migrated = migrateV1Workflow(payload, {
            sourceDependencies: grants.map(({ accessUrl, expiresAt, gatewayOrigin, ...dependency }) => dependency),
          });
          if (!migrated.ok) {
            throw new Error(
              `v1 migration failed closed with ${migrated.report.issues.length} issue(s).`,
            );
          }
          if (
            embed.active &&
            migrated.project &&
            Object.keys(migrated.project.assets).length !== grants.length
          ) {
            throw new Error("Library v1 项目的素材授权闭包不完整；未开放空白编辑面。");
          }
          const runtimeUrls = await materializeProjectDependencies(
            migrated.project,
            grants,
            { artifactId, revisionId },
            dependencyController.signal,
          );
          const openedProject = withOpenedArtifactReceipt(
            bindProjectDependenciesToOpenedRevision(migrated.project, { artifactId, revisionId }),
            asset,
          );
          if (!commitDependencyLoadIfCurrent({
            generation,
            currentGeneration: dependencyLoadGenerationRef.current,
            signal: dependencyController.signal,
            runtimeUrls,
            commit: () => {
              replaceRuntimeDependencyUrls(runtimeUrls);
              rememberArtifactRevision(artifactId, revisionId);
              applyLoadedProject(openedProject);
              setMigrationReport(migrated.report);
              setStatus(
                `v1 migrated with report: ${migrated.report.migratedNodeCount} nodes, ${migrated.report.migratedEdgeCount} edges.`,
              );
            },
          })) return;
        }
      } catch (error) {
        if (!isCurrentLoad()) return;
        replaceRuntimeDependencyUrls({});
        const message =
          error instanceof Error ? error.message : "Project import failed.";
        setProjectLoadError(message);
        setStatus(message);
        postLegacy({ type: "error", message });
      } finally {
        if (dependencyLoadControllerRef.current === dependencyController) {
          dependencyLoadControllerRef.current = null;
        }
      }
    },
    [applyLoadedProject, embed.active, insertOpenedMedia, postLegacy, rememberArtifactRevision, replaceRuntimeDependencyUrls],
  );

  const acceptProjectSaveResult = useCallback(
    (
      message: Extract<CanvasHostMessage, { type: "save-result" }>,
    ): void => {
      const saveId = message.saveId || "";
      const pending = pendingSaveReceiptsRef.current.get(saveId);
      if (!pending) {
        setStatus("Ignored an uncorrelated Project save receipt.");
        return;
      }
      if (
        message.revision !== undefined &&
        message.revision !== pending.revision
      ) {
        setStatus("Ignored a Project save receipt for a different revision.");
        return;
      }
      pendingSaveReceiptsRef.current.delete(saveId);
      if (!message.ok) {
        const conflict = message.currentRevisionId
          ? ` Current durable revision: ${message.currentRevisionId}.`
          : "";
        setStatus(`${message.message || "Project save failed."}${conflict}`);
        return;
      }
      if (
        typeof message.artifactId !== "string" || !message.artifactId ||
        typeof message.revisionId !== "string" || !message.revisionId ||
        !pending.expectedArtifactId ||
        !pending.expectedRevisionId ||
        message.artifactId !== pending.expectedArtifactId ||
        message.revisionId === pending.expectedRevisionId ||
        seenArtifactRevisionsRef.current
          .get(message.artifactId)?.has(message.revisionId)
      ) {
        setStatus(
          "Project save receipt did not confirm a new revision on the pinned artifact root; changes remain unsaved.",
        );
        return;
      }
      try {
        const next = recordArtifactRevisionReceipt(projectRef.current, {
          saveId,
          projectVersionId: pending.projectVersionId,
          artifactId: message.artifactId,
          revisionId: message.revisionId,
          url: pending.url,
          receivedAt: new Date().toISOString(),
        });
        projectRef.current = next;
        setProjectState(next);
        rememberArtifactRevision(message.artifactId, message.revisionId);
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : "The durable Project receipt was invalid.",
        );
        return;
      }
      if (projectRef.current.headVersionId === pending.projectVersionId) {
        setDirty(false);
        postLegacy({
          type: "dirty",
          dirty: false,
          revision: pending.revision,
        });
        setStatus(
          message.artifactId
            ? "Project saved with a durable artifact/revision receipt."
            : "Project saved; artifact receipt requires the compatible shared UI.",
        );
      } else {
        setStatus("Saved the requested Project revision; newer edits remain.");
      }
    },
    [postLegacy, rememberArtifactRevision],
  );

  useEffect(() => {
    disposedRef.current = false;
    if (embed.active) {
      postLegacy({ type: "ready" });
      postV2({ type: "editor-ready" });
    }
    const onMessage = (event: MessageEvent) => {
      if (
        !embed.active ||
        event.origin !== embed.hostOrigin ||
        event.source !== window.parent
      ) {
        return;
      }
      const message = parseCanvasHostMessage(event.data, embed.instanceId);
      if (!message) return;
      if (message.type === "init") {
        if (message.hostOwnsChrome === true || message.chrome === "host") {
          setHostOwnsChrome(true);
        }
        postLegacy({ type: "ready" });
        postV2({ type: "editor-ready" });
      } else if (message.type === "set-mode") {
        void dispatchCommand(
          "canvas.session.view.set",
          { view: message.mode === "pro" ? "director" : "graph" },
          "protocol",
        );
      } else if (message.type === "project-view") {
        const view = canvasViewFromHostPage(message.viewId);
        if (view) {
          void dispatchCommand(
            "canvas.session.view.set",
            { view },
            "protocol",
          );
        }
      } else if (message.type === "project-action") {
        const actionId = message.actionId.replace(/^project-action:/, "");
        if (actionId === "run-all" || actionId === "video-run-all") {
          dispatchSelectionCommand({
            requestId: `manifest-${Date.now()}`,
            selectionId: "",
            controlId: "run-all",
          });
        } else if (actionId === "save") {
          void dispatchCommand("canvas.project.save", {}, "protocol");
        }
      } else if (message.type === "open-asset") {
        void loadAsset(message.asset);
      } else if (message.type === "save-request") {
        void dispatchCommand(
          "canvas.project.save",
          { saveId: message.saveId },
          "protocol",
        ).then((result) => {
          if (result.status === "succeeded" || result.status === "accepted") return;
          postLegacy({
            type: "error",
            code: "VIDEO_SAVE_FAILED",
            saveId: message.saveId,
            message: "Video project save failed. Your changes are still available; retry when ready.",
            severity: "warning",
            retryable: true,
          });
        }).catch(() => {
          postLegacy({
            type: "error",
            code: "VIDEO_SAVE_FAILED",
            saveId: message.saveId,
            message: "Video project save failed. Your changes are still available; retry when ready.",
            severity: "warning",
            retryable: true,
          });
        });
      } else if (message.type === "export-request") {
        void exportProjectSource()
          .then((url) =>
            postLegacy({
              type: "export-result",
              exportId: message.exportId,
              ok: true,
              url,
            }),
          )
          .catch((error) =>
            postLegacy({
              type: "export-result",
              exportId: message.exportId,
              ok: false,
              message: error instanceof Error ? error.message : "Export failed.",
            }),
          );
      } else if (message.type === "save-result") {
        acceptProjectSaveResult(message);
      } else if (message.type === "set-host-layout") {
        setHostPanelVisible(message.sidePanelVisible);
        setHostOwnsChrome(message.hostOwnsChrome === true);
      } else if (message.type === "selection-command") {
        dispatchSelectionCommand(message.command);
      } else if (message.type === "command") {
        void dispatchCommand(
          message.commandId,
          message.args,
          "protocol",
          {
            requestId: message.requestId,
            projectVersionId: message.projectVersionId,
            selectionEpoch: message.selectionEpoch,
          },
        );
      } else if (message.type === "dispose") {
        cancelSelectionTransactions();
        for (const controller of commandControllersRef.current.values()) {
          controller.abort();
        }
        commandControllersRef.current.clear();
        activeCommandRequestIdRef.current = null;
        pendingSaveReceiptsRef.current.clear();
        disposedRef.current = true;
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      disposedRef.current = true;
      for (const controller of commandControllersRef.current.values()) {
        controller.abort();
      }
      commandControllersRef.current.clear();
      activeCommandRequestIdRef.current = null;
      window.removeEventListener("message", onMessage);
    };
  }, [
    acceptProjectSaveResult,
    dispatchCommand,
    dispatchSelectionCommand,
    cancelSelectionTransactions,
    embed,
    exportProjectSource,
    loadAsset,
    postLegacy,
    postV2,
  ]);

  useEffect(() => {
    postLegacy({
      type: "selection-changed",
      selection: selectionContext,
    });
    postV2({
      type: "selection-state",
      selectedNodeId: selectedNode?.nodeId || null,
    });
  }, [postLegacy, postV2, selectedNode, selectionContext, selectionEpoch]);

  useEffect(() => {
    if (!embed.active) return;
    postLegacy({
      type: "history-changed",
      history: {
        canUndo: workflowHistory.canUndo,
        canRedo: workflowHistory.canRedo,
        revision: project.headVersionId,
      },
    });
  }, [embed.active, postLegacy, project.headVersionId, workflowHistory]);

  useEffect(() => {
    if (!embed.active) return;
    // graph = 成品页，director = 专业编辑，不进 aux。宿主用 project-view 切这三页。
    postLegacy({
      type: "project-manifest",
      manifest: {
        revision: projectHead(project).revision,
        views: [
          {
            id: "graph",
            label: "节点图",
            icon: "layers",
            role: "artifact",
            active: workspaceView === "graph",
          },
          {
            id: "storyboard",
            label: "分镜",
            icon: "pages",
            active: workspaceView === "storyboard",
          },
          {
            id: "timeline",
            label: "时间线",
            icon: "timeline",
            active: workspaceView === "timeline",
          },
          {
            id: "history",
            label: "历史",
            icon: "history",
            active: workspaceView === "history",
          },
        ],
        actions: [
          {
            id: "run-all",
            label: "运行全部",
            icon: "animate",
            placement: "document",
          },
        ],
      },
    });
  }, [embed.active, postLegacy, project, workspaceView]);

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
          },
        ],
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
      setMaterialLibraryOpen(false);
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
          setDirty(true);
          postLegacy({ type: "dirty", dirty: true, revision: projectHead(next).revision });
        }
        return true;
      },
      setPolicy: (policy) =>
        setCollabPolicy((current) =>
          current.readOnly === policy.readOnly && current.canSave === policy.canSave ? current : policy,
        ),
      markDirty: () => {
        if (!collabPolicyRef.current.canSave) return;
        setDirty(true);
        postLegacy({ type: "dirty", dirty: true, revision: projectHead(projectRef.current).revision });
      },
    }),
    [cancelSelectionTransactions, postLegacy, setSelectedNodeId, workflowHistory],
  );

  return {
    collabPort,
    collabReadOnly: collabPolicy.readOnly,
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
    selectedNode,
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
    hostPanelVisible,
    hostOwnsChrome,
    commandState,
    commandResults,
    materialAdapter,
    availability,
    executionDegraded,
    migrationReport,
    embed,
    menuPoint,
    materialLibraryOpen,
    mediaUploadRequest,
    closeCreateMenu: () => setMenuPoint(null),
    closeMaterialLibrary: () => setMaterialLibraryOpen(false),
    openCreateMenu,
    createFromMenu,
    dropCreate,
    uploadMedia,
    openView: (view: CanvasWorkspaceView) =>
      dispatchCommand("canvas.session.view.set", { view }, "toolbar"),
    requestClose: () => postLegacy({ type: "close-request" }),
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
