/**
 * Execution gateway for the gallery-editor package.
 *
 * Durable Project/Run and provider generate calls never import site `app/` or
 * `@/lib/canvas`. The site adapter binds real implementations and/or
 * `host.fetchJson`. When neither is present, callers throw and the UI degrades
 * to graph-only editing.
 */

export type CanvasProviderProgressPhase =
  | "validating"
  | "submitting"
  | "queued"
  | "processing"
  | "rendering"
  | "finalizing"
  | "complete"
  | "canceling";

export interface CanvasProviderProgress {
  phase: CanvasProviderProgressPhase;
  progress: number;
  message?: string;
  externalRunId?: string;
}

export interface CanvasAdapterCancellation {
  scope: "client-request" | "gateway-job";
  disposition:
    | "client-aborted-provider-may-continue"
    | "gateway-cancel-requested";
  message: string;
}

export class CanvasError extends Error {}

export class CanvasAdapterError extends CanvasError {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly cancelled: boolean;
  readonly cancellation?: CanvasAdapterCancellation;

  constructor(
    code: string,
    message: string,
    options: {
      retryable?: boolean;
      status?: number;
      cancelled?: boolean;
      cancellation?: CanvasAdapterCancellation;
    } = {},
  ) {
    super(message);
    this.name = "CanvasAdapterError";
    this.code = code;
    this.retryable = options.retryable === true;
    this.status = options.status;
    this.cancelled = options.cancelled === true;
    this.cancellation = options.cancellation;
  }
}

export type CanvasImageSemanticOperation =
  | "generate"
  | "grid-4"
  | "grid-9"
  | "grid-25"
  | "relight"
  | "multi-angle"
  | "panorama"
  | "upscale"
  | "inpaint"
  | "outpaint"
  | "portrait-quality";

export type CanvasImageProviderOperation = Exclude<
  CanvasImageSemanticOperation,
  "generate"
>;

export interface CanvasImageOperationCapability {
  operation: CanvasImageSemanticOperation;
  available: boolean;
  execution: "server";
  billing: "estimated";
  adapter: string;
  requiredContract: string;
  disabledReason?: string;
}

export const CANVAS_IMAGE_OPERATION_CAPABILITIES: Readonly<
  Record<CanvasImageSemanticOperation, CanvasImageOperationCapability>
