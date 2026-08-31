import assert from "node:assert/strict";
import test from "node:test";

import {
  SSE_DEFAULT_FIRST_BYTE_TIMEOUT_MS,
  SseError,
  createSseParser,
  decodeChatFrame,
  isSseError,
  openSseStream,
} from "../src/lib/sse.ts";

// ── 测试替身 ────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/**
 * 按给定的**字节切分**造一条响应体。切分点是这套测试的重点：真实网络会在任意
 * 位置切断，本地一次性 chunk 的测试对此完全无感。
 */
function streamOf(chunks, { hang = false } = {}) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!hang) controller.close();
    },
  });
}

function responseOf(
  body,
  { status = 200, contentType = "text/event-stream", text = "" } = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key) => (key.toLowerCase() === "content-type" ? contentType : null) },
    body,
    text: async () => text,
  };
}

/** 记录下每次调用的 init，测试才能断言「取消是否真的传到了请求上」。 */
function fetcherOf(response) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  impl.calls = calls;
  return impl;
}

async function collect(iterator) {
  const events = [];
  for await (const event of iterator) events.push(event);
  return events;
}

// ── L1 解析器 ───────────────────────────────────────────────────────────────

test("跨 chunk 半行：一个 data: 行被切成两半仍解析为一个事件", () => {
  const parser = createSseParser();
  // 切在 JSON 中间——这正是 TCP 分片会干的事。
  assert.deepEqual(parser.push('data: {"a'), []);
  assert.deepEqual(parser.push('":1}\n\n'), [
    { event: "message", data: '{"a":1}' },
  ]);
});

test("跨 chunk 半行：逐字符喂入与整段喂入结果完全一致", () => {
  const wire =
    'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n' +
    "event: ping\ndata: 1\n\n" +
    "data: [DONE]\n\n";

  const whole = createSseParser();
  const expected = whole.push(wire);

  const drip = createSseParser();
  const actual = [];
  for (const char of wire) actual.push(...drip.push(char));

  assert.equal(expected.length, 3);
  assert.deepEqual(actual, expected);
});

test("跨 chunk 半行：\\r\\n 被切在 \\r 与 \\n 中间不算两个换行", () => {
  const parser = createSseParser();
  // 结尾孤立的 \r 必须留到下一段再判，否则空行提前出现 = 事件被切成两个。
  assert.deepEqual(parser.push("data: hello\r"), []);
  assert.deepEqual(parser.push("\ndata: world\r\n\r\n"), [
    { event: "message", data: "hello\nworld" },
  ]);
});

test("多行 data: 按规范用换行拼接，且只吃掉一个前导空格", () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push("data: line1\ndata:line2\ndata:  line3\n\n"), [
    { event: "message", data: "line1\nline2\n line3" },
  ]);
});

test("event: 分派自定义事件名，缺省是 message", () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push("event: charge\ndata: {}\n\n"), [
    { event: "charge", data: "{}" },
  ]);
  assert.deepEqual(parser.push("data: {}\n\n"), [
    { event: "message", data: "{}" },
  ]);
});

test("id: 与 retry: 被带出，且跨事件保持", () => {
  const parser = createSseParser();
  const [first] = parser.push("id: 7\nretry: 2500\ndata: a\n\n");
  assert.equal(first.id, "7");
  assert.equal(first.retry, 2_500);
  const [second] = parser.push("data: b\n\n");
  assert.equal(second.id, "7", "id 按规范跨事件保持");
  assert.equal(second.retry, 2_500);
});

test("畸形行不崩：注释、未知字段、无冒号的行、非法 retry 一律安静忽略", () => {
  const parser = createSseParser();
  const events = parser.push(
    ": keep-alive\nfoo: bar\nbarebones\nretry: soon\ndata: ok\n\n",
  );
  assert.deepEqual(events, [{ event: "message", data: "ok" }]);
});

test("只有注释或只有 id 的块不分派事件（data 为空不产出）", () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push(": heartbeat\n\n"), []);
  assert.deepEqual(parser.push("id: 9\n\n"), []);
  assert.deepEqual(parser.flush(), []);
});

test("flush 交出没有空行收尾的最后一个事件", () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push("data: tail"), []);
  assert.deepEqual(parser.flush(), [{ event: "message", data: "tail" }]);
  assert.deepEqual(parser.flush(), [], "flush 幂等，不会重复交付");
});

