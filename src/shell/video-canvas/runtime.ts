"use client";

import { accessToken } from "../../lib/auth/client";
import { withOperatorRemarkRequest } from "../../lib/operator-remark";
import { GATEWAY_BASE } from "../../lib/auth/config";

// Client-side provider adapter for explicit Generate / Final render commands.
// The route forwards to existing unified-gateway endpoints with the caller's
// SSO bearer; provider keys never enter the browser.
// Architecture: docs/architecture/leoclip-canvas-workflow.md (oceandino repo).

export type LeoNodeKind =
  | "text"
  | "script"
  | "model"
  | "image"
  | "video"
  | "subtitle"
  | "bgm"
  | "audioInput"
  | "imageInput"
  | "videoInput"
  | "compose"
  | "output";

export type PortDataType = "text" | "image" | "video" | "audio" | "model";
export type NodeCategory = "输入" | "模型" | "生成" | "媒体" | "后期" | "输出";

export type LeoNodeStatus = "idle" | "running" | "done" | "error";

export interface LeoNodeData {
  kind: LeoNodeKind;
  title: string;
  // Inputs (typed by the user or injected from an upstream node).
  prompt?: string;
  imageUrl?: string; // image input for video node (first frame)
  videoUrl?: string;
  audioUrl?: string;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  width?: number;
  height?: number;
  duration?: number;
  quality?: string;
  // Outputs.
  outputText?: string;
  outputImages?: string[];
  outputVideos?: string[];
  outputAudios?: string[];
  thumbnailUrl?: string;
  videoDuration?: number;
  // Runtime.
  status: LeoNodeStatus;
  error?: string;
  progress?: string;
  taskId?: string; // video polling
  // UI knobs.
  ratio?: "16:9" | "9:16" | "1:1";
  subtitleText?: string;
  bgmUrl?: string;
  bgmVolume?: number;
  [key: string]: unknown; // React Flow node data is index-signature friendly
}

export class CanvasError extends Error {}

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

export interface CanvasImageOperationCapability {
  operation: CanvasImageSemanticOperation;
  available: boolean;
  execution: "server";
  billing: "estimated";
  adapter: string;
  requiredContract: string;
  disabledReason?: string;
}

/**
 * Frontend projection of the shared image capability engine. Source-aware
 * edits use the deployed /v1/images/edit chain, upscale uses the verified
 * super-resolution route, and every response carries a provider receipt that
 * the Project model pins to immutable output lineage.
 */
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

const VIDEO_CANVAS_GATEWAY = GATEWAY_BASE;

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

export interface CanvasProviderPricing {
  billing: "provider";
  amount: number | null;
  currency: "OCEANLEO_CREDITS";
  estimated: boolean;
  label: string;
}

export interface CanvasAdapterCancellation {
  scope: "client-request" | "gateway-job";
  disposition:
    | "client-aborted-provider-may-continue"
    | "gateway-cancel-requested";
  message: string;
}

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

export type CanvasImageProviderOperation = Exclude<
  CanvasImageSemanticOperation,
  "generate"
>;

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

interface ImageGatewayResponse {
  images?: string[];
  image?: string;
  model?: string;
  request_id?: string;
  credits_spent?: number;
  detail?: string | { message?: string; code?: string };
  error?: string;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { name?: unknown }).name === "AbortError",
  );
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, numeric))
    : fallback;
}

function safeHttpUrl(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  try {
    const url = new URL(text);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    // Report one typed contract error below.
  }
  throw new CanvasAdapterError(
    "CANVAS_ASSET_URL_INVALID",
    `${label} must be a durable HTTP(S) Asset URL.`,
  );
}

function gatewayDetail(payload: unknown, fallback: string): {
  code?: string;
  message: string;
} {
  if (!payload || typeof payload !== "object") return { message: fallback };
  const record = payload as {
    detail?: unknown;
    error?: unknown;
    code?: unknown;
  };
  if (typeof record.detail === "string" && record.detail.trim()) {
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message: record.detail,
    };
  }
  if (record.detail && typeof record.detail === "object") {
    const detail = record.detail as { code?: unknown; message?: unknown };
    return {
      code: typeof detail.code === "string" ? detail.code : undefined,
      message:
        typeof detail.message === "string" && detail.message.trim()
          ? detail.message
          : fallback,
    };
  }
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message:
      typeof record.error === "string" && record.error.trim()
        ? record.error
        : fallback,
  };
}

