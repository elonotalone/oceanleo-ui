"use client";

import { authed, type AgentApiResult } from "../../../lib/agent";
import { fetchMediaBlob } from "../../../lib/media-proxy";
import { resolveVideoTimelineReferences } from "../../video-editor/video-timeline-source";

import {
  CANVAS_IMAGE_OPERATION_CAPABILITIES,
  CanvasAdapterError,
  executeCanvasImageSemanticOperation,
  generateImage,
  generateAudio,
  getDurableVideoRun,
  generateScript,
  generateText,
  type CanvasAdapterCancellation,
  type CanvasImageProviderOperation,
  type CanvasProviderProgress,
} from "./canvas-gateway";
import { renderComposedCanvas, handoffCanvasTimeline } from "./canvas-delivery-client";
import {
  refreshDurableVideoRun,
  reconcileDurableVideoRun,
  durableRunNeedsPolling,
  getPreparedVideoQuote,
  prepareVideoQuote,
  requestDurableVideoRunCancel,
  submitDurableVideoGeneration,
} from "./durable-video-adapter";
import {
  legacyExecutionBlockReason,
  updateLegacyParameter,
  updateLegacyPosition,
  updateLegacyTitle,
} from "./legacy-workflow-node";
import {
  canvasImageAppearance,
  effectiveCanvasNode,
  advanceProject,
  addProjectNode,
  canvasUpstreamOrder,
  CanvasInputError,
  canvasNodeHasOutput,
  resolveCanvasInputs,
  withCanvasNodeGeneration,
  attachFinalRenderAsset,
  attachGeneratedAsset,
  attachGeneratedAssetSet,
  buildTimelineFromApprovedTakes,
  createCameraPlan,
  deriveLocalAsset,
  deterministicDigest,
  operationReceiptForRequest,
  projectHead,
  recordTimelineHandoff,
  configureTimelineNode,
  recordCanvasOperationReceipt,
  registerAsset,
  removeProjectNode,
  reviewTake,
  runContinuityQc,
  splitGridAsset,
  stableId,
  structureScriptIntoProduction,
  updateProjectNode,
  type CanvasNodeDefinition,
  type CanvasNodeKind,
  type CanvasWorkspaceView,
  type LocalEditOperation,
  type ProjectAsset,
  type VideoProject,
} from "./project-model";
import { TIMELINE_FONT_FAMILIES, type TimelineClip, type TimelineTextStyle } from "../../video-editor/types";
import { timelineTextCasePatch, timelineTextListPatch, validTimelineLibrarySource } from "../../video-editor/timeline-model";
import { canvasCompositionDocument, canvasNodeTextClip } from "./canvas-selection-adapter";
export { canvasCompositionDocument } from "./canvas-selection-adapter";

export type CanvasCommandSurface =
  | "compact"
  | "toolbar"
  | "node-menu"
  | "keyboard"
  | "protocol"
  | "context-more";
export type CanvasCommandScope = "selection" | "canvas" | "project" | "run";
export type CanvasCommandStatus =
  | "pending"
  | "succeeded"
  | "accepted"
  | "rejected"
  | "disabled"
  | "cancelled"
  | "failed";

export interface CanvasCostSummary {
  billing: "none" | "estimated" | "actual";
  currency: string;
  estimatedAmount: number | null;
  actualAmount?: number | null;
  label: string;
  provider?: string;
  model?: string;
}

export type CanvasCapabilityReasonCode =
  | "MISSING_SHARED_OPERATION"
  | "MISSING_DURABLE_PROVIDER"
  | "MISSING_SOURCE_ASSET"
  | "MISSING_REQUIRED_INPUT"
  | "INVALID_SELECTION"
  | "NO_REGISTERED_MATERIAL_SOURCE"
  | "CAPABILITY_DISCOVERY_PENDING"
  | "LEGACY_WORKFLOW_UNSUPPORTED";

export interface CanvasCommandDisclosure {
  provider: string;
  model: string;
  input: string;
  cost: string;
  contract: string;
}

export interface CanvasCommandDefinition {
  commandId: string;
  scope: CanvasCommandScope;
  surfaces: CanvasCommandSurface[];
  mode?: "retouch" | "generate";
  execution: "local" | "server";
  billing: "none" | "estimated";
  cancellation?: "client-abort" | "cooperative";
  inputSchema: string;
  mutates: "session" | "project" | "asset" | "runtime" | "none";
  label: string;
  disclosure?: (
    environment: CanvasCommandEnvironment,
    args: Record<string, unknown>,
  ) => CanvasCommandDisclosure;
  availability?: (
    environment: CanvasCommandEnvironment,
    args: Record<string, unknown>,
  ) => CanvasCommandAvailability;
  handler: CanvasCommandHandler;
}

export interface CanvasCommandAvailability {
  enabled: boolean;
  reason?: string;
  reasonCode?: CanvasCapabilityReasonCode;
  missingContract?: string;
  hidden?: boolean;
}

export interface CanvasCommandRequest {
  commandId: string;
  requestId: string;
  projectVersionId: string;
  selectionEpoch: number;
  args?: Record<string, unknown>;
  surface: CanvasCommandSurface;
}

export interface CanvasCommandResult {
  commandId: string;
  requestId: string;
  projectVersionId: string;
  selectionEpoch: number;
  status: Exclude<CanvasCommandStatus, "pending">;
  message: string;
  assetIds: string[];
  runIds: string[];
  receiptIds: string[];
  cost: CanvasCostSummary;
  progress?: CanvasProviderProgress;
  cancellation?: CanvasAdapterCancellation;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

export interface CanvasRemoveBackgroundResponse {
  image: string;
  model: string;
  credits_spent: number;
  request_id: string;
}

export interface CanvasCommandEnvironment {
  getProject(): VideoProject;
  translate?(source: string, vars?: Record<string, string | number>): string;
  resolveAssetUrl?(asset: ProjectAsset): Promise<string>;
  reportNodeProgress?(nodeId: string, status: string, message?: string): void;
  setProject(project: VideoProject): void;
  getSelectedNodeId(): string | null;
  setSelectedNodeId(nodeId: string | null): void;
  getSelectionEpoch(): number;
  getImageMode(): "retouch" | "generate";
  setImageMode(mode: "retouch" | "generate"): void;
  getWorkspaceView(): CanvasWorkspaceView;
  setWorkspaceView(view: CanvasWorkspaceView): void;
  openMaterialLibrary(): void;
  pickLibraryImage?(nodeId: string): Promise<import("../../library-data").LibraryItem | null>;
  refreshLibraryImage?: typeof import("../../artifact-client").refreshArtifactRendition;
  requestRemoveBackground?: (path: string, init: RequestInit) => Promise<AgentApiResult<CanvasRemoveBackgroundResponse>>;
  readRemoveBackgroundImage?: typeof fetchMediaBlob;
  resolveImageReferences?: typeof resolveVideoTimelineReferences;
  requestMediaUpload(): void;
  getDurableVideoCapability(): CanvasCommandAvailability;
  getCommandSignal?(requestId: string): AbortSignal | undefined;
  reportCommandProgress?(
    requestId: string,
    progress: CanvasProviderProgress,
  ): void;
  setProjectMetadata(project: VideoProject): void;
  setStatus(message: string): void;
  saveProject(request?: {
    saveId?: string;
  }): Promise<{
    saveId: string;
    projectVersionId: string;
    revision: number;
    url: string;
  }>;
  screenCenter(): { x: number; y: number };
}

interface HandlerOutcome {
  appliedHeadVersionId?: string;
  status?: "succeeded" | "accepted";
  message: string;
  project?: VideoProject;
  selectedNodeId?: string | null;
  assetIds?: string[];
  runIds?: string[];
  receiptIds?: string[];
  cost?: CanvasCostSummary;
  progress?: CanvasProviderProgress;
}

type CanvasCommandHandler = (
  environment: CanvasCommandEnvironment,
  args: Record<string, unknown>,
  request: CanvasCommandRequest,
) => Promise<HandlerOutcome> | HandlerOutcome;

const NO_COST: CanvasCostSummary = {
  billing: "none",
  currency: "USD",
  estimatedAmount: 0,
  label: "No charge",
};

const PROVIDER_PRICE: CanvasCostSummary = {
  billing: "estimated",
  currency: "OCEANLEO_CREDITS",
  estimatedAmount: null,
  label:
    "Provider-metered; exact credits and model are returned in the immutable receipt",
  provider: "OceanLeo media gateway",
  model: "Platform default",
};

export const NODE_MENU_ENTRY_IDS = [
  "text",
  "image",
  "video",
  "audio",
  "script",
  "composite",
  "director",
  "storyboard",
  "model",
  "subtitle",
  "delivery",
  "timeline",
  "material-library",
  "upload",
  "history",
] as const;

export type NodeMenuEntryId = (typeof NODE_MENU_ENTRY_IDS)[number];

export const NODE_MENU_CAPABILITIES: Record<
  NodeMenuEntryId,
  {
    label: string;
    purpose: string;
    aliases: string[];
    visual: string;
    enabled: boolean;
    commandId: string;
    commandArgs?: Record<string, unknown>;
    disabledReason?: string;
    disabledReasonCode?: CanvasCapabilityReasonCode;
  }
> = {
  text: {
    label: "Text",
    purpose: "Write titles, notes, and prompts",
    aliases: ["copy", "caption"],
    visual: "TX",
    enabled: true,
    commandId: "canvas.node.create",
    commandArgs: { entryId: "text" },
  },
  image: {
    label: "Image",
    purpose: "Place or generate an immutable image",
    aliases: ["frame", "poster", "photo"],
    visual: "IM",
    enabled: true,
    commandId: "canvas.node.create",
    commandArgs: { entryId: "image" },
  },
  video: {
    label: "Video",
    purpose: "Place a take or submit a generation",
    aliases: ["clip", "take", "movie"],
    visual: "VD",
    enabled: true,
    commandId: "canvas.node.create",
    commandArgs: { entryId: "video" },
  },
  audio: {
    label: "Audio",
    purpose: "Place dialogue, sound, or music",
    aliases: ["sound", "music", "voice"],
    visual: "AU",
    enabled: true,
    commandId: "canvas.node.create",
    commandArgs: { entryId: "audio" },
  },
  script: {
    label: "Script",
    purpose: "Develop scenes, shots, and beats",
    aliases: ["story", "shot list"],
    visual: "SC",
    enabled: true,
    commandId: "canvas.node.create",
    commandArgs: { entryId: "script" },
  },
  composite: {
    label: "Composite / Timeline",
    purpose: "Arrange approved takes on the Project timeline",
    aliases: ["render", "timeline", "edit"],
    visual: "CP",
    enabled: true,
    commandId: "canvas.node.create",
    commandArgs: { entryId: "composite" },
  },
  director: {
    label: "Director / Previs",
    purpose: "Plan lenses, camera paths, framing, and safe areas",
    aliases: ["camera", "previs", "lens"],
    visual: "DR",
    enabled: true,
    commandId: "canvas.node.create",
    commandArgs: { entryId: "director" },
  },
  storyboard: {
    label: "Storyboard",
    purpose: "Review scenes, shots, frames, and candidate takes",
    aliases: ["shots", "frames", "review"],
    visual: "SB",
    enabled: true,
    commandId: "canvas.node.create",
    commandArgs: { entryId: "storyboard" },
  },
  model: { label: "Model", purpose: "Model", aliases: [], visual: "MD", enabled: true, commandId: "canvas.node.create", commandArgs: { entryId: "model" } },
  subtitle: { label: "Subtitles", purpose: "Subtitles", aliases: [], visual: "ST", enabled: true, commandId: "canvas.node.create", commandArgs: { entryId: "subtitle" } },
  delivery: { label: "Final render", purpose: "Final render", aliases: [], visual: "FR", enabled: true, commandId: "canvas.node.create", commandArgs: { entryId: "delivery" } },
  timeline: { label: "Timeline", purpose: "Timeline", aliases: [], visual: "TL", enabled: true, commandId: "canvas.node.create", commandArgs: { entryId: "timeline" } },
  "material-library": {
    label: "Material library",
    purpose: "Open registered shared materials with Insert / Replace history",
    aliases: ["assets", "library", "素材库"],
    visual: "ML",
    enabled: true,
    commandId: "canvas.panel.material-library.open",
  },
  upload: {
    label: "Upload media",
    purpose: "Upload an image, video, or audio Asset through the shared gateway",
    aliases: ["file", "import", "上传"],
    visual: "UP",
    enabled: true,
    commandId: "canvas.asset.upload.request",
  },
  history: {
    label: "History",
    purpose: "Compare versions or restore a version as a new edit",
    aliases: ["versions", "diff", "restore"],
    visual: "HI",
    enabled: true,
    commandId: "canvas.session.view.set",
    commandArgs: { view: "history" },
  },
};

const CREATE_KIND_BY_ENTRY: Partial<
  Record<NodeMenuEntryId, CanvasNodeKind>
> = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  script: "script",
  composite: "composite",
  director: "director",
  storyboard: "storyboard",
  model: "model", subtitle: "subtitle", delivery: "delivery", timeline: "timeline",
};

