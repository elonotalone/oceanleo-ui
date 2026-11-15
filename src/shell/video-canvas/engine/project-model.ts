"use client";

import { parseVideoProjectDoc } from "../../workflow-carrier/video-project-doc";
import type { Edge, Node, Viewport, XYPosition } from "@xyflow/react";
import { normalizeTimelineDoc, normalizeTimelineCrop, validTimelineLibrarySource, timelineDocIssue } from "../../video-editor/timeline-model";
import type { TimelineDoc, TimelineClip, TimelineLibraryImageSource } from "../../video-editor/types";
import { serializeVideoProjectEnvelope, type CanvasTimelineSource } from "../../video-editor/video-timeline-source";

export const VIDEO_PROJECT_SCHEMA = "oceanleo.video.project.v2" as const;
export const VIDEO_PROJECT_VERSION = 2 as const;
export const CANVAS_NODE_LIMIT = 500;
export const CANVAS_EDGE_LIMIT = 2_000;
export const CANVAS_REFERENCE_NODE_BUDGET = 200;
export const CANVAS_REFERENCE_EDGE_BUDGET = 400;

export type ProjectView = "canvas" | "storyboard" | "director" | "timeline";
export type CanvasWorkspaceView =
  | "graph"
  | "storyboard"
  | "director"
  | "timeline"
  | "history";
export type CanvasNodeKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "script"
  | "model"
  | "subtitle"
  | "composite"
  | "delivery"
  | "director"
  | "storyboard"
  | "timeline";
export type AssetKind = "image" | "video" | "audio" | "text" | "project";
export type AssetOrigin = "upload" | "provider" | "import" | "local-derivative";

export interface LocalEditOperation {
  operation:
    | "crop"
    | "rotate"
    | "flip-horizontal"
    | "flip-vertical"
    | "brightness"
    | "contrast"
    | "saturation"
    | "adjust"
    | "grayscale"
    | "grid-cell"
    | "radius"
    | "border"
    | "opacity"
    | "image-fit";
  parameters: Record<string, number | string | boolean>;
}

export interface AssetProviderMetadata {
  receiptId: string;
  provider: string;
  model: string;
  operation: string;
  pricing: {
    billing: "provider";
    amount: number | null;
    currency: string;
    estimated: boolean;
    label: string;
  };
}

export interface ProjectAsset {
  assetId: string;
  kind: AssetKind;
  origin: AssetOrigin;
  immutable: true;
  title: string;
  url?: string;
  previewUrl?: string;
  inlineText?: string;
  mime?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  contentDigest?: string;
  byteSize?: number;
  /** A private, immutable Library rendition identity; grants stay in runtime state. */
  librarySource?: TimelineLibraryImageSource;
  /** Stable owner-checked reference into this artifact's source dependency closure. */
  sourceDependency?: VideoCanvasSourceDependency;
  provider?: AssetProviderMetadata;
  createdAt: string;
  libraryItem?: { artifactId: string; revisionId: string };
  /** Original workflow-carrier metadata is retained verbatim during v1 migration. */
  legacySourceAsset?: Record<string, unknown>;
}

export interface VideoCanvasSourceDependency {
  artifactId: string;
  revisionId: string;
  path: string;
  sha256: string;
  mediaType: string;
  byteSize: number;
}

export interface AssetDerivative {
  derivativeId: string;
  assetId: string;
  derivedFromAssetId: string;
  kind: "retouch" | "thumbnail" | "poster" | "waveform";
  recipe: LocalEditOperation[];
  status: "local" | "ready" | "failed";
}

export interface AssetLineage {
  lineageId: string;
  parentAssetId: string;
  childAssetId: string;
  relation: "retouched-from" | "generated-from" | "rendered-from";
  commandId: string;
  projectVersionId: string;
  createdAt: string;
}

export interface CanvasOperationReceipt {
  schema: "oceanleo.canvas-operation-receipt@1";
  receiptId: string;
  requestId: string;
  requestFingerprint: string;
  commandId: string;
  projectVersionId: string;
  status: "succeeded";
  provider: string;
  model: string;
  pricing: AssetProviderMetadata["pricing"];
  inputAssetIds: string[];
  outputAssetIds: string[];
  externalRunIds: string[];
  startedAt: string;
  completedAt: string;
}

export interface DurableVideoRun {
  runId: string;
  commandRequestId: string;
  nodeId: string;
  remoteProjectVersionId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  message?: string;
  outputAssetIds?: string[];
  refundStatus?: string;
}

export interface DurableVideoProjectState {
  workspaceId: string;
  projectId: string;
  headVersionId: string;
  headEpoch: number;
  graphFingerprint: string;
  syncedLocalVersionId: string;
  syncedSelectionEpoch: number;
  runs: DurableVideoRun[];
}

export interface ArtifactRevisionReceipt {
  saveId: string;
  projectVersionId: string;
  artifactId: string;
  revisionId: string;
  url: string;
  receivedAt: string;
}

export interface SceneDefinition {
  sceneId: string;
  title: string;
  shotIds: string[];
  summary?: string;
  reviewStatus?: "draft" | "in-review" | "approved" | "rejected";
}

export interface ShotDefinition {
  shotId: string;
  sceneId: string;
  title: string;
  intendedDurationSeconds: number;
  storyboardId: string;
  takeIds: string[];
  approvedTakeId?: string;
  cameraId?: string;
  description?: string;
  reviewStatus?: "draft" | "in-review" | "approved" | "rejected";
}

export interface StoryboardDefinition {
  storyboardId: string;
  shotId: string;
  frameAssetIds: string[];
  reviewStatus?: "draft" | "in-review" | "approved" | "rejected";
}

export interface TakeDefinition {
  takeId: string;
  shotId: string;
  assetId: string;
  status: "candidate" | "in-review" | "approved" | "rejected";
  reviewNote?: string;
}

export interface TimelineDefinition {
  timelineId: string;
  title: string;
  clipIds: string[];
}

export interface ClipDefinition {
  clipId: string;
  timelineId: string;
  takeId?: string;
  assetId: string;
  startSeconds: number;
  durationSeconds: number;
}

export type ProjectTimelineDocument = TimelineDoc;

export interface CameraDefinition {
  cameraId: string;
  shotId: string;
  lensMillimeters?: number;
  fieldOfViewDegrees?: number;
  position: [number, number, number];
  rotation: [number, number, number];
  focusTarget?: [number, number, number];
  safeArea: "16:9" | "9:16" | "1:1";
  pathKeyframes: Array<{
    timeSeconds: number;
    position: [number, number, number];
    rotation: [number, number, number];
  }>;
  planStatus?: "draft" | "ready" | "approved";
}

export interface ContinuityQcIssue {
  issueId: string;
  code:
    | "MISSING_STORYBOARD_FRAME"
    | "MISSING_APPROVED_TAKE"
    | "BROKEN_APPROVED_TAKE"
    | "MISSING_CAMERA_PLAN"
    | "DURATION_MISMATCH";
  severity: "warning" | "error";
  sceneId?: string;
  shotId?: string;
  message: string;
}

export interface ContinuityQcReport {
  status: "not-checked" | "pass" | "warning" | "blocked";
  checkedAt?: string;
  checkedProjectVersionId?: string;
  issues: ContinuityQcIssue[];
}

export interface ProjectVersionComparison {
  baseVersionId: string;
  targetVersionId: string;
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedNodeIds: string[];
  addedAssetIds: string[];
  addedTakeIds: string[];
  reviewChanges: Array<{
    takeId: string;
    from?: TakeDefinition["status"];
    to?: TakeDefinition["status"];
  }>;
}

export interface CanvasNodeDefinition {
  nodeId: string;
  kind: CanvasNodeKind;
  title: string;
  position: XYPosition;
  assetId?: string;
  prompt?: string;
  text?: string;
  model?: string;
  ratio?: "16:9" | "9:16" | "1:1";
  durationSeconds?: number;
  sceneId?: string;
  shotId?: string;
  cameraId?: string;
  localEditRecipe: LocalEditOperation[];
  generation?: { status: string; message?: string; inputFingerprint?: string };
  audioMode?: "voice" | "music";
  voice?: string;
  /** Exact source node retained when the v1 workflow kind exceeds the v2 canvas model. */
  legacySourceNode?: Record<string, unknown>;
}

export interface CanvasEdgeDefinition {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** Exact source edge retained for round-trip-safe v1 workflow conversion. */
  legacySourceEdge?: Record<string, unknown>;
}

export interface ProjectVersion {
  versionId: string;
  parentVersionId?: string;
  revision: number;
  createdAt: string;
  reason: string;
  graph: {
    nodes: CanvasNodeDefinition[];
    edges: CanvasEdgeDefinition[];
    viewport?: Viewport;
  };
  scenes: SceneDefinition[];
  shots: ShotDefinition[];
  storyboards: StoryboardDefinition[];
  takes: TakeDefinition[];
  timelines: TimelineDefinition[];
  clips: ClipDefinition[];
  cameras: CameraDefinition[];
  continuityQc?: ContinuityQcReport;
}

export interface VideoProject {
  schema: typeof VIDEO_PROJECT_SCHEMA;
  schemaVersion: typeof VIDEO_PROJECT_VERSION;
  projectId: string;
  title: string;
  headVersionId: string;
  versions: Record<string, ProjectVersion>;
  assets: Record<string, ProjectAsset>;
  derivatives: Record<string, AssetDerivative>;
  lineage: AssetLineage[];
  operationReceipts: Record<string, CanvasOperationReceipt>;
  durable?: DurableVideoProjectState;
  artifactRevisionReceipt?: ArtifactRevisionReceipt;
  timelineHandoff?: {
    artifactId: string;
    revisionId: string;
    projectVersionId: string;
  };
  migration?: {
    sourceSchema: string;
    sourceDigest: string;
    sourceDigestAlgorithm: "fnv1a-dual32";
    sourceHeadVersionId?: string;
    /** Complete original source; never used as executable code. */
    sourceDocument?: unknown;
  };
}