async function semanticGatewayJson<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    requestId?: string;
  } = {},
): Promise<T> {
  const token = await accessToken();
  if (!token) {
    throw new CanvasAdapterError(
      "CANVAS_AUTH_REQUIRED",
      "Sign in before submitting provider media work.",
    );
  }
  let response: Response;
  try {
    response = await fetch(`${VIDEO_CANVAS_GATEWAY}${path}`, {
      credentials: "include",
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.requestId
          ? {
              "X-Request-ID": options.requestId,
              "X-Idempotency-Key": options.requestId,
            }
          : {}),
      },
      cache: "no-store",
      signal: options.signal,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      throw new CanvasAdapterError(
        "CANVAS_PROVIDER_REQUEST_CANCELLED",
        "The client request was canceled. The blocking image gateway may already have admitted provider work.",
        {
          cancelled: true,
          cancellation: {
            scope: "client-request",
            disposition: "client-aborted-provider-may-continue",
            message:
              "Browser abort stops waiting, but the current image HTTP contract cannot cancel an already-admitted provider task.",
          },
        },
      );
    }
    throw new CanvasAdapterError(
      "CANVAS_GATEWAY_NETWORK",
      "The OceanLeo media gateway could not be reached.",
      { retryable: true },
    );
  }
  let payload: unknown = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const detail = gatewayDetail(
      payload,
      `OceanLeo media gateway failed (HTTP ${response.status}).`,
    );
    throw new CanvasAdapterError(
      detail.code || `CANVAS_GATEWAY_HTTP_${response.status}`,
      detail.message,
      {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      },
    );
  }
  return payload as T;
}

const CANVAS_ANGLE_PROMPTS = Object.freeze([
  "front view",
  "front-left three-quarter view",
  "left profile view",
  "rear-left three-quarter view",
  "rear view",
  "rear-right three-quarter view",
  "right profile view",
  "front-right three-quarter view",
  "high front view",
  "high rear view",
  "low front hero view",
  "low rear view",
  "top-down view",
  "low side view",
  "close detail from the left",
  "close detail from the right",
]);

function withImageDirection(instruction: string, prompt: unknown): string {
  const addition = typeof prompt === "string" ? prompt.trim().slice(0, 4_000) : "";
  return addition ? `${instruction} Additional direction: ${addition}` : instruction;
}

function contactSheetDimension(
  operation: "grid-4" | "grid-9" | "grid-25",
): number {
  if (operation === "grid-4") return 2;
  if (operation === "grid-9") return 3;
  return 5;
}

