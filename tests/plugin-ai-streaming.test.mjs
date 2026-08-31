// plugin-ai text.generate 流式路径自测。
//
// 守的是 W20 的 P2–P5：增量顺序、最终拼接、取消真断开、断线保留残缺、
// 不支持流式时回落非流式并告知用户。不发真请求。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// 入口取 transport.ts / client.ts 本身，不取 index.ts：那份桶文件不在 W20 的
// 独占面，不会随这份测试一起进 main，挂在它上面的测试在干净检出上会直接红。
//
// `./types` 打的是**指向真模块的**替身，不是假实现。编译台默认「能被 node 原生
// 加载的 .ts 就别编」，而原生 type-stripping 要求相对 import 带扩展名——本包写的
// 是无扩展名的 `./types`，真加载会当场 ERR_MODULE_NOT_FOUND。给这条边一个替身，
// 既按 helper 既有规则把整张图拉回编译路径，又让三份文件共用同一份 types 实例，
// `error instanceof PluginAiError` 才不会因为两份副本而假红。
const typesUrl = await compileModule("src/shell/plugin-ai/types.ts");

const stubs = {
  "./types": typesUrl,
  "../../lib/auth/client": dataModule(
    `export async function accessToken() { return globalThis.__pluginAiToken ?? "test-token"; }`,
  ),
  "../../lib/auth/config": dataModule(
    `export const GATEWAY_BASE = "https://gateway.invalid";`,
  ),
};

const { PluginAiError, isPluginAiError } = await import(typesUrl);
const { createGatewayAiTransport, createHostFetchJsonAiTransport } =
  await import(await compileModule("src/shell/plugin-ai/transport.ts", stubs));
const { createPluginAiClient } = await import(
  await compileModule("src/shell/plugin-ai/client.ts", stubs)
);

const encoder = new TextEncoder();

function sseChunks(frames) {
  return frames.map((frame) => `data: ${frame}\n\n`);
}

function streamOf(chunks, { hang = false } = {}) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!hang) controller.close();
    },
  });
}

/**
 * 先把 chunks 真交出去，再断。
 *
 * 不能在 `start()` 里 enqueue 完接着 `controller.error()`：按流规范 `error()` 会
 * **清空队列**，读取端第一次 `read()` 就直接被拒，一个字节都拿不到。那模拟的是
 * 「连上就断」，不是「读到一半断」——两者对本用例是相反的期望，前者本就没有
 * partial 可留。分两次 `pull` 才是真实的 reset。
 */
function brokenStreamOf(chunks) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        return;
      }
      controller.error(new TypeError("connection reset"));
    },
  });
}

function brokenSseResponse(chunks) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (key) =>
        key.toLowerCase() === "content-type" ? "text/event-stream" : null,
    },
    body: brokenStreamOf(chunks),
    text: async () => "",
  };
}

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function sseResponse(chunks, { status = 200, hang = false } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key) =>
        key.toLowerCase() === "content-type" ? "text/event-stream" : null,
    },
    body: streamOf(chunks, { hang }),
    text: async () => "",
  };
}

function gatewayFetcher(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, aborted: init?.signal?.aborted ?? false });
    const route = routes.find(([pattern]) => url.includes(pattern));
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    const response = await route[1]({ url, init, callIndex: calls.length - 1 });
    if (init?.signal) {
      init.signal.addEventListener(
        "abort",
        () => {
          calls[calls.length - 1].aborted = true;
        },
        { once: true },
      );
    }
    return response;
  };
  fn.calls = calls;
  return fn;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ── 网关流式 ────────────────────────────────────────────────────────────────