function selectedNode(
  environment: CanvasCommandEnvironment,
): CanvasNodeDefinition | undefined {
  const selectedNodeId = environment.getSelectedNodeId();
  if (!selectedNodeId) return undefined;
  const node = projectHead(environment.getProject()).graph.nodes.find(
    (node) => node.nodeId === selectedNodeId,
  );
  return node ? effectiveCanvasNode(node) : undefined;
}

function selectedAsset(
  environment: CanvasCommandEnvironment,
): ProjectAsset | undefined {
  const node = selectedNode(environment);
  return node?.assetId
    ? environment.getProject().assets[node.assetId]
    : undefined;
}

function providerModelName(value?: string): string | undefined {
  return value && !/^(?:platform[- ]default|平台默认)$/i.test(value) ? value : undefined;
}

function generationInputs(environment: CanvasCommandEnvironment, node: CanvasNodeDefinition, args: Record<string, unknown>) {
  const project = environment.getProject();
  const version = projectHead(project);
  const requested = typeof args.prompt === "string" && args.prompt.trim() ? { ...node, prompt: args.prompt.trim() } : node;
  const contextual = { ...project, versions: { ...project.versions, [project.headVersionId]: { ...version, graph: { ...version.graph, nodes: version.graph.nodes.map((item) => item.nodeId === node.nodeId ? requested : item) } } } };
  const resolved = resolveCanvasInputs(contextual, node.nodeId);
  if ((["script", "text", "audio"].includes(node.kind) && resolved.inputs.some((input) => input.type !== "text")) || (node.kind === "image" && (resolved.audio.length || resolved.videos.length))) throw new Error("此节点不支持连接的媒体类型。");
  return resolved;
}

function imageDisclosure(
  environment: CanvasCommandEnvironment,
  args: Record<string, unknown>,
  contract = "POST /v1/images/generate",
  cost = "Provider-priced; no preflight quote",
): CanvasCommandDisclosure {
  const node = selectedNode(environment);
  const asset = selectedAsset(environment);
  const requestedModel = requireString(args, "model", node?.model || "");
  return {
    provider: "OceanLeo image gateway",
    model: requestedModel || "Platform default",
    input: asset
      ? `Immutable Asset ${asset.assetId} + prompt`
      : "Prompt + immutable Project context",
    cost,
    contract,
  };
}

function requireString(
  args: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  return typeof args[key] === "string" ? args[key].trim() : fallback;
}

function commandRequestFingerprint(request: CanvasCommandRequest): string {
  return deterministicDigest({
    commandId: request.commandId,
    projectVersionId: request.projectVersionId,
    selectionEpoch: request.selectionEpoch,
    args: request.args || {},
  });
}

function localImageAvailability(
  environment: CanvasCommandEnvironment,
): CanvasCommandAvailability {
  const node = selectedNode(environment);
  if (!node || node.kind !== "image") {
    return {
      enabled: false,
      reasonCode: "INVALID_SELECTION",
      reason: "Select an Image node first.",
    };
  }
  if (!selectedAsset(environment)) {
    return {
      enabled: false,
      reasonCode: "MISSING_SOURCE_ASSET",
      reason: "Retouch needs an immutable source Asset.",
    };
  }
  return { enabled: true };
}

function imageGenerationAvailability(
  environment: CanvasCommandEnvironment,
  args: Record<string, unknown>,
): CanvasCommandAvailability {
  const node = selectedNode(environment);
  if (!node || node.kind !== "image") {
    return {
      enabled: false,
      reasonCode: "INVALID_SELECTION",
      reason: "Select an Image node first.",
    };
  }
  const prompt = generationInputs(environment, node, args).prompt;
  return prompt
    ? { enabled: true }
    : {
        enabled: false,
        reasonCode: "MISSING_REQUIRED_INPUT",
        reason: "Add an image prompt before Generate.",
      };
}

function scriptGenerationAvailability(
  environment: CanvasCommandEnvironment,
  args: Record<string, unknown>,
): CanvasCommandAvailability {
  const node = selectedNode(environment);
  if (!node || (node.kind !== "script" && node.kind !== "text")) {
    return {
      enabled: false,
      reasonCode: "INVALID_SELECTION",
      reason: "Select a Text or Script node first.",
    };
  }
  const prompt = generationInputs(environment, node, args).prompt;
  return prompt
    ? { enabled: true }
    : {
        enabled: false,
        reasonCode: "MISSING_REQUIRED_INPUT",
        reason: "Add a prompt before Generate.",
      };
}

function videoGenerationAvailability(
  environment: CanvasCommandEnvironment,
  args: Record<string, unknown>,
): CanvasCommandAvailability {
  const node = selectedNode(environment);
  if (!node || node.kind !== "video") {
    return {
      enabled: false,
      reasonCode: "INVALID_SELECTION",
      reason: "Select a Video node first.",
    };
  }
  const durable = environment.getDurableVideoCapability();
  if (!durable.enabled) {
    return {
      enabled: false,
      reasonCode:
        durable.reasonCode ||
        (durable.reason?.includes("Checking")
          ? "CAPABILITY_DISCOVERY_PENDING"
          : "MISSING_DURABLE_PROVIDER"),
      missingContract:
        durable.missingContract || "GET /v1/video-canvas/capabilities",
      reason:
        durable.reason || "Durable video generation is not available.",
    };
  }
  const active = environment.getProject().durable?.runs.find((run) => run.nodeId === node.nodeId && durableRunNeedsPolling(run));
  if (active) return { enabled: false, reason: "这个节点的视频仍在生成。" };
  const inputs = generationInputs(environment, node, args);
  if (!inputs.prompt && !inputs.images.length) return { enabled: false, reasonCode: "MISSING_REQUIRED_INPUT", reason: "添加提示词或连接首帧图片。" };
  if (!getPreparedVideoQuote(environment.getProject(), node)) return { enabled: false, reasonCode: "CAPABILITY_DISCOVERY_PENDING", reason: "正在估算视频费用…" };
  return { enabled: true };
}

function sourceImageAvailability(
  environment: CanvasCommandEnvironment,
): CanvasCommandAvailability {
  const node = selectedNode(environment);
  if (!node || node.kind !== "image") {
    return {
      enabled: false,
      reasonCode: "INVALID_SELECTION",
      reason: "Select an Image node first.",
    };
  }
  const asset = selectedAsset(environment);
  if (!asset?.url) {
    return {
      enabled: false,
      reasonCode: "MISSING_SOURCE_ASSET",
      reason:
        "This semantic image command requires an immutable source Asset with a durable URL.",
    };
  }
  return { enabled: true };
}

function numericArg(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = Number(args[key]);
  return Number.isFinite(value) ? value : undefined;
}

function canvasProviderCost(input: {
  provider: string;
  model: string;
  pricing: {
    amount: number | null;
    currency: string;
    estimated: boolean;
    label: string;
  };
}): CanvasCostSummary {
  return {
    billing: input.pricing.estimated ? "estimated" : "actual",
    currency: input.pricing.currency,
    estimatedAmount: input.pricing.estimated ? input.pricing.amount : null,
    ...(!input.pricing.estimated
      ? { actualAmount: input.pricing.amount }
      : {}),
    label: input.pricing.label,
    provider: input.provider,
    model: input.model,
  };
}

function semanticImageHandler(
  operation: CanvasImageProviderOperation,
  label: string,
): CanvasCommandHandler {
  return async (environment, args, request) => {
    const node = selectedNode(environment);
    const source = selectedAsset(environment);
    if (!node || node.kind !== "image" || !source?.url) {
      throw new Error(`${label} source changed before submission.`);
    }
    const receipt = await executeCanvasImageSemanticOperation({
      operation,
      requestId: request.requestId,
      sourceAssetId: source.assetId,
      sourceUrl: source.url,
      sourceDigest: source.contentDigest,
      parameters: {
        prompt: requireString(args, "prompt", node.prompt || ""),
        model: requireString(args, "model", node.model || ""),
        direction:
          args.direction === "front" ||
          args.direction === "back" ||
          args.direction === "left" ||
          args.direction === "right" ||
          args.direction === "top" ||
          args.direction === "ambient"
            ? args.direction
            : undefined,
        intensity: numericArg(args, "intensity"),
        count: numericArg(args, "count"),
        fieldOfView: numericArg(args, "fieldOfView"),
        scale: args.scale === 4 ? 4 : 2,
        maskUrl: requireString(args, "maskUrl") || undefined,
        top: numericArg(args, "top"),
        right: numericArg(args, "right"),
        bottom: numericArg(args, "bottom"),
        left: numericArg(args, "left"),
        strength: numericArg(args, "strength"),
      },
      signal: environment.getCommandSignal?.(request.requestId),
      onProgress: (progress) =>
        environment.reportCommandProgress?.(request.requestId, progress),
    });
    const commandId = `canvas.node.generate.${operation}`;
    const attached = attachGeneratedAssetSet(
      environment.getProject(),
      node.nodeId,
      receipt.outputs.map((output, index) => ({
        kind: "image" as const,
        origin: "provider" as const,
        title:
          receipt.outputs.length === 1
            ? `${node.title} · ${label}`
            : `${node.title} · ${label} ${index + 1}`,
        url: output.url,
        mime: output.mimeType,
        provider: {
          receiptId: receipt.receiptId,
          provider: receipt.provider,
          model: receipt.model,
          operation,
          pricing: receipt.pricing,
        },
      })),
      commandId,
    );
    const project = recordCanvasOperationReceipt(attached.project, {
      schema: "oceanleo.canvas-operation-receipt@1",
      receiptId: receipt.receiptId,
      requestId: request.requestId,
      requestFingerprint: commandRequestFingerprint(request),
      commandId,
      projectVersionId: attached.project.headVersionId,
      status: "succeeded",
      provider: receipt.provider,
      model: receipt.model,
      pricing: receipt.pricing,
      inputAssetIds: [source.assetId],
      outputAssetIds: attached.assets.map((asset) => asset.assetId),
      externalRunIds: receipt.providerRequestIds,
      startedAt: receipt.startedAt,
      completedAt: receipt.completedAt,
    });
    return {
      message: `${label} completed through ${receipt.provider} · ${receipt.model}; immutable lineage and pricing receipt recorded.`,
      project,
      assetIds: attached.assets.map((asset) => asset.assetId),
      runIds: receipt.providerRequestIds,
      receiptIds: [receipt.receiptId],
      cost: canvasProviderCost(receipt),
      progress: {
        phase: "complete",
        progress: 1,
        message: `${label} complete.`,
      },
    };
  };
}

