// ============================================================================
// @oceanleo/ui — SSE 读取（fetch + ReadableStream，零依赖）
// ----------------------------------------------------------------------------
// 为什么不用 EventSource：它只会 GET，也带不了 Authorization header。网关的
// /v1/chat/stream 是 POST + Bearer，用不了它。所以这里手写一遍协议——不是因为
// 想造轮子，是因为平台那个内置实现的形状对不上。
//
// 两层，分开是为了让「协议」和「线格式」各自可测：
//   L1  createSseParser / openSseStream —— 纯 W3C SSE，与 OceanLeo 无关。
//   L2  decodeChatFrame                —— /v1/chat/stream 的四种 data: 载荷。
//       plugin-ai 与 agent 聊天共用它，线格式因此只有一处实现，不会各解各的。
//
// L1 存在的真正理由是**跨 chunk 半行**：`data: {"a":1}` 会被 TCP 切成
// `data: {"a` + `":1}` 两次到达，按 chunk 直接 JSON.parse 的写法在本地永远是对的、
// 在长回答上偶尔崩——这类 bug 只能靠解析器内部缓冲根治，不能靠调用方小心。
//
// 契约全文（含网关侧证据与三条使用纪律）：
// docs/work-logs/2026-08/oceanleo-experience-upgrade/signals/W20-request.md
// ============================================================================

// ── L1 事件 ─────────────────────────────────────────────────────────────────

/** 一个已完成的 SSE 事件。字段名与 W3C EventSource 一致。 */
export interface SseEvent {
  /** `event:` 行；缺省 "message"（规范默认值，不是空串）。 */
  event: string;
  /** 多行 `data:` 已按规范用 "\n" 拼接，且不含尾随换行。 */
  data: string;
  /** 最近一次 `id:` 行的值（按规范跨事件保持）。 */
  id?: string;
  /** 最近一次 `retry:` 行的毫秒数；非纯数字一律忽略（规范要求）。 */
  retry?: number;
}

export interface SseParser {
  /** 喂一段任意切分的文本，返回这一段里**已完整**的事件（可能是 0 个）。 */
  push(chunk: string): SseEvent[];
  /** 流结束时调用：把缓冲里最后一个没有空行收尾的事件交出来。 */
  flush(): SseEvent[];
}

const DEFAULT_EVENT_NAME = "message";

/**
 * 纯函数式解析器，不碰网络。
 *
 * 三处容易写错、这里逐条守住的地方：
 *  1. 半行跨 chunk：不完整的行留在 buffer 里，等下一段。
 *  2. `\r\n` 被切在 `\r` 与 `\n` 中间：结尾的孤立 `\r` **不当行尾**，留到下一段
 *     才能判断——否则同一个换行会被数成两个，凭空多出一个空行 = 提前分派事件。
 *  3. `data:` 后只吃掉**一个**空格（规范如此）；吃两个会把缩进的 JSON 弄脏。
 */
export function createSseParser(): SseParser {
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];
  let lastId: string | undefined;
  let lastRetry: number | undefined;
  let sawField = false;

  function resetEvent(): void {
    eventName = "";
    dataLines = [];
    sawField = false;
  }

  function dispatch(out: SseEvent[]): void {
    // 规范：data 缓冲为空时不分派（只有注释、或只设了 id/retry 的块）。
    if (!dataLines.length) {
      resetEvent();
      return;
    }
    out.push({
      event: eventName || DEFAULT_EVENT_NAME,
      data: dataLines.join("\n"),
      ...(lastId === undefined ? {} : { id: lastId }),
      ...(lastRetry === undefined ? {} : { retry: lastRetry }),
    });
    resetEvent();
  }

  function handleLine(line: string, out: SseEvent[]): void {
    if (!line) {
      dispatch(out);
      return;
    }
    if (line.startsWith(":")) return; // 注释行（心跳常用），丢弃
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "data") {
      dataLines.push(value);
      sawField = true;
      return;
    }
    if (field === "event") {
      eventName = value;
      sawField = true;
      return;
    }
    if (field === "id") {
      // 规范：含 NUL 的 id 忽略。
      if (!value.includes("\0")) {
        lastId = value;
        sawField = true;
      }
      return;
    }
    if (field === "retry") {
      if (/^\d+$/.test(value)) {
        lastRetry = Number(value);
        sawField = true;
      }
      return;
    }
    // 未知字段：规范要求忽略，不许当错误。
  }

  return {
    push(chunk) {
      const out: SseEvent[] = [];
      if (!chunk) return out;
      buffer += chunk;
      let start = 0;
      let index = 0;
      while (index < buffer.length) {
        const char = buffer[index];
        if (char === "\n") {
          handleLine(buffer.slice(start, index), out);
          index += 1;
          start = index;
          continue;
        }
        if (char === "\r") {
          // 结尾的 \r：可能是 \r\n 被切开了，留着，下一段再判。
          if (index === buffer.length - 1) break;
          handleLine(buffer.slice(start, index), out);
          index += buffer[index + 1] === "\n" ? 2 : 1;
          start = index;
          continue;
        }
        index += 1;
      }
      buffer = buffer.slice(start);
      return out;
    },

    flush() {
      const out: SseEvent[] = [];
      if (buffer) {
        const tail = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
        buffer = "";
        if (tail) handleLine(tail, out);
      }
      // 服务端不以空行收尾时，最后一个事件仍然要交出去，不能默默吞掉。
      if (sawField) dispatch(out);
      return out;
    },
  };
}