function imageSemanticRequests(input: {
  operation: CanvasImageProviderOperation;
  sourceUrl: string;
  parameters: CanvasImageSemanticParameters;
}): Array<{ path: "/v1/images/edit" | "/v1/images/upscale"; body: object }> {
  const { operation, sourceUrl, parameters } = input;
  const common = {
    site_id: "video",
    key_mode: "platform",
    image_url: sourceUrl,
    function: "description_edit",
    sharpness: "2K",
    n: 1,
    ...(parameters.model?.trim() ? { model: parameters.model.trim() } : {}),
  };
  const edit = (
    prompt: string,
    options: { ratio?: string; imageUrls?: string[] } = {},
  ) => ({
    path: "/v1/images/edit" as const,
    body: {
      ...common,
      prompt,
      ...(options.ratio ? { ratio: options.ratio } : {}),
      ...(options.imageUrls ? { image_urls: options.imageUrls } : {}),
    },
  });
  if (operation === "relight") {
    const direction = parameters.direction || "ambient";
    const intensity = boundedNumber(parameters.intensity, 1, 0, 2);
    return [
      edit(
        withImageDirection(
          `Relight this exact image from the ${direction} at intensity ${intensity.toFixed(
            2,
          )}. Preserve identity, geometry, materials, framing and every non-lighting detail.`,
          parameters.prompt,
        ),
      ),
    ];
  }
  if (operation === "multi-angle") {
    const count = Math.round(boundedNumber(parameters.count, 4, 2, 16));
    return CANVAS_ANGLE_PROMPTS.slice(0, count).map((angle) =>
      edit(
        withImageDirection(
          `Create the ${angle} of the same subject. Preserve exact identity, proportions, materials, clothing and environment; change only viewpoint.`,
          parameters.prompt,
        ),
      ),
    );
  }
  if (operation === "panorama") {
    const fieldOfView = boundedNumber(parameters.fieldOfView, 180, 90, 360);
    return [
      edit(
        withImageDirection(
          `Extend this scene into one seamless ${fieldOfView} degree equirectangular-style panorama. Preserve the source content and continue boundaries consistently without seams or duplicated subjects.`,
          parameters.prompt,
        ),
        { ratio: "2:1" },
      ),
    ];
  }
  if (
    operation === "grid-4" ||
    operation === "grid-9" ||
    operation === "grid-25"
  ) {
    const dimension = contactSheetDimension(operation);
    return [
      edit(
        withImageDirection(
          `Create one square ${dimension} by ${dimension} contact sheet with exactly ${
            dimension * dimension
          } equal cells and clean straight gutters. Each cell shows a coherent variation of the same source subject; do not add captions, borders or extra cells.`,
          parameters.prompt,
        ),
        { ratio: "1:1" },
      ),
    ];
  }
  if (operation === "upscale") {
    const scale = parameters.scale === 4 ? 4 : 2;
    return [
      {
        path: "/v1/images/upscale",
        body: {
          site_id: "video",
          key_mode: "platform",
          image_url: sourceUrl,
          upscale_factor: scale,
          prompt:
            parameters.prompt?.trim() ||
            "Restore fine detail while preserving exact identity, composition, colors and texture.",
          ...(parameters.model?.trim()
            ? { model: parameters.model.trim() }
            : {}),
        },
      },
    ];
  }
  if (operation === "inpaint") {
    const maskUrl = safeHttpUrl(parameters.maskUrl, "Inpaint mask");
    return [
      edit(
        withImageDirection(
          "The first image is the source and the second image is a mask. Edit only masked pixels, blend boundaries naturally, and preserve every unmasked pixel and subject identity.",
          parameters.prompt || "Fill the masked region consistently.",
        ),
        { imageUrls: [sourceUrl, maskUrl] },
      ),
    ];
  }
  if (operation === "outpaint") {
    const top = Math.round(boundedNumber(parameters.top, 0, 0, 4_096));
    const right = Math.round(boundedNumber(parameters.right, 256, 0, 4_096));
    const bottom = Math.round(boundedNumber(parameters.bottom, 0, 0, 4_096));
    const left = Math.round(boundedNumber(parameters.left, 256, 0, 4_096));
    if (![top, right, bottom, left].some((value) => value > 0)) {
      throw new CanvasAdapterError(
        "CANVAS_OUTPAINT_BOUNDS_REQUIRED",
        "Outpaint requires at least one positive target margin.",
      );
    }
    return [
      edit(
        withImageDirection(
          `Outpaint the canvas by ${top}px top, ${right}px right, ${bottom}px bottom and ${left}px left. Preserve every source pixel and extend only beyond the original boundaries with coherent perspective and lighting.`,
          parameters.prompt,
        ),
      ),
    ];
  }
  const strength = boundedNumber(parameters.strength, 0.5, 0, 1);
  return [
    edit(
      withImageDirection(
        `Enhance this portrait at strength ${strength.toFixed(
          2,
        )}. Preserve facial identity, expression, age, skin texture, hair, pose and composition; improve only natural detail, exposure and artifact cleanup.`,
        parameters.prompt,
      ),
    ),
  ];
}

/**
 * Thin LeoVideo adapter over the documented shared image provider mapping.
 * The installed package can lag the concurrently landing public export, so the
 * site binds the same wire schemas without forking provider credentials.
 */