const REMOVE_BACKGROUND_COMMAND = "canvas.node.generate.remove-background";
const REMOVE_BACKGROUND_MAX_BYTES = 20 * 1024 * 1024;

function checkImageOperationCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CanvasAdapterError("image_operation_canceled", "Image operation canceled.", {
    cancelled: true, cancellation: { scope: "client-request", disposition: "client-aborted-provider-may-continue",
      message: "The client stopped waiting; the image provider may finish the submitted request." },
  });
}

function remoteImageUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Image source is unavailable.");
  const parsed = new URL(value);
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Image source requires an authorized HTTP URL.");
  return parsed.href;
}

async function removeBackgroundSource(environment: CanvasCommandEnvironment, source: ProjectAsset, signal?: AbortSignal): Promise<string> {
  checkImageOperationCanceled(signal);
  if (source.sourceDependency) {
    const reference = source.sourceDependency;
    const resolve = environment.resolveImageReferences || resolveVideoTimelineReferences;
    const resolved = await resolve({ width: 16, height: 16, fps: 1, tracks: [{ id: "source", kind: "image", clips: [{ id: source.assetId,
      start_ms: 0, duration_ms: 1000, source_ref: { artifactId: reference.artifactId, revisionId: reference.revisionId, path: reference.path } }] }] });
    checkImageOperationCanceled(signal);
    return remoteImageUrl(resolved.tracks[0]?.clips[0]?.source_url);
  }
  if (source.librarySource) {
    const refresh = environment.refreshLibraryImage || (await import("../../artifact-client")).refreshArtifactRendition;
    const resolved = await refresh(source.librarySource, "full", signal);
    checkImageOperationCanceled(signal);
    if (!resolved.ok || !resolved.data?.mediaType?.startsWith("image/")) throw new Error(resolved.error || "Image source is unavailable.");
    return remoteImageUrl(resolved.data.url);
  }
  return remoteImageUrl(source.url);
}