// ── L1 错误 ─────────────────────────────────────────────────────────────────

/** 调用方按 reason 分支，不要对 message 做正则。 */
export type SseFailureReason =
  | "http"
  | "not-event-stream"
  | "no-body"
  | "first-byte-timeout"
  | "total-timeout"
  | "network";

export interface SseErrorOptions {
  status?: number;
  cause?: unknown;
}

export class SseError extends Error {
  readonly reason: SseFailureReason;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    reason: SseFailureReason,
    message: string,
    options: SseErrorOptions = {},
  ) {
    super(message);
    this.name = "SseError";
    this.reason = reason;
    this.status = options.status;
    this.cause = options.cause;
  }
}

export function isSseError(value: unknown): value is SseError {
  return value instanceof SseError;
}

// ── L1 网络 ─────────────────────────────────────────────────────────────────

export interface SseRequestInit {
  /** 绝对或相对 URL；由调用方拼好（本模块不认识网关地址）。 */
  url: string;
  method?: "GET" | "POST";
  headers?: Readonly<Record<string, string>>;
  /** string 原样发送；其余值 JSON.stringify 并自动补 Content-Type。 */
  body?: unknown;
  signal?: AbortSignal;
  /** 首字节超时（毫秒）。等这么久还没有第一个字节，那就是坏了。 */
  firstByteTimeoutMs?: number;
  /** 总超时（毫秒）。 */
  totalTimeoutMs?: number;
  /** 测试缝：注入假的 fetch。 */
  fetchImpl?: typeof fetch;
  /** 响应头已到、正文尚未开始时回调一次（可用来关掉「连接中」态）。 */
  onOpen?: (response: Response) => void;
}

export const SSE_DEFAULT_FIRST_BYTE_TIMEOUT_MS = 30_000;
export const SSE_DEFAULT_TOTAL_TIMEOUT_MS = 600_000;

function abortReasonOf(signal: AbortSignal): unknown {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  if (reason !== undefined) return reason;
  return new DOMException("Aborted", "AbortError");
}

function networkMessage(caught: unknown): string {
  const detail = caught instanceof Error ? caught.message.trim() : "";
  return detail ? `流式连接失败：${detail}` : "流式连接失败。";
}

/**
 * 打开一条 SSE 流并按事件产出。
 *
 * ```ts
 * for await (const event of openSseStream({ url, body, signal })) { … }
 * ```
 *
 * 提前 `break` 会走 async generator 的 return 路径，在 finally 里 abort 底层请求
 * ——**是真的把连接断掉，不是拿到结果再丢掉**。取消要省下的是上游的钱和算力，
 * 只在前端丢弃结果等于没取消。
 */