export interface CanvasNodeViewData extends Record<string, unknown> {
  nodeId: string;
  kind: CanvasNodeKind;
  title: string;
  asset?: ProjectAsset;
  derivative?: AssetDerivative;
  prompt?: string;
  text?: string;
  model?: string;
  ratio?: "16:9" | "9:16" | "1:1";
  durationSeconds?: number;
  sceneId?: string;
  shotId?: string;
  cameraId?: string;
  localEditRecipe: LocalEditOperation[];
  params?: Record<string, unknown>;
  /** Exact imported v1 node source, available to a guarded legacy view only. */
  legacySourceNode?: Record<string, unknown>;
  selectionEpoch: number;
  hostOwnsChrome: boolean;
  /**
   * 宿主已经提供编辑栏：统一外壳的 PluginChromeFrame，或外嵌 postMessage
   * 里声明自己拥有 chrome 的宿主。为 true 时节点不得再挂常驻浮动命令条。
   * 只有「外嵌且宿主没有编辑栏」时为 false。
   */
  hostProvidesEditBar: boolean;
  imageMode: "retouch" | "generate";
  generateSummary?: {
    provider: string;
    model: string;
    input: string;
    estimatedCost: string;
  };
  commandAvailability: Record<
    string,
    {
      enabled: boolean;
      reason?: string;
      reasonCode?: string;
      missingContract?: string;
      hidden?: boolean;
    }
  >;
  commandDisclosures: Record<
    string,
    {
      provider: string;
      model: string;
      input: string;
      cost: string;
      contract: string;
    }
  >;
  commandState?: {
    commandId: string;
    status: string;
    message?: string;
    phase?: string;
    progress?: number;
    cancelable?: boolean;
    externalRunId?: string;
  };
  onCommand: (
    commandId: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown>;
}

export type CanvasFlowNode = Node<CanvasNodeViewData, "leovideo-media">;
export type CanvasFlowEdge = Edge;

let fallbackSequence = 0;

function now(): string {
  return new Date().toISOString();
}

export function stableId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${prefix}_${randomUuid}`;
  fallbackSequence += 1;
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}_${fallbackSequence.toString(36)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function withDurableVideoState(
  project: VideoProject,
  durable: DurableVideoProjectState,
): VideoProject {
  return {
    ...project,
    durable: clone({
      ...durable,
      runs: durable.runs.slice(-100),
    }),
  };
}

export function recordDurableVideoRun(
  project: VideoProject,
  run: DurableVideoRun,
): VideoProject {
  if (!project.durable) {
    throw new Error("A durable Run cannot be recorded before Project binding.");
  }
  const runs = project.durable.runs.filter(
    (candidate) => candidate.runId !== run.runId,
  );
  return withDurableVideoState(project, {
    ...project.durable,
    runs: [...runs, clone(run)].slice(-100),
  });
}

export function recordArtifactRevisionReceipt(
  project: VideoProject,
  receipt: ArtifactRevisionReceipt,
): VideoProject {
  if (!Object.hasOwn(project.versions, receipt.projectVersionId)) {
    throw new Error("Artifact receipt references an unknown Project version.");
  }
  for (const [label, value, maximum] of [
    ["save ID", receipt.saveId, 128],
    ["artifact ID", receipt.artifactId, 300],
    ["revision ID", receipt.revisionId, 300],
  ] as const) {
    if (!value || value.length > maximum) {
      throw new Error(`Artifact receipt ${label} is missing or too long.`);
    }
  }
  const parsedUrl = new URL(receipt.url);
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Artifact receipt URL must use HTTP or HTTPS.");
  }
  if (!Number.isFinite(Date.parse(receipt.receivedAt))) {
    throw new Error("Artifact receipt timestamp is invalid.");
  }
  return {
    ...project,
    artifactRevisionReceipt: clone(receipt),
  };
}

/** Artifact identity/URL receipts are host-session CAS state, not Project source. */
export function projectSourceForStorage(project: VideoProject): VideoProject {
  const snapshot = clone(project);
  delete snapshot.artifactRevisionReceipt;
  for (const asset of Object.values(snapshot.assets)) {
    if (!asset.librarySource) continue;
    if (!validTimelineLibrarySource(asset.librarySource) || asset.kind !== "image") throw new Error("Invalid Library image reference.");
    asset.librarySource = { artifactId: asset.librarySource.artifactId, revisionId: asset.librarySource.revisionId, rendition: "full" };
    delete asset.url;
    delete asset.previewUrl;
  }
  return snapshot;
}

export function updateDurableVideoRun(
  project: VideoProject,
  runId: string,
  status: string,
): VideoProject {
  if (!project.durable) {
    throw new Error("Durable Project binding is missing.");
  }
  const run = project.durable.runs.find((candidate) => candidate.runId === runId);
  if (!run) throw new Error("Durable Run receipt is not part of this Project.");
  return recordDurableVideoRun(project, {
    ...run,
    status: status.slice(0, 80),
    updatedAt: now(),
  });
}

export interface ResolvedCanvasInput {
  nodeId: string;
  edgeId: string;
  type: "text" | "image" | "audio" | "video";
  text?: string;
  asset?: ProjectAsset;
}

export class CanvasInputError extends Error {
  readonly code: "cycle" | "missing" | "type";
  readonly nodeId: string;
  readonly template: string;
  readonly label: string;
  constructor(code: "cycle" | "missing" | "type", label: string, nodeId: string) {
    const template = code === "cycle" ? "连线形成循环：{node}" : code === "type" ? "连线的输入类型不匹配：{node}" : "连接的节点还没有可用输出：{node}";
    super(template.replace("{node}", label));
    this.code = code;
    this.nodeId = nodeId;
    this.template = template;
    this.label = label;
  }
  translated(tt: (source: string, vars?: Record<string, string | number>) => string): string {
    return tt(this.template, { node: this.label });
  }
}

/** One traversal for validation and explicit chain ordering; edits never run it. */
export function canvasUpstreamOrder(project: VideoProject, nodeId: string): CanvasNodeDefinition[] {
  const graph = head(project).graph;
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: CanvasNodeDefinition[] = [];
  const visit = (id: string) => {
    const node = byId.get(id);
    if (!node) throw new CanvasInputError("missing", id, nodeId);
    if (visiting.has(id)) throw new CanvasInputError("cycle", node.title, id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of graph.edges.filter((edge) => edge.targetNodeId === id)) visit(edge.sourceNodeId);
    visiting.delete(id);
    visited.add(id);
    ordered.push(effectiveCanvasNode(clone(node)));
  };
  visit(nodeId);
  return ordered;
}

export function canvasNodeHasOutput(project: VideoProject, node: CanvasNodeDefinition): boolean {
  node = effectiveCanvasNode(node);
  if (node.generation?.status === "failed") return false;
  if (["text", "script", "subtitle"].includes(node.kind)) return Boolean(node.text?.trim());
  const asset = node.assetId ? project.assets[node.assetId] : undefined;
  return Boolean(asset && asset.kind === node.kind && (asset.url || asset.sourceDependency));
}

/** Direct incoming ports carry current output, never the upstream node's old prompt. */
export function resolveCanvasInputs(project: VideoProject, nodeId: string): {
  inputs: ResolvedCanvasInput[]; prompt: string; images: ProjectAsset[]; audio: ProjectAsset[]; videos: ProjectAsset[];
} {
  canvasUpstreamOrder(project, nodeId);
  const graph = head(project).graph;
  const target = effectiveCanvasNode(graph.nodes.find((node) => node.nodeId === nodeId)!);
  const inputs: ResolvedCanvasInput[] = [];
  const portType = (handle?: string | null) => {
    const match = handle?.match(/(?:^|[-_:])(text|script|image|audio|video|first-frame|reference)(?:$|[-_:])/);
    return match ? (match[1] === "script" ? "text" : ["first-frame", "reference"].includes(match[1]) ? "image" : match[1]) : undefined;
  };
  for (const edge of graph.edges.filter((edge) => edge.targetNodeId === nodeId)) {
    const source = effectiveCanvasNode(graph.nodes.find((node) => node.nodeId === edge.sourceNodeId)!);
    const asset = source.assetId ? project.assets[source.assetId] : undefined;
    if (asset && ["image", "audio", "video"].includes(source.kind) && asset.kind !== source.kind) throw new CanvasInputError("type", source.title, source.nodeId);
    const type = ["text", "script", "subtitle"].includes(source.kind) ? "text" : asset?.kind || source.kind;
    if (!["text", "image", "audio", "video"].includes(type)) {
      throw new CanvasInputError("type", source.title, source.nodeId);
    }
    for (const expected of [portType(edge.sourceHandle), portType(edge.targetHandle)]) {
      if (expected && expected !== type) throw new CanvasInputError("type", source.title, source.nodeId);
    }
    const text = source.text?.trim() || asset?.inlineText?.trim();
    if (type === "text" ? !text : !asset || (!asset.url && !asset.sourceDependency)) {
      throw new CanvasInputError("missing", source.title, source.nodeId);
    }
    inputs.push({ nodeId: source.nodeId, edgeId: edge.edgeId, type: type as ResolvedCanvasInput["type"], ...(type === "text" ? { text } : { asset: clone(asset!) }) });
  }
  return {
    inputs,
    prompt: [target.prompt?.trim() || (["text", "script"].includes(target.kind) ? target.text?.trim() : ""), ...inputs.filter((input) => input.type === "text").map((input) => input.text)].filter(Boolean).join("\n\n"),
    images: inputs.filter((input) => input.type === "image").map((input) => input.asset!),
    audio: inputs.filter((input) => input.type === "audio").map((input) => input.asset!),
    videos: inputs.filter((input) => input.type === "video").map((input) => input.asset!),
  };
}

/** Status is saved with the graph, without minting history on every poll. */
export function withCanvasNodeGeneration(project: VideoProject, nodeId: string, status: string, message?: string): VideoProject {
  const next = clone(project);
  const node = next.versions[next.headVersionId].graph.nodes.find((node) => node.nodeId === nodeId);
  if (node) node.generation = { ...node.generation, status, message };
  return next;
}

export function projectPreviewAtCurrentHead(
  base: VideoProject,
  candidate: VideoProject,
): VideoProject {
  const baseVersion = head(base);
  const candidateVersion = head(candidate);
  return {
    ...candidate,
    headVersionId: base.headVersionId,
    versions: {
      ...base.versions,
      [base.headVersionId]: {
        ...candidateVersion,
        versionId: baseVersion.versionId,
        parentVersionId: baseVersion.parentVersionId,
        revision: baseVersion.revision,
        createdAt: baseVersion.createdAt,
        reason: baseVersion.reason,
      },
    },
  };
}

function head(project: VideoProject): ProjectVersion {
  const version = project.versions[project.headVersionId];
  if (!version) throw new Error("Project head does not resolve to a version.");
  // Defaults and official-template projections belong to the view. Stored
  // versions stay untouched, including fields introduced by another editor.
  const runtime = clone(version);
  runtime.versionId ||= project.headVersionId;
  runtime.revision = Number.isSafeInteger(runtime.revision) ? runtime.revision : 1;
  normalizeProjectVersions({ ...project, versions: { [project.headVersionId]: runtime } });
  return runtime;
}

/** Read official template aliases without rewriting their stored kind. */
export function effectiveCanvasNode(node: CanvasNodeDefinition): CanvasNodeDefinition {
  const kind = String(node.kind) === "prompt" ? "script"
    : String(node.kind) === "generate" ? "video" : node.kind;
  const params = (node as CanvasNodeDefinition & { params?: Record<string, unknown> }).params || {};
  const ratio = node.ratio ?? params.ratio ?? params.aspectRatio;
  const duration = node.durationSeconds ?? params.durationSeconds ?? (typeof params.durationMs === "number" ? params.durationMs / 1000 : undefined);
  return { ...params, ...node, kind, localEditRecipe: node.localEditRecipe || [],
    ...(["16:9", "9:16", "1:1"].includes(String(ratio)) ? { ratio: ratio as CanvasNodeDefinition["ratio"] } : {}),
    ...(typeof duration === "number" && Number.isFinite(duration) ? { durationSeconds: duration } : {}),
  };
}

export function projectHead(project: VideoProject): ProjectVersion {
  return clone(head(project));
}

function starterEntities() {
  const sceneId = stableId("scene");
  const shotId = stableId("shot");
  const storyboardId = stableId("storyboard");
  const timelineId = stableId("timeline");
  return {
    sceneId,
    shotId,
    storyboardId,
    timelineId,
    scenes: [{ sceneId, title: "Scene 1", shotIds: [shotId] }],
    shots: [
      {
        shotId,
        sceneId,
        title: "Shot 1",
        intendedDurationSeconds: 5,
        storyboardId,
        takeIds: [],
      },
    ],
    storyboards: [{ storyboardId, shotId, frameAssetIds: [] }],
    timelines: [{ timelineId, title: "Main timeline", clipIds: [] }],
  };
}

export function createVideoProject(
  title = "Untitled LeoVideo project",
  withStarterNodes = false,
): VideoProject {
  const entities = starterEntities();
  const versionId = stableId("projectVersion");
  const nodes: CanvasNodeDefinition[] = withStarterNodes
    ? [
        {
          nodeId: stableId("node"),
          kind: "script",
          title: "Story & shots",
          position: { x: 60, y: 140 },
          sceneId: entities.sceneId,
          shotId: entities.shotId,
          localEditRecipe: [],
        },
        {
          nodeId: stableId("node"),
          kind: "image",
          title: "Storyboard frame",
          position: { x: 440, y: 110 },
          sceneId: entities.sceneId,
          shotId: entities.shotId,
          ratio: "16:9",
          localEditRecipe: [],
        },
        {
          nodeId: stableId("node"),
          kind: "video",
          title: "Candidate take",
          position: { x: 930, y: 110 },
          sceneId: entities.sceneId,
          shotId: entities.shotId,
          ratio: "16:9",
          durationSeconds: 5,
          localEditRecipe: [],
        },
      ]
    : [];
  const version: ProjectVersion = {
    versionId,
    revision: 1,
    createdAt: now(),
    reason: "project.created",
    graph: { nodes, edges: [] },
    scenes: entities.scenes,
    shots: entities.shots,
    storyboards: entities.storyboards,
    takes: [],
    timelines: entities.timelines,
    clips: [],
    cameras: [],
  };
  return {
    schema: VIDEO_PROJECT_SCHEMA,
    schemaVersion: VIDEO_PROJECT_VERSION,
    projectId: stableId("project"),
    title,
    headVersionId: versionId,
    versions: { [versionId]: version },
    assets: {},
    derivatives: {},
    lineage: [],
    operationReceipts: {},
  };
}

export function advanceProject(
  project: VideoProject,
  reason: string,
  mutate: (draft: ProjectVersion) => void,
): VideoProject {
  const current = head(project);
  const next = clone(current);
  next.parentVersionId = current.versionId;
  next.versionId = stableId("projectVersion");
  next.revision = current.revision + 1;
  next.createdAt = now();
  next.reason = reason;
  mutate(next);
  assertProjectBudgets(next.graph.nodes.length, next.graph.edges.length);
  return {
    ...project,
    headVersionId: next.versionId,
    versions: { ...project.versions, [next.versionId]: next },
  };
}

export function addProjectNode(
  project: VideoProject,
  kind: CanvasNodeKind,
  position: XYPosition,
  patch: Partial<Omit<CanvasNodeDefinition, "nodeId" | "kind" | "position">> = {},
): { project: VideoProject; nodeId: string } {
  const nodeId = stableId("node");
  const attachedTakeId =
    kind === "video" && patch.assetId ? stableId("take") : undefined;
  const current = head(project);
  const firstShot = current.shots[0];
  const node: CanvasNodeDefinition = {
    nodeId,
    kind,
    title: patch.title || defaultNodeTitle(kind),
    position,
    sceneId: patch.sceneId ?? firstShot?.sceneId,
    shotId: patch.shotId ?? firstShot?.shotId,
    localEditRecipe: patch.localEditRecipe || [],
    ...patch,
  };
  return {
    project: advanceProject(project, "canvas.node.create", (version) => {
      version.graph.nodes.push(node);
      if (node.assetId && node.shotId && node.kind === "image") {
        const shot = version.shots.find(
          (candidate) => candidate.shotId === node.shotId,
        );
        const storyboard = version.storyboards.find(
          (candidate) => candidate.storyboardId === shot?.storyboardId,
        );
        if (storyboard && !storyboard.frameAssetIds.includes(node.assetId)) {
          storyboard.frameAssetIds.push(node.assetId);
        }
      }
      if (
        node.assetId &&
        node.shotId &&
        node.kind === "video" &&
        attachedTakeId
      ) {
        const shot = version.shots.find(
          (candidate) => candidate.shotId === node.shotId,
        );
        if (shot) {
          version.takes.push({
            takeId: attachedTakeId,
            shotId: shot.shotId,
            assetId: node.assetId,
            status: "candidate",
          });
          shot.takeIds.push(attachedTakeId);
        }
      }
    }),
    nodeId,
  };
}

export function updateProjectNode(
  project: VideoProject,
  nodeId: string,
  reason: string,
  patch: Partial<CanvasNodeDefinition>,
): VideoProject {
  return advanceProject(project, reason, (version) => {
    const index = version.graph.nodes.findIndex((node) => node.nodeId === nodeId);
    if (index < 0) throw new Error("Selected node no longer exists.");
    version.graph.nodes[index] = {
      ...version.graph.nodes[index],
      ...patch,
      nodeId,
      localEditRecipe:
        patch.localEditRecipe || version.graph.nodes[index].localEditRecipe,
    };
  });
}

export function removeProjectNode(
  project: VideoProject,
  nodeId: string,
): VideoProject {
  return advanceProject(project, "canvas.node.delete", (version) => {
    version.graph.nodes = version.graph.nodes.filter(
      (node) => node.nodeId !== nodeId,
    );
    version.graph.edges = version.graph.edges.filter(
      (edge) =>
        edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId,
    );
  });
}

export function replaceProjectGraph(
  project: VideoProject,
  nodes: CanvasNodeDefinition[],
  edges: CanvasEdgeDefinition[],
  reason: string,
  viewport?: Viewport,
): VideoProject {
  return advanceProject(project, reason, (version) => {
    version.graph = {
      nodes: clone(nodes),
      edges: clone(edges),
      viewport: viewport ? clone(viewport) : version.graph.viewport,
    };
  });
}

export function registerAsset(
  project: VideoProject,
  input: Omit<ProjectAsset, "assetId" | "immutable" | "createdAt"> & {
    assetId?: string;
  },
): { project: VideoProject; asset: ProjectAsset } {
  if (input.librarySource && (!validTimelineLibrarySource(input.librarySource) || input.kind !== "image")) throw new Error("Invalid Library image reference.");
  if (input.url) {
    const url = new URL(input.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Asset URL must use HTTP or HTTPS.");
    }
  }
  const asset: ProjectAsset = {
    ...input,
    assetId: input.assetId || stableId("asset"),
    immutable: true,
    createdAt: now(),
  };
  return {
    project: {
      ...project,
      assets: { ...project.assets, [asset.assetId]: asset },
    },
    asset,
  };
}

export function operationReceiptForRequest(
  project: VideoProject,
  requestId: string,
): CanvasOperationReceipt | undefined {
  return Object.values(project.operationReceipts || {}).find(
    (receipt) => receipt?.requestId === requestId,
  );
}

export function recordCanvasOperationReceipt(
  project: VideoProject,
  receipt: CanvasOperationReceipt,
): VideoProject {
  if (
    !receipt.receiptId ||
    !receipt.requestId ||
    !receipt.requestFingerprint ||
    !receipt.commandId
  ) {
    throw new Error("Provider receipt identity is incomplete.");
  }
  if (!Object.hasOwn(project.versions, receipt.projectVersionId)) {
    throw new Error("Provider receipt references an unknown Project version.");
  }
  for (const assetId of [
    ...receipt.inputAssetIds,
    ...receipt.outputAssetIds,
  ]) {
    if (!project.assets[assetId]) {
      throw new Error("Provider receipt references an unknown immutable Asset.");
    }
  }
  const existing = project.operationReceipts?.[receipt.receiptId];
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(receipt)) {
      throw new Error("Provider receipt ID was reused with different content.");
    }
    return project;
  }
  return {
    ...project,
    operationReceipts: {
      ...(project.operationReceipts || {}),
      [receipt.receiptId]: clone(receipt),
    },
  };
}

export function deriveLocalAsset(
  project: VideoProject,
  parentAssetId: string,
  operation: LocalEditOperation,
  commandId: string,
): { project: VideoProject; asset: ProjectAsset; derivative: AssetDerivative } {
  const parent = project.assets[parentAssetId];
  if (!parent) throw new Error("The immutable source Asset is missing.");
  const registered = registerAsset(project, {
    kind: parent.kind,
    origin: "local-derivative",
    title: `${parent.title} — ${operation.operation}`,
    url: parent.url,
    previewUrl: parent.previewUrl,
    mime: parent.mime,
    width: parent.width,
    height: parent.height,
    durationSeconds: parent.durationSeconds,
    sourceDependency: parent.sourceDependency,
    libraryItem: parent.libraryItem,
    librarySource: parent.librarySource,
    contentDigest: parent.contentDigest,
    byteSize: parent.byteSize,
  });
  const derivative: AssetDerivative = {
    derivativeId: stableId("derivative"),
    assetId: registered.asset.assetId,
    derivedFromAssetId: parentAssetId,
    kind: "retouch",
    recipe: [operation],
    status: "local",
  };
  return {
    project: {
      ...registered.project,
      derivatives: {
        ...registered.project.derivatives,
        [derivative.derivativeId]: derivative,
      },
      lineage: [
        ...(registered.project.lineage || []),
        {
          lineageId: stableId("lineage"),
          parentAssetId,
          childAssetId: registered.asset.assetId,
          relation: "retouched-from",
          commandId,
          projectVersionId: registered.project.headVersionId,
          createdAt: now(),
        },
      ],
    },
    asset: registered.asset,
    derivative,
  };
}

export function attachGeneratedAssetSet(
  project: VideoProject,
  nodeId: string,
  assetInputs: Array<
    Omit<ProjectAsset, "assetId" | "immutable" | "createdAt">
  >,
  commandId: string,
): {
  project: VideoProject;
  assets: ProjectAsset[];
  nodeIds: string[];
} {
  const sourceNode = head(project).graph.nodes.find(
    (node) => node.nodeId === nodeId,
  );
  if (!sourceNode) throw new Error("Generation target no longer exists.");
  if (assetInputs.length === 0) {
    throw new Error("Generation returned no immutable Assets.");
  }
  let working = project;
  let parentAssetId = sourceNode.assetId;
  const prompt = (sourceNode.prompt || sourceNode.text || "").trim();
  if (!parentAssetId && prompt) {
    const promptAsset = registerAsset(working, {
      kind: "text",
      origin: "import",
      title: `${sourceNode.title} — generation input`,
      inlineText: prompt,
      contentDigest: deterministicDigest({ prompt }),
    });
    working = promptAsset.project;
    parentAssetId = promptAsset.asset.assetId;
  }
  const assets: ProjectAsset[] = [];
  for (const input of assetInputs) {
    const registered = registerAsset(working, input);
    working = registered.project;
    assets.push(registered.asset);
  }
  const extraNodeIds = assets.slice(1).map(() => stableId("node"));
  const takeIds =
    effectiveCanvasNode(sourceNode).kind === "video"
      ? assets.map(() => stableId("take"))
      : [];
  let next = advanceProject(working, commandId, (version) => {
    const target = version.graph.nodes.find(
      (candidate) => candidate.nodeId === nodeId,
    );
    if (!target) throw new Error("Generation target no longer exists.");
    target.assetId = assets[0].assetId;
    target.generation = { status: "succeeded" };
    if (target.kind === "image" && target.shotId) {
      const shot = version.shots.find(
        (candidate) => candidate.shotId === target.shotId,
      );
      const storyboard = version.storyboards.find(
        (candidate) => candidate.storyboardId === shot?.storyboardId,
      );
      if (storyboard) {
        storyboard.frameAssetIds = [
          ...storyboard.frameAssetIds,
          ...assets
            .map((asset) => asset.assetId)
            .filter((assetId) => !storyboard.frameAssetIds.includes(assetId)),
        ];
      }
      assets.slice(1).forEach((asset, index) => {
        version.graph.nodes.push({
          ...clone(target),
          nodeId: extraNodeIds[index],
          title: `${target.title} ${index + 2}`,
          position: {
            x: target.position.x + ((index % 4) + 1) * 48,
            y: target.position.y + (Math.floor(index / 4) + 1) * 48,
          },
          assetId: asset.assetId,
          localEditRecipe: [],
        });
      });
    }
    if (effectiveCanvasNode(target).kind === "video" && target.shotId) {
      const shot = version.shots.find(
        (candidate) => candidate.shotId === target.shotId,
      );
      if (shot) {
        assets.forEach((asset, index) => {
          const takeId = takeIds[index];
          version.takes.push({
            takeId,
            shotId: shot.shotId,
            assetId: asset.assetId,
            status: "candidate",
          });
          shot.takeIds.push(takeId);
        });
      }
    }
  });
  if (parentAssetId && next.assets[parentAssetId]) {
    next = {
      ...next,
      lineage: [
        ...next.lineage,
        ...assets.map((asset) => ({
          lineageId: stableId("lineage"),
          parentAssetId,
          childAssetId: asset.assetId,
          relation: "generated-from" as const,
          commandId,
          projectVersionId: next.headVersionId,
          createdAt: now(),
        })),
      ],
    };
  }
  return {
    project: next,
    assets,
    nodeIds: [nodeId, ...extraNodeIds],
  };
}

export function attachGeneratedAsset(
  project: VideoProject,
  nodeId: string,
  assetInput: Omit<ProjectAsset, "assetId" | "immutable" | "createdAt">,
  commandId: string,
): { project: VideoProject; asset: ProjectAsset } {
  const attached = attachGeneratedAssetSet(
    project,
    nodeId,
    [assetInput],
    commandId,
  );
  return { project: attached.project, asset: attached.assets[0] };
}

/** Scene order, then each scene's storyboard shot order; orphan shots keep their order. */
function approvedTimelineTakes(version: ProjectVersion) {
  const ordered = [...new Set([
    ...version.scenes.flatMap((scene) => scene.shotIds),
    ...version.shots.map((shot) => shot.shotId),
  ])];
  return ordered.flatMap((shotId) => {
    const shot = version.shots.find((item) => item.shotId === shotId);
    const take = shot && version.takes.find((item) =>
      item.takeId === shot.approvedTakeId && item.shotId === shotId && item.status === "approved");
    return shot && take ? [{ shot, take }] : [];
  });
}

function composeNodeParams(node: CanvasNodeDefinition): Record<string, unknown> {
  const raw = node as CanvasNodeDefinition & { params?: Record<string, unknown> };
  return { ...raw.legacySourceNode, ...raw, ...raw.params };
}

function composeNumber(value: unknown, fallback: number, min = 0, max = Infinity): number {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** Canonical image settings shared by canvas preview and the composited film.
 * Recipes remain non-destructive; only the timeline renderer creates pixels.
 */
export function canvasImageAppearance(node: Pick<CanvasNodeDefinition, "localEditRecipe"> & { params?: Record<string, unknown> }) {
  const params = node.params || {};
  const result: Partial<TimelineClip> = {};
  for (const step of node.localEditRecipe || []) {
    const values = step.parameters || {};
    if (step.operation === "crop") {
      const inset = composeNumber(values.insetPercent, 0, 0, 49.5) / 100;
      result.crop = normalizeTimelineCrop(typeof values.x === "number" ? { x: values.x, y: Number(values.y), width: Number(values.width), height: Number(values.height) } : { x: inset, y: inset, width: 1 - inset * 2, height: 1 - inset * 2 });
    } else if (step.operation === "grid-cell") {
      const columns = composeNumber(values.columns, 1, 1, 25), rows = composeNumber(values.rows, 1, 1, 25);
      result.crop = normalizeTimelineCrop({ x: composeNumber(values.column, 0, 0, columns - 1) / columns,
        y: composeNumber(values.row, 0, 0, rows - 1) / rows, width: 1 / columns, height: 1 / rows });
    } else if (step.operation === "rotate") result.rotation = (result.rotation || 0) + composeNumber(values.degrees, 0, -360, 360);
    else if (step.operation === "flip-horizontal") result.flip_x = !result.flip_x;
    else if (step.operation === "flip-vertical") result.flip_y = !result.flip_y;
    else if (step.operation === "brightness") result.brightness = composeNumber(values.factor, 1, 0.25, 2) - 1;
    else if (step.operation === "contrast") result.contrast = composeNumber(values.factor, 1, 0.25, 2);
    else if (step.operation === "saturation") result.saturation = composeNumber(values.factor, 1, 0, 2);
    else if (step.operation === "grayscale") result.saturation = 1 - composeNumber(values.amount, 1, 0, 1);
    else if (step.operation === "adjust") {
      result.brightness = Math.min(1, Math.max(-1, composeNumber(values.brightness, 1, 0.25, 2) * 2 ** composeNumber(values.exposure, 0, -2, 2) - 1));
      result.contrast = composeNumber(values.contrast, 1, 0.25, 2);
      result.saturation = composeNumber(values.saturation, 1, 0, 2);
    } else if (step.operation === "radius") result.radius = composeNumber(values.radius, 0, 0, 1000);
    else if (step.operation === "border") result.border = { width: composeNumber(values.width, 0, 0, 100), color: /^#[0-9a-f]{6}$/i.test(String(values.color)) ? String(values.color) : "#000000" };
    else if (step.operation === "opacity") result.opacity = composeNumber(values.opacity, 1, 0, 1);
    else if (step.operation === "image-fit" && ["contain", "cover", "stretch"].includes(String(values.fit))) result.fit = values.fit as TimelineClip["fit"];
  }
  const border = params.border && typeof params.border === "object" ? params.border as Record<string, unknown> : result.border;
  return { ...result, fit: ["contain", "cover", "stretch"].includes(String(params.fit)) ? params.fit as NonNullable<TimelineClip["fit"]> : result.fit || "contain",
    radius: composeNumber(params.radius, result.radius || 0, 0, 1000), opacity: composeNumber(params.opacity, result.opacity ?? 1, 0, 1),
    border: { width: composeNumber(border?.width, 0, 0, 100), color: /^#[0-9a-f]{6}$/i.test(String(border?.color)) ? String(border?.color) : "#000000" },
    ...(params.crop ? { crop: normalizeTimelineCrop(params.crop as TimelineClip["crop"]) } : {}),
    alt: typeof params.alt === "string" ? params.alt.slice(0, 2000) : "" };
}

/** The one cut used by both FFmpeg export and the full timeline editor. */
export function projectTimelineDocument(project: VideoProject): {
  timelineId: string;
  document: ProjectTimelineDocument;
  projectDocument: string;
  canvasSource: CanvasTimelineSource;
  inputAssetIds: string[];
} {
  const version = head(project);
  const timeline = version.timelines[0] || { timelineId: `canvas_${project.projectId}`, title: project.title, clipIds: [] };
  const approved = approvedTimelineTakes(version);
  if (!approved.length) throw new Error("请先在分镜中批准视频候选。");
  const inputAssetIds = new Set<string>();
  const shotStarts = new Map<string, { start: number; duration: number }>();
  let cursor = 0;
  const videoClips: TimelineClip[] = approved.map(({ shot, take }) => {
    const asset = project.assets[take.assetId];
    if (asset?.kind !== "video" || (!asset.url && !asset.sourceDependency)) throw new Error("已批准的镜头缺少可用视频，请重新选择候选。");
    const duration = Math.round(composeNumber(asset.durationSeconds, shot.intendedDurationSeconds, 0.1) * 1000);
    const clip: TimelineClip = {
      id: `clip_${take.takeId}`, start_ms: cursor, duration_ms: duration,
      ...(asset.sourceDependency ? { source_ref: { artifactId: asset.sourceDependency.artifactId,
        revisionId: asset.sourceDependency.revisionId, path: asset.sourceDependency.path } } : { source_url: asset.url }), source_duration_ms: duration, in_ms: 0,
      speed: 1, volume: 1, muted: false, fit: "cover", label: shot.title,
    };
    shotStarts.set(shot.shotId, { start: cursor, duration });
    inputAssetIds.add(asset.assetId);
    cursor += duration;
    return clip;
  });
  const delivery = version.graph.nodes.find((node) => node.kind === "delivery");
  const output = delivery ? composeNodeParams(delivery) : {};
  const ratio = String(output.aspectRatio || output.ratio || "16:9");
  const preset = ratio === "9:16" ? [1080, 1920] : ratio === "1:1" ? [1080, 1080] : [1920, 1080];
  let width = Math.round(composeNumber(output.width, preset[0], 16, 3840));
  let height = Math.round(composeNumber(output.height, preset[1], 16, 3840));
  if (typeof output.width === "number" && typeof output.height !== "number") {
    height = Math.round(composeNumber(width * preset[1] / preset[0], preset[1], 16, 3840));
  } else if (typeof output.height === "number" && typeof output.width !== "number") {
    width = Math.round(composeNumber(height * preset[0] / preset[1], preset[0], 16, 3840));
  }
  const document: TimelineDoc = {
    width, height, fps: Math.round(composeNumber(output.fps, 30, 1, 60)),
    tracks: [{ id: `track_${timeline.timelineId}`, kind: "video", clips: videoClips }],
  };
  const subtitles: TimelineClip[] = [];
  for (const node of version.graph.nodes) {
    const params = composeNodeParams(node);
    const textOverlay = node.kind === "subtitle" || ((node.kind === "text" || node.kind === "script") && params.includeInVideo === true);
    const imageOverlay = node.kind === "image" && params.includeInVideo === true;
    if (node.kind !== "audio" && !textOverlay && !imageOverlay) continue;
    const shot = node.shotId ? shotStarts.get(node.shotId) : undefined;
    // An audio/subtitle attached to an unapproved shot must not leak into the cut.
    if (node.shotId && !shot) continue;
    const offset = composeNumber(params.startMs, composeNumber(params.startSeconds, 0) * 1000);
    const start = Math.round((shot?.start || 0) + offset);
    if (start >= cursor) continue;
    const asset = node.assetId ? project.assets[node.assetId] : undefined;
    const duration = Math.min(cursor - start, Math.round(composeNumber(params.durationMs,
      composeNumber(params.durationSeconds, asset?.durationSeconds || (shot ? shot.duration / 1000 : (cursor - start) / 1000), 0.1) * 1000, 100)));
    const clip: TimelineClip = { id: `clip_${node.nodeId}`, start_ms: start, duration_ms: duration, label: node.title };
    if (textOverlay) {
      const text = String(params.text ?? asset?.inlineText ?? "");
      if (!text.trim()) continue;
      const textStyle = params.textStyle && typeof params.textStyle === "object" ? params.textStyle : {};
      subtitles.push({ ...clip, text, ...(params.text_list ? { text_list: params.text_list as TimelineClip["text_list"] } : {}),
        style: { font_size: 48, color: "#ffffff", x: 0.5, y: 0.85, align: "center", ...textStyle } });
      if (asset) inputAssetIds.add(asset.assetId);
    } else if (imageOverlay) {
      if (asset?.kind !== "image" || (!asset.url && !asset.sourceDependency && !asset.librarySource)) throw new Error("Image source is unavailable.");
      inputAssetIds.add(asset.assetId);
      document.tracks.push({ id: `track_${node.nodeId}`, kind: "image", clips: [{ ...clip,
        ...(asset.sourceDependency ? { source_ref: { artifactId: asset.sourceDependency.artifactId, revisionId: asset.sourceDependency.revisionId, path: asset.sourceDependency.path } } : asset.librarySource ? { library_source: { ...asset.librarySource } } : { source_url: asset.url }),
        ...canvasImageAppearance(node as CanvasNodeDefinition & { params?: Record<string, unknown> }),
        x: composeNumber(params.x, 0.5, 0, 1), y: composeNumber(params.y, 0.5, 0, 1), scale: composeNumber(params.scale, 0.3, 0.05, 2),
      }] });
    } else {
      if (asset?.kind !== "audio" || (!asset.url && !asset.sourceDependency)) throw new Error("音轨缺少可用音频，请重新选择素材。");
      inputAssetIds.add(asset.assetId);
      document.tracks.push({ id: `track_${node.nodeId}`, kind: "audio", clips: [{ ...clip,
        ...(asset.sourceDependency ? { source_ref: { artifactId: asset.sourceDependency.artifactId,
          revisionId: asset.sourceDependency.revisionId, path: asset.sourceDependency.path } } : { source_url: asset.url }), in_ms: Math.round(composeNumber(params.inMs, 0)),
        ...(asset.durationSeconds ? { source_duration_ms: Math.round(asset.durationSeconds * 1000) } : {}),
        volume: composeNumber(params.volume, 1, 0, 2), muted: params.muted === true, speed: 1,
      }] });
    }
  }
  if (subtitles.length) document.tracks.push({ id: `subtitles_${timeline.timelineId}`, kind: "text", clips: subtitles });
  const receipt = project.artifactRevisionReceipt;
  const canvasSource: CanvasTimelineSource = {
    projectId: project.projectId, projectVersionId: project.headVersionId,
    ...(receipt ? { artifactId: receipt.artifactId, revisionId: receipt.revisionId } : {}),
    shots: approved.map(({ shot, take }) => ({ shotId: shot.shotId, takeId: take.takeId, assetId: take.assetId })),
    inputAssetIds: [...inputAssetIds],
  };
  if (document.tracks.length > 32 || document.tracks.reduce((count, track) => count + track.clips.length, 0) > 120) {
    throw new Error("成片的片段或音轨太多，请减少后重试。");
  }
  const normalized = normalizeTimelineDoc(document);
  const issue = timelineDocIssue(normalized);
  if (issue) throw new Error(issue);
  return { timelineId: timeline.timelineId, document: normalized, canvasSource,
    inputAssetIds: [...inputAssetIds], projectDocument: serializeVideoProjectEnvelope(normalized, canvasSource) };
}

export function configureTimelineNode(project: VideoProject, nodeId: string, field: string, value: unknown): VideoProject {
  let next = project;
  let node = head(project).graph.nodes.find((item) => item.nodeId === nodeId);
  if (!node && !nodeId) {
    const created = addProjectNode(project, "delivery", { x: 960, y: 120 });
    next = created.project;
    node = head(next).graph.nodes.find((item) => item.nodeId === created.nodeId);
  }
  const fields = node?.kind === "delivery" ? ["width", "height", "fps", "ratio"]
    : node?.kind === "audio" ? ["startMs", "durationMs", "volume"]
    : node?.kind === "subtitle" ? ["startMs", "durationMs"] : [];
  if (!node || !fields.includes(field)) throw new Error("无法修改这个合成参数。");
  if (field === "ratio") {
    if (!["16:9", "9:16", "1:1"].includes(String(value))) throw new Error("无法修改这个合成参数。");
  } else if (typeof value !== "number" || !Number.isFinite(value)
      || value < (field === "width" || field === "height" ? 16 : field === "fps" ? 1 : field === "durationMs" ? 100 : 0)
      || value > (field === "width" || field === "height" ? 3840 : field === "fps" ? 60 : field === "volume" ? 2 : 1800000)) {
    throw new Error("无法修改这个合成参数。");
  }
  const raw = node as CanvasNodeDefinition & { params?: Record<string, unknown> };
  const params = { ...(raw.params || {}), [field]: value };
  // Ratio changes select its matching size; explicit dimensions may then override it.
  if (field === "ratio") { delete params.width; delete params.height; delete params.aspectRatio; }
  return advanceProject(next, "canvas.timeline.configure", (version) => {
    const target = version.graph.nodes.find((item) => item.nodeId === node!.nodeId)!;
    Object.assign(target, { params });
  });
}

export function recordTimelineHandoff(project: VideoProject, item: { artifactId: string; revisionId: string }, projectVersionId: string): VideoProject {
  return { ...project, timelineHandoff: { ...item, projectVersionId } };
}

export function attachFinalRenderAsset(
  project: VideoProject,
  input: Omit<ProjectAsset, "assetId" | "immutable" | "createdAt">,
  parentAssetIds: string[],
  commandId: string,
): { project: VideoProject; asset: ProjectAsset; nodeId: string } {
  if (!parentAssetIds.length) {
    throw new Error("Final Render requires immutable input Asset lineage.");
  }
  for (const parentAssetId of parentAssetIds) {
    if (!project.assets[parentAssetId]) {
      throw new Error("Final Render input Asset is missing.");
    }
  }
  const registered = registerAsset(project, input);
  const current = head(registered.project);
  const existing = current.graph.nodes.find(
    (node) => node.kind === "delivery",
  );
  const nodeId = existing?.nodeId || stableId("node");
  let next = advanceProject(registered.project, commandId, (version) => {
    const delivery = version.graph.nodes.find(
      (node) => node.nodeId === nodeId,
    );
    if (delivery) {
      delivery.assetId = registered.asset.assetId;
      delivery.title = "Final render";
    } else {
      version.graph.nodes.push({
        nodeId,
        kind: "delivery",
        title: "Final render",
        position: {
          x:
            Math.max(
              0,
              ...version.graph.nodes.map((node) => node.position.x),
            ) + 520,
          y: 120,
        },
        assetId: registered.asset.assetId,
        localEditRecipe: [],
      });
    }
  });
  next = {
    ...next,
    lineage: [
      ...next.lineage,
      ...parentAssetIds.map((parentAssetId) => ({
        lineageId: stableId("lineage"),
        parentAssetId,
        childAssetId: registered.asset.assetId,
        relation: "rendered-from" as const,
        commandId,
        projectVersionId: next.headVersionId,
        createdAt: now(),
      })),
    ],
  };
  return { project: next, asset: registered.asset, nodeId };
}

export function splitGridAsset(
  project: VideoProject,
  nodeId: string,
  gridSize: 4 | 9 | 25,
  commandId: string,
): { project: VideoProject; assetIds: string[]; nodeIds: string[] } {
  const sourceNode = head(project).graph.nodes.find(
    (node) => node.nodeId === nodeId,
  );
  const sourceAsset =
    sourceNode?.assetId && project.assets[sourceNode.assetId];
  if (!sourceNode || sourceNode.kind !== "image" || !sourceAsset) {
    throw new Error("Grid split requires a selected Image Asset.");
  }
  const dimension = Math.sqrt(gridSize);
  if (!Number.isInteger(dimension)) {
    throw new Error("Grid split supports 4, 9, or 25 cells.");
  }
  let working = project;
  const lineageStart = (project.lineage || []).length;
  const derivedAssets: ProjectAsset[] = [];
  const recipes: LocalEditOperation[] = [];
  for (let index = 0; index < gridSize; index += 1) {
    const operation: LocalEditOperation = {
      operation: "grid-cell",
      parameters: {
        columns: dimension,
        rows: dimension,
        column: index % dimension,
        row: Math.floor(index / dimension),
      },
    };
    const derived = deriveLocalAsset(
      working,
      sourceAsset.assetId,
      operation,
      commandId,
    );
    working = derived.project;
    derivedAssets.push(derived.asset);
    recipes.push(operation);
  }
  const nodeIds = derivedAssets.map(() => stableId("node"));
  let next = advanceProject(working, commandId, (version) => {
    derivedAssets.forEach((asset, index) => {
      version.graph.nodes.push({
        ...clone(sourceNode),
        nodeId: nodeIds[index],
        title: `${sourceNode.title} · cell ${index + 1}`,
        position: {
          x:
            sourceNode.position.x +
            (index % dimension) * (nodeDimensions("image").width + 24),
          y:
            sourceNode.position.y +
            (Math.floor(index / dimension) + 1) *
              (nodeDimensions("image").height + 24),
        },
        assetId: asset.assetId,
        localEditRecipe: [recipes[index]],
      });
    });
    if (sourceNode.shotId) {
      const shot = version.shots.find(
        (candidate) => candidate.shotId === sourceNode.shotId,
      );
      const storyboard = version.storyboards.find(
        (candidate) => candidate.storyboardId === shot?.storyboardId,
      );
      if (storyboard) {
        storyboard.frameAssetIds = [
          ...storyboard.frameAssetIds,
          ...derivedAssets.map((asset) => asset.assetId),
        ];
      }
    }
  });
  next = {
    ...next,
    lineage: next.lineage.map((lineage, index) =>
      index >= lineageStart
        ? { ...lineage, projectVersionId: next.headVersionId }
        : lineage,
    ),
  };
  return {
    project: next,
    assetIds: derivedAssets.map((asset) => asset.assetId),
    nodeIds,
  };
}

export function structureScriptIntoProduction(
  project: VideoProject,
  nodeId: string,
): {
  project: VideoProject;
  sceneIds: string[];
  shotIds: string[];
  storyboardIds: string[];
} {
  const scriptNode = head(project).graph.nodes.find(
    (node) => node.nodeId === nodeId,
  );
  if (
    !scriptNode ||
    (scriptNode.kind !== "script" && scriptNode.kind !== "text")
  ) {
    throw new Error("Structure scenes requires a selected Script or Text node.");
  }
  const content = (scriptNode.text || scriptNode.prompt || "").trim();
  if (!content) throw new Error("Add script content before structuring scenes.");
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((block) => block.length > 0)
    .slice(0, 8);
  const normalizedBlocks = blocks.length ? blocks : [[content]];
  let remainingShots = 24;
  const plan = normalizedBlocks.map((lines, sceneIndex) => {
    const shotLines = lines.slice(0, Math.max(1, remainingShots));
    remainingShots -= shotLines.length;
    const sceneId = stableId("scene");
    return {
      sceneId,
      title: `Scene ${sceneIndex + 1}`,
      summary: lines.join(" ").slice(0, 500),
      shots: shotLines.map((line, shotIndex) => ({
        shotId: stableId("shot"),
        storyboardId: stableId("storyboard"),
        title: `Shot ${sceneIndex + 1}.${shotIndex + 1}`,
        description: line.slice(0, 2_000),
      })),
    };
  });
  const sceneIds = plan.map((scene) => scene.sceneId);
  const shotIds = plan.flatMap((scene) =>
    scene.shots.map((shot) => shot.shotId),
  );
  const storyboardIds = plan.flatMap((scene) =>
    scene.shots.map((shot) => shot.storyboardId),
  );
  const next = advanceProject(project, "canvas.script.structure", (version) => {
    for (const scene of plan) {
      version.scenes.push({
        sceneId: scene.sceneId,
        title: scene.title,
        summary: scene.summary,
        shotIds: scene.shots.map((shot) => shot.shotId),
        reviewStatus: "draft",
      });
      for (const shot of scene.shots) {
        version.shots.push({
          shotId: shot.shotId,
          sceneId: scene.sceneId,
          title: shot.title,
          description: shot.description,
          intendedDurationSeconds: 5,
          storyboardId: shot.storyboardId,
          takeIds: [],
          reviewStatus: "draft",
        });
        version.storyboards.push({
          storyboardId: shot.storyboardId,
          shotId: shot.shotId,
          frameAssetIds: [],
          reviewStatus: "draft",
        });
      }
    }
    const node = version.graph.nodes.find(
      (candidate) => candidate.nodeId === nodeId,
    );
    if (node) {
      node.sceneId = sceneIds[0];
      node.shotId = shotIds[0];
    }
    version.continuityQc = { status: "not-checked", issues: [] };
  });
  return { project: next, sceneIds, shotIds, storyboardIds };
}

export function reviewTake(
  project: VideoProject,
  takeId: string,
  decision: "approved" | "rejected" | "candidate" | "in-review",
  note = "",
): VideoProject {
  return advanceProject(project, `canvas.take.${decision}`, (version) => {
    const take = version.takes.find((candidate) => candidate.takeId === takeId);
    if (!take) throw new Error("The reviewed Take no longer exists.");
    const shot = version.shots.find(
      (candidate) => candidate.shotId === take.shotId,
    );
    if (!shot) throw new Error("The reviewed Take has no Shot.");
    if (decision === "approved") {
      for (const candidate of version.takes) {
        if (
          candidate.shotId === shot.shotId &&
          candidate.takeId !== take.takeId &&
          candidate.status === "approved"
        ) {
          candidate.status = "candidate";
        }
      }
      shot.approvedTakeId = take.takeId;
      shot.reviewStatus = "approved";
    } else if (shot.approvedTakeId === take.takeId) {
      delete shot.approvedTakeId;
      shot.reviewStatus = decision === "rejected" ? "rejected" : "in-review";
    } else if (decision === "in-review") {
      shot.reviewStatus = "in-review";
    }
    take.status = decision;
    take.reviewNote = note.slice(0, 2_000);
    version.continuityQc = { status: "not-checked", issues: [] };
  });
}

export function createCameraPlan(
  project: VideoProject,
  shotId?: string,
): { project: VideoProject; cameraId: string } {
  const current = head(project);
  const shot = current.shots.find((candidate) => candidate.shotId === shotId) ||
    current.shots[0];
  if (!shot) throw new Error("Create a Shot before planning a camera.");
  const cameraId = stableId("camera");
  const next = advanceProject(project, "canvas.director.camera-plan", (version) => {
    const target = version.shots.find(
      (candidate) => candidate.shotId === shot.shotId,
    );
    if (!target) throw new Error("The planned Shot no longer exists.");
    version.cameras.push({
      cameraId,
      shotId: target.shotId,
      lensMillimeters: 35,
      fieldOfViewDegrees: 54,
      position: [0, 1.6, 4],
      rotation: [0, 180, 0],
      focusTarget: [0, 1.4, 0],
      safeArea: "16:9",
      pathKeyframes: [
        {
          timeSeconds: 0,
          position: [0, 1.6, 4],
          rotation: [0, 180, 0],
        },
        {
          timeSeconds: target.intendedDurationSeconds,
          position: [0, 1.6, 3.25],
          rotation: [0, 180, 0],
        },
      ],
      planStatus: "ready",
    });
    target.cameraId = cameraId;
    version.continuityQc = { status: "not-checked", issues: [] };
  });
  return { project: next, cameraId };
}

export function buildTimelineFromApprovedTakes(
  project: VideoProject,
): { project: VideoProject; clipIds: string[] } {
  const current = head(project);
  const timeline = current.timelines[0] || { timelineId: `canvas_${project.projectId}`, title: project.title, clipIds: [] };
  const approved = approvedTimelineTakes(current);
  if (approved.length === 0) {
    throw new Error("Approve at least one Take before building the Timeline.");
  }
  const clipIds = approved.map(() => stableId("clip"));
  const next = advanceProject(project, "canvas.timeline.build", (version) => {
    let cursor = 0;
    const clips = approved.map(({ shot, take }, index): ClipDefinition => {
      const asset = project.assets[take.assetId];
      const duration = Math.max(
        0.1,
        asset?.durationSeconds || shot.intendedDurationSeconds,
      );
      const clip = {
        clipId: clipIds[index],
        timelineId: timeline.timelineId,
        takeId: take.takeId,
        assetId: take.assetId,
        startSeconds: cursor,
        durationSeconds: duration,
      };
      cursor += duration;
      return clip;
    });
    version.clips = [
      ...version.clips.filter(
        (clip) => clip.timelineId !== timeline.timelineId,
      ),
      ...clips,
    ];
    const target = version.timelines.find(
      (candidate) => candidate.timelineId === timeline.timelineId,
    );
    if (target) target.clipIds = clipIds;
    else version.timelines.push({ ...timeline, clipIds });
  });
  return { project: next, clipIds };
}

function continuityIssues(
  project: VideoProject,
  version: ProjectVersion,
): ContinuityQcIssue[] {
  const issues: ContinuityQcIssue[] = [];
  for (const shot of version.shots) {
    const storyboard = version.storyboards.find(
      (candidate) => candidate.storyboardId === shot.storyboardId,
    );
    if (!storyboard || storyboard.frameAssetIds.length === 0) {
      issues.push({
        issueId: stableId("qcIssue"),
        code: "MISSING_STORYBOARD_FRAME",
        severity: "warning",
        sceneId: shot.sceneId,
        shotId: shot.shotId,
        message: `${shot.title} has no approved storyboard frame.`,
      });
    }
    if (!shot.approvedTakeId) {
      issues.push({
        issueId: stableId("qcIssue"),
        code: "MISSING_APPROVED_TAKE",
        severity: "warning",
        sceneId: shot.sceneId,
        shotId: shot.shotId,
        message: `${shot.title} has no approved Take.`,
      });
    } else {
      const take = version.takes.find(
        (candidate) =>
          candidate.takeId === shot.approvedTakeId &&
          candidate.status === "approved",
      );
      if (!take || !project.assets[take.assetId]) {
        issues.push({
          issueId: stableId("qcIssue"),
          code: "BROKEN_APPROVED_TAKE",
          severity: "error",
          sceneId: shot.sceneId,
          shotId: shot.shotId,
          message: `${shot.title} references a missing approved Take Asset.`,
        });
      } else {
        const duration = project.assets[take.assetId].durationSeconds;
        if (
          duration &&
          Math.abs(duration - shot.intendedDurationSeconds) >
            Math.max(1, shot.intendedDurationSeconds * 0.25)
        ) {
          issues.push({
            issueId: stableId("qcIssue"),
            code: "DURATION_MISMATCH",
            severity: "warning",
            sceneId: shot.sceneId,
            shotId: shot.shotId,
            message: `${shot.title} differs from its planned duration.`,
          });
        }
      }
    }
    if (!shot.cameraId) {
      issues.push({
        issueId: stableId("qcIssue"),
        code: "MISSING_CAMERA_PLAN",
        severity: "warning",
        sceneId: shot.sceneId,
        shotId: shot.shotId,
        message: `${shot.title} has no Director camera plan.`,
      });
    }
  }
  return issues;
}

export function runContinuityQc(project: VideoProject): VideoProject {
  return advanceProject(project, "canvas.continuity-qc.check", (version) => {
    const issues = continuityIssues(project, version);
    version.continuityQc = {
      status: issues.some((issue) => issue.severity === "error")
        ? "blocked"
        : issues.length
          ? "warning"
          : "pass",
      checkedAt: now(),
      checkedProjectVersionId: version.versionId,
      issues,
    };
  });
}

export function compareProjectVersions(
  project: VideoProject,
  baseVersionId: string,
  targetVersionId = project.headVersionId,
): ProjectVersionComparison {
  const base = head({ ...project, headVersionId: baseVersionId });
  const target = head({ ...project, headVersionId: targetVersionId });
  if (!base || !target) throw new Error("History comparison version is missing.");
  const baseNodes = new Map(base.graph.nodes.map((node) => [node.nodeId, node]));
  const targetNodes = new Map(
    target.graph.nodes.map((node) => [node.nodeId, node]),
  );
  const baseAssetIds = new Set(
    base.graph.nodes
      .map((node) => node.assetId)
      .filter((assetId): assetId is string => Boolean(assetId)),
  );
  const targetAssetIds = new Set(
    target.graph.nodes
      .map((node) => node.assetId)
      .filter((assetId): assetId is string => Boolean(assetId)),
  );
  const baseTakes = new Map(base.takes.map((take) => [take.takeId, take]));
  return {
    baseVersionId,
    targetVersionId,
    addedNodeIds: [...targetNodes.keys()].filter((id) => !baseNodes.has(id)),
    removedNodeIds: [...baseNodes.keys()].filter((id) => !targetNodes.has(id)),
    changedNodeIds: [...targetNodes.entries()]
      .filter(([id, node]) => {
        const before = baseNodes.get(id);
        return before && JSON.stringify(before) !== JSON.stringify(node);
      })
      .map(([id]) => id),
    addedAssetIds: [...targetAssetIds].filter((id) => !baseAssetIds.has(id)),
    addedTakeIds: target.takes
      .filter((take) => !baseTakes.has(take.takeId))
      .map((take) => take.takeId),
    reviewChanges: target.takes
      .filter((take) => baseTakes.get(take.takeId)?.status !== take.status)
      .map((take) => ({
        takeId: take.takeId,
        from: baseTakes.get(take.takeId)?.status,
        to: take.status,
      })),
  };
}

/** 宿主页面行 / project-view → 画布投影。graph 是成品页，director 是专业编辑。 */
export function canvasViewFromHostPage(
  viewId: string,
): CanvasWorkspaceView | null {
  if (
    viewId === "artifact" ||
    viewId === "edit" ||
    viewId === "preview" ||
    viewId === "graph"
  ) {
    return "graph";
  }
  if (viewId === "pro" || viewId === "director") return "director";
  if (
    viewId === "storyboard" ||
    viewId === "timeline" ||
    viewId === "history"
  ) {
    return viewId;
  }
  return null;
}

export function workspaceViewForNodeKind(
  kind: CanvasNodeKind,
): CanvasWorkspaceView {
  if (kind === "script" || kind === "storyboard") return "storyboard";
  if (kind === "director") return "director";
  if (kind === "composite" || kind === "timeline" || kind === "delivery") {
    return "timeline";
  }
  return "graph";
}

export function projectToFlow(
  project: VideoProject,
  makeData: (
    node: CanvasNodeDefinition,
    asset: ProjectAsset | undefined,
    derivative: AssetDerivative | undefined,
  ) => CanvasNodeViewData,
): { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] } {
  const version = head(project);
  const nodes = version.graph.nodes.map((node) => {
    const asset = node.assetId ? project.assets[node.assetId] : undefined;
    const derivative = Object.values(project.derivatives || {}).find(
      (candidate) => candidate.assetId === node.assetId,
    );
    return {
      id: node.nodeId,
      type: "leovideo-media" as const,
      position: node.position,
      data: {
        ...makeData(effectiveCanvasNode(node), asset, derivative),
        params: clone((node as CanvasNodeDefinition & { params?: Record<string, unknown> }).params || {}),
        ...(node.legacySourceNode
          ? { legacySourceNode: clone(node.legacySourceNode) }
          : {}),
      },
      style: nodeDimensions(node.kind),
    };
  });
  const edges = version.graph.edges.map((edge) => ({
    id: edge.edgeId,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    animated: false,
    style: { stroke: "var(--vc-edge)", strokeWidth: 1.5 },
  }));
  return { nodes, edges };
}

export function projectProjection(project: VideoProject, view: ProjectView) {
  const version = head(project);
  const common = {
    projectId: project.projectId,
    headVersionId: project.headVersionId,
    revision: version.revision,
    view,
  };
  if (view === "canvas") {
    return {
      ...common,
      nodeIds: version.graph.nodes.map((node) => node.nodeId),
      edgeIds: version.graph.edges.map((edge) => edge.edgeId),
    };
  }
  if (view === "storyboard") {
    return {
      ...common,
      sceneIds: version.scenes.map((scene) => scene.sceneId),
      shotIds: version.shots.map((shot) => shot.shotId),
      storyboardIds: version.storyboards.map(
        (storyboard) => storyboard.storyboardId,
      ),
    };
  }
  if (view === "director") {
    return {
      ...common,
      shotIds: version.shots.map((shot) => shot.shotId),
      cameraIds: version.cameras.map((camera) => camera.cameraId),
    };
  }
  return {
    ...common,
    timelineIds: version.timelines.map((timeline) => timeline.timelineId),
    clipIds: version.clips.map((clip) => clip.clipId),
    takeIds: version.takes.map((take) => take.takeId),
  };
}

export function assertProjectBudgets(nodeCount: number, edgeCount: number): void {
  if (nodeCount > CANVAS_NODE_LIMIT || edgeCount > CANVAS_EDGE_LIMIT) {
    throw new Error(
      `Project exceeds the hard canvas budget (${CANVAS_NODE_LIMIT} nodes / ${CANVAS_EDGE_LIMIT} edges).`,
    );
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDurableVideoState(value: unknown): boolean {
  const durable = objectRecord(value);
  if (
    !durable ||
    !UUID_RE.test(String(durable.workspaceId || "")) ||
    !UUID_RE.test(String(durable.projectId || "")) ||
    !UUID_RE.test(String(durable.headVersionId || "")) ||
    !Number.isSafeInteger(durable.headEpoch) ||
    Number(durable.headEpoch) < 1 ||
    typeof durable.graphFingerprint !== "string" ||
    !durable.graphFingerprint ||
    typeof durable.syncedLocalVersionId !== "string" ||
    !durable.syncedLocalVersionId ||
    !Number.isSafeInteger(durable.syncedSelectionEpoch) ||
    Number(durable.syncedSelectionEpoch) < 0 ||
    !Array.isArray(durable.runs) ||
    durable.runs.length > 100
  ) {
    return false;
  }
  return durable.runs.every((item) => {
    const run = objectRecord(item);
    return Boolean(
      run &&
        UUID_RE.test(String(run.runId || "")) &&
        typeof run.commandRequestId === "string" &&
        run.commandRequestId.length > 0 &&
        run.commandRequestId.length <= 128 &&
        typeof run.nodeId === "string" &&
        run.nodeId.length > 0 &&
        UUID_RE.test(String(run.remoteProjectVersionId || "")) &&
        typeof run.status === "string" &&
        run.status.length > 0 &&
        run.status.length <= 80 &&
        typeof run.createdAt === "string" &&
        typeof run.updatedAt === "string",
    );
  });
}

function validArtifactRevisionReceipt(
  value: unknown,
  versions: Record<string, unknown>,
): boolean {
  const receipt = objectRecord(value);
  if (
    !receipt ||
    typeof receipt.saveId !== "string" ||
    !receipt.saveId ||
    receipt.saveId.length > 128 ||
    typeof receipt.projectVersionId !== "string" ||
    !receipt.projectVersionId ||
    !Object.hasOwn(versions, receipt.projectVersionId) ||
    typeof receipt.artifactId !== "string" ||
    !receipt.artifactId ||
    receipt.artifactId.length > 300 ||
    typeof receipt.revisionId !== "string" ||
    !receipt.revisionId ||
    receipt.revisionId.length > 300 ||
    typeof receipt.url !== "string" ||
    typeof receipt.receivedAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.receivedAt))
  ) {
    return false;
  }
  try {
    const parsed = new URL(receipt.url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function validVideoCanvasSourceDependency(
  value: unknown,
  asset: Record<string, unknown>,
): value is VideoCanvasSourceDependency {
  const dependency = objectRecord(value);
  const path = typeof dependency?.path === "string" ? dependency.path : "";
  const pathParts = path.split("/");
  const digest = typeof dependency?.sha256 === "string"
    ? dependency.sha256.toLowerCase().replace(/^sha256:/, "")
    : "";
  const mediaType = typeof dependency?.mediaType === "string"
    ? dependency.mediaType.toLowerCase().split(";", 1)[0]
    : "";
  const assetDigest = typeof asset.contentDigest === "string"
    ? asset.contentDigest.toLowerCase().replace(/^sha256:/, "")
    : "";
  const assetMediaType = typeof asset.mime === "string"
    ? asset.mime.toLowerCase().split(";", 1)[0]
    : "";
  return Boolean(
    dependency &&
      typeof dependency.artifactId === "string" &&
      UUID_RE.test(dependency.artifactId) &&
      typeof dependency.revisionId === "string" &&
      UUID_RE.test(dependency.revisionId) &&
      path.length <= 1_024 &&
      pathParts[0] === "assets" &&
      pathParts.length >= 2 &&
      pathParts.every((part) => part && part !== "." && part !== "..") &&
      !/[?#%\\\0]/.test(path) &&
      /^[a-f0-9]{64}$/.test(digest) &&
      digest === assetDigest &&
      /^(?:image|video|audio)\/[a-z0-9.+-]+$/.test(mediaType) &&
      mediaType === assetMediaType &&
      Number.isSafeInteger(dependency.byteSize) &&
      Number(dependency.byteSize) > 0 &&
      !(typeof asset.url === "string" && asset.url) &&
      !(typeof asset.previewUrl === "string" && asset.previewUrl),
  );
}

function isExpiringOrRuntimeLocator(value: string): boolean {
  const candidate = value.trim();
  if (/^(?:blob|data):/i.test(candidate)) return true;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return true;
    if (
      parsed.username ||
      parsed.password ||
      /\/v1\/artifact-renditions\/access\//i.test(parsed.pathname)
    ) {
      return true;
    }
    return [...parsed.searchParams.keys()].some((key) =>
      /^(?:token|access_token|signature|expires|expires_at|x-amz-|x-oss-)/i.test(key),
    );
  } catch {
    return true;
  }
}

/** Build an exact typed-commit snapshot without runtime blobs/grant URLs. */
export function projectForTypedArtifactCommit(
  project: VideoProject,
  artifactId: string,
): VideoProject {
  if (!UUID_RE.test(String(artifactId || ""))) {
    throw new Error("Video project commit requires a valid artifact root.");
  }
  const snapshot = projectSourceForStorage(project);
  for (const asset of Object.values(snapshot.assets)) {
    if (asset.sourceDependency) {
      if (
        asset.sourceDependency.artifactId !== artifactId ||
        !validVideoCanvasSourceDependency(asset.sourceDependency, asset as unknown as Record<string, unknown>)
      ) {
        throw new Error(`Asset ${asset.assetId} has an invalid or cross-root source dependency.`);
      }
      // Runtime preview bindings are held separately; the durable reference
      // is the only locator written into the Project source.
      delete asset.url;
      delete asset.previewUrl;
      continue;
    }
    if (asset.librarySource) continue;
    const locator = asset.url || asset.previewUrl || "";
    if (!locator && typeof asset.inlineText !== "string") {
      throw new Error(`Asset ${asset.assetId} has no durable source dependency.`);
    }
    if (locator && isExpiringOrRuntimeLocator(locator)) {
      throw new Error(`Asset ${asset.assetId} uses a runtime or expiring source URL.`);
    }
  }
  return snapshot;
}

function validOperationReceipts(
  value: unknown,
  versions: Record<string, unknown>,
  assets: Record<string, unknown>,
): value is Record<string, CanvasOperationReceipt> {
  const receipts = objectRecord(value);
  if (!receipts || Object.keys(receipts).length > 2_000) return false;
  return Object.entries(receipts).every(([receiptId, candidate]) => {
    const receipt = objectRecord(candidate);
    const pricing = receipt && objectRecord(receipt.pricing);
    return Boolean(
      receipt &&
        receipt.receiptId === receiptId &&
        typeof receipt.requestId === "string" &&
        receipt.requestId.length > 0 &&
        receipt.requestId.length <= 128 &&
        typeof receipt.requestFingerprint === "string" &&
        receipt.requestFingerprint.length > 0 &&
        typeof receipt.commandId === "string" &&
        receipt.commandId.length > 0 &&
        typeof receipt.projectVersionId === "string" &&
        Object.hasOwn(versions, receipt.projectVersionId) &&
        receipt.status === "succeeded" &&
        typeof receipt.provider === "string" &&
        typeof receipt.model === "string" &&
        pricing &&
        pricing.billing === "provider" &&
        typeof pricing.currency === "string" &&
        typeof pricing.estimated === "boolean" &&
        Array.isArray(receipt.inputAssetIds) &&
        receipt.inputAssetIds.every(
          (assetId) =>
            typeof assetId === "string" && Object.hasOwn(assets, assetId),
        ) &&
        Array.isArray(receipt.outputAssetIds) &&
        receipt.outputAssetIds.every(
          (assetId) =>
            typeof assetId === "string" && Object.hasOwn(assets, assetId),
        ) &&
        Array.isArray(receipt.externalRunIds) &&
        typeof receipt.startedAt === "string" &&
        typeof receipt.completedAt === "string",
    );
  });
}

/** Adapt official child-to-parent v2 records to the editor's in-memory view model. */
function normalizeProjectVersions(project: VideoProject): void {
  const fail = (path: string, reason: string): never => {
    throw new Error(`视频工程源文件不完整：${path} ${reason}。`);
  };
  for (const [versionId, version] of Object.entries(project.versions)) {
    const path = (name: string) => `${versionId}.${name}`;
    const graph = objectRecord(version?.graph);
    if (!graph) fail(path("graph"), "缺失");
    for (const name of ["nodes", "edges"] as const) {
      if (!Array.isArray(graph![name])) fail(path(`graph.${name}`), "必须是列表");
    }
    for (const name of ["scenes", "shots", "storyboards", "takes", "timelines", "clips", "cameras"] as const) {
      if (version[name] === undefined) (version[name] as unknown) = [];
      else if (!Array.isArray(version[name])) fail(path(name), "必须是列表");
    }
    const ids = (rows: object[], field: string, name: string) => {
      const result = new Set<string>();
      rows.forEach((row, index) => {
        const id = objectRecord(row)?.[field];
        if (typeof id !== "string" || !id) fail(path(`${name}[${index}].${field}`), "缺失");
        if (result.has(id as string)) fail(path(`${name}[${index}].${field}`), `重复引用 ${id}`);
        result.add(id as string);
      });
      return result;
    };
    const scenes = ids(version.scenes, "sceneId", "scenes");
    const shots = ids(version.shots, "shotId", "shots");
    const timelines = ids(version.timelines, "timelineId", "timelines");
    const nodes = ids(version.graph.nodes, "nodeId", "graph.nodes");
    ids(version.clips, "clipId", "clips");
    const storyboards = ids(version.storyboards, "storyboardId", "storyboards");
    const cameras = ids(version.cameras, "cameraId", "cameras");
    ids(version.takes, "takeId", "takes");
    const reference = (row: object, field: string, parentIds: Set<string>, rowPath: string) => {
      const id = objectRecord(row)?.[field];
      if (typeof id !== "string" || !parentIds.has(id)) {
        fail(path(`${rowPath}.${field}`), `引用的 ${String(id)} 不存在`);
      }
    };
    version.graph.nodes.forEach((node, index) => {
      if (!Array.isArray(node.localEditRecipe)) node.localEditRecipe = [];
      const official = node as CanvasNodeDefinition & { params?: Record<string, unknown> };
      if (node.text === undefined && typeof official.params?.text === "string") node.text = official.params.text;
      if (node.prompt === undefined && typeof official.params?.prompt === "string") node.prompt = official.params.prompt;
      if (!node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
        fail(path(`graph.nodes[${index}].position`), "缺失或坐标无效");
      }
    });
    version.graph.edges.forEach((edge, index) => {
      reference(edge, "sourceNodeId", nodes, `graph.edges[${index}]`);
      reference(edge, "targetNodeId", nodes, `graph.edges[${index}]`);
    });
    version.shots.forEach((shot, index) => {
      reference(shot, "sceneId", scenes, `shots[${index}]`);
      if (!Array.isArray(shot.takeIds)) {
        shot.takeIds = version.takes.filter((take) => take.shotId === shot.shotId).map((take) => take.takeId);
      }
      if (typeof shot.intendedDurationSeconds !== "number") {
        const ms = (shot as ShotDefinition & { durationMs?: number }).durationMs;
        shot.intendedDurationSeconds = typeof ms === "number" ? ms / 1000 : 0;
      }
      if (!shot.storyboardId) {
        const board = version.storyboards.find((candidate) =>
          (candidate as StoryboardDefinition & { sceneId?: string }).sceneId === shot.sceneId,
        );
        if (board) shot.storyboardId = board.storyboardId;
      }
      if (shot.storyboardId) reference(shot, "storyboardId", storyboards, `shots[${index}]`);
      if (shot.cameraId) reference(shot, "cameraId", cameras, `shots[${index}]`);
    });
    version.takes.forEach((take, index) => reference(take, "shotId", shots, `takes[${index}]`));
    version.scenes.forEach((scene) => {
      if (!Array.isArray(scene.shotIds)) {
        scene.shotIds = version.shots.filter((shot) => shot.sceneId === scene.sceneId)
          .sort((a, b) => Number((a as ShotDefinition & { order?: number }).order || 0) - Number((b as ShotDefinition & { order?: number }).order || 0))
          .map((shot) => shot.shotId);
      }
      if (!scene.summary && typeof (scene as SceneDefinition & { synopsis?: string }).synopsis === "string") {
        scene.summary = (scene as SceneDefinition & { synopsis?: string }).synopsis;
      }
    });
    version.storyboards.forEach((board, index) => {
      const official = board as StoryboardDefinition & { sceneId?: string; frames?: Array<{ shotId?: string; assetId?: string }> };
      if (official.sceneId) reference(official, "sceneId", scenes, `storyboards[${index}]`);
      if (official.shotId) reference(official, "shotId", shots, `storyboards[${index}]`);
      official.frames?.forEach((frame, frameIndex) => {
        if (frame.shotId) reference(frame, "shotId", shots, `storyboards[${index}].frames[${frameIndex}]`);
        if (frame.assetId && !Object.hasOwn(project.assets, frame.assetId)) {
          fail(path(`storyboards[${index}].frames[${frameIndex}].assetId`), `引用的 ${frame.assetId} 不存在`);
        }
      });
      if (!Array.isArray(board.frameAssetIds)) {
        board.frameAssetIds = Array.isArray(official.frames)
          ? official.frames.map((frame) => frame.assetId).filter((id): id is string => typeof id === "string")
          : [];
      }
    });
    version.clips.forEach((clip, index) => {
      reference(clip, "timelineId", timelines, `clips[${index}]`);
      const official = clip as ClipDefinition & { sourceShotId?: string; startMs?: number; endMs?: number };
      if (official.sourceShotId) reference(official, "sourceShotId", shots, `clips[${index}]`);
      if (typeof clip.startSeconds !== "number") clip.startSeconds = Number(official.startMs || 0) / 1000;
      if (typeof clip.durationSeconds !== "number") clip.durationSeconds =
        (Number(official.endMs || 0) - Number(official.startMs || 0)) / 1000;
    });
    version.timelines.forEach((timeline) => {
      if (!Array.isArray(timeline.clipIds)) {
        timeline.clipIds = version.clips.filter((clip) => clip.timelineId === timeline.timelineId)
          .sort((a, b) => {
            const left = a as ClipDefinition & { track?: string; startMs?: number };
            const right = b as ClipDefinition & { track?: string; startMs?: number };
            return String(left.track || "").localeCompare(String(right.track || "")) ||
              Number(left.startMs || 0) - Number(right.startMs || 0);
          }).map((clip) => clip.clipId);
      }
    });
    version.cameras.forEach((camera, index) => {
      reference(camera, "shotId", shots, `cameras[${index}]`);
      if (!Array.isArray(camera.pathKeyframes)) camera.pathKeyframes = [];
    });
  }
}

export function parseVideoProject(input: unknown): VideoProject {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("Project JSON is invalid.");
    }
  }
  const structural = parseVideoProjectDoc(value);
  if (!structural.ok) throw new Error(structural.error);
  const project = objectRecord(value);
  if (
    !project ||
    project.schema !== VIDEO_PROJECT_SCHEMA ||
    project.schemaVersion !== VIDEO_PROJECT_VERSION ||
    typeof project.projectId !== "string"
  ) {
    throw new Error("Input is not an oceanleo.video.project.v2 document.");
  }
  if (typeof project.headVersionId !== "string" || !project.headVersionId) {
    throw new Error("视频工程源文件不完整：headVersionId 缺失。");
  }
  const versions = objectRecord(project.versions);
  const assets = objectRecord(project.assets);
  const derivatives = project.derivatives === undefined ? {} : objectRecord(project.derivatives);
  const operationReceipts =
    project.operationReceipts === undefined
      ? {}
      : objectRecord(project.operationReceipts);
  const version = versions && objectRecord(versions[project.headVersionId]);
  const graph = version && objectRecord(version.graph);
  if (!versions) throw new Error("视频工程源文件不完整：versions 缺失。");
  if (!assets) throw new Error("视频工程源文件不完整：assets 缺失。");
  if (!derivatives) throw new Error("视频工程源文件不完整：derivatives 缺失。");
  if (!operationReceipts) throw new Error("视频工程源文件不完整：operationReceipts 缺失或格式错误。");
  if (project.lineage !== undefined && !Array.isArray(project.lineage)) throw new Error("视频工程源文件不完整：lineage 缺失或必须是列表。");
  if (!version) throw new Error(`视频工程源文件不完整：headVersionId ${project.headVersionId} 指向的版本不存在。`);
  if (!graph) throw new Error(`视频工程源文件不完整：${project.headVersionId}.graph 缺失。`);
  if (!Array.isArray(graph.nodes)) throw new Error(`视频工程源文件不完整：${project.headVersionId}.graph.nodes 必须是列表。`);
  if (!Array.isArray(graph.edges)) throw new Error(`视频工程源文件不完整：${project.headVersionId}.graph.edges 必须是列表。`);
  if (
    project.durable !== undefined &&
    !validDurableVideoState(project.durable)
  ) {
    throw new Error("Project durable Run metadata is malformed.");
  }
  if (
    project.artifactRevisionReceipt !== undefined &&
    !validArtifactRevisionReceipt(project.artifactRevisionReceipt, versions)
  ) {
    throw new Error("Project artifact/revision receipt is malformed.");
  }
  assertProjectBudgets(graph.nodes.length, graph.edges.length);
  for (const asset of Object.values(assets)) {
    const record = objectRecord(asset);
    if (
      !record ||
      (record.immutable !== undefined && record.immutable !== true) ||
      (record.assetId !== undefined && typeof record.assetId !== "string")
    ) {
      throw new Error("Project contains a mutable or malformed Asset.");
    }
    if (record.librarySource !== undefined && (!validTimelineLibrarySource(record.librarySource) || record.kind !== "image")) throw new Error("Invalid Library image reference.");
    if (
      record.sourceDependency !== undefined &&
      !validVideoCanvasSourceDependency(record.sourceDependency, record)
    ) {
      throw new Error(
        `Project Asset ${record.assetId} has a malformed stable source dependency.`,
      );
    }
  }
  const parsed = clone(value as VideoProject);
  normalizeProjectVersions(parsed);
  // Validation must never become a migration of the source document.
  return clone(value as VideoProject);
}

export function defaultNodeTitle(kind: CanvasNodeKind): string {
  return (
    {
      text: "Text",
      image: "Image",
      video: "Video",
      audio: "Audio",
      script: "Script",
      model: "Model",
      subtitle: "Subtitles",
      composite: "Composite",
      delivery: "Final render",
      director: "Director",
      storyboard: "Storyboard",
      timeline: "Timeline",
    } satisfies Record<CanvasNodeKind, string>
  )[kind];
}

export function nodeDimensions(kind: CanvasNodeKind): {
  width: number;
  height: number;
} {
  if (kind === "image") return { width: 432, height: 270 };
  if (kind === "video") return { width: 432, height: 243 };
  if (kind === "audio") return { width: 400, height: 144 };
  if (kind === "composite" || kind === "delivery") {
    return { width: 440, height: 190 };
  }
  if (
    kind === "director" ||
    kind === "storyboard" ||
    kind === "timeline"
  ) {
    return { width: 420, height: 248 };
  }
  return { width: 336, height: 180 };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicDigest(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const byte of bytes) {
    left ^= byte;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= byte + 0x9d;
    right = Math.imul(right, 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right
    .toString(16)
    .padStart(8, "0")}`;
}

