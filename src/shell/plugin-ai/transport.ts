"use client";

// ============================================================================
// @oceanleo/ui — 插件 AI 的传输层（能力 → 具体通道）
// ----------------------------------------------------------------------------
// types.ts 定了「插件能要什么」，这一层定「今天由谁去做」。拆开的理由很实在：
// 同一件插件在三种宿主里跑——共享站里有网关凭据、陈列馆里只有 host.fetchJson、
// 被别人 embed 时两样都没有。旧实现把这三种情况写死在各自的调用点上，于是
// 「AI 用不了」有的报 401、有的静默返回空数组、有的干脆假装成功给一张占位图。
//
// 这里只有三种实现，覆盖全部三种宿主：
//   createGatewayAiTransport()      —— 有登录态，直连 api.oceanleo.com；
//                                      token 与 GATEWAY_BASE 复用 lib/auth 那一套，
//                                      不另起炉灶（见 lib/image-ai-edit.ts 同样写法）。
//   createHostFetchJsonAiTransport()—— 只有 host.fetchJson，走逻辑 URL 让站点适配器路由；
//   createUnavailableAiTransport()  —— 什么都没有。**fail closed**：抛
//                                      disposition="unavailable"，中文说清缺的是哪一样，
//                                      绝不伪造成功。
//
// 端点不是拍脑袋写的，逐条对应本仓已经在调的真实路由：
//   text.generate            POST /v1/chat/stream         （真 SSE；回落 POST /v1/chat）
//   text.rewrite/translate   POST /v1/assistant/transform （shell/LeoAssistant.tsx）
//   image.generate           POST /v1/images/generate     （lib/capabilities.ts）
//   image.edit/inpaint/relight POST /v1/images/edit       （oceanleo.gateway.images.edit@1）
//   image.upscale            POST /v1/images/upscale      （oceanleo.gateway.images.upscale@1）
//   video.generate           POST /v1/videos/generate + 轮询 /v1/videos/status/{id}
//   code.patch               —— 网关**没有**这条路由，所以网关传输如实报 unavailable。
// ============================================================================

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import {
  decodeChatFrame,
  isSseError,
  openSseStream,
  type ChatStreamCharge,
} from "../../lib/sse";
import {
  AI_CAPABILITIES,
  PluginAiError,
  type AiBilling,
  type AiCapability,
  type AiCapabilityAvailability,
  type AiImageOutput,
  type AiImageOutputSet,
  type AiImageRef,
  type AiInputFor,
  type AiOutputFor,
  type AiProgress,
  type AiTextOutput,
  type AiVideoOutput,
} from "./types";

// ── 传输接口 ────────────────────────────────────────────────────────────────

/**
 * 一次调用里 transport 能拿到的全部环境。
 *
 * `signal` 与 `onProgress` 在这里是**必填**（客户端保证一定给），传输层因此不需要
 * 到处写 `?.` —— 「可能没有取消通道」这件事在契约边界上就已经被消掉了。
 */
export interface AiTransportContext {
  readonly capability: AiCapability;
  readonly runId: string;
  readonly requestId: string;
  readonly siteId: string;
  /** 调用方指定的模型；空串表示「用通道默认的」。 */
  readonly model: string;
  readonly signal: AbortSignal;
  onProgress(progress: AiProgress): void;
}

export interface AiTransportResult<K extends AiCapability = AiCapability> {
  output: AiOutputFor<K>;
  provider?: string;
  model?: string;
  providerRunId?: string;
  billing?: AiBilling;
}

export interface AiTransport {
  readonly id: string;
  availability(capability: AiCapability): AiCapabilityAvailability;
  execute<K extends AiCapability>(
    capability: K,
    input: AiInputFor<K>,
    context: AiTransportContext,
  ): Promise<AiTransportResult<K>>;
  /** 上游支持撤单时实现它；只做尽力而为，失败不许把主流程带崩。 */
  cancel?(runId: string, providerRunId?: string): Promise<void>;
}

/**
 * 每条能力一个处理函数。用「能力 → 处理函数」的映射而不是一个大 switch，
 * 是为了让 `execute<K>` 的入参出参在泛型下仍然严格对齐（映射类型按 K 索引，
 * 编译器自己会把 AiInputFor<K> 和 AiOutputFor<K> 对上），不需要任何 as。
 * 顺带白拿一个性质：表里没有的能力 = 这条通道没有它，availability 直接就能答。
 */
type AiCapabilityHandler<K extends AiCapability> = (
  input: AiInputFor<K>,
  context: AiTransportContext,
) => Promise<AiTransportResult<K>>;

type AiHandlerMap = { [K in AiCapability]?: AiCapabilityHandler<K> };

function transportFromHandlers(
  id: string,
  handlers: AiHandlerMap,
  disabledReason: (capability: AiCapability) => string,
  cancel?: (runId: string, providerRunId?: string) => Promise<void>,
): AiTransport {
  const transport: AiTransport = {
    id,
    availability(capability) {
      if (handlers[capability]) return { enabled: true };
      return { enabled: false, reason: disabledReason(capability) };
    },
    async execute<K extends AiCapability>(
      capability: K,
      input: AiInputFor<K>,
      context: AiTransportContext,
    ): Promise<AiTransportResult<K>> {
      const handler = handlers[capability];
      if (!handler) {
        throw new PluginAiError("unavailable", disabledReason(capability), {
          capability,
          code: "ai-capability-unsupported",
          runId: context.runId,
        });
      }
      return handler(input, context);
    },
  };
  if (cancel) transport.cancel = cancel;
  return transport;
}

// ── 公用小工具 ──────────────────────────────────────────────────────────────

function isAbortError(caught: unknown): boolean {
  return (
    (caught instanceof DOMException && caught.name === "AbortError") ||
    (Boolean(caught) &&
      typeof caught === "object" &&
      (caught as { name?: unknown }).name === "AbortError")
  );
}