export async function* openSseStream(
  init: SseRequestInit,
): AsyncGenerator<SseEvent, void, void> {
  const fetcher = init.fetchImpl || globalThis.fetch;
  const external = init.signal;
  if (external?.aborted) throw abortReasonOf(external);

  const controller = new AbortController();
  const onExternalAbort = (): void => controller.abort();
  external?.addEventListener("abort", onExternalAbort, { once: true });

  // 超时不是「报个错就算」：先 abort 真实请求，再抛。否则连接还挂着继续烧钱。
  let expired: SseFailureReason | null = null;
  const arm = (
    ms: number,
    reason: SseFailureReason,
  ): ReturnType<typeof setTimeout> =>
    globalThis.setTimeout(() => {
      expired = reason;
      controller.abort();
    }, ms);

  let firstByteTimer: ReturnType<typeof setTimeout> | null = arm(
    init.firstByteTimeoutMs ?? SSE_DEFAULT_FIRST_BYTE_TIMEOUT_MS,
    "first-byte-timeout",
  );
  const totalTimer = arm(
    init.totalTimeoutMs ?? SSE_DEFAULT_TOTAL_TIMEOUT_MS,
    "total-timeout",
  );
  const disarmFirstByte = (): void => {
    if (firstByteTimer === null) return;
    globalThis.clearTimeout(firstByteTimer);
    firstByteTimer = null;
  };

  /** abort 之后落到这里：分清「超时」「用户取消」「网络断」三种，不许混成一种。 */
  const raise = (caught: unknown): never => {
    if (expired) {
      throw new SseError(
        expired,
        expired === "first-byte-timeout"
          ? "等了太久没有收到第一个字节，这次流式请求已中断。"
          : "流式请求超过总时长上限，已中断。",
        { cause: caught },
      );
    }
    if (external?.aborted) throw abortReasonOf(external);
    throw new SseError("network", networkMessage(caught), { cause: caught });
  };

  try {
    const hasBody = init.body !== undefined;
    const isRawBody = typeof init.body === "string";
    let response: Response;
    try {
      response = await fetcher(init.url, {
        method: init.method || "POST",
        headers: {
          Accept: "text/event-stream",
          ...(hasBody && !isRawBody
            ? { "Content-Type": "application/json" }
            : {}),
          ...(init.headers || {}),
        },
        ...(hasBody
          ? {
              body: isRawBody
                ? (init.body as string)
                : JSON.stringify(init.body),
            }
          : {}),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (caught) {
      raise(caught);
      return;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SseError(
        "http",
        detail.slice(0, 400) || `流式接口返回 HTTP ${response.status}。`,
        { status: response.status },
      );
    }

    const contentType = response.headers?.get?.("content-type") || "";
    if (!contentType.toLowerCase().includes("text/event-stream")) {
      throw new SseError(
        "not-event-stream",
        `这条响应不是 SSE（Content-Type: ${contentType || "缺失"}）。`,
        { status: response.status },
      );
    }
    if (!response.body) {
      throw new SseError(
        "no-body",
        "这条响应没有可读的流（当前环境不支持 ReadableStream 响应体）。",
        { status: response.status },
      );
    }

    init.onOpen?.(response);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSseParser();

    // 取消/超时不能只依赖「读取端自己会拒绝」：fetch 的响应体会，别的实现不一定。
    // 把 abort 并进每一次 read 的竞速里，断开就是断开，不用等对端赏脸。
    const abortRace = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
    abortRace.catch(() => undefined); // 正常收尾后它仍会 reject，先认领掉

    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await Promise.race([reader.read(), abortRace]);
        } catch (caught) {
          raise(caught);
          return;
        }
        if (chunk.done) break;
        disarmFirstByte();
        // stream: true —— 多字节字符被切在 chunk 边界上时，解码器自己会等齐。
        // 中文一个字三字节，这里省掉的是「一个汉字变成两个问号」那类 bug。
        for (const event of parser.push(
          decoder.decode(chunk.value, { stream: true }),
        )) {
          yield event;
        }
      }
      const tail = decoder.decode();
      if (tail) {
        for (const event of parser.push(tail)) yield event;
      }
      for (const event of parser.flush()) yield event;
    } finally {
      // 调用方提前 break 时把读取端也关掉，底层连接才会真的松手。
      void reader.cancel().catch(() => undefined);
    }
  } finally {
    disarmFirstByte();
    globalThis.clearTimeout(totalTimer);
    external?.removeEventListener("abort", onExternalAbort);
    controller.abort();
  }
}