function deterministicLegacyId(
  prefix: string,
  digest: string,
  legacyId: string,
): string {
  return `${prefix}_${deterministicDigest(`${digest}:${legacyId}`)}`;
}

interface MigrationIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  nodeId?: string;
}

export interface V1MigrationReport {
  sourceDigest: string;
  sourceDigestAlgorithm: "fnv1a-dual32";
  inputNodeCount: number;
  inputEdgeCount: number;
  migratedNodeCount: number;
  migratedEdgeCount: number;
  importedAssetCount: number;
  idMap: Record<string, string>;
  discardedRuntimeFields: Array<{
    nodeId: string;
    fields: string[];
  }>;
  inaccessibleMedia: Array<{ nodeId: string; url: string }>;
  externalTasksRequiringReview: Array<{ nodeId: string; taskId: string }>;
  issues: MigrationIssue[];
}

export type V1MigrationResult =
  | { ok: true; project: VideoProject; report: V1MigrationReport }
  | { ok: false; project: null; report: V1MigrationReport };

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mappedKind(value: unknown): CanvasNodeKind {
  if (value === "image" || value === "imageInput") return "image";
  if (value === "video" || value === "videoInput") return "video";
  if (value === "audioInput" || value === "bgm") return "audio";
  if (value === "script") return "script";
  if (value === "model") return "model";
  if (value === "subtitle") return "subtitle";
  if (value === "compose") return "composite";
  if (value === "output") return "delivery";
  return "text";
}