export async function executeCanvasImageSemanticOperation(input: {
  operation: CanvasImageProviderOperation;
  requestId: string;
  sourceAssetId: string;
  sourceUrl: string;
  sourceDigest?: string;
  parameters?: CanvasImageSemanticParameters;
  signal?: AbortSignal;
  onProgress?: (progress: CanvasProviderProgress) => void;
}): Promise<CanvasImageSemanticReceipt> {
  const startedAt = new Date().toISOString();
  const parameters = input.parameters || {};
  const sourceUrl = safeHttpUrl(input.sourceUrl, "Source image");
  const requests = imageSemanticRequests({
    operation: input.operation,
    sourceUrl,
    parameters,
  });
  const outputs: CanvasImageSemanticReceipt["outputs"] = [];
  const providerRequestIds: string[] = [];
  let model = parameters.model?.trim() || "platform-default";
  let credits = 0;
  let sawCredits = false;
  input.onProgress?.({
    phase: "validating",
    progress: 0,
    message: `Validated immutable source Asset ${input.sourceAssetId}.`,
  });
  for (const [index, request] of requests.entries()) {
    if (input.signal?.aborted) {
      throw new CanvasAdapterError(
        "CANVAS_PROVIDER_REQUEST_CANCELLED",
        "The image command was canceled before the next provider request.",
        {
          cancelled: true,
          cancellation: {
            scope: "client-request",
            disposition: "client-aborted-provider-may-continue",
            message:
              "Completed blocking image requests cannot be recalled; remaining requests were not submitted.",
          },
        },
      );
    }
    input.onProgress?.({
      phase: index === 0 ? "submitting" : "processing",
      progress: 0.1 + (index / Math.max(1, requests.length)) * 0.75,
      message:
        requests.length > 1
          ? `Submitting output ${index + 1}/${requests.length}.`
          : `Submitting ${input.operation}.`,
    });
    const response = await semanticGatewayJson<ImageGatewayResponse>(
      request.path,
      {
        method: "POST",
        body: request.body,
        signal: input.signal,
        requestId: `${input.requestId}:${index}`,
      },
    );
    const urls = [
      ...(Array.isArray(response.images) ? response.images : []),
      ...(response.image ? [response.image] : []),
    ].filter((value): value is string => typeof value === "string" && !!value);
    if (urls.length !== 1) {
      throw new CanvasAdapterError(
        "CANVAS_IMAGE_OUTPUT_CARDINALITY",
        `${input.operation} request ${index + 1} returned ${urls.length} outputs; expected exactly one.`,
        { retryable: true },
      );
    }
    const providerRequestId =
      typeof response.request_id === "string" && response.request_id.trim()
        ? response.request_id.trim()
        : `${input.requestId}:${index}`;
    providerRequestIds.push(providerRequestId);
    if (typeof response.model === "string" && response.model.trim()) {
      model = response.model.trim();
    }
    if (
      typeof response.credits_spent === "number" &&
      Number.isFinite(response.credits_spent)
    ) {
      credits += response.credits_spent;
      sawCredits = true;
    }
    outputs.push({
      outputId: `${providerRequestId}:${index}`,
      url: safeHttpUrl(urls[0], "Provider output"),
      mimeType: "image/png",
    });
  }
  input.onProgress?.({
    phase: "finalizing",
    progress: 0.92,
    message: "Registering immutable provider outputs.",
  });
  const receipt: CanvasImageSemanticReceipt = {
    schema: "oceanleo.image-command-receipt@1",
    receiptId: input.requestId,
    operation: input.operation,
    status: "succeeded",
    provider: "oceanleo-image-gateway",
    model,
    pricing: {
      billing: "provider",
      amount: sawCredits ? credits : null,
      currency: "OCEANLEO_CREDITS",
      estimated: !sawCredits,
      label: sawCredits
        ? `${credits} OceanLeo credits charged`
        : "Provider-metered; the gateway returned no numeric credit amount",
    },
    providerRequestIds,
    outputs,
    startedAt,
    completedAt: new Date().toISOString(),
  };
  input.onProgress?.({
    phase: "complete",
    progress: 1,
    message: `${outputs.length} immutable output${outputs.length === 1 ? "" : "s"} ready.`,
  });
  return receipt;
}