// ── L1 网络层 ───────────────────────────────────────────────────────────────

test("openSseStream 按事件产出，并把 body 当 JSON 发出去", async () => {
  const fetcher = fetcherOf(
    responseOf(streamOf(["data: a\n\n", "data: b\n\n"])),
  );
  const events = await collect(
    openSseStream({
      url: "https://api.example.com/v1/chat/stream",
      body: { prompt: "hi" },
      fetchImpl: fetcher,
    }),
  );

  assert.deepEqual(
    events.map((event) => event.data),
    ["a", "b"],
  );
  const [{ init }] = fetcher.calls;
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Accept, "text/event-stream");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.equal(init.body, JSON.stringify({ prompt: "hi" }));
});

test("openSseStream 处理跨 chunk 切断的多字节中文", async () => {
  const bytes = encoder.encode("data: 你好世界\n\n");
  const stream = new ReadableStream({
    start(controller) {
      // 切在一个汉字的三个字节中间。
      controller.enqueue(bytes.slice(0, 9));
      controller.enqueue(bytes.slice(9));
      controller.close();
    },
  });
  const events = await collect(
    openSseStream({ url: "/s", fetchImpl: fetcherOf(responseOf(stream)) }),
  );
  assert.deepEqual(events.map((event) => event.data), ["你好世界"]);
});

test("非 2xx 抛 SseError('http') 并带状态码与上游文案", async () => {
  const fetcher = fetcherOf(
    responseOf(null, { status: 402, text: "余额不足" }),
  );
  await assert.rejects(
    () => collect(openSseStream({ url: "/s", fetchImpl: fetcher })),
    (caught) => {
      assert.ok(isSseError(caught));
      assert.equal(caught.reason, "http");
      assert.equal(caught.status, 402);
      assert.equal(caught.message, "余额不足");
      return true;
    },
  );
});

test("Content-Type 不是 text/event-stream 时抛 not-event-stream", async () => {
  const fetcher = fetcherOf(
    responseOf(streamOf(["data: a\n\n"]), { contentType: "application/json" }),
  );
  await assert.rejects(
    () => collect(openSseStream({ url: "/s", fetchImpl: fetcher })),
    (caught) => caught instanceof SseError && caught.reason === "not-event-stream",
  );
});

test("响应没有可读流时抛 no-body，不是静默返回空", async () => {
  const fetcher = fetcherOf(responseOf(null));
  await assert.rejects(
    () => collect(openSseStream({ url: "/s", fetchImpl: fetcher })),
    (caught) => caught instanceof SseError && caught.reason === "no-body",
  );
});

test("fetch 自己抛错时归 network", async () => {
  const fetcher = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    () => collect(openSseStream({ url: "/s", fetchImpl: fetcher })),
    (caught) => {
      assert.ok(caught instanceof SseError);
      assert.equal(caught.reason, "network");
      assert.ok(caught.message.includes("Failed to fetch"));
      return true;
    },
  );
});

test("AbortSignal 中断：抛 AbortError 且底层请求真的被 abort", async () => {
  const controller = new AbortController();
  // hang: true —— 服务端还挂着不关流，取消必须由我们这边生效。
  const fetcher = fetcherOf(responseOf(streamOf(["data: a\n\n"], { hang: true })));

  const received = [];
  await assert.rejects(
    async () => {
      for await (const event of openSseStream({
        url: "/s",
        signal: controller.signal,
        fetchImpl: fetcher,
      })) {
        received.push(event.data);
        controller.abort();
      }
    },
    (caught) => caught?.name === "AbortError",
  );

  assert.deepEqual(received, ["a"], "取消前已收到的事件仍然交付了");
  assert.equal(
    fetcher.calls[0].init.signal.aborted,
    true,
    "取消必须传到 fetch 的 signal 上 —— 只丢弃结果不算取消",
  );
});

test("开始前就已取消：一个字节都不发", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = fetcherOf(responseOf(streamOf(["data: a\n\n"])));
  await assert.rejects(
    () =>
      collect(
        openSseStream({ url: "/s", signal: controller.signal, fetchImpl: fetcher }),
      ),
    (caught) => caught?.name === "AbortError",
  );
  assert.equal(fetcher.calls.length, 0, "已取消就不该再发一趟白花钱的请求");
});