const VERSIONED_V1_WORKFLOW_SCHEMA = "oceanleo.video-canvas.v1";
const VERSIONED_V1_NODE_KINDS = new Set([
  "source", "trim", "concat", "overlay", "transition", "filter",
  "audio-mix", "text", "branch", "output",
]);
const VERSIONED_V1_PORT_TYPES = new Set([
  "video", "audio", "image", "text", "number", "any",
]);

function versionedV1NodeKind(
  node: Record<string, unknown>,
  assets: Map<string, Record<string, unknown>>,
): CanvasNodeKind {
  const kind = String(node.kind || "");
  if (kind === "source") {
    const assetId = typeof node.assetId === "string" ? node.assetId : "";
    const mediaType = String(assets.get(assetId)?.mediaType || "");
    if (mediaType.startsWith("image/")) return "image";
    if (mediaType.startsWith("audio/")) return "audio";
    if (mediaType.startsWith("video/")) return "video";
    const ports = objectRecord(node.ports);
    const outputs = Array.isArray(ports?.outputs) ? ports.outputs : [];
    const type = String(objectRecord(outputs[0])?.dataType || "");
    if (type === "image" || type === "audio" || type === "video" || type === "text") {
      return type;
    }
    return "model";
  }
  if (kind === "trim") return "video";
  if (kind === "audio-mix") return "audio";
  if (kind === "text") return "text";
  if (kind === "output") return "delivery";
  return "composite";
}