/** Validates actual provider bytes before any immutable graph mutation. */
async function removeBackgroundHandler(environment: CanvasCommandEnvironment, _args: Record<string, unknown>, request: CanvasCommandRequest): Promise<HandlerOutcome> {
  const snapshot = environment.getProject();
  const node = selectedNode(environment), source = selectedAsset(environment);
  if (!node || node.kind !== "image" || source?.kind !== "image") throw new Error("Select an Image node first.");
  const signal = environment.getCommandSignal?.(request.requestId);
  const startedAt = new Date().toISOString();
  const imageUrl = await removeBackgroundSource(environment, source, signal);
  checkImageOperationCanceled(signal);
  if (snapshot.headVersionId !== environment.getProject().headVersionId || request.selectionEpoch !== environment.getSelectionEpoch()) throw new Error("Image selection changed.");
  environment.reportCommandProgress?.(request.requestId, { phase: "submitting", progress: 0.1 });
  const init = { method: "POST", signal, body: JSON.stringify({ site_id: "video", image_url: imageUrl }) };
  const response = environment.requestRemoveBackground ? await environment.requestRemoveBackground("/v1/images/remove-bg", init)
    : await authed<CanvasRemoveBackgroundResponse>("/v1/images/remove-bg", init);
  checkImageOperationCanceled(signal);
  if (!response.ok || !response.data) throw new CanvasAdapterError("remove_background_failed", response.error || "Image operation failed.", { status: response.status });
  const output = response.data;
  const outputUrl = remoteImageUrl(output.image);
  const locator = new URL(outputUrl);
  if (outputUrl === imageUrl || /\/v1\/artifact-renditions\/access\//i.test(locator.pathname) || [...locator.searchParams.keys()].some((key) => /^(?:token|access_token|signature|expires|expires_at|x-amz-|x-oss-)/i.test(key))) throw new Error("Image output requires a durable URL.");
  if (!output.request_id || !output.model || !Number.isFinite(output.credits_spent) || output.credits_spent < 0) throw new Error("Image operation receipt is incomplete.");
  environment.reportCommandProgress?.(request.requestId, { phase: "finalizing", progress: 0.8 });
  const blob = await (environment.readRemoveBackgroundImage || fetchMediaBlob)(outputUrl, { signal, maxBytes: REMOVE_BACKGROUND_MAX_BYTES, cache: "no-store" });
  checkImageOperationCanceled(signal);
  if (!blob.size || blob.size > REMOVE_BACKGROUND_MAX_BYTES) throw new Error("Image source bytes failed verification.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type.toLowerCase().split(";", 1)[0];
  const png = mime === "image/png" && bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = mime === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = mime === "image/webp" && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!png && !jpeg && !webp) throw new Error("Image source bytes failed verification.");
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  checkImageOperationCanceled(signal);
  const pricing = { amount: output.credits_spent, currency: "OCEANLEO_CREDITS", estimated: false, label: "Provider-metered" };
  const provider = "OceanLeo media gateway";
  const attached = attachGeneratedAssetSet(snapshot, node.nodeId, [{ kind: "image", origin: "provider", title: node.title,
    url: outputUrl, mime, contentDigest: digest, byteSize: bytes.length,
    provider: { receiptId: output.request_id, provider, model: output.model, operation: "remove-background", pricing: { billing: "provider", ...pricing } },
  }], REMOVE_BACKGROUND_COMMAND);
  const project = recordCanvasOperationReceipt(attached.project, { schema: "oceanleo.canvas-operation-receipt@1", receiptId: output.request_id,
    requestId: request.requestId, requestFingerprint: commandRequestFingerprint(request), commandId: REMOVE_BACKGROUND_COMMAND,
    projectVersionId: attached.project.headVersionId, status: "succeeded", provider, model: output.model, pricing: { billing: "provider", ...pricing },
    inputAssetIds: [source.assetId], outputAssetIds: attached.assets.map((asset) => asset.assetId), externalRunIds: [output.request_id],
    startedAt, completedAt: new Date().toISOString() });
  return { project, assetIds: attached.assets.map((asset) => asset.assetId), receiptIds: [output.request_id], runIds: [output.request_id],
    message: "Image operation complete.", cost: canvasProviderCost({ provider, model: output.model, pricing }) };
}

function localRetouchHandler(
  commandId: string,
  operation: LocalEditOperation,
): CanvasCommandHandler {
  return (environment) => {
    const node = selectedNode(environment);
    const asset = selectedAsset(environment);
    if (!node || !asset) throw new Error("Retouch source changed.");
    const derived = deriveLocalAsset(
      environment.getProject(),
      asset.assetId,
      operation,
      commandId,
    );
    let project = updateProjectNode(
      derived.project,
      node.nodeId,
      commandId,
      {
        assetId: derived.asset.assetId,
        localEditRecipe: [...node.localEditRecipe, operation],
      },
    );
    const lineageIndex = project.lineage.length - 1;
    if (lineageIndex >= 0) {
      project = {
        ...project,
        lineage: project.lineage.map((lineage, index) =>
          index === lineageIndex
            ? { ...lineage, projectVersionId: project.headVersionId }
            : lineage,
        ),
      };
    }
    return {
      message: `${operation.operation} added as a non-destructive local recipe.`,
      project,
      assetIds: [derived.asset.assetId],
      cost: NO_COST,
    };
  };
}

const localAdjustHandler: CanvasCommandHandler = (environment, args) => {
  const operation: LocalEditOperation = {
    operation: "adjust",
    parameters: {
      brightness: Math.max(
        0.25,
        Math.min(2, numericArg(args, "brightness") ?? 1),
      ),
      contrast: Math.max(
        0.25,
        Math.min(2, numericArg(args, "contrast") ?? 1),
      ),
      saturation: Math.max(
        0,
        Math.min(2, numericArg(args, "saturation") ?? 1),
      ),
      exposure: Math.max(
        -2,
        Math.min(2, numericArg(args, "exposure") ?? 0),
      ),
    },
  };
  return localRetouchHandler(
    "canvas.node.update.local.adjust",
    operation,
  )(environment, args, {
    commandId: "canvas.node.update.local.adjust",
    requestId: "",
    projectVersionId: environment.getProject().headVersionId,
    selectionEpoch: environment.getSelectionEpoch(),
    surface: "compact",
  });
};

function gridSplitHandler(
  count: 4 | 9 | 25,
): CanvasCommandHandler {
  return (environment) => {
    const node = selectedNode(environment);
    if (!node) throw new Error("Grid split selection changed.");
    const split = splitGridAsset(
      environment.getProject(),
      node.nodeId,
      count,
      `canvas.node.update.local.grid-split-${count}`,
    );
    return {
      message: `${count} local crop derivatives were created without changing the source Asset.`,
      project: split.project,
      assetIds: split.assetIds,
      cost: NO_COST,
    };
  };
}

const definitions: CanvasCommandDefinition[] = [
  {
    commandId: REMOVE_BACKGROUND_COMMAND, scope: "selection", surfaces: ["compact", "context-more", "protocol"],
    execution: "server", billing: "estimated", cancellation: "client-abort", inputSchema: "canvas.node.remove-background.v1", mutates: "asset", label: "Remove background",
    disclosure: (environment) => ({ provider: "OceanLeo media gateway", model: "imageseg-matting", input: selectedAsset(environment)?.title || "Image",
      cost: "Provider-metered; credits and model are returned in the immutable receipt", contract: "POST /v1/images/remove-bg" }),
    availability: (environment) => {
      const source = selectedAsset(environment);
      return { enabled: selectedNode(environment)?.kind === "image" && source?.kind === "image" && Boolean(source.url || source.sourceDependency || source.librarySource) };
    },
    handler: removeBackgroundHandler,
  },
  {
    commandId: "canvas.node.image-style.update", scope: "selection",
    surfaces: ["compact", "context-more", "protocol"], execution: "local", billing: "none",
    inputSchema: "canvas.node.image-style.update.v1", mutates: "project", label: "Image style",
    availability: (environment) => ({ enabled: selectedNode(environment)?.kind === "image" }),
    handler: (environment, args) => {
      const node = selectedNode(environment)!;
      const params = (node as CanvasNodeDefinition & { params?: Record<string, unknown> }).params || {};
      const current = canvasImageAppearance(node as CanvasNodeDefinition & { params?: Record<string, unknown> });
      const field = requireString(args, "field");
      let value = args.value;
      let operation: LocalEditOperation | undefined;
      let patch: Record<string, unknown>;
      if (["opacity", "radius", "border"].includes(field)) {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Unsupported image style.");
        value = Math.max(0, Math.min(field === "opacity" ? 1 : field === "radius" ? 1000 : 100, value));
        if (field === "border") {
          patch = { border: { ...current.border, width: value } };
          operation = { operation: "border", parameters: { width: value as number, color: current.border.color } };
        } else {
          patch = { [field]: value };
          operation = { operation: field as "opacity" | "radius", parameters: { [field]: value as number } };
        }
      } else if (field === "borderColor" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
        patch = { border: { ...current.border, color: value } };
        operation = { operation: "border", parameters: { ...current.border, color: value } };
      } else if (field === "fit" && ["contain", "cover", "stretch"].includes(String(value))) {
        patch = { fit: value };
        // The renderer derives the real frame from the composition dimensions and scale.
        operation = { operation: "image-fit", parameters: { fit: String(value) } };
      } else if (field === "alt" && typeof value === "string") patch = { alt: value.slice(0, 2000) };
      else if (field === "includeInVideo" && typeof value === "boolean") patch = { includeInVideo: value };
      else throw new Error("Unsupported image style.");
      const project = advanceProject(environment.getProject(), "canvas.node.image-style.update", (version) => {
        const target = version.graph.nodes.find((item) => item.nodeId === node.nodeId)!;
        Object.assign(target, { params: { ...params, ...patch }, ...(operation ? {
          localEditRecipe: [...target.localEditRecipe.filter((step) => step.operation !== operation!.operation), operation],
        } : {}) });
      });
      return { project, message: "Image style updated.", cost: NO_COST };
    },
  },
  {
    commandId: "canvas.node.asset.replace-library", scope: "selection",
    surfaces: ["compact", "context-more", "protocol"], execution: "local", billing: "none",
    inputSchema: "canvas.node.asset.replace-library.v1", mutates: "asset", label: "Replace image",
    availability: (environment) => ({ enabled: selectedNode(environment)?.kind === "image" }),
    handler: async (environment) => {
      const node = selectedNode(environment)!;
      const snapshot = environment.getProject();
      const epoch = environment.getSelectionEpoch();
      const pick = environment.pickLibraryImage || (await import("./LeoNode")).requestCanvasLibraryImage;
      const item = await pick(node.nodeId);
      if (!item) return { message: "Image selection canceled.", cost: NO_COST };
      const librarySource = { artifactId: String(item.artifactId), revisionId: String(item.revisionId), rendition: "full" as const };
      if (!validTimelineLibrarySource(librarySource)) throw new Error("Invalid Library image reference.");
      const checkSelection = () => {
        if (environment.getProject().headVersionId !== snapshot.headVersionId || environment.getSelectedNodeId() !== node.nodeId || environment.getSelectionEpoch() !== epoch) throw new Error("Image selection changed.");
      };
      checkSelection();
      const refresh = environment.refreshLibraryImage || (await import("../../artifact-client")).refreshArtifactRendition;
      const source = await refresh(librarySource, "full");
      if (!source.ok || !source.data?.url || !source.data.mediaType?.startsWith("image/")) throw new Error("Image source is unavailable.");
      checkSelection();
      const digest = source.data.digest?.replace(/^sha256:/i, "").toLowerCase();
      if (!digest || !/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(source.data.byteSize) || Number(source.data.byteSize) <= 0 || Number(source.data.byteSize) > 20 * 1024 * 1024) throw new Error("Image source metadata is incomplete.");
      const registered = registerAsset(snapshot, { kind: "image", origin: "import", title: item.title, mime: source.data.mediaType,
        contentDigest: digest, byteSize: source.data.byteSize!, ...(source.data.width ? { width: source.data.width } : {}), ...(source.data.height ? { height: source.data.height } : {}),
        librarySource, libraryItem: { artifactId: librarySource.artifactId, revisionId: librarySource.revisionId } });
      const project = advanceProject(registered.project, "canvas.node.asset.replace-library", (version) => {
        Object.assign(version.graph.nodes.find((candidate) => candidate.nodeId === node.nodeId)!, { assetId: registered.asset.assetId, localEditRecipe: [] });
        const shot = version.shots.find((candidate) => candidate.shotId === node.shotId);
        const board = version.storyboards.find((candidate) => candidate.storyboardId === shot?.storyboardId);
        if (board && node.assetId) board.frameAssetIds = [...new Set(board.frameAssetIds.map((id) => id === node.assetId ? registered.asset.assetId : id))];
      });
      return { project, message: "Image replaced; the previous asset remains in history.", assetIds: [registered.asset.assetId], cost: NO_COST };
    },
  },
  {
    commandId: "canvas.node.asset.replace", scope: "selection",
    surfaces: ["compact", "protocol"], execution: "local", billing: "none",
    inputSchema: "canvas.node.asset.replace.v1", mutates: "project", label: "Replace image",
    availability: (environment, args) => {
      const node = selectedNode(environment);
      const asset = environment.getProject().assets[requireString(args, "assetId")];
      return { enabled: node?.kind === "image" && asset?.kind === "image"
        && (asset.origin !== "local-derivative" || asset.assetId === node.assetId) };
    },
    handler: (environment, args) => {
      const node = selectedNode(environment)!;
      const assetId = requireString(args, "assetId");
      if (assetId === node.assetId) return { message: "This image is already selected.", cost: NO_COST };
      const asset = environment.getProject().assets[assetId];
      if (asset?.kind !== "image" || asset.origin === "local-derivative") throw new Error("Choose an image with a materialized source.");
      const project = advanceProject(environment.getProject(), "canvas.node.asset.replace", (version) => {
        Object.assign(version.graph.nodes.find((item) => item.nodeId === node.nodeId)!, { assetId, localEditRecipe: [] });
        const shot = version.shots.find((item) => item.shotId === node.shotId);
        const board = version.storyboards.find((item) => item.storyboardId === shot?.storyboardId);
        if (board && node.assetId) board.frameAssetIds = [...new Set(board.frameAssetIds.map((id) => id === node.assetId ? assetId : id))];
      });
      return { project, message: "Image replaced; the previous asset remains in history.", cost: NO_COST };
    },
  },
  {
    commandId: "canvas.node.text-style.update", scope: "selection",
    surfaces: ["compact", "context-more", "protocol"], execution: "local", billing: "none",
    inputSchema: "canvas.node.text-style.update.v1", mutates: "project", label: "Text style",
    availability: (environment) => ({ enabled: ["text", "script", "subtitle"].includes(selectedNode(environment)?.kind || "") }),
    handler: (environment, args) => {
      const node = selectedNode(environment)!;
      const params = (node as CanvasNodeDefinition & { params?: Record<string, unknown> }).params || {};
      const field = requireString(args, "field");
      const value = args.value;
      let patch: Record<string, unknown>;
      let contentPatch: Partial<TimelineClip> | undefined;
      const content = canvasNodeTextClip(node, selectedAsset(environment)?.inlineText);
      if (field === "clearFormat") {
        patch = { textStyle: {} };
        contentPatch = timelineTextListPatch(content, "none");
      } else if (field === "list") {
        if (value !== "none" && value !== "bullet" && value !== "ordered") throw new Error("Unsupported text list.");
        contentPatch = timelineTextListPatch(content, value);
        patch = {};
      } else if (field === "case") {
        if (value !== undefined && value !== "upper" && value !== "lower") throw new Error("Unsupported text case.");
        const text = String(content.text ?? "");
        contentPatch = timelineTextCasePatch(content, value || (text === text.toUpperCase() ? "lower" : "upper"));
        patch = {};
      } else if (field === "includeInVideo" && typeof value === "boolean") patch = { includeInVideo: value };
      else {
        if (!(field === "font_size" && typeof value === "number" && Number.isFinite(value) && value >= 8 && value <= 300)
          && !(["color", "background"].includes(field) && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
          && !(["bold", "italic", "underline", "strike", "vertical_text"].includes(field) && typeof value === "boolean")
          && !(field === "font_family" && TIMELINE_FONT_FAMILIES.includes(value as typeof TIMELINE_FONT_FAMILIES[number]))
          && !(field === "line_height" && typeof value === "number" && Number.isFinite(value) && value >= 0.5 && value <= 3)
          && !(field === "letter_spacing" && typeof value === "number" && Number.isFinite(value) && value >= -10 && value <= 100)
          && !(field === "align" && ["left", "center", "right", "justify"].includes(String(value)))) throw new Error("Unsupported text style.");
        patch = { textStyle: { ...(params.textStyle as TimelineTextStyle || {}), [field]: value } };
      }
      const project = advanceProject(environment.getProject(), "canvas.node.text-style.update", (version) => {
        const nextParams = { ...params, ...patch };
        if (contentPatch) {
          nextParams.text = contentPatch.text;
          if (contentPatch.text_list) nextParams.text_list = contentPatch.text_list;
          else delete nextParams.text_list;
        }
        Object.assign(version.graph.nodes.find((item) => item.nodeId === node.nodeId)!, {
          ...(contentPatch ? { text: contentPatch.text } : {}), params: nextParams,
        });
      });
      return { project, message: "Text style updated.", cost: NO_COST };
    },
  },
  {
    commandId: "canvas.project.version.restore", scope: "project",
    surfaces: ["toolbar", "protocol"], execution: "local", billing: "none",
    inputSchema: "canvas.project.version.restore.v1", mutates: "project", label: "Restore version",
    availability: (environment, args) => {
      const project = environment.getProject();
      const id = requireString(args, "versionId");
      return { enabled: Object.hasOwn(project.versions, id) && project.versions[id].versionId === id && id !== project.headVersionId };
    },
    handler: (environment, args) => {
      const project = environment.getProject();
      const id = requireString(args, "versionId");
      if (!Object.hasOwn(project.versions, id) || project.versions[id].versionId !== id || id === project.headVersionId) {
        throw new Error("Select an earlier Project version.");
      }
      const target = project.versions[id];
      const restored = advanceProject(project, "canvas.project.version.restore", (next) => {
        const { versionId: _id, parentVersionId: _parent, revision: _revision, createdAt: _time, reason: _reason, ...content } = target;
        const identity = new Set(["versionId", "parentVersionId", "revision", "createdAt", "reason"]);
        for (const key of Object.keys(next)) {
          if (!identity.has(key)) delete (next as unknown as Record<string, unknown>)[key];
        }
        Object.assign(next, structuredClone(content));
      });
      return { project: restored, selectedNodeId: null, message: "Version restored as a new edit. Save to keep this revision.", cost: NO_COST };
    },
  },
  {
    commandId: "canvas.session.image-mode.set",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.session.image-mode.set.v2",
    mutates: "session",
    label: "Set image mode",
    availability: (environment) => {
      const node = selectedNode(environment);
      return node?.kind === "image"
        ? { enabled: true }
        : { enabled: false, reason: "Select an Image node first." };
    },
    handler: (environment, args) => {
      const mode = args.mode;
      if (mode !== "retouch" && mode !== "generate") {
        throw new Error("Image mode must be Retouch or Generate.");
      }
      environment.setImageMode(mode);
      return {
        message: `${mode === "retouch" ? "Retouch" : "Generate"} mode selected. No command was submitted.`,
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.session.view.set",
    scope: "canvas",
    surfaces: ["toolbar", "node-menu", "keyboard", "protocol", "compact"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.session.view.set.v1",
    mutates: "session",
    label: "Open Project view",
    handler: (environment, args) => {
      const view = args.view;
      if (
        view !== "graph" &&
        view !== "storyboard" &&
        view !== "director" &&
        view !== "timeline" &&
        view !== "history"
      ) {
        throw new Error("Unknown Project view.");
      }
      environment.setWorkspaceView(view);
      return {
        message: `${view === "graph" ? "Graph" : view} view opened on the current Project head.`,
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.panel.material-library.open",
    scope: "canvas",
    surfaces: ["node-menu", "toolbar", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.panel.material-library.open.v1",
    mutates: "session",
    label: "Open material library",
    handler: (environment) => {
      environment.openMaterialLibrary();
      return {
        message:
          "Shared material panel opened.",
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.asset.upload.request",
    scope: "canvas",
    surfaces: ["node-menu", "toolbar"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.asset.upload.request.v1",
    mutates: "session",
    label: "Upload media",
    handler: (environment) => {
      environment.requestMediaUpload();
      return {
        message: "Choose an image, video, or audio file to upload.",
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.node.create",
    scope: "canvas",
    surfaces: ["toolbar", "node-menu", "keyboard", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.create.v2",
    mutates: "project",
    label: "Create canvas node",
    availability: (_environment, args) => {
      const entryId = requireString(args, "entryId") as NodeMenuEntryId;
      const capability = NODE_MENU_CAPABILITIES[entryId];
      if (!capability) return { enabled: false, reason: "Unknown node entry." };
      return capability.enabled
        ? { enabled: true }
        : { enabled: false, reason: capability.disabledReason };
    },
    handler: (environment, args) => {
      const entryId = requireString(args, "entryId") as NodeMenuEntryId;
      const kind = CREATE_KIND_BY_ENTRY[entryId];
      if (!kind) throw new Error("This entry cannot create a Project node.");
      const x = Number(args.x);
      const y = Number(args.y);
      const center = environment.screenCenter();
      let project = environment.getProject();
      let assetId: string | undefined;
      const assetInput =
        args.asset && typeof args.asset === "object" && !Array.isArray(args.asset)
          ? (args.asset as Record<string, unknown>)
          : null;
      if (assetInput) {
        const url = requireString(assetInput, "url");
        const hostAssetId = requireString(assetInput, "assetId");
        const verified = assetInput.verified === true;
        if (!url || !hostAssetId || !verified) {
          throw new Error(
            "Inserted media must carry a stable Asset ID, URL, and verified=true from the host.",
          );
        }
        const registered = registerAsset(project, {
          assetId: hostAssetId,
          kind:
            kind === "image" || kind === "video" || kind === "audio"
              ? kind
              : "project",
          origin: "import",
          title:
            requireString(assetInput, "title") ||
            NODE_MENU_CAPABILITIES[entryId].label,
          url,
          previewUrl: requireString(assetInput, "previewUrl") || undefined,
          contentDigest:
            requireString(assetInput, "contentDigest") || undefined,
        });
        project = registered.project;
        assetId = registered.asset.assetId;
      }
      const created = addProjectNode(
        project,
        kind,
        {
          x: Number.isFinite(x) ? x : center.x,
          y: Number.isFinite(y) ? y : center.y,
        },
        {
          ratio: kind === "image" || kind === "video" ? "16:9" : undefined,
          durationSeconds: kind === "video" ? 5 : kind === "audio" ? 30 : undefined,
          assetId,
        },
      );
      return {
        message: `${NODE_MENU_CAPABILITIES[entryId].label} added.`,
        project: created.project,
        selectedNodeId: created.nodeId,
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.node.field.update",
    scope: "selection",
    surfaces: ["compact", "context-more", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.field.update.v2",
    mutates: "project",
    label: "Update node field",
    availability: (environment) =>
      selectedNode(environment)
        ? { enabled: true }
        : { enabled: false, reason: "Select a node first." },
    handler: (environment, args) => {
      const node = selectedNode(environment);
      if (!node) throw new Error("Selection changed.");
      const field = requireString(args, "field");
      let patch: Partial<CanvasNodeDefinition>;
      if (["title", "prompt", "text", "model"].includes(field)) {
        patch = {
          [field]:
            typeof args.value === "string"
              ? args.value.slice(0, 20_000)
              : "",
        };
        if (field === "text" && ["text", "script", "subtitle"].includes(node.kind)) {
          const params = { ...(node as CanvasNodeDefinition & { params?: Record<string, unknown> }).params, text: patch.text };
          delete (params as Record<string, unknown>).text_list;
          Object.assign(patch, { params });
        }
      } else if (field === "audioMode" && node.kind === "audio" && (args.value === "voice" || args.value === "music")) {
        patch = { audioMode: args.value };
      } else if (
        field === "ratio" &&
        (node.kind === "image" || node.kind === "video") &&
        (args.value === "16:9" ||
          args.value === "9:16" ||
          args.value === "1:1")
      ) {
        patch = { ratio: args.value };
      } else if (
        field === "durationSeconds" &&
        (node.kind === "video" || node.kind === "subtitle" || node.kind === "audio") &&
        typeof args.value === "number" &&
        Number.isFinite(args.value)
      ) {
        patch = {
          durationSeconds: Math.max(0.1, Math.min(3_600, args.value)),
        };
      } else {
        throw new Error("Field is not editable through the command registry.");
      }
      if (field === "title" && node.legacySourceNode) {
        patch.legacySourceNode = updateLegacyTitle(
          node.legacySourceNode,
          String(patch.title || ""),
        );
      }
      return {
        message: `${field} updated.`,
        project: updateProjectNode(
          environment.getProject(),
          node.nodeId,
          "canvas.node.field.update",
          patch,
        ),
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.node.legacy-param.update",
    scope: "selection",
    surfaces: ["compact", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.legacy-param.update.v1",
    mutates: "project",
    label: "Update supported legacy parameter",
    availability: (environment, args) => {
      const node = selectedNode(environment);
      if (!node?.legacySourceNode) {
        return {
          enabled: false,
          reasonCode: "INVALID_SELECTION",
          reason: "Select a retained legacy workflow node first.",
        };
      }
      const path = requireString(args, "path");
      if (!path) return { enabled: true };
      const update = updateLegacyParameter(
        node.legacySourceNode,
        path,
        args.value,
      );
      return update.ok
        ? { enabled: true }
        : {
            enabled: false,
            reasonCode: "MISSING_REQUIRED_INPUT",
            reason: update.reason || "This legacy value is read-only.",
          };
    },
    handler: (environment, args) => {
      const node = selectedNode(environment);
      if (!node?.legacySourceNode) throw new Error("Selection changed.");
      const path = requireString(args, "path");
      const update = updateLegacyParameter(
        node.legacySourceNode,
        path,
        args.value,
      );
      if (!update.ok || !update.source) {
        throw new Error(update.reason || "This legacy value is read-only.");
      }
      const patch: Partial<CanvasNodeDefinition> = {
        legacySourceNode: update.source,
      };
      if (path === "params.text" && typeof args.value === "string") {
        patch.text = args.value;
      }
      return {
        message: `${path.slice("params.".length)} updated in the retained legacy source.`,
        project: updateProjectNode(
          environment.getProject(),
          node.nodeId,
          "canvas.node.legacy-param.update",
          patch,
        ),
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.node.position.update",
    scope: "selection",
    surfaces: ["compact", "context-more", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.position.update.v2",
    mutates: "project",
    label: "Update node position",
    availability: (environment) =>
      selectedNode(environment)
        ? { enabled: true }
        : { enabled: false, reason: "Select a node first." },
    handler: (environment, args) => {
      const node = selectedNode(environment);
      if (!node) throw new Error("Selection changed.");
      const axis = args.axis;
      const value = args.value;
      if (
        (axis !== "x" && axis !== "y") ||
        typeof value !== "number" ||
        !Number.isFinite(value)
      ) {
        throw new Error("Node position requires a finite x or y value.");
      }
      return {
        message: `${axis.toUpperCase()} position updated.`,
        project: updateProjectNode(
          environment.getProject(),
          node.nodeId,
          "canvas.node.position.update",
          {
            position: {
              ...node.position,
              [axis]: Math.max(-100_000, Math.min(100_000, value)),
            },
            ...(node.legacySourceNode
              ? {
                  legacySourceNode: updateLegacyPosition(
                    node.legacySourceNode,
                    axis,
                    Math.max(-100_000, Math.min(100_000, value)),
                  ),
                }
              : {}),
          },
        ),
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.node.update.local.crop",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.update.local.crop.v2",
    mutates: "asset",
    label: "Crop",
    availability: localImageAvailability,
    handler: localRetouchHandler("canvas.node.update.local.crop", {
      operation: "crop",
      parameters: { insetPercent: 6 },
    }),
  },
  {
    commandId: "canvas.node.update.local.rotate",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.update.local.rotate.v2",
    mutates: "asset",
    label: "Rotate",
    availability: localImageAvailability,
    handler: localRetouchHandler("canvas.node.update.local.rotate", {
      operation: "rotate",
      parameters: { degrees: 90 },
    }),
  },
  {
    commandId: "canvas.node.update.local.flip-horizontal",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.update.local.flip-horizontal.v2",
    mutates: "asset",
    label: "Flip",
    availability: localImageAvailability,
    handler: localRetouchHandler("canvas.node.update.local.flip-horizontal", {
      operation: "flip-horizontal",
      parameters: { axis: "x" },
    }),
  },
  {
    commandId: "canvas.node.update.local.flip-vertical",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.update.local.flip-vertical.v1",
    mutates: "asset",
    label: "Flip vertical",
    availability: localImageAvailability,
    handler: localRetouchHandler("canvas.node.update.local.flip-vertical", {
      operation: "flip-vertical",
      parameters: { axis: "y" },
    }),
  },
  {
    commandId: "canvas.node.update.local.brightness",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.update.local.brightness.v1",
    mutates: "asset",
    label: "Brightness +10%",
    availability: localImageAvailability,
    handler: localRetouchHandler("canvas.node.update.local.brightness", {
      operation: "brightness",
      parameters: { factor: 1.1 },
    }),
  },
  {
    commandId: "canvas.node.update.local.contrast",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.update.local.contrast.v1",
    mutates: "asset",
    label: "Contrast +10%",
    availability: localImageAvailability,
    handler: localRetouchHandler("canvas.node.update.local.contrast", {
      operation: "contrast",
      parameters: { factor: 1.1 },
    }),
  },
  {
    commandId: "canvas.node.update.local.saturation",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.update.local.saturation.v1",
    mutates: "asset",
    label: "Saturation +10%",
    availability: localImageAvailability,
    handler: localRetouchHandler("canvas.node.update.local.saturation", {
      operation: "saturation",
      parameters: { factor: 1.1 },
    }),
  },
  {
    commandId: "canvas.node.update.local.adjust",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "oceanleo.image-recipe.adjust@1",
    mutates: "asset",
    label: "Adjust",
    availability: localImageAvailability,
    handler: localAdjustHandler,
  },
  {
    commandId: "canvas.node.update.local.grayscale",
    scope: "selection",
    surfaces: ["compact", "keyboard", "protocol"],
    mode: "retouch",
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.update.local.grayscale.v1",
    mutates: "asset",
    label: "Grayscale filter",
    availability: localImageAvailability,
    handler: localRetouchHandler("canvas.node.update.local.grayscale", {
      operation: "grayscale",
      parameters: { amount: 1 },
    }),
  },
  ...([4, 9, 25] as const).map(
    (count): CanvasCommandDefinition => ({
      commandId: `canvas.node.update.local.grid-split-${count}`,
      scope: "selection",
      surfaces: ["compact", "protocol"],
      mode: "retouch",
      execution: "local",
      billing: "none",
      inputSchema: `canvas.node.update.local.grid-split-${count}.v1`,
      mutates: "asset",
      label: `Split ${count}-grid`,
      availability: localImageAvailability,
      handler: gridSplitHandler(count),
    }),
  ),
  {
    commandId: "canvas.node.generate.image",
    scope: "selection",
    surfaces: ["compact", "protocol"],
    mode: "generate",
    execution: "server",
    billing: "estimated",
    inputSchema: "canvas.node.generate.image.v2",
    mutates: "asset",
    label: "Generate image",
    disclosure: (environment, args) => imageDisclosure(environment, args),
    availability: imageGenerationAvailability,
    handler: async (environment, args, request) => {
      const node = selectedNode(environment);
      if (!node) throw new Error("Selection changed.");
      const inputs = generationInputs(environment, node, args);
      const prompt = inputs.prompt;
      const model = providerModelName(requireString(args, "model", node.model || ""));
      const result = await generateImage(prompt, node.ratio, {
        model,
        quality: "2K", signal: environment.getCommandSignal?.(request.requestId),
        sourceUrls: await Promise.all(inputs.images.map(async (asset) => environment.resolveAssetUrl ? environment.resolveAssetUrl(asset) : asset.url || "")),
      });
      const url = result.images[0];
      if (!url) throw new Error("The image provider returned no Asset URL.");
      const attached = attachGeneratedAsset(
        environment.getProject(),
        node.nodeId,
        {
          kind: "image",
          origin: "provider",
          title: node.title,
          url,
        },
        "canvas.node.generate.image",
      );
      return {
        message: "Image generated as a new immutable Asset.",
        project: attached.project,
        assetIds: [attached.asset.assetId],
        cost: PROVIDER_PRICE,
      };
    },
  },
  ...([4, 9, 25] as const).map(
    (count): CanvasCommandDefinition => ({
      commandId: `canvas.node.generate.grid-${count}`,
      scope: "selection",
      surfaces: ["compact", "protocol"],
      mode: "generate",
      execution: "server",
      billing: "estimated",
      cancellation: "client-abort",
      inputSchema: `canvas.node.generate.grid-${count}.v1`,
      mutates: "asset",
      label: `Generate ${count}-grid`,
      disclosure: (environment, args) =>
        imageDisclosure(
          environment,
          args,
          CANVAS_IMAGE_OPERATION_CAPABILITIES?.[`grid-${count}`]
            ?.requiredContract || "oceanleo.gateway.images.edit@1",
          "One provider-metered contact-sheet request; exact credits returned in the receipt",
        ),
      availability: sourceImageAvailability,
      handler: semanticImageHandler(
        `grid-${count}` as CanvasImageProviderOperation,
        `${count}-grid`,
      ),
    }),
  ),
  ...(
    [
      { id: "relight", label: "Relight" },
      { id: "multi-angle", label: "Multi-angle" },
      { id: "panorama", label: "Panorama" },
      { id: "upscale", label: "Upscale" },
      { id: "inpaint", label: "Inpaint" },
      { id: "outpaint", label: "Outpaint" },
      { id: "portrait-quality", label: "Portrait quality" },
    ] as const
  ).map(
    (capability): CanvasCommandDefinition => ({
      commandId: `canvas.node.generate.${capability.id}`,
      scope: "selection",
      surfaces: ["compact", "protocol"],
      mode: "generate",
      execution: "server",
      billing: "estimated",
      cancellation: "client-abort",
      inputSchema:
        capability.id === "upscale"
          ? "oceanleo.gateway.images.upscale@1"
          : "oceanleo.gateway.images.edit@1",
      mutates: "asset",
      label: capability.label,
      disclosure: (environment, args) =>
        imageDisclosure(
          environment,
          args,
          CANVAS_IMAGE_OPERATION_CAPABILITIES?.[capability.id]
            ?.requiredContract ||
            (capability.id === "upscale"
              ? "oceanleo.gateway.images.upscale@1"
              : "oceanleo.gateway.images.edit@1"),
          "Provider-metered; exact model and credits are recorded in the immutable receipt",
        ),
      availability: sourceImageAvailability,
      handler: semanticImageHandler(capability.id, capability.label),
    }),
  ),
  {
    commandId: "canvas.node.generate.script",
    scope: "selection",
    surfaces: ["compact", "protocol"],
    mode: "generate",
    execution: "server",
    billing: "estimated",
    inputSchema: "canvas.node.generate.script.v2",
    mutates: "project",
    label: "Generate script",
    availability: scriptGenerationAvailability,
    handler: async (environment, args) => {
      const node = selectedNode(environment);
      if (!node) throw new Error("Selection changed.");
      const prompt = generationInputs(environment, node, args).prompt;
      const model = providerModelName(requireString(args, "model", node.model || ""));
      const result =
        node.kind === "script"
          ? await generateScript(prompt, { model })
          : await generateText(prompt, { model });
      return {
        message: "Text generated and stored in the next Project version.",
        project: updateProjectNode(
          environment.getProject(),
          node.nodeId,
          "canvas.node.generate.script",
          { text: result.text, generation: { status: "succeeded" } },
        ),
        cost: PROVIDER_PRICE,
      };
    },
  },
  {
    commandId: "canvas.node.generate.video",
    scope: "selection",
    surfaces: ["compact", "protocol"],
    mode: "generate",
    execution: "server",
    billing: "estimated",
    inputSchema: "canvas.node.generate.video.v2",
    mutates: "runtime",
    label: "Generate video",
    disclosure: (environment, args) => {
      const node = selectedNode(environment);
      const asset = selectedAsset(environment);
      return {
        provider: "OceanLeo durable video · bailian-video",
        model: requireString(args, "model", node?.model || "") ||
          "Platform default",
        input: asset
          ? `Immutable Asset ${asset.assetId} + prompt`
          : "Prompt + versioned Project graph",
        cost: (() => { const quote = node && getPreparedVideoQuote(environment.getProject(), node); return quote ? `${quote.amount} ${quote.currency}` : "正在估算视频费用…"; })(),
        contract:
          "GET /v1/video-canvas/capabilities + Project version + idempotent Run",
      };
    },
    availability: videoGenerationAvailability,
    handler: async (environment, args, request) => {
      const node = selectedNode(environment);
      if (!node) throw new Error("Selection changed.");
      const submittedNode = {
        ...node,
        prompt: requireString(args, "prompt", node.prompt || ""),
        model: requireString(args, "model", node.model || ""),
      };
      const localHead = environment.getProject().headVersionId;
      const result = await submitDurableVideoGeneration({
        project: environment.getProject(),
        node: submittedNode,
        selectionEpoch: request.selectionEpoch,
        commandRequestId: request.requestId,
        onSynced: (synced) => {
          if (
            environment.getProject().headVersionId !== localHead ||
            environment.getSelectionEpoch() !== request.selectionEpoch
          ) {
            return false;
          }
          environment.setProjectMetadata(synced);
          return true;
        },
      });
      const recorded = { ...environment.getProject(), durable: result.project.durable };
      environment.setProjectMetadata(recorded);
      return {
        status: "accepted",
        message: result.created
          ? "Durable Run queued. It continues after this browser disconnects."
          : "The existing durable Run receipt was recovered without a duplicate submission.",
        project: recorded,
        runIds: [result.runId],
        cost: PROVIDER_PRICE,
      };
    },
  },
  ...(["voice", "music"] as const).map((mode): CanvasCommandDefinition => ({
    commandId: `canvas.node.generate.${mode}`, scope: "selection", surfaces: ["compact", "protocol", "context-more"], mode: "generate", execution: "server", billing: "estimated", cancellation: "client-abort", inputSchema: `canvas.node.generate.${mode}.v1`, mutates: "asset", label: mode === "voice" ? "生成配音" : "生成音乐",
    disclosure: () => ({ provider: "OceanLeo media gateway", model: "Platform default", input: "Text / script", cost: PROVIDER_PRICE.label, contract: mode === "voice" ? "POST /v1/audio/tts" : "POST /v1/music/generate" }),
    availability: (environment, args) => {
      const node = selectedNode(environment);
      if (node?.kind !== "audio") return { enabled: false, reason: "Select an Audio node first." };
      return generationInputs(environment, node, args).prompt ? { enabled: true } : { enabled: false, reason: "添加文本或连接脚本。" };
    },
    handler: async (environment, args, request) => {
      const node = selectedNode(environment)!;
      const result = await generateAudio({ mode, text: generationInputs(environment, node, args).prompt, model: providerModelName(node.model), voice: node.voice, duration: node.durationSeconds, signal: environment.getCommandSignal?.(request.requestId) });
      if (!result.audio_url) throw new Error("生成失败，请重试。");
      const attached = attachGeneratedAsset(environment.getProject(), node.nodeId, { kind: "audio", origin: "provider", title: node.title, url: result.audio_url }, `canvas.node.generate.${mode}`);
      attached.project.versions[attached.project.headVersionId].graph.nodes.find((candidate) => candidate.nodeId === node.nodeId)!.audioMode = mode;
      return { message: "已完成", project: attached.project, assetIds: [attached.asset.assetId], cost: PROVIDER_PRICE };
    },
  })),
  {
    commandId: "canvas.chain.run", scope: "selection", surfaces: ["compact", "toolbar", "protocol", "context-more"], execution: "server", billing: "estimated", cancellation: "client-abort", inputSchema: "canvas.chain.run.v1", mutates: "project", label: "运行这条链",
    availability: (environment) => {
      const node = selectedNode(environment);
      if (!node || !["text", "script", "image", "video", "audio"].includes(node.kind)) return { enabled: false, reason: "Select a generation node first." };
      canvasUpstreamOrder(environment.getProject(), node.nodeId);
      return { enabled: true };
    },
    disclosure: () => ({ provider: "OceanLeo media gateway", model: "Each node's selected model", input: "Missing upstream outputs, then selected node", cost: "Provider-metered per generated node", contract: "Explicit ordered generation" }),
    handler: runCanvasChain,
  },
  {
    commandId: "canvas.script.structure",
    scope: "selection",
    surfaces: ["compact", "protocol", "context-more"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.script.structure.v1",
    mutates: "project",
    label: "Structure scenes and shots",
    availability: (environment) => {
      const node = selectedNode(environment);
      if (!node || (node.kind !== "script" && node.kind !== "text")) {
        return {
          enabled: false,
          reasonCode: "INVALID_SELECTION",
          reason: "Select a Script or Text node first.",
        };
      }
      return (node.text || node.prompt || "").trim()
        ? { enabled: true }
        : {
            enabled: false,
            reasonCode: "MISSING_REQUIRED_INPUT",
            reason: "Add script content before structuring scenes.",
          };
    },
    handler: (environment) => {
      const node = selectedNode(environment);
      if (!node) throw new Error("Script selection changed.");
      const structured = structureScriptIntoProduction(
        environment.getProject(),
        node.nodeId,
      );
      environment.setWorkspaceView("storyboard");
      return {
        message: `${structured.sceneIds.length} scenes and ${structured.shotIds.length} shots were added to the immutable Project history.`,
        project: structured.project,
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.director.camera-plan.create",
    scope: "project",
    surfaces: ["compact", "toolbar", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.director.camera-plan.create.v1",
    mutates: "project",
    label: "Create camera plan",
    availability: (environment) =>
      projectHead(environment.getProject()).shots.length
        ? { enabled: true }
        : {
            enabled: false,
            reasonCode: "MISSING_REQUIRED_INPUT",
            reason: "Create a Shot before planning a camera.",
          },
    handler: (environment, args) => {
      const selected = selectedNode(environment);
      const planned = createCameraPlan(
        environment.getProject(),
        requireString(args, "shotId", selected?.shotId || "") || undefined,
      );
      environment.setWorkspaceView("director");
      return {
        message: "A 35 mm camera and dolly path were added as a real plan.",
        project: planned.project,
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.timeline.build-approved",
    scope: "project",
    surfaces: ["compact", "toolbar", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.timeline.build-approved.v1",
    mutates: "project",
    label: "Build timeline from approved takes",
    availability: (environment) =>
      projectHead(environment.getProject()).takes.some(
        (take) => take.status === "approved",
      )
        ? { enabled: true }
        : {
            enabled: false,
            reasonCode: "MISSING_REQUIRED_INPUT",
            reason: "Approve at least one Take before building the Timeline.",
          },
    handler: (environment) => {
      const built = buildTimelineFromApprovedTakes(environment.getProject());
      environment.setWorkspaceView("timeline");
      return {
        message: `${built.clipIds.length} approved Takes were placed on the Timeline.`,
        project: built.project,
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.timeline.final-render",
    scope: "project",
    surfaces: ["compact", "toolbar", "protocol"],
    execution: "server",
    billing: "estimated",
    cancellation: "cooperative",
    inputSchema: "oceanleo.timeline-snapshot@1",
    mutates: "asset",
    label: "Final Render",
    disclosure: (environment) => {
      const current = projectHead(environment.getProject());
      const timeline = current.timelines[0];
      return {
        provider: "OceanLeo timeline renderer",
        model: "oceanleo-convert · FFmpeg",
        input: `${timeline?.title || "Main timeline"} · ${
          current.shots.filter((shot) => current.takes.some((take) => take.takeId === shot.approvedTakeId && take.status === "approved")).length
        } immutable clips · Project ${environment.getProject().headVersionId}`,
        cost:
          "Metered video compose; charge, settlement, and output are pinned to the idempotent render job",
        contract:
          "POST/GET/DELETE /v1/video/render-timeline · oceanleo.timeline-run-receipt@1",
      };
    },
    availability: (environment) => {
      try {
        canvasCompositionDocument(environment.getProject());
        return { enabled: true };
      } catch (error) {
        return {
          enabled: false,
          reasonCode: "MISSING_REQUIRED_INPUT",
          reason:
            error instanceof Error
              ? error.message
              : "Final Render requires a valid Timeline.",
        };
      }
    },
    handler: async (environment, _args, request) => {
      const sourceProject = environment.getProject();
      const timeline = canvasCompositionDocument(sourceProject);
      const receipt = await renderComposedCanvas({
        requestId: request.requestId,
        title: `${sourceProject.title} · Final Render`,
        timeline: timeline.document,
        canvasSource: timeline.canvasSource,
        signal: environment.getCommandSignal?.(request.requestId),
        onProgress: (progress) =>
          environment.reportCommandProgress?.(request.requestId, progress),
      });
      const attached = attachFinalRenderAsset(
        environment.getProject(),
        {
          kind: "video",
          origin: "provider",
          title: `${sourceProject.title} · Final Render`,
          url: receipt.url,
          mime: receipt.mimeType,
          libraryItem: receipt.libraryItem,
          provider: {
            receiptId: receipt.receiptId,
            provider: receipt.provider,
            model: receipt.model,
            operation: "final-render",
            pricing: receipt.pricing,
          },
        },
        timeline.inputAssetIds,
        "canvas.timeline.final-render",
      );
      const project = recordCanvasOperationReceipt(attached.project, {
        schema: "oceanleo.canvas-operation-receipt@1",
        receiptId: receipt.receiptId,
        requestId: request.requestId,
        requestFingerprint: commandRequestFingerprint(request),
        commandId: "canvas.timeline.final-render",
        projectVersionId: sourceProject.headVersionId,
        status: "succeeded",
        provider: receipt.provider,
        model: receipt.model,
        pricing: receipt.pricing,
        inputAssetIds: timeline.inputAssetIds,
        outputAssetIds: [attached.asset.assetId],
        externalRunIds: [receipt.jobId],
        startedAt: receipt.startedAt,
        completedAt: receipt.completedAt,
      });
      environment.setWorkspaceView("timeline");
      return {
        message:
          "成片已保存到我的库，来源镜头和工程版本已记录。",
        project,
        selectedNodeId: attached.nodeId,
        assetIds: [attached.asset.assetId],
        runIds: [receipt.jobId],
        receiptIds: [receipt.receiptId],
        cost: canvasProviderCost(receipt),
        progress: {
          phase: "complete",
          progress: 1,
          externalRunId: receipt.jobId,
          message: "Final Render complete.",
        },
      };
    },
  },
  {
    commandId: "canvas.timeline.configure",
    scope: "project", surfaces: ["toolbar", "protocol"], execution: "local", billing: "none",
    inputSchema: "canvas.timeline.configure.v1", mutates: "project", label: "合成参数",
    handler: (environment, args) => ({ message: "合成参数已更新。", cost: NO_COST,
      project: configureTimelineNode(environment.getProject(), String(args.nodeId || ""), String(args.field || ""), args.value) }),
  },
  {
    commandId: "canvas.timeline.handoff",
    scope: "project",
    surfaces: ["toolbar", "compact", "protocol"],
    execution: "server",
    billing: "none",
    inputSchema: "oceanleo.timeline.v1",
    mutates: "project",
    label: "在时间线里精修",
    availability: (environment) => {
      try { canvasCompositionDocument(environment.getProject()); return { enabled: true }; }
      catch (error) { return { enabled: false, reason: error instanceof Error ? error.message : "请先在分镜中批准视频候选。" }; }
    },
    handler: async (environment, _args, request) => {
      const source = environment.getProject();
      const composed = canvasCompositionDocument(source);
      const item = await handoffCanvasTimeline({ projectDocument: composed.projectDocument,
        title: source.title, previous: source.timelineHandoff,
        signal: environment.getCommandSignal?.(request.requestId) });
      return { message: "时间线已保存到我的库，可继续精修。",
        project: recordTimelineHandoff(environment.getProject(), item, source.headVersionId), cost: NO_COST };
    },
  },
  ...(
    [
      {
        commandId: "canvas.take.review",
        decision: "in-review",
        label: "Send Take to review",
      },
      {
        commandId: "canvas.take.approve",
        decision: "approved",
        label: "Approve Take",
      },
      {
        commandId: "canvas.take.reject",
        decision: "rejected",
        label: "Reject Take",
      },
    ] as const
  ).map(
    (action): CanvasCommandDefinition => ({
      commandId: action.commandId,
      scope: "project",
      surfaces: ["compact", "toolbar", "protocol"],
      execution: "local",
      billing: "none",
      inputSchema: `${action.commandId}.v1`,
      mutates: "project",
      label: action.label,
      availability: (environment, args) => {
        const takeId = requireString(args, "takeId");
        return takeId &&
          projectHead(environment.getProject()).takes.some(
            (take) => take.takeId === takeId,
          )
          ? { enabled: true }
          : {
              enabled: false,
              reasonCode: "MISSING_REQUIRED_INPUT",
              reason: "Choose an existing Take first.",
            };
      },
      handler: (environment, args) => ({
        message: `${action.label} recorded in Project history.`,
        project: reviewTake(
          environment.getProject(),
          requireString(args, "takeId"),
          action.decision,
          requireString(args, "note"),
        ),
        cost: NO_COST,
      }),
    }),
  ),
  {
    commandId: "canvas.project.continuity-qc.check",
    scope: "project",
    surfaces: ["compact", "toolbar", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.project.continuity-qc.check.v1",
    mutates: "project",
    label: "Run continuity QC",
    handler: (environment) => {
      const project = runContinuityQc(environment.getProject());
      const report = projectHead(project).continuityQc;
      return {
        message: `Continuity QC: ${report?.status || "not-checked"} · ${report?.issues.length || 0} issues.`,
        project,
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.run.status.refresh",
    scope: "run",
    surfaces: ["compact", "toolbar", "protocol"],
    execution: "server",
    billing: "none",
    inputSchema: "canvas.run.status.refresh.v2",
    mutates: "runtime",
    label: "Refresh generation status",
    availability: (environment, args) => {
      const runId = requireString(args, "runId");
      return runId &&
        environment
          .getProject()
          .durable?.runs.some((run) => run.runId === runId)
        ? { enabled: true }
        : { enabled: false, reason: "No durable Run receipt is selected." };
    },
    handler: async (environment, args) => {
      const runId = requireString(args, "runId");
      const refreshed = await refreshDurableVideoRun(
        environment.getProject(),
        runId,
      );
      return {
        message: refreshed.message,
        project: refreshed.project,
        runIds: [runId],
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.run.cancel",
    scope: "run",
    surfaces: ["compact", "toolbar", "protocol"],
    execution: "server",
    billing: "none",
    inputSchema: "canvas.run.cancel.v2",
    mutates: "runtime",
    label: "Cancel",
    availability: (environment, args) => {
      const runId = requireString(args, "runId");
      const run = environment
        .getProject()
        .durable?.runs.find((candidate) => candidate.runId === runId);
      if (!run) {
        return { enabled: false, reason: "No durable Run receipt is selected." };
      }
      return ["succeeded", "failed", "cancelled"].includes(run.status)
        ? { enabled: false, reason: `Run is already ${run.status}.` }
        : { enabled: true };
    },
    handler: async (environment, args) => {
      const runId = requireString(args, "runId");
      const cancelled = await requestDurableVideoRunCancel(
        environment.getProject(),
        runId,
      );
      return {
        message: "已请求停止跟踪；供应商可能继续生成和计费。",
        project: cancelled.project,
        runIds: [runId],
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.node.delete",
    scope: "selection",
    surfaces: ["keyboard", "context-more", "protocol"],
    execution: "local",
    billing: "none",
    inputSchema: "canvas.node.delete.v2",
    mutates: "project",
    label: "Delete node",
    availability: (environment) =>
      selectedNode(environment)
        ? { enabled: true }
        : { enabled: false, reason: "Select a node first." },
    handler: (environment) => {
      const node = selectedNode(environment);
      if (!node) throw new Error("Selection changed.");
      return {
        message: "Node removed; immutable Assets were retained.",
        project: removeProjectNode(environment.getProject(), node.nodeId),
        selectedNodeId: null,
        cost: NO_COST,
      };
    },
  },
  {
    commandId: "canvas.project.save",
    scope: "project",
    surfaces: ["toolbar", "keyboard", "protocol"],
    execution: "server",
    billing: "none",
    inputSchema: "canvas.project.save.v2",
    mutates: "none",
    label: "Save project snapshot",
    handler: async (environment, args) => {
      const saved = await environment.saveProject({
        saveId:
          typeof args.saveId === "string" && args.saveId.trim()
            ? args.saveId.trim()
            : undefined,
      });
      return {
        message: `Project snapshot uploaded${saved.url ? " for persistence" : ""}.`,
        assetIds: [],
        cost: NO_COST,
      };
    },
  },
];

async function runCanvasChain(environment: CanvasCommandEnvironment, _args: Record<string, unknown>, request: CanvasCommandRequest): Promise<HandlerOutcome> {
  const target = selectedNode(environment)!;
  const ordered = canvasUpstreamOrder(environment.getProject(), target.nodeId);
  const assetIds: string[] = [], runIds: string[] = [];
  // Validate/quote every video before any paid upstream work is submitted.
  for (const node of ordered.filter((node) => node.kind === "video")) await prepareVideoQuote(environment.getProject(), node);
  for (const planned of ordered) {
    if (environment.getCommandSignal?.(request.requestId)?.aborted) throw new Error("已停止这条链；已提交的视频可能继续生成和计费。");
    const stored = projectHead(environment.getProject()).graph.nodes.find((node) => node.nodeId === planned.nodeId);
    if (!stored) throw new Error("连接的素材尚未准备好。");
    const current = effectiveCanvasNode(stored);
    if (current.nodeId !== target.nodeId && canvasNodeHasOutput(environment.getProject(), current)) continue;
    const kind = current.kind === "audio" ? current.audioMode || "voice" : ["text", "script"].includes(current.kind) ? "script" : current.kind;
    const commandId = `canvas.node.generate.${kind}`;
    const definition = entries.get(commandId);
    if (!definition) throw new Error(`Cannot generate ${current.title}: ${current.kind}`);
    const scoped = { ...environment, getSelectedNodeId: () => current.nodeId, getCommandSignal: () => environment.getCommandSignal?.(request.requestId) };
    if (current.kind === "video") await prepareVideoQuote(environment.getProject(), current);
    const availability = commandAvailability(commandId, scoped);
    if (!availability.enabled) throw new Error(availability.reason || "Generation unavailable");
    environment.reportNodeProgress?.(current.nodeId, "running", "正在运行…");
    try {
      const baseHead = environment.getProject().headVersionId;
      const result = await definition.handler(scoped, {}, { ...request, commandId, requestId: `${request.requestId}:${current.nodeId}`.slice(0, 128), projectVersionId: baseHead });
      if (environment.getProject().headVersionId !== baseHead || environment.getSelectionEpoch() !== request.selectionEpoch) throw new Error("工程已改变；这条链已停止。");
      if (result.project) environment.setProject(result.project);
      assetIds.push(...result.assetIds || []); runIds.push(...result.runIds || []);
      if (current.kind === "video" && result.runIds?.[0]) {
        const runId = result.runIds[0];
        while (true) {
          if (environment.getCommandSignal?.(request.requestId)?.aborted) throw new Error("已停止这条链；已提交的视频可能继续生成和计费。");
          const snapshot = await getDurableVideoRun(runId);
          const refreshed = reconcileDurableVideoRun(environment.getProject(), runId, snapshot);
          environment.setProjectMetadata(refreshed.project);
          const run = refreshed.project.durable!.runs.find((item) => item.runId === runId)!;
          if (!durableRunNeedsPolling(run)) {
            if (run.status !== "succeeded") throw new Error(refreshed.message);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
      environment.reportNodeProgress?.(current.nodeId, "succeeded", "已完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      environment.reportNodeProgress?.(current.nodeId, "failed", message);
      environment.setProjectMetadata(withCanvasNodeGeneration(environment.getProject(), current.nodeId, "failed", message));
      throw error;
    }
  }
  return { message: "已完成", appliedHeadVersionId: environment.getProject().headVersionId, assetIds, runIds };
}

const entries = new Map<string, CanvasCommandDefinition>();
for (const definition of definitions) {
  if (entries.has(definition.commandId)) {
    throw new Error(`Duplicate canvas command: ${definition.commandId}`);
  }
  if (
    definition.mode === "retouch" &&
    (definition.execution !== "local" || definition.billing !== "none")
  ) {
    throw new Error(
      `Retouch command ${definition.commandId} must be local and non-billable.`,
    );
  }
  entries.set(definition.commandId, definition);
}

export const CANVAS_COMMAND_REGISTRY: ReadonlyMap<
  string,
  CanvasCommandDefinition
> = entries;

export function commandAvailability(
  commandId: string,
  environment: CanvasCommandEnvironment,
  args: Record<string, unknown> = {},
): CanvasCommandAvailability {
  const definition = entries.get(commandId);
  if (!definition) return { enabled: false, reason: "Unknown command." };
  const legacyBlock = legacyExecutionBlockReason(
    selectedNode(environment)?.legacySourceNode,
    definition,
  );
  if (legacyBlock) {
    return {
      enabled: false,
      reasonCode: "LEGACY_WORKFLOW_UNSUPPORTED",
      reason: legacyBlock,
    };
  }
  try { return definition.availability?.(environment, args) || { enabled: true }; }
  catch (error) { return { enabled: false, reasonCode: "MISSING_REQUIRED_INPUT", reason: error instanceof CanvasInputError && environment.translate ? error.translated(environment.translate) : error instanceof Error ? error.message : String(error) }; }
}

export function commandDisclosure(
  commandId: string,
  environment: CanvasCommandEnvironment,
  args: Record<string, unknown> = {},
): CanvasCommandDisclosure | undefined {
  return entries.get(commandId)?.disclosure?.(environment, args);
}

function failedResult(
  request: CanvasCommandRequest,
  environment: CanvasCommandEnvironment,
  status: "rejected" | "disabled" | "failed" | "cancelled",
  code: string,
  message: string,
  cost: CanvasCostSummary = NO_COST,
  options: {
    retryable?: boolean;
    cancellation?: CanvasAdapterCancellation;
  } = {},
): CanvasCommandResult {
  return {
    commandId: request.commandId,
    requestId: request.requestId,
    projectVersionId: environment.getProject().headVersionId,
    selectionEpoch: environment.getSelectionEpoch(),
    status,
    message,
    assetIds: [],
    runIds: [],
    receiptIds: [],
    cost,
    ...(options.cancellation
      ? { cancellation: options.cancellation }
      : {}),
    error: {
      code,
      message,
      ...(options.retryable !== undefined
        ? { retryable: options.retryable }
        : {}),
    },
  };
}

const activeGenerationNodes = new Set<string>();

export async function executeCanvasCommand(
  request: CanvasCommandRequest,
  environment: CanvasCommandEnvironment,
): Promise<CanvasCommandResult> {
  const definition = entries.get(request.commandId);
  if (!definition) {
    return failedResult(
      request,
      environment,
      "rejected",
      "UNKNOWN_COMMAND",
      "Command is not registered.",
    );
  }
  const legacyBlock = legacyExecutionBlockReason(
    selectedNode(environment)?.legacySourceNode,
    definition,
  );
  if (legacyBlock) {
    environment.setStatus(legacyBlock);
    return failedResult(
      request,
      environment,
      "disabled",
      "LEGACY_WORKFLOW_UNSUPPORTED",
      legacyBlock,
      NO_COST,
    );
  }
  const currentProject = environment.getProject();
  const existingReceipt = operationReceiptForRequest(
    currentProject,
    request.requestId,
  );
  if (existingReceipt) {
    if (
      existingReceipt.commandId !== request.commandId ||
      existingReceipt.requestFingerprint !== commandRequestFingerprint(request)
    ) {
      return failedResult(
        request,
        environment,
        "rejected",
        "IDEMPOTENCY_KEY_REUSED",
        "This command request ID already belongs to a different immutable provider receipt.",
      );
    }
    environment.setStatus(
      "Recovered the existing immutable provider receipt without another submission.",
    );
    return {
      commandId: request.commandId,
      requestId: request.requestId,
      projectVersionId: currentProject.headVersionId,
      selectionEpoch: environment.getSelectionEpoch(),
      status: "succeeded",
      message:
        "Recovered the existing immutable provider receipt without another submission.",
      assetIds: [...existingReceipt.outputAssetIds],
      runIds: [...existingReceipt.externalRunIds],
      receiptIds: [existingReceipt.receiptId],
      cost: canvasProviderCost(existingReceipt),
      progress: {
        phase: "complete",
        progress: 1,
        message: "Existing receipt recovered.",
      },
    };
  }
  if (request.projectVersionId !== currentProject.headVersionId) {
    return failedResult(
      request,
      environment,
      "rejected",
      "STALE_PROJECT_VERSION",
      "Command targets an obsolete Project head.",
    );
  }
  if (request.selectionEpoch !== environment.getSelectionEpoch()) {
    return failedResult(
      request,
      environment,
      "rejected",
      "STALE_SELECTION_EPOCH",
      "Command targets an obsolete selection.",
    );
  }
  if (!definition.surfaces.includes(request.surface)) {
    return failedResult(
      request,
      environment,
      "rejected",
      "SURFACE_NOT_ALLOWED",
      "Command is not exposed on this surface.",
    );
  }
  if (
    definition.mode &&
    selectedNode(environment)?.kind === "image" &&
    definition.mode !== environment.getImageMode()
  ) {
    return failedResult(
      request,
      environment,
      "disabled",
      "IMAGE_MODE_MISMATCH",
      `Switch to ${definition.mode === "retouch" ? "Retouch" : "Generate"} mode before using this command.`,
      definition.billing === "none" ? NO_COST : PROVIDER_PRICE,
    );
  }
  const args = request.args || {};
  const availability = commandAvailability(
    request.commandId,
    environment,
    args,
  );
  if (!availability.enabled) {
    const message = availability.reason || "Capability is unavailable.";
    environment.setStatus(message);
    return failedResult(
      request,
      environment,
      "disabled",
      "CAPABILITY_DISABLED",
      message,
      definition.billing === "none" ? NO_COST : PROVIDER_PRICE,
    );
  }
  if (
    definition.mode === "retouch" &&
    (definition.execution !== "local" || definition.billing !== "none")
  ) {
    return failedResult(
      request,
      environment,
      "rejected",
      "RETOUCH_BILLING_INVARIANT",
      "Retouch must remain local and non-billable.",
    );
  }
  const generating = request.commandId.startsWith("canvas.node.generate.") || request.commandId === "canvas.chain.run";
  const node = selectedNode(environment);
  const lockKeys = generating && node ? (request.commandId === "canvas.chain.run" ? canvasUpstreamOrder(environment.getProject(), node.nodeId) : [node]).map((item) => `${currentProject.projectId}:${item.nodeId}`) : [];
  if (lockKeys.some((key) => activeGenerationNodes.has(key))) return failedResult(request, environment, "disabled", "ALREADY_RUNNING", "正在运行…");
  lockKeys.forEach((key) => activeGenerationNodes.add(key));
  if (generating && node && request.commandId !== "canvas.chain.run") environment.reportNodeProgress?.(node.nodeId, "running", "正在运行…");
  try {
    const outcome = await definition.handler(environment, args, request);
    // Delivery operates on its captured cut and attaches the resulting Library
    // identity to the latest canvas. Changing selection or editing while it
    // renders must not discard an already-published film or timeline link.
    const isDelivery = request.commandId === "canvas.timeline.final-render" || request.commandId === "canvas.timeline.handoff";
    if (!isDelivery && (
      environment.getProject().headVersionId !== (outcome.appliedHeadVersionId || request.projectVersionId) ||
      environment.getSelectionEpoch() !== request.selectionEpoch
    )) {
      return failedResult(
        request,
        environment,
        "rejected",
        "STALE_COMMAND_RESULT",
        "The command completed against an obsolete Project head or selection; its result was not promoted.",
        definition.billing === "none" ? NO_COST : PROVIDER_PRICE,
      );
    }
    if (outcome.project) environment.setProject(outcome.project);
    if (generating && node && request.commandId !== "canvas.chain.run") environment.reportNodeProgress?.(node.nodeId, outcome.status === "accepted" ? "queued" : "succeeded", outcome.message);
    if (outcome.selectedNodeId !== undefined) {
      environment.setSelectedNodeId(outcome.selectedNodeId);
    }
    environment.setStatus(outcome.message);
    return {
      commandId: request.commandId,
      requestId: request.requestId,
      projectVersionId:
        outcome.project?.headVersionId ||
        environment.getProject().headVersionId,
      selectionEpoch: environment.getSelectionEpoch(),
      status: outcome.status || "succeeded",
      message: outcome.message,
      assetIds: outcome.assetIds || [],
      runIds: outcome.runIds || [],
      receiptIds: outcome.receiptIds || [],
      cost:
        outcome.cost ||
        (definition.billing === "none" ? NO_COST : PROVIDER_PRICE),
      ...(outcome.progress ? { progress: outcome.progress } : {}),
    };
  } catch (error) {
    const message = error instanceof CanvasInputError && environment.translate ? error.translated(environment.translate)
      : error instanceof Error ? error.message : "Command execution failed.";
    environment.setStatus(message);
    if (generating && node && request.commandId !== "canvas.chain.run") {
      environment.reportNodeProgress?.(node.nodeId, "failed", message);
      if (request.commandId !== REMOVE_BACKGROUND_COMMAND) environment.setProjectMetadata(withCanvasNodeGeneration(environment.getProject(), node.nodeId, "failed", message));
    }
    if (error instanceof CanvasAdapterError && error.cancelled) {
      return failedResult(
        request,
        environment,
        "cancelled",
        error.code,
        message,
        definition.billing === "none" ? NO_COST : PROVIDER_PRICE,
        {
          retryable: error.retryable,
          cancellation: error.cancellation,
        },
      );
    }
    return failedResult(
      request,
      environment,
      "failed",
      error instanceof CanvasAdapterError ? error.code : "COMMAND_FAILED",
      message,
      definition.billing === "none" ? NO_COST : PROVIDER_PRICE,
      {
        retryable:
          error instanceof CanvasAdapterError ? error.retryable : false,
      },
    );
  } finally {
    lockKeys.forEach((key) => activeGenerationNodes.delete(key));
  }
}

export function newCommandRequestId(): string {
  return stableId("command");
}