test("调用方提前 break 会断开底层请求", async () => {
  const fetcher = fetcherOf(
    responseOf(streamOf(["data: a\n\n", "data: b\n\n"], { hang: true })),
  );
  for await (const event of openSseStream({ url: "/s", fetchImpl: fetcher })) {
    assert.equal(event.data, "a");
    break;
  }
  assert.equal(fetcher.calls[0].init.signal.aborted, true);
});

test("首字节超时短于总超时，且超时会 abort 请求", async () => {
  assert.equal(SSE_DEFAULT_FIRST_BYTE_TIMEOUT_MS, 30_000);
  const fetcher = fetcherOf(responseOf(streamOf([], { hang: true })));
  await assert.rejects(
    () =>
      collect(
        openSseStream({ url: "/s", firstByteTimeoutMs: 20, fetchImpl: fetcher }),
      ),
    (caught) => {
      assert.ok(caught instanceof SseError);
      assert.equal(caught.reason, "first-byte-timeout");
      return true;
    },
  );
  assert.equal(fetcher.calls[0].init.signal.aborted, true);
});

test("首字节到了之后就只受总超时约束", async () => {
  const fetcher = fetcherOf(
    responseOf(streamOf(["data: a\n\n"], { hang: true })),
  );
  await assert.rejects(
    () =>
      collect(
        openSseStream({
          url: "/s",
          firstByteTimeoutMs: 20,
          totalTimeoutMs: 60,
          fetchImpl: fetcher,
        }),
      ),
    (caught) => {
      assert.ok(caught instanceof SseError);
      assert.equal(
        caught.reason,
        "total-timeout",
        "第一个字节已到，就不该再报首字节超时",
      );
      return true;
    },
  );
});

// ── L2 /v1/chat/stream 线格式 ───────────────────────────────────────────────

test("decodeChatFrame 解 OpenAI 风格增量", () => {
  assert.deepEqual(
    decodeChatFrame('{"choices":[{"delta":{"content":"你"}}]}'),
    { kind: "delta", text: "你" },
  );
  assert.deepEqual(
    decodeChatFrame(
      '{"choices":[{"delta":{"reasoning_content":"想一下"},"finish_reason":"length"}]}',
    ),
    { kind: "delta", text: "", reasoning: "想一下", finishReason: "length" },
  );
});

test("decodeChatFrame 认得 [DONE]，但它只是 provider 的结束标记", () => {
  assert.deepEqual(decodeChatFrame("[DONE]"), { kind: "done" });
  assert.equal(decodeChatFrame("   "), null);
});

test("decodeChatFrame 解网关的计费帧（[DONE] 之后才来的那一帧）", () => {
  const frame = decodeChatFrame(
    JSON.stringify({
      oceanleo_charge: {
        tokens: 512,
        price_cny: 0.0123,
        model: "qwen-max",
        key_mode: "platform",
        request_id: "req_1",
        balance_yuan: 3.5,
      },
    }),
  );
  assert.equal(frame.kind, "charge");
  assert.equal(frame.charge.tokens, 512);
  assert.equal(frame.charge.priceCny, 0.0123);
  assert.equal(frame.charge.keyMode, "platform");
  assert.equal(frame.charge.requestId, "req_1");
  assert.equal(frame.charge.balanceYuan, 3.5);
  assert.equal(frame.charge.raw.price_cny, 0.0123, "原始对象要留着");
});

test("decodeChatFrame 解错误帧（HTTP 仍是 200 的那种）", () => {
  const blocked = decodeChatFrame(
    JSON.stringify({
      error: "内容不合规，已拦截。",
      blocked: true,
      content_safety: { scene: "output" },
    }),
  );
  assert.deepEqual(blocked, {
    kind: "error",
    message: "内容不合规，已拦截。",
    blocked: true,
    contentSafety: { scene: "output" },
  });

  assert.deepEqual(
    decodeChatFrame('{"error":{"message":"provider unreachable"}}'),
    { kind: "error", message: "provider unreachable", blocked: false },
  );
});

test("decodeChatFrame 遇到畸形载荷不抛错，归为 unknown", () => {
  assert.deepEqual(decodeChatFrame("{oops"), { kind: "unknown", data: "{oops" });
  assert.deepEqual(decodeChatFrame("42"), { kind: "unknown", data: "42" });
  assert.deepEqual(decodeChatFrame('{"hello":"world"}'), {
    kind: "unknown",
    data: '{"hello":"world"}',
  });
});