test("text.generate 流式：增量按顺序到达，最终完整值等于增量拼接", async () => {
  const deltas = ["你", "好", "世界"];
  const charge = JSON.stringify({
    oceanleo_charge: {
      tokens: 12,
      price_cny: 0.01,
      model: "qwen-max",
      key_mode: "platform",
      request_id: "req_stream_1",
      balance_yuan: 9.9,
    },
  });
  const fetcher = gatewayFetcher([
    [
      "/v1/chat/stream",
      () =>
        sseResponse([
          ...sseChunks(
            deltas.map((d) =>
              JSON.stringify({ choices: [{ delta: { content: d } }] }),
            ),
          ),
          "data: [DONE]\n\n",
          `data: ${charge}\n\n`,
        ]),
    ],
  ]);

  const progress = [];
  const transport = createGatewayAiTransport({ fetcher });
  const client = createPluginAiClient(transport);
  const result = await client.run({
    capability: "text.generate",
    input: { prompt: "打招呼" },
    onProgress: (p) => progress.push({ phase: p.phase, delta: p.delta }),
  });

  assert.equal(result.output.text, deltas.join(""));
  assert.equal(result.output.streamed, true);
  assert.equal(result.receipt.billing.charged, true);
  assert.equal(result.receipt.providerRunId, "req_stream_1");
  assert.deepEqual(
    progress.filter((p) => p.phase === "streaming").map((p) => p.delta),
    deltas,
  );
  assert.equal(fetcher.calls.length, 1);
  assert.match(fetcher.calls[0].url, /\/v1\/chat\/stream$/);
});

test("text.generate 流式：读到 [DONE] 后继续等计费帧，不在 [DONE] 就 break", async () => {
  const charge = JSON.stringify({
    oceanleo_charge: {
      tokens: 4,
      price_cny: 0,
      model: "qwen-max",
      key_mode: "byok",
      request_id: "req_after_done",
      balance_yuan: 1,
    },
  });
  const fetcher = gatewayFetcher([
    [
      "/v1/chat/stream",
      () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"x"}}]}\n\n',
          "data: [DONE]\n\n",
          `data: ${charge}\n\n`,
        ]),
    ],
  ]);

  const transport = createGatewayAiTransport({ fetcher });
  const client = createPluginAiClient(transport);
  const result = await client.run({
    capability: "text.generate",
    input: { prompt: "测计费" },
  });

  assert.equal(result.output.text, "x");
  assert.equal(result.receipt.providerRunId, "req_after_done");
  assert.equal(result.receipt.billing.estimated, true);
});

test("text.generate 取消：AbortSignal 真断开底层请求", async () => {
  const fetcher = gatewayFetcher([
    [
      "/v1/chat/stream",
      () =>
        sseResponse(['data: {"choices":[{"delta":{"content":"a"}}]}\n\n'], {
          hang: true,
        }),
    ],
  ]);

  const transport = createGatewayAiTransport({ fetcher });
  const client = createPluginAiClient(transport);
  const controller = new AbortController();

  const running = client.run({
    capability: "text.generate",
    input: { prompt: "取消" },
    signal: controller.signal,
  });

  await tick();
  controller.abort();

  await assert.rejects(running, (error) => {
    assert.ok(isPluginAiError(error));
    assert.equal(error.disposition, "cancelled");
    return true;
  });

  assert.equal(fetcher.calls[0].init.signal.aborted, true);
});

test("text.generate 流式中途断开：已收部分保留且标记 incomplete", async () => {
  const fetcher = gatewayFetcher([
    [
      "/v1/chat/stream",
      () =>
        brokenSseResponse([
          'data: {"choices":[{"delta":{"content":"已收到"}}]}\n\n',
        ]),
    ],
  ]);

  const transport = createGatewayAiTransport({ fetcher });
  const client = createPluginAiClient(transport);
  const result = await client.run({
    capability: "text.generate",
    input: { prompt: "断线" },
  });

  assert.equal(result.output.text, "已收到");
  assert.equal(result.output.incomplete, true);
  assert.equal(result.output.streamed, true);
});

test("text.generate 流式错误帧（HTTP 200）：当失败处理", async () => {
  const fetcher = gatewayFetcher([
    [
      "/v1/chat/stream",
      () =>
        sseResponse(
          [
            JSON.stringify({
              error: "内容不合规，已拦截。",
              blocked: true,
            }),
          ].map((f) => `data: ${f}\n\n`),
        ),
    ],
  ]);

  const transport = createGatewayAiTransport({ fetcher });
  const client = createPluginAiClient(transport);
  await assert.rejects(
    client.run({
      capability: "text.generate",
      input: { prompt: "违规" },
    }),
    (error) => {
      assert.ok(error instanceof PluginAiError);
      assert.equal(error.disposition, "failed");
      assert.match(error.message, /内容不合规/);
      return true;
    },
  );
});