function versionedV1AssetKind(mediaType: string): AssetKind {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  return "text";
}

/**
 * The real workflow carrier is a versioned `schemaVersion` envelope. The
 * video core uses a different v2 graph model, so retain the complete source
 * and source records while projecting the active head for editing.
 */
function migrateVersionedV1Workflow(
  input: unknown,
  source: Record<string, unknown>,
  options: { sourceDependencies?: Array<VideoCanvasSourceDependency & { assetId: string }> } = {},
): V1MigrationResult {
  const sourceDigest = deterministicDigest(input);
  const versions = Array.isArray(source.versions) ? source.versions : [];
  const assets = Array.isArray(source.assets) ? source.assets : [];
  const rawHeadVersionId = source.headVersionId;
  const headRecord = versions.find((candidate) =>
    objectRecord(candidate)?.id === rawHeadVersionId,
  );
  const head = objectRecord(headRecord);
  const headGraph = objectRecord(head?.graph);
  const rawNodes = Array.isArray(headGraph?.nodes) ? headGraph.nodes : [];
  const rawEdges = Array.isArray(headGraph?.edges) ? headGraph.edges : [];
  const report: V1MigrationReport = {
    sourceDigest,
    sourceDigestAlgorithm: "fnv1a-dual32",
    inputNodeCount: rawNodes.length,
    inputEdgeCount: rawEdges.length,
    migratedNodeCount: 0,
    migratedEdgeCount: 0,
    importedAssetCount: 0,
    idMap: {},
    discardedRuntimeFields: [],
    inaccessibleMedia: [],
    externalTasksRequiringReview: [],
    issues: [],
  };
  const reject = (code: string, message: string): V1MigrationResult => {
    report.issues.push({ severity: "error", code, message });
    return { ok: false, project: null, report };
  };

  if (
    source.schemaVersion !== VERSIONED_V1_WORKFLOW_SCHEMA ||
    typeof rawHeadVersionId !== "string" ||
    !rawHeadVersionId ||
    !versions.length ||
    !head ||
    !headGraph ||
    !Array.isArray(headGraph.nodes) ||
    !Array.isArray(headGraph.edges) ||
    !Array.isArray(source.assets) ||
    !objectRecord(source.attribution) ||
    !Array.isArray(objectRecord(source.attribution)?.entries) ||
    !objectRecord(head.timeline)
  ) {
    return reject(
      "INVALID_V1_DOCUMENT",
      "Input is not a complete versioned oceanleo.video-canvas.v1 project.",
    );
  }

  const versionIds = new Set<string>();
  for (const [index, candidate] of versions.entries()) {
    const version = objectRecord(candidate);
    if (
      !version ||
      typeof version.id !== "string" ||
      !version.id ||
      versionIds.has(version.id)
    ) {
      return reject(
        "INVALID_V1_VERSION",
        `Version ${index} is malformed or has a duplicate ID.`,
      );
    }
    versionIds.add(version.id);
  }
  if (!versionIds.has(rawHeadVersionId)) {
    return reject(
      "INVALID_V1_HEAD_VERSION",
      `headVersionId ${rawHeadVersionId} does not exist in versions[].`,
    );
  }

  try {
    assertProjectBudgets(rawNodes.length, rawEdges.length);
  } catch (error) {
    return reject(
      "GRAPH_BUDGET_EXCEEDED",
      error instanceof Error ? error.message : "Graph is too large.",
    );
  }

  const assetsById = new Map<string, Record<string, unknown>>();
  for (const [index, candidate] of assets.entries()) {
    const asset = objectRecord(candidate);
    const id = asset?.id;
    const mediaType = String(asset?.mediaType || "");
    if (
      !asset ||
      typeof id !== "string" ||
      !id ||
      assetsById.has(id) ||
      typeof asset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(asset.sha256) ||
      !Number.isSafeInteger(asset.byteSize) ||
      Number(asset.byteSize) < 1 ||
      !/^(image\/(png|jpeg|webp)|video\/mp4|audio\/(mpeg|wav)|font\/woff2)$/.test(mediaType)
    ) {
      return reject(
        "INVALID_V1_ASSET",
        `Asset ${index} is malformed or has a duplicate ID.`,
      );
    }
    assetsById.set(id, asset);
  }

  const sourceDependenciesByAsset = new Map<
    string,
    VideoCanvasSourceDependency & { assetId: string }
  >();
  if (options.sourceDependencies !== undefined) {
    if (options.sourceDependencies.length !== assetsById.size) {
      return reject(
        "INCOMPLETE_ASSET_DEPENDENCY_CLOSURE",
        "The pinned source dependency set does not cover every v1 asset.",
      );
    }
    let dependencyRootId = "";
    for (const dependency of options.sourceDependencies) {
      const assetId = dependency.assetId;
      const sourceAsset = assetsById.get(assetId);
      if (
        !sourceAsset ||
        sourceDependenciesByAsset.has(assetId) ||
        (dependencyRootId && dependency.artifactId !== dependencyRootId) ||
        !validVideoCanvasSourceDependency(dependency, {
          contentDigest: sourceAsset.sha256,
          mime: sourceAsset.mediaType,
        })
      ) {
        return reject(
          "INVALID_ASSET_DEPENDENCY",
          `The pinned source dependency for ${assetId || "an asset"} does not match its source evidence.`,
        );
      }
      dependencyRootId ||= dependency.artifactId;
      sourceDependenciesByAsset.set(assetId, dependency);
    }
  }

  const nodeIds = new Set<string>();
  const sourceNodes = new Map<string, Record<string, unknown>>();
  for (const [index, candidate] of rawNodes.entries()) {
    const node = objectRecord(candidate);
    const ports = objectRecord(node?.ports);
    if (
      !node ||
      typeof node.id !== "string" ||
      !node.id ||
      nodeIds.has(node.id) ||
      typeof node.kind !== "string" ||
      !VERSIONED_V1_NODE_KINDS.has(node.kind) ||
      typeof node.x !== "number" || !Number.isFinite(node.x) ||
      typeof node.y !== "number" || !Number.isFinite(node.y) ||
      (node.params !== undefined && !objectRecord(node.params)) ||
      !ports ||
      !Array.isArray(ports.inputs) ||
      !Array.isArray(ports.outputs) ||
      (node.assetId !== undefined && node.assetId !== null &&
        (typeof node.assetId !== "string" || !assetsById.has(node.assetId)))
    ) {
      return reject(
        "INVALID_V1_GRAPH",
        `Node ${index} is malformed or references an unknown Asset.`,
      );
    }
    for (const [direction, list] of [["inputs", ports.inputs], ["outputs", ports.outputs]] as const) {
      const portNames = new Set<string>();
      for (const portCandidate of list) {
        const port = objectRecord(portCandidate);
        if (
          !port ||
          typeof port.name !== "string" ||
          !port.name ||
          portNames.has(port.name) ||
          typeof port.dataType !== "string" ||
          !VERSIONED_V1_PORT_TYPES.has(port.dataType)
        ) {
          return reject(
            "INVALID_V1_GRAPH",
            `Node ${index} has a malformed ${direction} port.`,
          );
        }
        portNames.add(port.name);
      }
    }
    if (typeof node.label !== "string" || !node.label.trim()) {
      return reject("INVALID_V1_GRAPH", `Node ${index} has no display label.`);
    }
    nodeIds.add(node.id);
    sourceNodes.set(node.id, node);
  }

  const edgeIds = new Set<string>();
  for (const [index, candidate] of rawEdges.entries()) {
    const edge = objectRecord(candidate);
    const from = typeof edge?.fromNodeId === "string" ? sourceNodes.get(edge.fromNodeId) : undefined;
    const to = typeof edge?.toNodeId === "string" ? sourceNodes.get(edge.toNodeId) : undefined;
    const fromPorts = objectRecord(from?.ports);
    const toPorts = objectRecord(to?.ports);
    const sourcePort = typeof edge?.fromPort === "string" ? edge.fromPort : "";
    const targetPort = typeof edge?.toPort === "string" ? edge.toPort : "";
    const sourcePortExists = Array.isArray(fromPorts?.outputs) &&
      fromPorts.outputs.some((port) => objectRecord(port)?.name === sourcePort);
    const targetPortExists = Array.isArray(toPorts?.inputs) &&
      toPorts.inputs.some((port) => objectRecord(port)?.name === targetPort);
    if (
      !edge ||
      typeof edge.id !== "string" ||
      !edge.id ||
      edgeIds.has(edge.id) ||
      !from ||
      !to ||
      !sourcePort ||
      !targetPort ||
      !sourcePortExists ||
      !targetPortExists ||
      (edge.condition !== undefined && typeof edge.condition !== "string")
    ) {
      return reject(
        "INVALID_V1_GRAPH",
        `Edge ${index} is malformed, dangling, or references a missing port.`,
      );
    }
    edgeIds.add(edge.id);
  }

  let project = createVideoProject(
    typeof source.title === "string" && source.title.trim()
      ? source.title
      : typeof head.note === "string" && head.note.trim()
        ? head.note
        : "Migrated video-canvas project",
    false,
  );
  const version = projectHead(project);
  if (typeof head.createdAt === "string" && Number.isFinite(Date.parse(head.createdAt))) {
    version.createdAt = head.createdAt;
  }
  version.reason = "project.migrate.video-canvas.v1";
  const mappedAssets: Record<string, ProjectAsset> = {};
  const sourcePathByAsset = new Map<string, string>();
  for (const candidate of rawNodes) {
    const node = objectRecord(candidate);
    const assetId = typeof node?.assetId === "string"
      ? node.assetId
      : typeof node?.id === "string" && assetsById.has(node.id)
        ? node.id
        : "";
    if (!assetId || !assetsById.has(assetId)) continue;
    const path = objectRecord(node?.params)?.path;
    if (typeof path !== "string") continue;
    if (sourcePathByAsset.has(assetId) && sourcePathByAsset.get(assetId) !== path) {
      return reject(
        "AMBIGUOUS_ASSET_DEPENDENCY_PATH",
        `V1 asset ${assetId} refers to more than one source path.`,
      );
    }
    sourcePathByAsset.set(assetId, path);
  }
  for (const asset of assetsById.values()) {
    const assetId = String(asset.id);
    const sourceDependency = sourceDependenciesByAsset.get(assetId);
    const sourcePath = sourcePathByAsset.get(assetId);
    if (
      sourceDependency &&
      (!sourcePath || sourceDependency.path !== sourcePath)
    ) {
      return reject(
        "ASSET_DEPENDENCY_PATH_MISMATCH",
        `V1 asset ${assetId} source path does not match its owner-pinned dependency.`,
      );
    }
    mappedAssets[assetId] = {
      assetId,
      kind: versionedV1AssetKind(String(asset.mediaType)),
      origin: "import",
      immutable: true,
      title: assetId,
      mime: String(asset.mediaType),
      contentDigest: String(asset.sha256),
      ...(sourceDependency
        ? {
            sourceDependency: {
              artifactId: sourceDependency.artifactId,
              revisionId: sourceDependency.revisionId,
              path: sourceDependency.path,
              sha256: sourceDependency.sha256,
              mediaType: sourceDependency.mediaType,
              byteSize: sourceDependency.byteSize,
            },
          }
        : {}),
      createdAt: version.createdAt,
      legacySourceAsset: clone(asset),
    };
  }
  version.graph.nodes = rawNodes.map((candidate) => {
    const node = objectRecord(candidate)!;
    const params = objectRecord(node.params) || {};
    const kind = versionedV1NodeKind(node, assetsById);
    const durationMs = params.durationMs;
    const durationSeconds = typeof durationMs === "number" && Number.isFinite(durationMs)
      ? durationMs / 1000
      : typeof params.durationSeconds === "number" && Number.isFinite(params.durationSeconds)
        ? params.durationSeconds
        : undefined;
    const ratio = params.ratio;
    return {
      nodeId: String(node.id),
      kind,
      title: String(node.label),
      position: { x: Number(node.x), y: Number(node.y) },
      ...(typeof node.assetId === "string" ? { assetId: node.assetId } : {}),
      ...(typeof params.prompt === "string" ? { prompt: params.prompt } : {}),
      ...(typeof params.text === "string" ? { text: params.text } : {}),
      ...(typeof params.model === "string" ? { model: params.model } : {}),
      ratio: ratio === "9:16" || ratio === "1:1" ? ratio : "16:9",
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      localEditRecipe: [],
      legacySourceNode: clone(node),
    };
  });
  version.graph.edges = rawEdges.map((candidate) => {
    const edge = objectRecord(candidate)!;
    return {
      edgeId: String(edge.id),
      sourceNodeId: String(edge.fromNodeId),
      targetNodeId: String(edge.toNodeId),
      sourceHandle: String(edge.fromPort),
      targetHandle: String(edge.toPort),
      legacySourceEdge: clone(edge),
    };
  });
  report.idMap = Object.fromEntries(
    rawNodes.map((candidate, index) => [
      `${String(objectRecord(candidate)?.id)}:${index}`,
      String(objectRecord(candidate)?.id),
    ]),
  );
  report.migratedNodeCount = version.graph.nodes.length;
  report.migratedEdgeCount = version.graph.edges.length;
  project = {
    ...project,
    versions: { [version.versionId]: version },
    assets: mappedAssets,
    migration: {
      sourceSchema: VERSIONED_V1_WORKFLOW_SCHEMA,
      sourceDigest,
      sourceDigestAlgorithm: "fnv1a-dual32",
      sourceHeadVersionId: rawHeadVersionId,
      sourceDocument: clone(source),
    },
  };
  return { ok: true, project, report };
}