> = Object.freeze({
  generate: {
    operation: "generate",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "video:/api/site/video/canvas -> POST /v1/images/generate",
    requiredContract: "POST /v1/images/generate",
  },
  "grid-4": {
    operation: "grid-4",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · 2×2 contact sheet",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
  "grid-9": {
    operation: "grid-9",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · 3×3 contact sheet",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
  "grid-25": {
    operation: "grid-25",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · 5×5 contact sheet",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
  relight: {
    operation: "relight",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · description_edit",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
  "multi-angle": {
    operation: "multi-angle",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · one request per named viewpoint",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
  panorama: {
    operation: "panorama",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · 2:1 projection",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
  upscale: {
    operation: "upscale",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/upscale · super_resolution",
    requiredContract: "oceanleo.gateway.images.upscale@1",
  },
  inpaint: {
    operation: "inpaint",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · source + durable mask URL",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
  outpaint: {
    operation: "outpaint",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · explicit target margins",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
  "portrait-quality": {
    operation: "portrait-quality",
    available: true,
    execution: "server",
    billing: "estimated",
    adapter: "POST /v1/images/edit · identity-preserving enhancement",
    requiredContract: "oceanleo.gateway.images.edit@1",
  },
});

export interface CanvasImageSemanticParameters {
  prompt?: string;
  model?: string;
  direction?: "front" | "back" | "left" | "right" | "top" | "ambient";
  intensity?: number;
  count?: number;
  fieldOfView?: number;
  scale?: 2 | 4;
  maskUrl?: string;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  strength?: number;
}

export interface CanvasProviderPricing {
  billing: "provider";
  amount: number | null;
  currency: "OCEANLEO_CREDITS";
  estimated: boolean;
  label: string;
}

export interface CanvasImageSemanticReceipt {
  schema: "oceanleo.image-command-receipt@1";
  receiptId: string;
  operation: CanvasImageProviderOperation;
  status: "succeeded";
  provider: "oceanleo-image-gateway";
  model: string;
  pricing: CanvasProviderPricing;
  providerRequestIds: string[];
  outputs: Array<{
    outputId: string;
    url: string;
    mimeType: string;
  }>;
  startedAt: string;
  completedAt: string;
}

export interface DurableVideoCanvasGraph {
  schema: "oceanleo.video.canvas.v2";
  nodes: Array<{
    id: string;
    operation: string;
    normalized_params: Record<string, unknown>;
    tool_version: string;
    input_asset_ids: string[];
    depends_on: string[];
    output_slot: string;
    provider: string;
    provider_model?: string;
    billing: "provider";
    cost?: DurableVideoQuote["cost"];
  }>;
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    source_slot: string;
    target_slot: string;
  }>;
}

export interface DurableVideoProjectHead {
  project_id: string;
  head_version_id: string;
  head_epoch: number;
}

export interface DurableVideoRunReceipt {
  run_id: string;
  created: boolean;
}

export interface DurableVideoRunSnapshot {
  id: string;
  project_id: string;
  project_version_id: string;
  command_id: string;
  command_request_id: string;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
  node_runs?: Array<Record<string, unknown>>;
  attempts?: Array<Record<string, unknown>>;
  bindings?: Array<Record<string, unknown>>;
  costs?: Array<Record<string, unknown>>;
  output_assets?: Array<{ id: string; node_id: string; url: string; mime_type?: string; duration_ms?: number; content_sha256?: string; created_at?: string }>;
  refund_status?: string;
}

export interface DurableVideoQuote {
  provider: string; provider_model: string; amount: number; currency: string;
  cost: { estimated_cost_nano: number; currency: string; pricing_input: Record<string, unknown> };
}

export interface DurableVideoCapabilities {
  providers?: Record<
    string,
    {
      available?: boolean;
      supported_operations?: string[];
      limitation?: string;
    }
  >;
}

export interface CanvasTimelineDocument {
  width: number;
  height: number;
  fps: number;
  tracks: Array<{
    id: string;
    kind: "video";
    clips: Array<Record<string, unknown>>;
  }>;
}

export interface CanvasTimelineRenderReceipt {
  receiptId: string;
  url: string;
  mimeType: string;
  provider: string;
  model: string;
  pricing: CanvasProviderPricing;
  jobId: string;
  startedAt: string;
  completedAt: string;
}

export const EXECUTION_UNAVAILABLE_MESSAGE =
  "纯编辑：未注入执行通道，不执行 Durable Project/Run 与网关生成";

type FetchJson = (url: string, init?: RequestInit) => Promise<unknown>;

export interface CanvasGatewayImpl {
  listDurableVideoRuns: (projectId: string) => Promise<{ items: Array<{ id: string; command_request_id: string; project_version_id: string; target_node_ids: string[]; status: string; created_at: string }> }>;
  quoteDurableVideo: (input: { model?: string; image: boolean; duration: number; ratio: string }) => Promise<DurableVideoQuote>;
  registerDurableVideoInput: (input: { projectId: string; localAssetId: string; url?: string; sourceDependency?: unknown }) => Promise<{ asset_id: string; content_sha256: string }>;
  generateAudio: (input: { mode: "voice" | "music"; text: string; model?: string; voice?: string; duration?: number; signal?: AbortSignal }) => Promise<{ audio_url: string; model?: string }>;

  generateImage: (
    prompt: string,
    ratio?: string,
    options?: { model?: string; quality?: string; sourceUrls?: string[]; signal?: AbortSignal },
  ) => Promise<{ images: string[] }>;
  generateScript: (
    prompt: string,
    options?: {
      model?: string;
      system?: string;
      maxTokens?: number;
      signal?: AbortSignal;
    },
  ) => Promise<{ text: string }>;
  generateText: (
    prompt: string,
    options?: {
      model?: string;
      system?: string;
      maxTokens?: number;
      signal?: AbortSignal;
    },
  ) => Promise<{ text: string }>;
  executeCanvasImageSemanticOperation: (input: {
    operation: CanvasImageProviderOperation;
    requestId: string;
    sourceAssetId: string;
    sourceUrl: string;
    sourceDigest?: string;
    parameters?: CanvasImageSemanticParameters;
    signal?: AbortSignal;
    onProgress?: (progress: CanvasProviderProgress) => void;
  }) => Promise<CanvasImageSemanticReceipt>;
  renderCanvasTimeline: (input: {
    requestId: string;
    title: string;
    timeline: CanvasTimelineDocument;
    signal?: AbortSignal;
    pollMs?: number;
    onProgress?: (progress: CanvasProviderProgress) => void;
  }) => Promise<CanvasTimelineRenderReceipt>;
  getDurableVideoCapabilities: (
    signal?: AbortSignal,
  ) => Promise<DurableVideoCapabilities>;
  createDurableVideoProject: (input: {
    name: string;
    workspaceId: string;
    graph: DurableVideoCanvasGraph;
    signal?: AbortSignal;
  }) => Promise<DurableVideoProjectHead>;
  promoteDurableVideoVersion: (input: {
    projectId: string;
    expectedHeadVersionId: string;
    expectedHeadEpoch: number;
    graph: DurableVideoCanvasGraph;
    selectionEpoch: number;
    message: string;
    signal?: AbortSignal;
  }) => Promise<DurableVideoProjectHead>;
  createDurableVideoRun: (input: {
    projectId: string;
    commandId: string;
    commandRequestId: string;
    projectVersionId: string;
    expectedHeadEpoch: number;
    targetNodeIds: string[];
    signal?: AbortSignal;
  }) => Promise<DurableVideoRunReceipt>;
  getDurableVideoRun: (
    runId: string,
    signal?: AbortSignal,
  ) => Promise<DurableVideoRunSnapshot>;
  cancelDurableVideoRun: (
    runId: string,
    signal?: AbortSignal,
  ) => Promise<{ run_id: string; status: string }>;
}

let boundFetchJson: FetchJson | undefined;
let boundImpl: Partial<CanvasGatewayImpl> = {};

export function bindCanvasFetchJson(fetchJson?: FetchJson): void {
  boundFetchJson = fetchJson;
}

export function bindCanvasGatewayImpl(impl?: Partial<CanvasGatewayImpl>): void {
  boundImpl = impl || {};
}

export function canvasExecutionAvailable(): boolean {
  return typeof boundFetchJson === "function" || Object.keys(boundImpl).length > 0;
}

function unavailable(): CanvasAdapterError {
  return new CanvasAdapterError("MISSING_RUNTIME", EXECUTION_UNAVAILABLE_MESSAGE);
}

async function viaFetch<T>(url: string, init?: RequestInit): Promise<T> {
  if (!boundFetchJson) throw unavailable();
  return boundFetchJson(url, init) as Promise<T>;
}

export function generateImage(
  prompt: string,
  ratio?: string,
  options: { model?: string; quality?: string; sourceUrls?: string[]; signal?: AbortSignal } = {},
) {
  if (boundImpl.generateImage) {
    return boundImpl.generateImage(prompt, ratio, options);
  }
  return viaFetch<{ images: string[] }>(options.sourceUrls?.length ? "/v1/images/edit" : "/v1/images/generate", {
    method: "POST", signal: options.signal,
    body: JSON.stringify({ prompt, ratio, site_id: "video", ...(options.model ? { model: options.model } : {}), ...(options.sourceUrls?.length ? { image_urls: options.sourceUrls, function: "description_edit" } : {}) }),
  });
}

export function generateScript(
  prompt: string,
  options: {
    model?: string;
    system?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  } = {},
) {
  if (boundImpl.generateScript) return boundImpl.generateScript(prompt, options);
  return chatText(prompt, { ...options, system: options.system || "Write a usable video script with scenes and shot descriptions." });
}

export function generateText(
  prompt: string,
  options: {
    model?: string;
    system?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  } = {},
) {
  if (boundImpl.generateText) return boundImpl.generateText(prompt, options);
  return chatText(prompt, options);
}

export function executeCanvasImageSemanticOperation(input: {
  operation: CanvasImageProviderOperation;
  requestId: string;
  sourceAssetId: string;
  sourceUrl: string;
  sourceDigest?: string;
  parameters?: CanvasImageSemanticParameters;
  signal?: AbortSignal;
  onProgress?: (progress: CanvasProviderProgress) => void;
}) {
  if (boundImpl.executeCanvasImageSemanticOperation) {
    return boundImpl.executeCanvasImageSemanticOperation(input);
  }
  return viaFetch<CanvasImageSemanticReceipt>(
    "/gallery-editor/runtime/image-semantic",
    {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({
        operation: input.operation,
        requestId: input.requestId,
        sourceAssetId: input.sourceAssetId,
        sourceUrl: input.sourceUrl,
        sourceDigest: input.sourceDigest,
        parameters: input.parameters,
      }),
    },
  );
}

export function renderCanvasTimeline(input: {
  requestId: string;
  title: string;
  timeline: CanvasTimelineDocument;
  signal?: AbortSignal;
  pollMs?: number;
  onProgress?: (progress: CanvasProviderProgress) => void;
}) {
  if (boundImpl.renderCanvasTimeline) {
    return boundImpl.renderCanvasTimeline(input);
  }
  return viaFetch<CanvasTimelineRenderReceipt>(
    "/gallery-editor/runtime/render-timeline",
    {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({
        requestId: input.requestId,
        title: input.title,
        timeline: input.timeline,
        pollMs: input.pollMs,
      }),
    },
  );
}

export function getDurableVideoCapabilities(signal?: AbortSignal) {
  if (boundImpl.getDurableVideoCapabilities) {
    return boundImpl.getDurableVideoCapabilities(signal);
  }
  return viaFetch<DurableVideoCapabilities>("/v1/video-canvas/capabilities", {
    signal,
  });
}

export function createDurableVideoProject(input: {
  name: string;
  workspaceId: string;
  graph: DurableVideoCanvasGraph;
  signal?: AbortSignal;
}) {
  if (boundImpl.createDurableVideoProject) {
    return boundImpl.createDurableVideoProject(input);
  }
  return viaFetch<DurableVideoProjectHead>("/v1/video-canvas/projects", {
    method: "POST",
    signal: input.signal,
    body: JSON.stringify({
      name: input.name,
      workspace_id: input.workspaceId,
      idempotency_key: input.workspaceId,
      graph: input.graph,
    }),
  });
}

export function promoteDurableVideoVersion(input: {
  projectId: string;
  expectedHeadVersionId: string;
  expectedHeadEpoch: number;
  graph: DurableVideoCanvasGraph;
  selectionEpoch: number;
  message: string;
  signal?: AbortSignal;
}) {
  if (boundImpl.promoteDurableVideoVersion) {
    return boundImpl.promoteDurableVideoVersion(input);
  }
  return viaFetch<DurableVideoProjectHead>(
    `/v1/video-canvas/projects/${encodeURIComponent(input.projectId)}/versions`,
    {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({
        expected_head_version_id: input.expectedHeadVersionId,
        idempotency_key: input.expectedHeadVersionId,
        expected_head_epoch: input.expectedHeadEpoch,
        graph: input.graph,
        selection_epoch: input.selectionEpoch,
        message: input.message,
      }),
    },
  );
}

export function createDurableVideoRun(input: {
  projectId: string;
  commandId: string;
  commandRequestId: string;
  projectVersionId: string;
  expectedHeadEpoch: number;
  targetNodeIds: string[];
  signal?: AbortSignal;
}) {
  if (boundImpl.createDurableVideoRun) {
    return boundImpl.createDurableVideoRun(input);
  }
  return viaFetch<DurableVideoRunReceipt>(
    `/v1/video-canvas/projects/${encodeURIComponent(input.projectId)}/runs`,
    {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({
        command_id: input.commandId,
        command_request_id: input.commandRequestId,
        project_version_id: input.projectVersionId,
        expected_head_epoch: input.expectedHeadEpoch,
        target_node_ids: input.targetNodeIds,
        kind: "generate",
      }),
    },
  );
}

export function getDurableVideoRun(runId: string, signal?: AbortSignal) {
  if (boundImpl.getDurableVideoRun) {
    return boundImpl.getDurableVideoRun(runId, signal);
  }
  return viaFetch<DurableVideoRunSnapshot>(
    `/v1/video-canvas/runs/${encodeURIComponent(runId)}`,
    { signal },
  );
}

export function cancelDurableVideoRun(runId: string, signal?: AbortSignal) {
  if (boundImpl.cancelDurableVideoRun) {
    return boundImpl.cancelDurableVideoRun(runId, signal);
  }
  return viaFetch<{ run_id: string; status: string }>(
    `/v1/video-canvas/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST", signal },
  );
}

export function quoteDurableVideo(input: { model?: string; image: boolean; duration: number; ratio: string }): Promise<DurableVideoQuote> {
  if (boundImpl.quoteDurableVideo) return boundImpl.quoteDurableVideo(input);
  return viaFetch("/v1/video-canvas/quote", { method: "POST", body: JSON.stringify(input) });
}

export function registerDurableVideoInput(input: { projectId: string; localAssetId: string; url?: string; sourceDependency?: unknown }): Promise<{ asset_id: string; content_sha256: string }> {
  if (boundImpl.registerDurableVideoInput) return boundImpl.registerDurableVideoInput(input);
  return viaFetch(`/v1/video-canvas/projects/${encodeURIComponent(input.projectId)}/inputs`, {
    method: "POST", body: JSON.stringify({ local_asset_id: input.localAssetId, url: input.url || "", source_dependency: input.sourceDependency }),
  });
}

export function generateAudio(input: { mode: "voice" | "music"; text: string; model?: string; voice?: string; duration?: number; signal?: AbortSignal }): Promise<{ audio_url: string; model?: string }> {
  if (boundImpl.generateAudio) return boundImpl.generateAudio(input);
  return viaFetch(input.mode === "voice" ? "/v1/audio/tts" : "/v1/music/generate", {
    method: "POST", signal: input.signal,
    body: JSON.stringify(input.mode === "voice"
      ? { text: input.text, voice: input.voice || "Cherry", ...(input.model ? { model: input.model } : {}), site_id: "video" }
      : { prompt: input.text, duration_s: input.duration || 30, ...(input.model ? { model: input.model } : {}), site_id: "video" }),
  });
}

async function chatText(prompt: string, options: { model?: string; system?: string; maxTokens?: number; signal?: AbortSignal }): Promise<{ text: string }> {
  const response = await viaFetch<{ text?: string; content?: string }>("/v1/chat", {
    method: "POST", signal: options.signal, body: JSON.stringify({ site_id: "video", messages: [{ role: "user", content: prompt }], ...(options.model ? { model: options.model } : {}), system: options.system, max_tokens: options.maxTokens || 4096, enable_thinking: false }),
  });
  const text = response.text || response.content;
  if (!text?.trim()) throw new CanvasAdapterError("EMPTY_RESULT", "生成失败，请重试。");
  return { text };
}

export function listDurableVideoRuns(projectId: string): ReturnType<CanvasGatewayImpl["listDurableVideoRuns"]> {
  if (boundImpl.listDurableVideoRuns) return boundImpl.listDurableVideoRuns(projectId);
  return viaFetch(`/v1/video-canvas/projects/${encodeURIComponent(projectId)}/runs`);
}