test("text.generate 网关不支持流式（404）：回落非流式并告知用户", async () => {
  const fetcher = gatewayFetcher([
    ["/v1/chat/stream", () => sseResponse([], { status: 404 })],
    [
      "/v1/chat",
      () =>
        jsonResponse({
          text: "整段结果",
          model: "qwen-max",
          charge: { price_cny: 0.02, key_mode: "platform" },
        }),
    ],
  ]);

  const messages = [];
  const transport = createGatewayAiTransport({ fetcher });
  const client = createPluginAiClient(transport);
  const result = await client.run({
    capability: "text.generate",
    input: { prompt: "回落" },
    onProgress: (p) => {
      if (p.message) messages.push(p.message);
    },
  });

  assert.equal(result.output.text, "整段结果");
  assert.equal(result.output.streamed, false);
  assert.ok(messages.some((m) => m.includes("不支持流式")));
  assert.equal(fetcher.calls.length, 2);
  assert.match(fetcher.calls[0].url, /\/v1\/chat\/stream$/);
  assert.match(fetcher.calls[1].url, /\/v1\/chat$/);
});

test("text.generate streaming:false 直接走非流式，不发 /stream", async () => {
  const fetcher = gatewayFetcher([
    ["/v1/chat", () => jsonResponse({ text: "关闭流式" })],
  ]);

  const transport = createGatewayAiTransport({ fetcher, streaming: false });
  const client = createPluginAiClient(transport);
  const result = await client.run({
    capability: "text.generate",
    input: { prompt: "非流式" },
  });

  assert.equal(result.output.text, "关闭流式");
  assert.equal(result.output.streamed, false);
  assert.equal(fetcher.calls.length, 1);
  assert.match(fetcher.calls[0].url, /\/v1\/chat$/);
  assert.doesNotMatch(fetcher.calls[0].url, /\/stream$/);
});

// ── 宿主传输（非流式回落 + 告知）────────────────────────────────────────────

test("宿主 text.generate：streamed 为 false 并告知不支持流式", async () => {
  const messages = [];
  const transport = createHostFetchJsonAiTransport(async () => ({
    text: "宿主整段",
  }));
  const client = createPluginAiClient(transport);
  const result = await client.run({
    capability: "text.generate",
    input: { prompt: "宿主" },
    onProgress: (p) => {
      if (p.message) messages.push(p.message);
    },
  });

  assert.equal(result.output.text, "宿主整段");
  assert.equal(result.output.streamed, false);
  assert.ok(messages.some((m) => m.includes("宿主通道不支持流式")));
});

// ── 反面验证：正确实现下这些断言必须绿；摘掉对应机制后会红 ────────────────

test("反面验证 · 跨 chunk 半行：sse-parser 有专项测试（摘缓冲会红）", async () => {
  const { createSseParser } = await import(
    await compileModule("src/lib/sse.ts")
  );
  const parser = createSseParser();
  assert.deepEqual(parser.push('data: {"a'), []);
  assert.deepEqual(parser.push('":1}\n\n'), [
    { event: "message", data: '{"a":1}' },
  ]);
});

test("反面验证 · 取消必须传到 fetch signal（只丢结果不算取消）", async () => {
  const fetcher = gatewayFetcher([
    [
      "/v1/chat/stream",
      () =>
        sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n'], {
          hang: true,
        }),
    ],
  ]);
  const transport = createGatewayAiTransport({ fetcher });
  const client = createPluginAiClient(transport);
  const controller = new AbortController();
  const running = client.run({
    capability: "text.generate",
    input: { prompt: "abort" },
    signal: controller.signal,
  });
  await tick();
  controller.abort();
  await assert.rejects(running);
  assert.equal(
    fetcher.calls[0].init.signal.aborted,
    true,
    "若取消只丢弃结果而不 abort 请求，此断言会红",
  );
});

test("反面验证 · 断线后不许清空已收部分", async () => {
  const fetcher = gatewayFetcher([
    [
      "/v1/chat/stream",
      () =>
        brokenSseResponse([
          'data: {"choices":[{"delta":{"content":"留着"}}]}\n\n',
        ]),
    ],
  ]);
  const transport = createGatewayAiTransport({ fetcher });
  const client = createPluginAiClient(transport);
  const result = await client.run({
    capability: "text.generate",
    input: { prompt: "partial" },
  });
  assert.equal(result.output.text, "留着", "若断线清空 partial，此断言会红");
  assert.equal(result.output.incomplete, true);
});
