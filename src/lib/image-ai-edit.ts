"use client";

// 高级工作台图片编辑器的「AI 改图」动作：画布当前状态 → 上传拿 URL →
// 网关 /v1/images/edit（DashScope 图生图）→ 返回结果图 URL。
// 网关只吃 URL 不吃字节，所以必须先经文件库上传。

import { uploadFile } from "./database";
import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import type {
  ImageAiCommand,
  ImageAiCommandId,
  ImageAiExecutionInput,
  ImageAiProvider,
  ImageAiProviderContext,
  ImageAiProviderOutput,
  ImageAiProviderResult,
  ImageBillingMetadata,
} from "../shell/image-editor/image-capability-engine";
import {
  OCEANLEO_IMAGE_AI_PROVIDER_MAPPINGS,
  buildOceanLeoImageAiRequests,
  type OceanLeoImageGatewayRequest,
} from "../shell/image-editor/image-provider-mappings";

export * from "../shell/image-editor/image-capability-engine";
export * from "../shell/image-editor/image-provider-mappings";

export async function aiEditImage(
  prompt: string,
  image: Blob,
  opts: { siteId?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("未登录");

  const file = new File([image], `ai-edit-${Date.now()}.png`, { type: "image/png" });
  const uploaded = await uploadFile(file, { siteId: opts.siteId, title: "AI 改图底图" });
  if (!uploaded.ok || !uploaded.data?.file?.url) {
    throw new Error(uploaded.ok ? "上传底图失败" : uploaded.error);
  }

  const response = await fetch(`${GATEWAY_BASE}/v1/images/edit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      site_id: opts.siteId || "image",
      image_url: uploaded.data.file.url,
      prompt,
      n: 1,
    }),
    cache: "no-store",
    signal: opts.signal,
  });
  let data: { images?: string[]; detail?: string } | null = null;
  try {
    data = (await response.json()) as { images?: string[]; detail?: string };
  } catch {
    /* non-JSON */
  }
  if (!response.ok) {
    throw new Error(data?.detail || `AI 改图失败 HTTP ${response.status}`);
  }
  const result = data?.images?.[0];
  if (!result) throw new Error("AI 没有返回结果图");
  return result;
}

export type ImageAiEndpointMap = Partial<Record<ImageAiCommandId, string>>;

export interface GatewayImageAiProviderOptions {
  /**
   * Exact, operator-provisioned endpoints. No semantic command is inferred from
   * the legacy free-form `/v1/images/edit` route.
   */
  endpoints: ImageAiEndpointMap;
  siteId?: string;
  providerId?: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
  estimatedCosts?: Partial<
    Record<ImageAiCommandId, Omit<ImageBillingMetadata, "provider">>
  >;
  statusEndpoint?: (
    runId: string,
    providerRunId: string,
    commandId: ImageAiCommandId,
  ) => string;
  cancelEndpoint?: (
    runId: string,
    providerRunId: string | undefined,
    commandId: ImageAiCommandId,
  ) => string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  upload?: (
    blob: Blob,
    input: { title: string; siteId: string; signal: AbortSignal },
  ) => Promise<string>;
}

export interface OceanLeoImageAiProviderOptions {
  siteId?: string;
  providerId?: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
  upload?: GatewayImageAiProviderOptions["upload"];
  splitGrid?: (
    source: Blob,
    rows: number,
    columns: number,
    signal: AbortSignal,
  ) => Promise<readonly Blob[]>;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  wait?: GatewayImageAiProviderOptions["wait"];
}

interface GatewayImageAiResponse {
  run_id?: string;
  job_id?: string;
  request_id?: string;
  status?: string;
  phase?: string;
  progress?: number;
  status_url?: string;
  poll_url?: string;
  cancel_url?: string;
  outputs?: Array<
    | string
    | {
        id?: string;
        url?: string;
        mime_type?: string;
        width?: number;
        height?: number;
        byte_digest?: string;
      }
  >;
  images?: string[];
  image?: string;
  credits_spent?: number;
  cost?: Partial<ImageBillingMetadata>;
  detail?: string;
  error?: string;
}

interface ActiveImageGatewayRun {
  commandId: ImageAiCommandId;
  providerRunId?: string;
  statusUrl?: string;
  cancelUrl?: string;
}

interface GatewayExecutionOptions {
  commandId: ImageAiCommandId;
  runId: string;
  endpoint: string;
  body: unknown;
  token: string;
  signal: AbortSignal;
  fetcher: typeof fetch;
  onProgress: ImageAiProviderContext["onProgress"];
  active: ActiveImageGatewayRun;
  statusEndpoint?: GatewayImageAiProviderOptions["statusEndpoint"];
  pollIntervalMs: number;
  pollTimeoutMs: number;
  wait: NonNullable<GatewayImageAiProviderOptions["wait"]>;
}

export class ImageGatewayError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    options: { status?: number; retryable?: boolean; details?: unknown } = {},
  ) {
    super(message);
    this.name = "ImageGatewayError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable === true;
    this.details = options.details;
  }
}

function safeEndpoint(value: unknown): string {
  const endpoint = typeof value === "string" ? value.trim() : "";
  if (!endpoint) return "";
  if (endpoint.startsWith("/") && !endpoint.startsWith("//")) return endpoint;
  try {
    return ["http:", "https:"].includes(new URL(endpoint).protocol)
      ? endpoint
      : "";
  } catch {
    return "";
  }
}

function absoluteEndpoint(value: string): string {
  return value.startsWith("/") ? `${GATEWAY_BASE}${value}` : value;
}

function safeGatewayEndpoint(value: unknown): string {
  const endpoint = safeEndpoint(value);
  if (!endpoint || endpoint.startsWith("/")) return endpoint;
  try {
    const fallbackOrigin = globalThis.location?.origin || "http://localhost";
    const gatewayOrigin = new URL(GATEWAY_BASE, fallbackOrigin).origin;
    return new URL(endpoint).origin === gatewayOrigin ? endpoint : "";
  } catch {
    return "";
  }
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (Boolean(error) &&
      typeof error === "object" &&
      (error as { name?: unknown }).name === "AbortError")
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}

async function defaultImageAiUpload(
  blob: Blob,
  input: { title: string; siteId: string; signal: AbortSignal },
): Promise<string> {
  if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
  const extension = blob.type === "image/jpeg" ? "jpg" : "png";
  const uploaded = await uploadFile(
    new File([blob], `${input.title}.${extension}`, {
      type: blob.type || "image/png",
    }),
    { siteId: input.siteId, title: input.title },
  );
  if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    throw new Error(uploaded.error || "Image AI source upload failed");
  }
  return url;
}

function gatewayOutputs(data: GatewayImageAiResponse): ImageAiProviderOutput[] {
  const raw = data.outputs?.length
    ? data.outputs
    : data.images?.length
      ? data.images
      : data.image
        ? [data.image]
        : [];
  return raw.flatMap((entry) => {
    if (typeof entry === "string") return entry ? [{ url: entry }] : [];
    if (!entry?.url) return [];
    return [{
      ...(entry.id ? { id: entry.id } : {}),
      url: entry.url,
      ...(entry.mime_type ? { mimeType: entry.mime_type } : {}),
      ...(Number.isFinite(entry.width) ? { width: entry.width } : {}),
      ...(Number.isFinite(entry.height) ? { height: entry.height } : {}),
      ...(entry.byte_digest ? { byteDigest: entry.byte_digest } : {}),
    }];
  });
}

function responseRunId(data: GatewayImageAiResponse): string {
  return String(data.run_id || data.job_id || data.request_id || "").trim();
}

function gatewayCost(
  data: GatewayImageAiResponse,
  providerId: string,
): ImageBillingMetadata | undefined {
  if (data.cost) {
    return {
      charged:
        data.cost.charged ??
        (typeof data.cost.amount === "number" && data.cost.amount > 0),
      amount: typeof data.cost.amount === "number" ? data.cost.amount : null,
      currency: data.cost.currency || "USD",
      estimated: data.cost.estimated === true,
      provider: providerId,
      ...(data.cost.quoteId ? { quoteId: data.cost.quoteId } : {}),
    };
  }
  if (typeof data.credits_spent === "number") {
    return {
      charged: data.credits_spent > 0,
      amount: Math.max(0, data.credits_spent),
      currency: "OCEANLEO_CREDITS",
      estimated: false,
      provider: providerId,
      ...(data.request_id ? { quoteId: data.request_id } : {}),
    };
  }
  return undefined;
}

function errorCode(status: number): {
  code: string;
  retryable: boolean;
} {
  if (status === 401 || status === 403) {
    return { code: "image-provider-auth", retryable: false };
  }
  if (status === 402) {
    return { code: "image-provider-billing", retryable: false };
  }
  if (status === 408 || status === 429) {
    return { code: "image-provider-throttled", retryable: true };
  }
  if (status >= 500) {
    return { code: "image-provider-unavailable", retryable: true };
  }
  return { code: "image-provider-invalid-request", retryable: false };
}

async function responseJson(response: Response): Promise<GatewayImageAiResponse> {
  try {
    return (await response.json()) as GatewayImageAiResponse;
  } catch {
    return {};
  }
}

async function checkedGatewayResponse(
  response: Response,
  commandId: ImageAiCommandId,
): Promise<GatewayImageAiResponse> {
  const data = await responseJson(response);
  if (!response.ok) {
    const classification = errorCode(response.status);
    throw new ImageGatewayError(
      classification.code,
      data.detail ||
        data.error ||
        `${commandId} provider failed HTTP ${response.status}`,
      {
        status: response.status,
        retryable: classification.retryable,
        details: data,
      },
    );
  }
  return data;
}

function terminalStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function pollProgress(data: GatewayImageAiResponse, previous: number): number {
  const numeric = Number(data.progress);
  if (Number.isFinite(numeric)) {
    return Math.max(previous, Math.min(0.88, numeric > 1 ? numeric / 100 : numeric));
  }
  const status = terminalStatus(data.status || data.phase);
  if (status.includes("queue") || status.includes("pending")) {
    return Math.max(previous, 0.35);
  }
  return Math.max(previous, 0.55);
}

function defaultWait(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function gatewayFetch(
  options: GatewayExecutionOptions,
): Promise<GatewayImageAiResponse> {
  let response: Response;
  try {
    response = await options.fetcher(absoluteEndpoint(options.endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify(options.body),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (caught) {
    if (isAbort(caught)) throw caught;
    throw new ImageGatewayError(
      "image-provider-network",
      `Cannot reach ${options.commandId} provider endpoint`,
      { retryable: true, details: caught },
    );
  }
  let data = await checkedGatewayResponse(response, options.commandId);
  options.active.providerRunId = responseRunId(data) || undefined;
  options.active.cancelUrl = safeGatewayEndpoint(data.cancel_url) || undefined;
  let statusUrl =
    safeGatewayEndpoint(data.status_url || data.poll_url) ||
    (options.active.providerRunId
      ? safeEndpoint(
          options.statusEndpoint?.(
            options.runId,
            options.active.providerRunId,
            options.commandId,
          ),
        )
      : "");
  options.active.statusUrl = statusUrl || undefined;
  if (gatewayOutputs(data).length) return data;

  const providerRunId = options.active.providerRunId;
  if (!providerRunId) {
    throw new ImageGatewayError(
      "image-provider-empty-output",
      `${options.commandId} provider returned no image outputs`,
      { retryable: true, details: data },
    );
  }
  if (!statusUrl) {
    throw new ImageGatewayError(
      "image-provider-polling-unavailable",
      `${options.commandId} returned async job ${providerRunId}, but the gateway did not expose a status URL`,
      { retryable: false, details: data },
    );
  }

  const started = Date.now();
  let progress = 0.35;
  while (Date.now() - started <= options.pollTimeoutMs) {
    await options.wait(options.pollIntervalMs, options.signal);
    throwIfAborted(options.signal);
    let pollResponse: Response;
    try {
      pollResponse = await options.fetcher(absoluteEndpoint(statusUrl), {
        method: "GET",
        headers: { Authorization: `Bearer ${options.token}` },
        cache: "no-store",
        signal: options.signal,
      });
    } catch (caught) {
      if (isAbort(caught)) throw caught;
      throw new ImageGatewayError(
        "image-provider-poll-network",
        `Cannot poll ${options.commandId} provider job`,
        { retryable: true, details: caught },
      );
    }
    data = await checkedGatewayResponse(pollResponse, options.commandId);
    options.active.cancelUrl =
      safeGatewayEndpoint(data.cancel_url) || options.active.cancelUrl;
    const nextStatusUrl = safeGatewayEndpoint(data.status_url || data.poll_url);
    if (nextStatusUrl) {
      statusUrl = nextStatusUrl;
      options.active.statusUrl = nextStatusUrl;
    }
    const status = terminalStatus(data.status || data.phase);
    if (
      status === "failed" ||
      status === "error" ||
      status === "canceled" ||
      status === "cancelled"
    ) {
      throw new ImageGatewayError(
        status.startsWith("cancel")
          ? "image-provider-canceled"
          : "image-provider-job-failed",
        data.detail || data.error || `${options.commandId} provider job ${status}`,
        { retryable: status !== "canceled" && status !== "cancelled", details: data },
      );
    }
    progress = pollProgress(data, progress);
    options.onProgress({
      phase: status.includes("queue") ? "queued" : "processing",
      progress,
      ...(status ? { message: status } : {}),
    });
    if (gatewayOutputs(data).length) return data;
    if (status === "done" || status === "succeeded" || status === "complete") {
      throw new ImageGatewayError(
        "image-provider-empty-output",
        `${options.commandId} provider job completed without image outputs`,
        { retryable: true, details: data },
      );
    }
  }
  throw new ImageGatewayError(
    "image-provider-timeout",
    `${options.commandId} provider job did not finish within ${options.pollTimeoutMs}ms`,
    { retryable: true },
  );
}

function combineCosts(
  values: readonly (ImageBillingMetadata | undefined)[],
  providerId: string,
): ImageBillingMetadata | undefined {
  const costs = values.filter(
    (value): value is ImageBillingMetadata => Boolean(value),
  );
  if (!costs.length) return undefined;
  const currency = costs[0].currency;
  const compatible = costs.every(
    (cost) => cost.currency === currency && typeof cost.amount === "number",
  );
  return {
    charged: costs.some((cost) => cost.charged),
    amount: compatible
      ? costs.reduce((total, cost) => total + Number(cost.amount), 0)
      : null,
    currency: compatible ? currency : "MIXED",
    estimated: costs.some((cost) => cost.estimated),
    provider: providerId,
    ...(costs.length === 1 && costs[0].quoteId
      ? { quoteId: costs[0].quoteId }
      : {}),
  };
}

function imageGridRuntimeAvailability(): { enabled: boolean; reason?: string } {
  if (typeof createImageBitmap !== "function") {
    return {
      enabled: false,
      reason: "This runtime does not expose createImageBitmap for grid splitting",
    };
  }
  if (
    typeof OffscreenCanvas === "undefined" &&
    (typeof document === "undefined" ||
      typeof document.createElement !== "function")
  ) {
    return {
      enabled: false,
      reason:
        "This runtime exposes neither OffscreenCanvas nor an HTML canvas for grid splitting",
    };
  }
  return { enabled: true };
}

async function canvasBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.size) resolve(blob);
      else reject(new ImageGatewayError("grid-split-empty", "Grid cell is empty"));
    }, "image/png");
  });
}

async function defaultGridSplitter(
  source: Blob,
  rows: number,
  columns: number,
  signal: AbortSignal,
): Promise<readonly Blob[]> {
  const availability = imageGridRuntimeAvailability();
  if (!availability.enabled) {
    throw new ImageGatewayError(
      "grid-split-runtime-unavailable",
      availability.reason || "Grid splitting is unavailable",
    );
  }
  throwIfAborted(signal);
  const bitmap = await createImageBitmap(source);
  try {
    const outputs: Blob[] = [];
    const cellWidth = bitmap.width / columns;
    const cellHeight = bitmap.height / rows;
    const outputWidth = Math.max(1, Math.round(cellWidth));
    const outputHeight = Math.max(1, Math.round(cellHeight));
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        throwIfAborted(signal);
        const canvas =
          typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(outputWidth, outputHeight)
            : Object.assign(document.createElement("canvas"), {
                width: outputWidth,
                height: outputHeight,
              });
        const context = canvas.getContext("2d");
        if (!context) {
          throw new ImageGatewayError(
            "grid-split-canvas-unavailable",
            "A 2D canvas context could not be created for grid splitting",
          );
        }
        context.drawImage(
          bitmap,
          column * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          outputWidth,
          outputHeight,
        );
        outputs.push(await canvasBlob(canvas));
      }
    }
    return Object.freeze(outputs);
  } finally {
    bitmap.close();
  }
}

async function sourceBlob(
  input: Readonly<ImageAiExecutionInput>,
  sourceUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<Blob> {
  if (input.raster) return input.raster;
  let response: Response;
  try {
    response = await fetcher(sourceUrl, {
      method: "GET",
      cache: "no-store",
      signal,
    });
  } catch (caught) {
    if (isAbort(caught)) throw caught;
    throw new ImageGatewayError(
      "grid-split-source-network",
      "Cannot download the source image for grid splitting",
      { retryable: true, details: caught },
    );
  }
  if (!response.ok) {
    throw new ImageGatewayError(
      "grid-split-source-http",
      `Cannot download the source image (HTTP ${response.status})`,
      { status: response.status, retryable: response.status >= 500 },
    );
  }
  const blob = await response.blob();
  if (!blob.size || !/^image\//i.test(blob.type || input.source.mimeType)) {
    throw new ImageGatewayError(
      "grid-split-source-invalid",
      "Grid split source is not a non-empty image",
    );
  }
  return blob;
}

async function uploadExecutionInputs(
  command: Readonly<ImageAiCommand>,
  input: Readonly<ImageAiExecutionInput>,
  context: ImageAiProviderContext,
  siteId: string,
  uploader: NonNullable<GatewayImageAiProviderOptions["upload"]>,
): Promise<{ sourceUrl: string; maskUrl: string }> {
  context.onProgress({ phase: "uploading", progress: 0.05 });
  let sourceUrl = input.source.url || "";
  if (input.raster) {
    sourceUrl = await uploader(input.raster, {
      title: `${command.id}-source`,
      siteId,
      signal: context.signal,
    });
  }
  if (!sourceUrl) {
    throw new ImageGatewayError(
      "image-source-unavailable",
      `${command.id} requires a durable source URL or frozen raster`,
    );
  }
  let maskUrl = command.id === "inpaint" ? command.params.maskUrl || "" : "";
  if (command.id === "inpaint" && input.mask) {
    maskUrl = await uploader(input.mask, {
      title: `${command.id}-mask`,
      siteId,
      signal: context.signal,
    });
  }
  return { sourceUrl, maskUrl };
}

/**
 * Build a concrete gateway adapter only for endpoints supplied by the caller.
 * An omitted endpoint remains disabled with an actionable reason.
 */
export function createGatewayImageAiProvider(
  options: GatewayImageAiProviderOptions,
): ImageAiProvider {
  const providerId = options.providerId?.trim() || "oceanleo-image-gateway";
  const fetcher = options.fetcher || fetch;
  const getToken = options.getAccessToken || accessToken;
  const uploader = options.upload || defaultImageAiUpload;
  const activeRuns = new Map<string, ActiveImageGatewayRun>();
  const pollIntervalMs = Math.max(50, options.pollIntervalMs || 1_000);
  const pollTimeoutMs = Math.max(
    pollIntervalMs,
    options.pollTimeoutMs || 180_000,
  );
  const wait = options.wait || defaultWait;
  return {
    id: providerId,
    availability(commandId) {
      const configured = options.endpoints[commandId];
      const endpoint = safeEndpoint(configured);
      if (!endpoint) {
        return {
          enabled: false,
          reason: configured
            ? `Configured endpoint for ${commandId} is not a safe HTTP path`
            : `Provider endpoint for ${commandId} is not configured`,
        };
      }
      const estimate = options.estimatedCosts?.[commandId];
      return {
        enabled: true,
        ...(estimate
          ? {
              estimatedCost: {
                ...estimate,
                estimated: true,
                provider: providerId,
              },
            }
          : {}),
      };
    },
    async execute(command, input, context): Promise<ImageAiProviderResult> {
      const endpoint = safeEndpoint(options.endpoints[command.id]);
      if (!endpoint) {
        throw new ImageGatewayError(
          "image-provider-not-configured",
          `Provider endpoint for ${command.id} is not configured`,
        );
      }
      const siteId = options.siteId || "image";
      const { sourceUrl, maskUrl } = await uploadExecutionInputs(
        command,
        input,
        context,
        siteId,
        uploader,
      );
      context.onProgress({ phase: "queued", progress: 0.3 });
      const token = await getToken();
      if (!token) {
        throw new ImageGatewayError(
          "image-provider-auth",
          "Authentication is required for image AI",
        );
      }
      const active: ActiveImageGatewayRun = { commandId: command.id };
      activeRuns.set(context.runId, active);
      try {
        const data = await gatewayFetch({
          commandId: command.id,
          runId: context.runId,
          endpoint,
          body: {
            schema: "oceanleo.image-ai-request@1",
            run_id: context.runId,
            command: command.id,
            site_id: siteId,
            source: {
              url: sourceUrl,
              byte_digest: input.source.byteDigest,
              byte_length: input.source.byteLength,
              mime_type: input.source.mimeType,
              asset_id: input.source.assetId,
              revision_id: input.source.revisionId,
            },
            parent_output_id: input.parentLineage.outputId,
            params: {
              ...command.params,
              ...(maskUrl ? { mask_url: maskUrl } : {}),
            },
          },
          token,
          signal: context.signal,
          fetcher,
          onProgress: context.onProgress,
          active,
          statusEndpoint: options.statusEndpoint,
          pollIntervalMs,
          pollTimeoutMs,
          wait,
        });
        context.onProgress({ phase: "finalizing", progress: 0.9 });
        const outputs = gatewayOutputs(data);
        const cost = gatewayCost(data, providerId);
        return {
          outputs,
          ...(cost ? { cost } : {}),
          ...(active.providerRunId
            ? { providerRunId: active.providerRunId }
            : {}),
        };
      } finally {
        activeRuns.delete(context.runId);
      }
    },
    async cancel(runId, providerRunId) {
      const active = activeRuns.get(runId);
      const commandId = active?.commandId;
      if (!commandId) return;
      const endpoint = safeEndpoint(
        active?.cancelUrl ||
          options.cancelEndpoint?.(
            runId,
            active?.providerRunId || providerRunId,
            commandId,
          ),
      );
      if (!endpoint) return;
      const token = await getToken();
      if (!token) return;
      await fetcher(absoluteEndpoint(endpoint), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    },
  };
}

function requestBody(request: Readonly<OceanLeoImageGatewayRequest>): unknown {
  return request.body;
}

/**
 * Production OceanLeo adapter for every semantic command. It uses exact
 * deployed gateway schemas, deterministic local grid slicing, durable uploads,
 * immutable engine lineage, typed errors and optional async polling if a
 * gateway response exposes status/cancel URLs.
 */
export function createOceanLeoImageAiProvider(
  options: OceanLeoImageAiProviderOptions = {},
): ImageAiProvider {
  const providerId = options.providerId?.trim() || "oceanleo-image-gateway";
  const fetcher = options.fetcher || fetch;
  const getToken = options.getAccessToken || accessToken;
  const uploader = options.upload || defaultImageAiUpload;
  const splitGrid = options.splitGrid || defaultGridSplitter;
  const siteId = options.siteId?.trim() || "image";
  const pollIntervalMs = Math.max(50, options.pollIntervalMs || 1_000);
  const pollTimeoutMs = Math.max(
    pollIntervalMs,
    options.pollTimeoutMs || 180_000,
  );
  const wait = options.wait || defaultWait;
  const activeRuns = new Map<string, ActiveImageGatewayRun>();

  return {
    id: providerId,
    availability(commandId) {
      const mapping = OCEANLEO_IMAGE_AI_PROVIDER_MAPPINGS[commandId];
      if (!mapping) {
        return {
          enabled: false,
          reason: `No OceanLeo image mapping exists for ${commandId}`,
        };
      }
      if (commandId === "grid-split" && !options.splitGrid) {
        return imageGridRuntimeAvailability();
      }
      return { enabled: true };
    },
    async execute(command, input, context): Promise<ImageAiProviderResult> {
      const { sourceUrl, maskUrl } = await uploadExecutionInputs(
        command,
        input,
        context,
        siteId,
        uploader,
      );
      const requests = buildOceanLeoImageAiRequests(command, {
        sourceUrl,
        ...(maskUrl ? { maskUrl } : {}),
        siteId,
        source: input.source,
        parentOutputId: input.parentLineage.outputId,
      });
      const active: ActiveImageGatewayRun = { commandId: command.id };
      activeRuns.set(context.runId, active);
      try {
        if (command.id === "grid-split") {
          const source = await sourceBlob(
            input,
            sourceUrl,
            fetcher,
            context.signal,
          );
          const cells = await splitGrid(
            source,
            command.params.rows,
            command.params.columns,
            context.signal,
          );
          const expected = command.params.rows * command.params.columns;
          if (cells.length !== expected) {
            throw new ImageGatewayError(
              "grid-split-cardinality",
              `Grid splitter returned ${cells.length} cells; expected ${expected}`,
            );
          }
          const outputs: ImageAiProviderOutput[] = [];
          for (const [index, cell] of cells.entries()) {
            throwIfAborted(context.signal);
            context.onProgress({
              phase: "uploading",
              progress: 0.35 + (index / Math.max(1, cells.length)) * 0.5,
              message: `Uploading grid cell ${index + 1}/${cells.length}`,
            });
            const url = await uploader(cell, {
              title: `grid-split-${index + 1}`,
              siteId,
              signal: context.signal,
            });
            outputs.push({ url, mimeType: cell.type || "image/png" });
          }
          context.onProgress({ phase: "finalizing", progress: 0.9 });
          return {
            outputs: Object.freeze(outputs),
            providerRunId: `${context.runId}:local-grid-split`,
            cost: {
              charged: false,
              amount: 0,
              currency: "OCEANLEO_CREDITS",
              estimated: false,
              provider: providerId,
            },
          };
        }

        const token = await getToken();
        if (!token) {
          throw new ImageGatewayError(
            "image-provider-auth",
            "Authentication is required for image AI",
          );
        }
        const outputs: ImageAiProviderOutput[] = [];
        const costs: Array<ImageBillingMetadata | undefined> = [];
        const providerRunIds: string[] = [];
        for (const [index, request] of requests.entries()) {
          throwIfAborted(context.signal);
          const baseProgress = 0.25 + (index / requests.length) * 0.6;
          context.onProgress({
            phase: index === 0 ? "queued" : "processing",
            progress: baseProgress,
            message:
              requests.length > 1
                ? `Processing output ${index + 1}/${requests.length}`
                : undefined,
          });
          const data = await gatewayFetch({
            commandId: command.id,
            runId: context.runId,
            endpoint: request.endpoint,
            body: requestBody(request),
            token,
            signal: context.signal,
            fetcher,
            onProgress: (progress) =>
              context.onProgress({
                ...progress,
                progress: Math.min(
                  0.88,
                  baseProgress +
                    progress.progress * (0.6 / Math.max(1, requests.length)),
                ),
              }),
            active,
            pollIntervalMs,
            pollTimeoutMs,
            wait,
          });
          const requestOutputs = gatewayOutputs(data);
          if (requestOutputs.length !== request.expectedOutputCount) {
            throw new ImageGatewayError(
              "image-provider-cardinality",
              `${command.id} request ${index + 1} returned ${
                requestOutputs.length
              } outputs; expected ${request.expectedOutputCount}`,
              { retryable: true, details: data },
            );
          }
          outputs.push(...requestOutputs);
          costs.push(gatewayCost(data, providerId));
          const providerRunId = responseRunId(data);
          if (providerRunId) providerRunIds.push(providerRunId);
        }
        context.onProgress({ phase: "finalizing", progress: 0.9 });
        return {
          outputs: Object.freeze(outputs),
          ...(providerRunIds.length
            ? { providerRunId: providerRunIds.join(",") }
            : {}),
          ...(combineCosts(costs, providerId)
            ? { cost: combineCosts(costs, providerId) }
            : {}),
        };
      } finally {
        activeRuns.delete(context.runId);
      }
    },
    async cancel(runId) {
      const active = activeRuns.get(runId);
      if (!active?.cancelUrl) return;
      const token = await getToken();
      if (!token) return;
      await fetcher(absoluteEndpoint(active.cancelUrl), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    },
  };
}