function throwIfCancelled(context: AiTransportContext): void {
  if (!context.signal.aborted) return;
  throw new PluginAiError("cancelled", "这次 AI 运行已被取消。", {
    capability: context.capability,
    code: "ai-cancelled",
    runId: context.runId,
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 上游把人话塞在 detail / error / message 三个位置之一，全都试一遍。 */
function upstreamDetail(data: unknown): string {
  const body = record(data);
  if (text(body.detail)) return text(body.detail);
  const detail = record(body.detail);
  if (text(detail.message)) return text(detail.message);
  if (text(body.error)) return text(body.error);
  if (text(body.message)) return text(body.message);
  return "";
}

/** HTTP 状态码 → 界面该怎么办。这张表就是 disposition 存在的全部意义。 */
function dispositionForStatus(status: number): {
  disposition: "unavailable" | "denied" | "failed";
  code: string;
  retryable: boolean;
} {
  if (status === 401 || status === 403) {
    return { disposition: "denied", code: "ai-gateway-auth", retryable: false };
  }
  if (status === 402) {
    return {
      disposition: "denied",
      code: "ai-gateway-billing",
      retryable: false,
    };
  }
  if (status === 404 || status === 501) {
    return {
      disposition: "unavailable",
      code: "ai-gateway-endpoint-missing",
      retryable: false,
    };
  }
  if (status === 408 || status === 429) {
    return {
      disposition: "failed",
      code: "ai-gateway-throttled",
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      disposition: "failed",
      code: "ai-gateway-upstream",
      retryable: true,
    };
  }
  return { disposition: "failed", code: "ai-gateway-rejected", retryable: false };
}

function imageOutputsFrom(data: unknown): readonly AiImageOutput[] {
  const body = record(data);
  const raw = Array.isArray(body.outputs)
    ? body.outputs
    : Array.isArray(body.images)
      ? body.images
      : text(body.image)
        ? [text(body.image)]
        : text(body.url)
          ? [text(body.url)]
          : [];
  return Object.freeze(
    raw.flatMap((entry): AiImageOutput[] => {
      if (typeof entry === "string") return entry ? [{ url: entry }] : [];
      const item = record(entry);
      const url = text(item.url);
      if (!url) return [];
      const mimeType = text(item.mimeType) || text(item.mime_type);
      const digest = text(item.byteDigest) || text(item.byte_digest);
      return [
        {
          url,
          ...(mimeType ? { mimeType } : {}),
          ...(Number.isFinite(item.width) ? { width: Number(item.width) } : {}),
          ...(Number.isFinite(item.height)
            ? { height: Number(item.height) }
            : {}),
          ...(digest ? { byteDigest: digest } : {}),
        },
      ];
    }),
  );
}

function videoOutputsFrom(data: unknown): readonly AiVideoOutput[] {
  const body = record(data);
  const raw = Array.isArray(body.videos)
    ? body.videos
    : text(body.video_url)
      ? [text(body.video_url)]
      : text(body.url)
        ? [text(body.url)]
        : [];
  return Object.freeze(
    raw.flatMap((entry): AiVideoOutput[] => {
      if (typeof entry === "string") return entry ? [{ url: entry }] : [];
      const item = record(entry);
      const url = text(item.url) || text(item.video_url);
      if (!url) return [];
      const poster = text(item.posterUrl) || text(item.poster_url);
      const mimeType = text(item.mimeType) || text(item.mime_type);
      return [
        {
          url,
          ...(mimeType ? { mimeType } : {}),
          ...(Number.isFinite(item.durationMs)
            ? { durationMs: Number(item.durationMs) }
            : {}),
          ...(poster ? { posterUrl: poster } : {}),
        },
      ];
    }),
  );
}

/**
 * 一发一收的响应 → AiTextOutput。
 *
 * `streamed` 必填而不是可选，是刻意的：每个调用点都得当场回答「这次是不是流式」，
 * 漏答就编译不过。上一轮的教训是「事后再补一个可选字段」= 永远补不齐。
 */
function textOutputFrom(data: unknown, streamed: boolean): AiTextOutput {
  const body = record(data);
  const value = (
    text(body.text) ||
    text(body.result) ||
    text(body.content) ||
    text(body.answer)
  ).trim();
  const truncated =
    body.truncated === true || text(body.finish_reason) === "length";
  return {
    text: value,
    ...(truncated ? { truncated: true } : {}),
    streamed,
  };
}

/**
 * 网关的计费回执 → AiBilling。
 *
 * `estimated: true` 不是保守，是事实：流式路径的 token 数是服务端按字符估的
 * （chat_router.py:274-275、:366-367，provider 不可靠地发 usage 块）。
 * BYOK 是免费的，所以 charged=false、金额如实写 0，不拿 0 冒充「不知道」。
 */
function billingFromCharge(charge: ChatStreamCharge | null): AiBilling | undefined {
  if (!charge) return undefined;
  return {
    charged: charge.keyMode === "platform" && charge.priceCny > 0,
    amount: charge.priceCny,
    currency: "CNY",
    estimated: true,
  };
}

/** 非流式 /v1/chat 的同一件事：响应体里的 charge 段（chat_router.py:255-256）。 */
function billingFromResponse(data: unknown): AiBilling | undefined {
  const charge = record(record(data).charge);
  if (!Object.keys(charge).length) return undefined;
  const price = Number(charge.price_cny);
  const keyMode = text(charge.key_mode);
  return {
    charged: keyMode === "platform" && Number.isFinite(price) && price > 0,
    amount: Number.isFinite(price) ? price : null,
    currency: "CNY",
    estimated: true,
  };
}

/**
 * 内部信号：**这个部署根本不支持流式**（没有这条路由、或回的压根不是 SSE），
 * 调用方应当回落非流式。绝不外泄给插件——插件看到的只能是 PluginAiError。
 *
 * 只有「结构上不支持」才用它。网络抖动、超时、上游报错都**不**走回落：
 * 那种情况下再发一次非流式请求，很可能让用户为同一次生成付两回钱。
 */
class StreamingUnsupported extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "StreamingUnsupported";
  }
}

/** 这些状态码等于「这条流式路由不在」，可以安全回落。 */
const NO_STREAM_STATUSES: ReadonlySet<number> = new Set([404, 405, 415, 501]);

/**
 * 不知道总长就别编百分比：一条渐近曲线，单调向上、永远不到 1，
 * 真正的 1 只由「跑完了」来给。假的匀速进度条比没有进度条更伤信任。
 */
function streamProgress(chars: number): number {
  return 0.3 + 0.6 * (1 - 1 / (1 + chars / 400));
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
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

const NON_STREAM_FALLBACK_MESSAGE =
  "当前环境不支持流式输出，正在等待完整结果…";

const HOST_NON_STREAM_MESSAGE =
  "当前宿主通道不支持流式输出，正在等待完整结果…";

interface ChatStreamAccumulation {
  text: string;
  truncated: boolean;
  incomplete: boolean;
  charge: ChatStreamCharge | null;
}

/**
 * 把 decodeChatFrame 解出来的帧变成进度回调与最终正文。
 * 循环跑到流自然结束——不在 kind === "done" 时 break，否则计费帧会被吞掉。
 */
async function consumeChatStream(
  events: AsyncIterable<{ data: string }>,
  context: AiTransportContext,
): Promise<ChatStreamAccumulation> {
  let accumulated = "";
  let truncated = false;
  let incomplete = false;
  let charge: ChatStreamCharge | null = null;

  try {
    for await (const event of events) {
      throwIfCancelled(context);
      const frame = decodeChatFrame(event.data);
      if (!frame) continue;

      switch (frame.kind) {
        case "delta":
          if (frame.text) {
            accumulated += frame.text;
            context.onProgress({
              phase: "streaming",
              progress: streamProgress(accumulated.length),
              delta: frame.text,
            });
          }
          if (frame.finishReason === "length") truncated = true;
          break;
        case "done":
          break;
        case "error":
          throw new PluginAiError("failed", frame.message, {
            capability: context.capability,
            code: frame.blocked ? "ai-content-blocked" : "ai-stream-error",
            retryable: !frame.blocked,
            runId: context.runId,
          });
        case "charge":
          charge = frame.charge;
          break;
        case "unknown":
          break;
        default:
          break;
      }
    }
  } catch (caught) {
    if (isAbortError(caught)) throwIfCancelled(context);
    if (caught instanceof PluginAiError) throw caught;
    // 流式中途断开：已收到的部分保留并标未完成，不要清空。
    if (accumulated.length > 0) {
      incomplete = true;
      context.onProgress({
        phase: "streaming",
        progress: streamProgress(accumulated.length),
        message: "连接已断开，以下为已收到的部分内容。",
      });
      return { text: accumulated, truncated, incomplete, charge };
    }
    throw caught;
  }

  context.onProgress({ phase: "finalizing", progress: 0.95 });
  return { text: accumulated, truncated, incomplete, charge };
}

function rethrowStreamingUnsupported(caught: unknown): never {
  if (isSseError(caught)) {
    if (
      (caught.reason === "http" &&
        caught.status !== undefined &&
        NO_STREAM_STATUSES.has(caught.status)) ||
      caught.reason === "not-event-stream"
    ) {
      throw new StreamingUnsupported(caught.message);
    }
  }
  throw caught;
}

async function runSseTextGenerate(
  init: {
    url: string;
    body: unknown;
    headers?: Readonly<Record<string, string>>;
    fetchImpl?: typeof fetch;
    firstByteTimeoutMs?: number;
    totalTimeoutMs?: number;
  },
  context: AiTransportContext,
): Promise<{
  output: AiTextOutput;
  billing?: AiBilling;
  model?: string;
  providerRunId?: string;
}> {
  try {
    const { text: value, truncated, incomplete, charge } =
      await consumeChatStream(
        openSseStream({
          url: init.url,
          body: init.body,
          headers: init.headers,
          signal: context.signal,
          fetchImpl: init.fetchImpl,
          firstByteTimeoutMs: init.firstByteTimeoutMs,
          totalTimeoutMs: init.totalTimeoutMs,
        }),
        context,
      );
    return {
      output: {
        text: value,
        streamed: true,
        ...(truncated ? { truncated: true } : {}),
        ...(incomplete ? { incomplete: true } : {}),
      },
      billing: billingFromCharge(charge),
      ...(charge
        ? { model: charge.model, providerRunId: charge.requestId }
        : {}),
    };
  } catch (caught) {
    rethrowStreamingUnsupported(caught);
    throw caught;
  }
}

function buildGatewayChatBody(
  input: AiInputFor<"text.generate">,
  context: AiTransportContext,
  siteOf: (ctx: AiTransportContext) => string,
  modelOf: (ctx: AiTransportContext) => string,
): Record<string, unknown> {
  return {
    site_id: siteOf(context),
    provider: "bailian",
    key_mode: "platform",
    system: input.system || "",
    messages: [{ role: "user", content: input.prompt }],
    max_tokens: input.maxTokens ?? 2_000,
    ...(input.temperature === undefined
      ? {}
      : { temperature: input.temperature }),
    ...(modelOf(context) ? { model: modelOf(context) } : {}),
  };
}

// ── 1. 网关传输 ─────────────────────────────────────────────────────────────

export interface GatewayAiTransportOptions {
  /** 计费与配额按站分账；不给时用 "oceanleo"。 */
  siteId?: string;
  provider?: string;
  fetcher?: typeof fetch;
  /** 测试缝；生产调用方不要传，默认就是 lib/auth 的 accessToken()。 */
  getAccessToken?: () => Promise<string | null>;
  /**
   * 把内存里的像素变成网关能读的持久 URL。网关只吃 URL 不吃字节，宿主不注入它
   * 时，只带 blob 的素材会如实报 unavailable —— 不会静默丢一张图。
   */
  uploadImage?: (
    blob: Blob,
    context: { title: string; siteId: string; signal: AbortSignal },
  ) => Promise<string>;
  models?: Partial<Record<AiCapability, string>>;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  /**
   * 文本生成是否走流式（默认 true）。留这个开关不是为了「以防万一」：
   * 宿主把响应包在自己的代理后面、代理又缓冲整条流时，流式反而更慢，
   * 那种部署可以显式关掉。
   */
  streaming?: boolean;
  /**
   * 首字节超时（默认 30 秒）。等这么久还没有第一个字，那就是坏了。
   *
   * 别设得更短：境内出向审核是「扣住再放行」（chat_router.py:298-303），
   * 第一段字要等审完才出得来，本来就比裸 provider 慢一拍。
   */
  streamFirstByteTimeoutMs?: number;
  /** 整条流的总时长上限（默认 10 分钟）。 */
  streamTotalTimeoutMs?: number;
}

const GATEWAY_EDIT_BODY_SCHEMA = "oceanleo.gateway.images.edit@1";

interface GatewayCallOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** false = 没登录也照发（/v1/assistant/transform 是公开 + 操作员买单的）。 */
  authRequired?: boolean;
}

export function createGatewayAiTransport(
  options: GatewayAiTransportOptions = {},
): AiTransport {
  const provider = options.provider?.trim() || "oceanleo-gateway";
  const fetcher = options.fetcher || fetch;
  const getToken = options.getAccessToken || accessToken;
  const defaultSiteId = options.siteId?.trim() || "oceanleo";
  const pollIntervalMs = Math.max(250, options.pollIntervalMs || 2_500);
  const pollTimeoutMs = Math.max(pollIntervalMs, options.pollTimeoutMs || 300_000);
  const wait = options.wait || defaultWait;

  const siteOf = (context: AiTransportContext): string =>
    context.siteId || defaultSiteId;

  const modelOf = (context: AiTransportContext): string =>
    context.model || options.models?.[context.capability] || "";

  async function call(
    path: string,
    context: AiTransportContext,
    call_: GatewayCallOptions = {},
  ): Promise<Record<string, unknown>> {
    throwIfCancelled(context);
    const authRequired = call_.authRequired !== false;
    const token = await getToken();
    if (!token && authRequired) {
      throw new PluginAiError(
        "denied",
        "请先登录 OceanLeo 账号再使用 AI 功能。",
        {
          capability: context.capability,
          code: "ai-gateway-signed-out",
          status: 401,
          runId: context.runId,
        },
      );
    }
    let response: Response;
    try {
      response = await fetcher(`${GATEWAY_BASE}${path}`, {
        method: call_.method || "POST",
        headers: {
          ...(call_.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(call_.body === undefined
          ? {}
          : { body: JSON.stringify(call_.body) }),
        cache: "no-store",
        signal: context.signal,
      });
    } catch (caught) {
      if (isAbortError(caught)) throwIfCancelled(context);
      throw new PluginAiError(
        "failed",
        `网络错误：连不上 AI 网关（${path}）。`,
        {
          capability: context.capability,
          code: "ai-gateway-network",
          retryable: true,
          runId: context.runId,
          cause: caught,
        },
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const classified = dispositionForStatus(response.status);
      throw new PluginAiError(
        classified.disposition,
        upstreamDetail(data) ||
          `AI 网关拒绝了这次请求（${path}，HTTP ${response.status}）。`,
        {
          capability: context.capability,
          code: classified.code,
          status: response.status,
          retryable: classified.retryable,
          runId: context.runId,
        },
      );
    }
    return record(data);
  }

  async function sourceUrl(
    ref: AiImageRef,
    slug: string,
    label: string,
    context: AiTransportContext,
  ): Promise<string> {
    const url = (ref.url || "").trim();
    if (url) return url;
    if (!ref.blob) {
      throw new PluginAiError(
        "failed",
        `${label}既没有 URL 也没有像素，这次请求没有发出。`,
        {
          capability: context.capability,
          code: "ai-source-missing",
          runId: context.runId,
        },
      );
    }
    if (!options.uploadImage) {
      throw new PluginAiError(
        "unavailable",
        `宿主没有注入图片上传通道（GatewayAiTransportOptions.uploadImage）；${label}目前只有内存里的像素，而网关只接收 URL，所以这次请求没有发出。`,
        {
          capability: context.capability,
          code: "ai-upload-unavailable",
          runId: context.runId,
        },
      );
    }
    context.onProgress({
      phase: "uploading",
      progress: 0.1,
      message: `正在上传${label}`,
    });
    const uploaded = await options.uploadImage(ref.blob, {
      title: `${context.capability.replace(".", "-")}-${slug}`,
      siteId: siteOf(context),
      signal: context.signal,
    });
    throwIfCancelled(context);
    if (!uploaded.trim()) {
      throw new PluginAiError("failed", `${label}上传后没有拿到 URL。`, {
        capability: context.capability,
        code: "ai-upload-empty",
        runId: context.runId,
      });
    }
    return uploaded.trim();
  }

  /**
   * /v1/images/edit 的公共外壳；relight / inpaint 只是换一段 prompt。
   *
   * 返回的是**具体**形状而不是 AiTransportResult<K>：那个类型对 K 是不变的
   * （output 走 AiOutputFor<K> 的延迟索引），拿 "image.edit" 冒充别的能力过不了编译，
   * 而这三条能力的产物本来就都是 AiImageOutputSet，写具体形状即可各自对号入座。
   */
  async function imageEdit(
    context: AiTransportContext,
    body: {
      imageUrl: string;
      imageUrls?: readonly string[];
      prompt: string;
      ratio?: string;
      count?: number;
    },
  ): Promise<{
    output: AiImageOutputSet;
    provider: string;
    model: string;
    providerRunId?: string;
  }> {
    context.onProgress({ phase: "processing", progress: 0.4 });
    const data = await call("/v1/images/edit", context, {
      body: {
        schema: GATEWAY_EDIT_BODY_SCHEMA,
        site_id: siteOf(context),
        key_mode: "platform",
        image_url: body.imageUrl,
        ...(body.imageUrls?.length ? { image_urls: [...body.imageUrls] } : {}),
        prompt: body.prompt,
        function: "description_edit",
        ...(body.ratio ? { ratio: body.ratio } : {}),
        sharpness: "2K",
        n: Math.max(1, Math.min(4, body.count || 1)),
      },
    });
    context.onProgress({ phase: "finalizing", progress: 0.9 });
    const images = imageOutputsFrom(data);
    if (!images.length) {
      throw new PluginAiError("failed", "AI 网关没有返回结果图。", {
        capability: context.capability,
        code: "ai-empty-output",
        retryable: true,
        runId: context.runId,
      });
    }
    return {
      output: { images },
      provider,
      model: modelOf(context) || text(data.model),
      ...(text(data.request_id)
        ? { providerRunId: text(data.request_id) }
        : {}),
    };
  }

  const handlers: AiHandlerMap = {
    "text.generate": async (input, context) => {
      const chatBody = buildGatewayChatBody(input, context, siteOf, modelOf);
      const streamingEnabled = options.streaming !== false;

      if (streamingEnabled) {
        throwIfCancelled(context);
        const token = await getToken();
        if (!token) {
          throw new PluginAiError(
            "denied",
            "请先登录 OceanLeo 账号再使用 AI 功能。",
            {
              capability: context.capability,
              code: "ai-gateway-signed-out",
              status: 401,
              runId: context.runId,
            },
          );
        }
        try {
          const streamed = await runSseTextGenerate(
            {
              url: `${GATEWAY_BASE}/v1/chat/stream`,
              body: chatBody,
              headers: { Authorization: `Bearer ${token}` },
              fetchImpl: fetcher,
              firstByteTimeoutMs: options.streamFirstByteTimeoutMs,
              totalTimeoutMs: options.streamTotalTimeoutMs,
            },
            context,
          );
          return {
            ...streamed,
            provider,
            model: streamed.model || modelOf(context) || "bailian",
          };
        } catch (caught) {
          if (caught instanceof StreamingUnsupported) {
            context.onProgress({
              phase: "processing",
              progress: 0.3,
              message: NON_STREAM_FALLBACK_MESSAGE,
            });
            const data = await call("/v1/chat", context, { body: chatBody });
            return {
              output: textOutputFrom(data, false),
              provider,
              model: modelOf(context) || text(data.model) || "bailian",
              billing: billingFromResponse(data),
            };
          }
          if (isAbortError(caught)) throwIfCancelled(context);
          throw caught;
        }
      }

      context.onProgress({ phase: "processing", progress: 0.3 });
      const data = await call("/v1/chat", context, { body: chatBody });
      return {
        output: textOutputFrom(data, false),
        provider,
        model: modelOf(context) || text(data.model) || "bailian",
        billing: billingFromResponse(data),
      };
    },

    "text.rewrite": async (input, context) => {
      context.onProgress({ phase: "processing", progress: 0.3 });
      // transform 是公开 + 操作员买单的（posture 同 /v1/recommend），
      // 未登录也要能用，所以这里不强制 token。
      const data = await call("/v1/assistant/transform", context, {
        authRequired: false,
        body: {
          site_id: siteOf(context),
          action: input.action,
          text: input.text,
          ...(input.instruction ? { instruction: input.instruction } : {}),
        },
      });
      return {
        output: textOutputFrom(data, false),
        provider,
        model: modelOf(context),
      };
    },

    "text.translate": async (input, context) => {
      context.onProgress({ phase: "processing", progress: 0.3 });
      const data = await call("/v1/assistant/transform", context, {
        authRequired: false,
        body: {
          site_id: siteOf(context),
          action: "translate",
          text: input.text,
          target_lang: input.targetLang,
          ...(input.sourceLang ? { source_lang: input.sourceLang } : {}),
        },
      });
      return {
        output: textOutputFrom(data, false),
        provider,
        model: modelOf(context),
      };
    },

    "image.generate": async (input, context) => {
      context.onProgress({ phase: "processing", progress: 0.3 });
      const data = await call("/v1/images/generate", context, {
        body: {
          site_id: siteOf(context),
          key_mode: "platform",
          prompt: input.prompt,
          ...(input.ratio ? { ratio: input.ratio } : {}),
          ...(input.count ? { n: input.count } : {}),
          ...(input.negativePrompt
            ? { negative_prompt: input.negativePrompt }
            : {}),
          ...(modelOf(context) ? { model: modelOf(context) } : {}),
        },
      });
      context.onProgress({ phase: "finalizing", progress: 0.9 });
      const images = imageOutputsFrom(data);
      if (!images.length) {
        throw new PluginAiError("failed", "AI 网关没有返回结果图。", {
          capability: context.capability,
          code: "ai-empty-output",
          retryable: true,
          runId: context.runId,
        });
      }
      return {
        output: { images },
        provider,
        model: modelOf(context) || text(data.model),
      };
    },

    "image.edit": async (input, context) => {
      const url = await sourceUrl(input.source, "source", "底图", context);
      return imageEdit(context, {
        imageUrl: url,
        prompt: input.prompt,
        ...(input.ratio ? { ratio: input.ratio } : {}),
        ...(input.count ? { count: input.count } : {}),
      });
    },

    "image.relight": async (input, context) => {
      const url = await sourceUrl(input.source, "source", "底图", context);
      const direction = input.direction || "ambient";
      const intensity = input.intensity ?? 1;
      // 指令逐字沿用 image-provider-mappings 里 relight 那一段：两边出图必须可比，
      // 否则「同一个 relight」在图片编辑器和这里得到两种结果。
      const instruction =
        `Relight this exact image from the ${direction} at intensity ${intensity.toFixed(2)}. ` +
        "Preserve identity, geometry, materials, framing and all non-lighting details.";
      return imageEdit(context, {
        imageUrl: url,
        prompt: input.prompt
          ? `${instruction} Additional direction: ${input.prompt}`
          : instruction,
      });
    },

    "image.inpaint": async (input, context) => {
      const url = await sourceUrl(input.source, "source", "底图", context);
      const maskUrl = await sourceUrl(input.mask, "mask", "遮罩", context);
      const instruction =
        "The first image is the source and the second image is a mask. " +
        "Edit only masked pixels, blend boundaries naturally, and preserve every unmasked pixel and subject identity.";
      return imageEdit(context, {
        imageUrl: url,
        imageUrls: [url, maskUrl],
        prompt: `${instruction} Additional direction: ${input.prompt}`,
      });
    },

    "image.upscale": async (input, context) => {
      const url = await sourceUrl(input.source, "source", "底图", context);
      context.onProgress({ phase: "processing", progress: 0.4 });
      const data = await call("/v1/images/upscale", context, {
        body: {
          site_id: siteOf(context),
          key_mode: "platform",
          image_url: url,
          upscale_factor: input.scale,
          prompt:
            input.prompt ||
            "Restore fine detail while preserving exact identity, composition, colors and texture.",
        },
      });
      context.onProgress({ phase: "finalizing", progress: 0.9 });
      const images = imageOutputsFrom(data);
      if (!images.length) {
        throw new PluginAiError("failed", "AI 网关没有返回放大后的图。", {
          capability: context.capability,
          code: "ai-empty-output",
          retryable: true,
          runId: context.runId,
        });
      }
      return {
        output: { images },
        provider,
        model: modelOf(context) || text(data.model),
      };
    },

    "video.generate": async (input, context) => {
      const posterUrl = input.source
        ? await sourceUrl(input.source, "first-frame", "首帧图", context)
        : "";
      context.onProgress({ phase: "queued", progress: 0.15 });
      const submitted = await call("/v1/videos/generate", context, {
        body: {
          site_id: siteOf(context),
          prompt: input.prompt,
          ...(posterUrl ? { image_url: posterUrl } : {}),
          ...(input.durationSeconds
            ? { duration: input.durationSeconds }
            : {}),
          ...(input.ratio ? { ratio: input.ratio } : {}),
          ...(input.fps ? { fps: input.fps } : {}),
          ...(modelOf(context) ? { model: modelOf(context) } : {}),
        },
      });
      const immediate = videoOutputsFrom(submitted);
      if (immediate.length) {
        return {
          output: { videos: immediate },
          provider,
          model: modelOf(context) || text(submitted.model),
        };
      }
      const taskId = text(submitted.task_id) || text(submitted.job_id);
      if (!taskId) {
        throw new PluginAiError(
          "failed",
          "AI 网关既没有返回视频，也没有返回可轮询的任务号。",
          {
            capability: context.capability,
            code: "ai-video-no-task",
            retryable: true,
            runId: context.runId,
          },
        );
      }
      const started = Date.now();
      let progress = 0.25;
      while (Date.now() - started <= pollTimeoutMs) {
        try {
          await wait(pollIntervalMs, context.signal);
        } catch (caught) {
          if (isAbortError(caught)) throwIfCancelled(context);
          throw caught;
        }
        throwIfCancelled(context);
        const snapshot = await call(
          `/v1/videos/status/${encodeURIComponent(taskId)}`,
          context,
          { method: "GET" },
        );
        const status = text(snapshot.status).toLowerCase();
        if (status === "failed" || status === "error") {
          throw new PluginAiError(
            "failed",
            upstreamDetail(snapshot) || "视频生成失败。",
            {
              capability: context.capability,
              code: "ai-video-failed",
              retryable: true,
              runId: context.runId,
            },
          );
        }
        const videos = videoOutputsFrom(snapshot);
        progress = Math.min(0.9, progress + 0.05);
        context.onProgress({
          phase: status.includes("queue") ? "queued" : "processing",
          progress,
          ...(status ? { message: status } : {}),
        });
        if (videos.length) {
          return {
            output: { videos },
            provider,
            model: modelOf(context) || text(snapshot.model),
            providerRunId: taskId,
          };
        }
      }
      throw new PluginAiError(
        "failed",
        `视频没有在 ${Math.round(pollTimeoutMs / 1000)} 秒内生成完，请稍后在历史记录里查看。`,
        {
          capability: context.capability,
          code: "ai-video-timeout",
          retryable: true,
          runId: context.runId,
        },
      );
    },
  };

  return transportFromHandlers(
    "oceanleo-gateway",
    handlers,
    (capability) =>
      capability === "code.patch"
        ? "网关没有部署 code.patch 这条路由；能改可运行产物的只有宿主注入的生成链（如 registerGameIterationRunner），共享包这边发不出这次请求。"
        : `AI 网关没有 ${capability} 这条能力。`,
  );
}

// ── 2. host.fetchJson 传输 ──────────────────────────────────────────────────

export type PluginAiFetchJson = (
  url: string,
  init?: RequestInit,
) => Promise<unknown>;

/**
 * 逻辑 URL —— 不是公网路径，是给站点适配器认的。
 *
 * 设计画布已经在用 `design://ai/chat` / `design://ai/image-generate`；那套只有
 * 两条、且和插件名绑死。这里换成按能力命名的一张表，站点适配器加一条能力就加一行，
 * 不用再发明第三种 scheme。已经路由了旧 URL 的站点，用 `urls` 覆盖单条即可迁移。
 */
export const PLUGIN_AI_LOGICAL_URLS: Readonly<Record<AiCapability, string>> =
  Object.freeze({
    "text.generate": "ai://text/generate",
    "text.rewrite": "ai://text/rewrite",
    "text.translate": "ai://text/translate",
    "image.generate": "ai://image/generate",
    "image.edit": "ai://image/edit",
    "image.upscale": "ai://image/upscale",
    "image.inpaint": "ai://image/inpaint",
    "image.relight": "ai://image/relight",
    "video.generate": "ai://video/generate",
    "code.patch": "ai://code/patch",
  });

/** 请求信封的版本号。站点适配器认这个字符串来判断该按哪一版解包。 */
export const PLUGIN_AI_REQUEST_SCHEMA = "oceanleo.plugin-ai-request@1" as const;

export interface HostFetchJsonAiTransportOptions {
  siteId?: string;
  provider?: string;
  /** 覆盖个别能力的逻辑 URL（迁移期指回站点已经在路由的旧 URL）。 */
  urls?: Partial<Record<AiCapability, string>>;
  /**
   * 宿主**确实**路由了哪几条能力。不给 = 全部；给了就只开这几条，其余如实报
   * unavailable —— 让插件在按钮变灰时就知道，而不是点下去等一个 404。
   */
  capabilities?: readonly AiCapability[];
  models?: Partial<Record<AiCapability, string>>;
}

function hostImageRef(
  ref: AiImageRef,
  label: string,
  context: AiTransportContext,
): Record<string, unknown> {
  const url = (ref.url || "").trim();
  if (!url && !ref.assetId) {
    throw new PluginAiError(
      "unavailable",
      `宿主只提供了 host.fetchJson（一条 JSON 通道），塞不进${label}的二进制像素；请先把它上传成 URL 或素材 id 再调用。`,
      {
        capability: context.capability,
        code: "ai-host-binary-unsupported",
        runId: context.runId,
      },
    );
  }
  return {
    ...(url ? { url } : {}),
    ...(ref.assetId ? { assetId: ref.assetId } : {}),
    ...(ref.byteDigest ? { byteDigest: ref.byteDigest } : {}),
    ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
  };
}

/**
 * 陈列馆 / extracted 插件用这条：宿主只给一个 fetchJson，别的什么都没有。
 *
 * fetchJson 是一发一收，中途没有任何回报，所以这里报的进度只是「请求的两头」，
 * 不是上游真实百分比 —— 宁可只给阶段，也不编一条匀速前进的假进度条。
 */
export function createHostFetchJsonAiTransport(
  fetchJson: PluginAiFetchJson | null | undefined,
  options: HostFetchJsonAiTransportOptions = {},
): AiTransport {
  if (typeof fetchJson !== "function") {
    return createUnavailableAiTransport(
      "宿主没有注入 host.fetchJson，插件拿不到任何 AI 通道",
    );
  }
  const send = fetchJson;
  const provider = options.provider?.trim() || "host-fetch-json";
  const defaultSiteId = options.siteId?.trim() || "oceanleo";
  const allowed = options.capabilities
    ? new Set<AiCapability>(options.capabilities)
    : null;

  const modelOf = (context: AiTransportContext): string =>
    context.model || options.models?.[context.capability] || "";

  async function post(
    context: AiTransportContext,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    throwIfCancelled(context);
    const url =
      options.urls?.[context.capability] ||
      PLUGIN_AI_LOGICAL_URLS[context.capability];
    context.onProgress({ phase: "processing", progress: 0.35 });
    let data: unknown;
    try {
      data = await send(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: PLUGIN_AI_REQUEST_SCHEMA,
          capability: context.capability,
          requestId: context.requestId,
          runId: context.runId,
          siteId: context.siteId || defaultSiteId,
          ...(modelOf(context) ? { model: modelOf(context) } : {}),
          input: payload,
        }),
        signal: context.signal,
      });
    } catch (caught) {
      if (isAbortError(caught)) throwIfCancelled(context);
      const status = Number(record(caught).status) || undefined;
      const message =
        (caught instanceof Error && caught.message) ||
        `宿主通道执行 ${context.capability} 失败。`;
      const classified = status
        ? dispositionForStatus(status)
        : { disposition: "failed" as const, code: "ai-host-failed", retryable: true };
      throw new PluginAiError(classified.disposition, message, {
        capability: context.capability,
        code: classified.code,
        ...(status ? { status } : {}),
        retryable: classified.retryable,
        runId: context.runId,
        cause: caught,
      });
    }
    context.onProgress({ phase: "finalizing", progress: 0.85 });
    // 站点适配器可以回包一层 { output }，也可以直接回裸负载（视频画布现有的
    // { text } / { images } 就是裸的）。两种都收，省得每个站再各写一遍适配。
    const body = record(data);
    return body.output && typeof body.output === "object"
      ? record(body.output)
      : body;
  }

  function receiptFrom(
    context: AiTransportContext,
    body: Record<string, unknown>,
  ): { provider: string; model: string; providerRunId?: string } {
    const receipt = record(body.receipt);
    const runId = text(receipt.providerRunId) || text(body.providerRunId);
    return {
      provider: text(receipt.provider) || provider,
      model: text(receipt.model) || modelOf(context),
      ...(runId ? { providerRunId: runId } : {}),
    };
  }

  function requireImages(
    body: Record<string, unknown>,
    context: AiTransportContext,
  ): readonly AiImageOutput[] {
    const images = imageOutputsFrom(body);
    if (images.length) return images;
    throw new PluginAiError("failed", "宿主通道没有返回结果图。", {
      capability: context.capability,
      code: "ai-empty-output",
      retryable: true,
      runId: context.runId,
    });
  }

  const handlers: AiHandlerMap = {
    "text.generate": async (input, context) => {
      context.onProgress({
        phase: "processing",
        progress: 0.35,
        message: HOST_NON_STREAM_MESSAGE,
      });
      const body = await post(context, { ...input });
      return {
        output: textOutputFrom(body, false),
        ...receiptFrom(context, body),
      };
    },
    "text.rewrite": async (input, context) => {
      const body = await post(context, { ...input });
      return {
        output: textOutputFrom(body, false),
        ...receiptFrom(context, body),
      };
    },
    "text.translate": async (input, context) => {
      const body = await post(context, { ...input });
      return {
        output: textOutputFrom(body, false),
        ...receiptFrom(context, body),
      };
    },
    "image.generate": async (input, context) => {
      const body = await post(context, { ...input });
      return {
        output: { images: requireImages(body, context) },
        ...receiptFrom(context, body),
      };
    },
    "image.edit": async (input, context) => {
      const body = await post(context, {
        ...input,
        source: hostImageRef(input.source, "底图", context),
      });
      return {
        output: { images: requireImages(body, context) },
        ...receiptFrom(context, body),
      };
    },
    "image.upscale": async (input, context) => {
      const body = await post(context, {
        ...input,
        source: hostImageRef(input.source, "底图", context),
      });
      return {
        output: { images: requireImages(body, context) },
        ...receiptFrom(context, body),
      };
    },
    "image.inpaint": async (input, context) => {
      const body = await post(context, {
        ...input,
        source: hostImageRef(input.source, "底图", context),
        mask: hostImageRef(input.mask, "遮罩", context),
      });
      return {
        output: { images: requireImages(body, context) },
        ...receiptFrom(context, body),
      };
    },
    "image.relight": async (input, context) => {
      const body = await post(context, {
        ...input,
        source: hostImageRef(input.source, "底图", context),
      });
      return {
        output: { images: requireImages(body, context) },
        ...receiptFrom(context, body),
      };
    },
    "video.generate": async (input, context) => {
      const body = await post(context, {
        ...input,
        ...(input.source
          ? { source: hostImageRef(input.source, "首帧图", context) }
          : {}),
      });
      const videos = videoOutputsFrom(body);
      if (!videos.length) {
        throw new PluginAiError("failed", "宿主通道没有返回视频。", {
          capability: context.capability,
          code: "ai-empty-output",
          retryable: true,
          runId: context.runId,
        });
      }
      return { output: { videos }, ...receiptFrom(context, body) };
    },
    "code.patch": async (input, context) => {
      const body = await post(context, { ...input });
      const files = Array.isArray(body.files)
        ? body.files.flatMap((entry) => {
            const item = record(entry);
            const path = text(item.path);
            return path ? [{ path, content: text(item.content) }] : [];
          })
        : [];
      const envelopeUrl = text(body.envelopeUrl) || text(body.envelope_url);
      if (!files.length && !envelopeUrl) {
        throw new PluginAiError(
          "failed",
          "宿主通道既没有返回改动后的文件，也没有返回产物信封。",
          {
            capability: context.capability,
            code: "ai-empty-output",
            retryable: true,
            runId: context.runId,
          },
        );
      }
      const runtimeApiVersion =
        text(body.runtimeApiVersion) || text(body.runtime_api_version);
      return {
        output: {
          summary: text(body.summary),
          files: Object.freeze(files),
          ...(envelopeUrl ? { envelopeUrl } : {}),
          ...(runtimeApiVersion ? { runtimeApiVersion } : {}),
        },
        ...receiptFrom(context, body),
      };
    },
  };

  if (allowed) {
    for (const capability of AI_CAPABILITIES) {
      if (!allowed.has(capability)) delete handlers[capability];
    }
  }

  return transportFromHandlers(
    "host-fetch-json",
    handlers,
    (capability) =>
      `宿主的 host.fetchJson 没有路由 ${capability}（逻辑 URL ${
        options.urls?.[capability] || PLUGIN_AI_LOGICAL_URLS[capability]
      }），插件这边发不出这次请求。`,
  );
}

// ── 3. 不可用传输（fail closed）─────────────────────────────────────────────

/**
 * 什么 AI 通道都没有时用它。
 *
 * 这条实现存在的唯一目的，是把「没接 AI」变成一句用户看得懂的话，而不是一次
 * 静默的空结果或一张假装成功的占位图。旧实现里三种都出现过，最坏的一种让用户
 * 以为图已经生成、保存后才发现什么都没有。所以这里**永远抛**，
 * disposition 恒为 "unavailable"，消息里必须点名缺的是哪一样宿主能力。
 */
export function createUnavailableAiTransport(reason: string): AiTransport {
  const detail = (reason || "").trim() || "宿主没有注入任何 AI 通道";
  const message = `AI 能力不可用：${detail}。这次请求没有发出，也不会有任何结果。`;
  const fail = (capability: AiCapability, runId?: string): never => {
    throw new PluginAiError("unavailable", message, {
      capability,
      code: "ai-transport-unavailable",
      ...(runId ? { runId } : {}),
    });
  };
  return {
    id: "unavailable",
    availability: () => ({ enabled: false, reason: message }),
    async execute(capability, _input, context) {
      return fail(capability, context.runId);
    },
  };
}