// ── L2 /v1/chat/stream 的线格式 ─────────────────────────────────────────────
//
// 网关把 provider 的 OpenAI 风格 SSE **原样透传**（backend/app/llm.py 的
// chat_stream：「Yields raw SSE lines straight through to the browser」），
// 另外自己加两种帧。两处反直觉，调用方必须知道：
//
//   1. `[DONE]` 不是终点：oceanleo_charge 在它之后才发（chat_router.py:429 在
//      async for 循环之外）。读到 [DONE] 就 break = 把计费回执吞掉。
//   2. 错误不走 HTTP 状态码：流一开始 status 就改不了了，所以内容审核拦截与
//      provider 不可达都以 data: 错误帧送出，HTTP 依旧 200。

export interface ChatStreamCharge {
  /** 服务端估算值（prompt 按 4 字符/token、completion 按 16 字符/token）。 */
  tokens: number;
  /** 账本货币码（"CNY" / "USD"）；旧网关没给时按 CNY。 */
  currency: string;
  /** 本次真实成本，账本货币主单位（`price ?? price_cny`）。 */
  price: number;
  /** 扣费后余额，账本货币主单位（`balance ?? balance_yuan`）。 */
  balance: number;
  /** @deprecated 与 `price` 同一个数。 */
  priceCny: number;
  model: string;
  keyMode: string;
  requestId: string;
  /** @deprecated 与 `balance` 同一个数。 */
  balanceYuan: number;
  /** 后端原样对象；将来加字段也不会在这一层丢掉。 */
  raw: Readonly<Record<string, unknown>>;
}

export type ChatStreamFrame =
  | { kind: "delta"; text: string; reasoning?: string; finishReason?: string }
  | { kind: "done" }
  | { kind: "error"; message: string; blocked: boolean; contentSafety?: unknown }
  | { kind: "charge"; charge: ChatStreamCharge }
  | { kind: "unknown"; data: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function chargeFrom(raw: Record<string, unknown>): ChatStreamCharge {
  // 账本货币契约（2026-09-07）：中性键 `price` / `balance` / `currency` 优先，
  // 旧键 `price_cny` / `balance_yuan` 只在人民币账本上还会给。货币没说就是 CNY，绝不猜美元。
  const price = firstNumber(raw.price, raw.price_cny);
  const balance = firstNumber(raw.balance, raw.balance_yuan);
  const currency = asText(raw.currency).trim().toUpperCase() || "CNY";
  return {
    tokens: asNumber(raw.tokens),
    currency,
    price,
    balance,
    priceCny: price,
    model: asText(raw.model),
    keyMode: asText(raw.key_mode),
    requestId: asText(raw.request_id),
    balanceYuan: balance,
    raw,
  };
}

/**
 * 把一个 SSE 事件的 `data` 解成可辨识联合。
 *
 * **永不抛错**：畸形 JSON 归 `{ kind: "unknown" }`，由调用方决定忽略还是记日志。
 * 一条坏帧不该把整段已经生成好的正文带走——用户读到一半的东西比那条帧值钱。
 */
export function decodeChatFrame(data: string): ChatStreamFrame | null {
  const trimmed = data.trim();
  if (!trimmed) return null;
  if (trimmed === "[DONE]") return { kind: "done" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: "unknown", data };
  }
  if (!parsed || typeof parsed !== "object") return { kind: "unknown", data };
  const body = parsed as Record<string, unknown>;

  const charge = body.oceanleo_charge;
  if (charge && typeof charge === "object") {
    return { kind: "charge", charge: chargeFrom(asRecord(charge)) };
  }

  // error 有两种形状：网关自己发的是字符串，provider 透传的常是 { message }。
  const errorMessage =
    asText(body.error) || asText(asRecord(body.error).message);
  if (errorMessage) {
    return {
      kind: "error",
      message: errorMessage,
      blocked: body.blocked === true,
      ...(body.content_safety === undefined
        ? {}
        : { contentSafety: body.content_safety }),
    };
  }

  if (Array.isArray(body.choices)) {
    const first = asRecord(body.choices[0]);
    const delta = asRecord(first.delta);
    const reasoning = asText(delta.reasoning_content);
    const finishReason = asText(first.finish_reason);
    return {
      kind: "delta",
      text: asText(delta.content),
      ...(reasoning ? { reasoning } : {}),
      ...(finishReason ? { finishReason } : {}),
    };
  }

  return { kind: "unknown", data };
}