export interface CanvasTimelineDocument {
  width: number;
  height: number;
  fps: number;
  tracks: Array<{
    id: string;
    kind: "video" | "audio" | "text" | "image";
    clips: Array<{
      id: string;
      start_ms: number;
      duration_ms: number;
      source_url?: string;
      source_duration_ms?: number;
      in_ms?: number;
      speed?: number;
      volume?: number;
      muted?: boolean;
      text?: string;
      fit?: "contain" | "cover" | "stretch";
    }>;
  }>;
}

export interface CanvasTimelineRenderReceipt {
  schema: "oceanleo.timeline-run-receipt@1";
  receiptId: string;
  status: "succeeded";
  provider: "oceanleo-timeline-ffmpeg";
  model: "oceanleo-convert";
  pricing: CanvasProviderPricing;
  jobId: string;
  url: string;
  mimeType: "video/mp4";
  startedAt: string;
  completedAt: string;
}

function stableHex32(value: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const words = seeds.map((seed, index) => {
    let hash = seed >>> 0;
    for (let offset = 0; offset < value.length; offset += 1) {
      hash ^= value.charCodeAt(offset) + index * 31;
      hash = Math.imul(hash, 0x01000193 + index * 2) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  });
  return words.join("");
}

function waitForGateway(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      new CanvasAdapterError("CANVAS_TIMELINE_CANCELLED", "Final Render canceled.", {
        cancelled: true,
      }),
    );
  }
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        reject(
          new CanvasAdapterError(
            "CANVAS_TIMELINE_CANCELLED",
            "Final Render canceled.",
            { cancelled: true },
          ),
        );
      },
      { once: true },
    );
  });
}

export async function cancelCanvasTimelineRender(jobId: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(jobId)) return;
  try {
    await semanticGatewayJson<{ status?: string }>(
      `/v1/video/render-timeline/${encodeURIComponent(jobId)}`,
      { method: "DELETE" },
    );
  } catch {
    // Cancellation is reflected as requested even if status reconciliation must
    // happen on the next authenticated poll.
  }
}

/**
 * Submit, recover, poll, and cooperatively cancel the durable timeline route.
 * The stable request id is also the gateway job id, so a lost POST response can
 * be retried without a second charge or render.
 */