export function migrateV1Workflow(
  input: unknown,
  options: { sourceDependencies?: Array<VideoCanvasSourceDependency & { assetId: string }> } = {},
): V1MigrationResult {
  const source = objectRecord(input);
  if (source?.schemaVersion === VERSIONED_V1_WORKFLOW_SCHEMA) {
    return migrateVersionedV1Workflow(input, source, options);
  }
  const rawNodes = Array.isArray(source?.nodes) ? source.nodes : [];
  const rawEdges = Array.isArray(source?.edges) ? source.edges : [];
  const sourceDigest = deterministicDigest(input);
  const report: V1MigrationReport = {
    sourceDigest,
    sourceDigestAlgorithm: "fnv1a-dual32",
    inputNodeCount: rawNodes.length,
    inputEdgeCount: rawEdges.length,
    migratedNodeCount: 0,
    migratedEdgeCount: 0,
    importedAssetCount: 0,
    idMap: {},
    discardedRuntimeFields: [],
    inaccessibleMedia: [],
    externalTasksRequiringReview: [],
    issues: [],
  };
  if (
    !source ||
    (source.schema !== undefined &&
      source.schema !== "oceanleo.video.canvas.v1") ||
    !Array.isArray(source.nodes) ||
    !Array.isArray(source.edges)
  ) {
    report.issues.push({
      severity: "error",
      code: "INVALID_V1_DOCUMENT",
      message: "Input is not an oceanleo.video.canvas.v1 graph.",
    });
    return { ok: false, project: null, report };
  }
  try {
    assertProjectBudgets(rawNodes.length, rawEdges.length);
  } catch (error) {
    report.issues.push({
      severity: "error",
      code: "GRAPH_BUDGET_EXCEEDED",
      message: error instanceof Error ? error.message : "Graph is too large.",
    });
    return { ok: false, project: null, report };
  }

  let project = createVideoProject(
    typeof source.title === "string" ? source.title : "Migrated LeoVideo project",
    false,
  );
  const version = projectHead(project);
  const usedNodeIds = new Set<string>();
  for (const [index, rawNode] of rawNodes.entries()) {
    const candidate = objectRecord(rawNode);
    const data = objectRecord(candidate?.data) || {};
    if (!candidate) {
      report.issues.push({
        severity: "warning",
        code: "INVALID_NODE_SKIPPED",
        message: `Node ${index} is not an object and was skipped.`,
      });
      continue;
    }
    const legacyId =
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : `missing-${index}`;
    let nodeId = legacyId;
    if (!candidate.id || usedNodeIds.has(nodeId)) {
      nodeId = deterministicLegacyId("node", sourceDigest, `${legacyId}:${index}`);
    }
    usedNodeIds.add(nodeId);
    report.idMap[`${legacyId}:${index}`] = nodeId;
    const position = objectRecord(candidate.position) || {};
    const runtimeFields = ["status", "progress", "error", "taskId"].filter(
      (field) => data[field] !== undefined,
    );
    if (runtimeFields.length) {
      report.discardedRuntimeFields.push({ nodeId, fields: runtimeFields });
    }
    if (typeof data.taskId === "string" && data.taskId) {
      report.externalTasksRequiringReview.push({
        nodeId,
        taskId: data.taskId,
      });
    }
    const mediaUrls = [
      data.imageUrl,
      data.videoUrl,
      data.audioUrl,
      ...(Array.isArray(data.outputImages) ? data.outputImages : []),
      ...(Array.isArray(data.outputVideos) ? data.outputVideos : []),
      ...(Array.isArray(data.outputAudios) ? data.outputAudios : []),
    ].filter((value): value is string => typeof value === "string" && Boolean(value));
    for (const url of mediaUrls) {
      report.inaccessibleMedia.push({ nodeId, url });
      report.issues.push({
        severity: "error",
        code: "MEDIA_REQUIRES_VERIFIED_IMPORT",
        nodeId,
        message:
          "A v1 media URL requires owner, SSRF, MIME, size, and digest verification before it can become an Asset.",
      });
    }
    version.graph.nodes.push({
      nodeId,
      kind: mappedKind(data.kind),
      title:
        typeof data.title === "string" && data.title
          ? data.title
          : defaultNodeTitle(mappedKind(data.kind)),
      position: {
        x: Number.isFinite(position.x) ? Number(position.x) : index * 360,
        y: Number.isFinite(position.y) ? Number(position.y) : 0,
      },
      prompt: typeof data.prompt === "string" ? data.prompt : undefined,
      text:
        typeof data.outputText === "string"
          ? data.outputText
          : typeof data.subtitleText === "string"
            ? data.subtitleText
            : undefined,
      model: typeof data.model === "string" ? data.model : undefined,
      ratio:
        data.ratio === "9:16" || data.ratio === "1:1" ? data.ratio : "16:9",
      durationSeconds:
        typeof data.duration === "number" ? data.duration : undefined,
      localEditRecipe: [],
    });
  }

  const nodeIds = new Set(version.graph.nodes.map((node) => node.nodeId));
  const usedEdgeIds = new Set<string>();
  for (const [index, rawEdge] of rawEdges.entries()) {
    const candidate = objectRecord(rawEdge);
    if (
      !candidate ||
      typeof candidate.source !== "string" ||
      typeof candidate.target !== "string"
    ) {
      report.issues.push({
        severity: "warning",
        code: "INVALID_EDGE_SKIPPED",
        message: `Edge ${index} is malformed and was skipped.`,
      });
      continue;
    }
    const sourceId =
      version.graph.nodes.find((node) => node.nodeId === candidate.source)
        ?.nodeId ||
      report.idMap[`${candidate.source}:${rawNodes.findIndex(
        (node) => objectRecord(node)?.id === candidate.source,
      )}`];
    const targetId =
      version.graph.nodes.find((node) => node.nodeId === candidate.target)
        ?.nodeId ||
      report.idMap[`${candidate.target}:${rawNodes.findIndex(
        (node) => objectRecord(node)?.id === candidate.target,
      )}`];
    if (!sourceId || !targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      report.issues.push({
        severity: "warning",
        code: "DANGLING_EDGE_SKIPPED",
        message: `Edge ${index} references a skipped node.`,
      });
      continue;
    }
    const legacyEdgeId =
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : `missing-edge-${index}`;
    let edgeId = legacyEdgeId;
    if (!candidate.id || usedEdgeIds.has(edgeId)) {
      edgeId = deterministicLegacyId(
        "edge",
        sourceDigest,
        `${legacyEdgeId}:${index}`,
      );
    }
    usedEdgeIds.add(edgeId);
    version.graph.edges.push({
      edgeId,
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      sourceHandle:
        typeof candidate.sourceHandle === "string"
          ? candidate.sourceHandle
          : undefined,
      targetHandle:
        typeof candidate.targetHandle === "string"
          ? candidate.targetHandle
          : undefined,
    });
  }
  report.migratedNodeCount = version.graph.nodes.length;
  report.migratedEdgeCount = version.graph.edges.length;
  if (report.issues.some((issue) => issue.severity === "error")) {
    return { ok: false, project: null, report };
  }
  project = {
    ...project,
    versions: { [version.versionId]: version },
    migration: {
      sourceSchema: "oceanleo.video.canvas.v1",
      sourceDigest,
      sourceDigestAlgorithm: "fnv1a-dual32",
    },
  };
  return { ok: true, project, report };
}