export async function renderCanvasTimeline(input: {
  requestId: string;
  title: string;
  timeline: CanvasTimelineDocument;
  signal?: AbortSignal;
  pollMs?: number;
  onProgress?: (progress: CanvasProviderProgress) => void;
}): Promise<CanvasTimelineRenderReceipt> {
  const startedAt = new Date().toISOString();
  if (!input.timeline.tracks.length) {
    throw new CanvasAdapterError(
      "CANVAS_TIMELINE_EMPTY",
      "Final Render requires at least one Timeline track.",
    );
  }
  const jobId = stableHex32(`leovideo-final-render:${input.requestId}`);
  input.onProgress?.({
    phase: "validating",
    progress: 0,
    externalRunId: jobId,
    message: "Validated revision-pinned TimelineDoc.",
  });
  try {
    input.onProgress?.({
      phase: "submitting",
      progress: 0.08,
      externalRunId: jobId,
      message: "Submitting idempotent Final Render.",
    });
    const submission = await semanticGatewayJson<{ job_id?: string }>(
      "/v1/video/render-timeline",
      {
        method: "POST",
        signal: input.signal,
        requestId: jobId,
        body: {
          timeline: input.timeline,
          title: input.title,
          site_id: "video",
          request_id: jobId,
        },
      },
    );
    const submittedJobId = String(submission.job_id || "");
    if (submittedJobId !== jobId) {
      throw new CanvasAdapterError(
        "CANVAS_TIMELINE_RECEIPT_MISMATCH",
        "Timeline gateway returned a job ID that does not match the idempotent request receipt.",
      );
    }
    for (;;) {
      await waitForGateway(Math.max(100, input.pollMs || 2_000), input.signal);
      const state = await semanticGatewayJson<{
        status?: string;
        url?: string;
        error?: string;
      }>(`/v1/video/render-timeline/${encodeURIComponent(jobId)}`, {
        signal: input.signal,
      });
      const status = String(state.status || "").toLowerCase();
      if (status === "done") {
        const url = safeHttpUrl(state.url, "Final Render output");
        input.onProgress?.({
          phase: "complete",
          progress: 1,
          externalRunId: jobId,
          message: "Durable Final Render completed.",
        });
        return {
          schema: "oceanleo.timeline-run-receipt@1",
          receiptId: input.requestId,
          status: "succeeded",
          provider: "oceanleo-timeline-ffmpeg",
          model: "oceanleo-convert",
          pricing: {
            billing: "provider",
            amount: null,
            currency: "OCEANLEO_CREDITS",
            estimated: true,
            label:
              "Metered video compose; charge and settlement are pinned to the gateway job receipt",
          },
          jobId,
          url,
          mimeType: "video/mp4",
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }
      if (status === "error") {
        throw new CanvasAdapterError(
          "CANVAS_TIMELINE_RENDER_FAILED",
          state.error || "Timeline renderer failed.",
          { retryable: true },
        );
      }
      if (status === "canceled" || status === "cancelled") {
        throw new CanvasAdapterError(
          "CANVAS_TIMELINE_CANCELLED",
          "Final Render was canceled by the durable timeline gateway.",
          {
            cancelled: true,
            cancellation: {
              scope: "gateway-job",
              disposition: "gateway-cancel-requested",
              message: "The durable timeline job accepted cancellation.",
            },
          },
        );
      }
      input.onProgress?.({
        phase:
          status === "queued" || status === "charging"
            ? "queued"
            : status === "settling"
              ? "finalizing"
              : "rendering",
        progress:
          status === "charging"
            ? 0.1
            : status === "queued"
              ? 0.2
              : status === "settling"
                ? 0.9
                : 0.6,
        externalRunId: jobId,
        message: status || "rendering",
      });
    }
  } catch (error) {
    if (
      input.signal?.aborted ||
      isAbortError(error) ||
      (error instanceof CanvasAdapterError && error.cancelled)
    ) {
      input.onProgress?.({
        phase: "canceling",
        progress: 0.6,
        externalRunId: jobId,
        message: "Requesting durable render cancellation.",
      });
      await cancelCanvasTimelineRender(jobId);
      throw new CanvasAdapterError(
        "CANVAS_TIMELINE_CANCELLED",
        "Final Render cancellation was sent to the durable timeline gateway.",
        {
          cancelled: true,
          cancellation: {
            scope: "gateway-job",
            disposition: "gateway-cancel-requested",
            message:
              "The DELETE request uses the idempotent gateway job ID and can be reconciled after reconnect.",
          },
        },
      );
    }
    throw error;
  }
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

async function durableVideoCanvasApi<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const token = await accessToken();
  if (!token) {
    throw new CanvasError("Sign in to submit or inspect durable video work.");
  }
  const response = await fetch(`${VIDEO_CANVAS_GATEWAY}${path}`, {
    credentials: "include",
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    signal: options.signal,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = (await response.text()).trim();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const detail =
      payload &&
      typeof payload === "object" &&
      "detail" in payload &&
      typeof (payload as { detail?: unknown }).detail === "string"
        ? (payload as { detail: string }).detail
        : text;
    throw new CanvasError(
      detail || `Durable video request failed (HTTP ${response.status}).`,
    );
  }
  return payload as T;
}

export function getDurableVideoCapabilities(signal?: AbortSignal) {
  return durableVideoCanvasApi<DurableVideoCapabilities>(
    "/v1/video-canvas/capabilities",
    { signal },
  );
}

export function createDurableVideoProject(input: {
  name: string;
  workspaceId: string;
  graph: DurableVideoCanvasGraph;
  signal?: AbortSignal;
}) {
  return durableVideoCanvasApi<DurableVideoProjectHead>(
    "/v1/video-canvas/projects",
    {
      method: "POST",
      signal: input.signal,
      body: {
        name: input.name,
        workspace_id: input.workspaceId,
        graph: input.graph,
        production_plan: {},
        qc_manifest: {},
      },
    },
  );
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
  return durableVideoCanvasApi<DurableVideoProjectHead>(
    `/v1/video-canvas/projects/${encodeURIComponent(input.projectId)}/versions`,
    {
      method: "POST",
      signal: input.signal,
      body: {
        expected_head_version_id: input.expectedHeadVersionId,
        expected_head_epoch: input.expectedHeadEpoch,
        graph: input.graph,
        production_plan: {},
        qc_manifest: {},
        message: input.message,
        selection_epoch: input.selectionEpoch,
      },
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
  return durableVideoCanvasApi<DurableVideoRunReceipt>(
    `/v1/video-canvas/projects/${encodeURIComponent(input.projectId)}/runs`,
    {
      method: "POST",
      signal: input.signal,
      body: {
        command_id: input.commandId,
        command_request_id: input.commandRequestId,
        project_version_id: input.projectVersionId,
        expected_head_epoch: input.expectedHeadEpoch,
        kind: "generate",
        target_node_ids: input.targetNodeIds,
      },
    },
  );
}

export function getDurableVideoRun(runId: string, signal?: AbortSignal) {
  return durableVideoCanvasApi<DurableVideoRunSnapshot>(
    `/v1/video-canvas/runs/${encodeURIComponent(runId)}`,
    { signal },
  );
}

export function cancelDurableVideoRun(runId: string, signal?: AbortSignal) {
  return durableVideoCanvasApi<{ run_id: string; status: string }>(
    `/v1/video-canvas/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST", signal },
  );
}

async function canvasApi<T>(action: "generate_text" | "generate_script" | "generate_image", payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const common = { site_id: "video", key_mode: "platform", model: payload.model };
  if (action === "generate_image") {
    return semanticGatewayJson<T>("/v1/images/generate", { method: "POST", signal,
      body: withOperatorRemarkRequest({ ...common, prompt: payload.prompt, ratio: payload.ratio || "16:9",
        sharpness: payload.quality === "1K" || payload.quality === "4K" ? payload.quality : "2K", n: 1 }) });
  }
  return semanticGatewayJson<T>("/v1/chat", { method: "POST", signal,
    body: withOperatorRemarkRequest({ ...common, system: payload.system || (action === "generate_script"
      ? "你是短视频导演与分镜师。把主题拆成分镜，每个镜头写明画面、运镜、光线、风格与时长。" : undefined),
      messages: [{ role: "user", content: payload.prompt }], max_tokens: payload.maxTokens || 2000 }) });
}

function selectedModel(model?: string): string | undefined {
  const value = (model || "").trim();
  return value && value !== "平台默认" ? value : undefined;
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
  return canvasApi<{ text: string }>("generate_text", {
    prompt,
    model: selectedModel(options.model),
    system: options.system,
    maxTokens: options.maxTokens,
  }, options.signal);
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
  return canvasApi<{ text: string }>("generate_script", {
    prompt,
    model: selectedModel(options.model),
    system: options.system,
    maxTokens: options.maxTokens,
  }, options.signal);
}

export function generateImage(
  prompt: string,
  ratio?: string,
  options: { model?: string; quality?: string; signal?: AbortSignal } = {},
) {
  return canvasApi<{ images: string[] }>("generate_image", {
    prompt,
    ratio,
    model: selectedModel(options.model),
    quality: options.quality,
  }, options.signal);
}


// Every editor entry (Library, task and LeoVideo) uses this same gateway adapter.
import { bindCanvasGatewayImpl } from "./engine/canvas-gateway";
bindCanvasGatewayImpl({ generateText, generateScript, generateImage, executeCanvasImageSemanticOperation,
  renderCanvasTimeline: input => renderCanvasTimeline({ ...input, timeline: input.timeline as CanvasTimelineDocument }), getDurableVideoCapabilities, createDurableVideoProject,
  promoteDurableVideoVersion, createDurableVideoRun, getDurableVideoRun, cancelDurableVideoRun });
