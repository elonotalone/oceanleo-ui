// 插件 AI 契约（`src/shell/plugin-ai/`）的自测。
//
// 这一层存在的理由是「六套互不知情的 AI 通道」收敛成一条：调用方只说要哪条能力，
// 落到哪个宿主由 transport 决定。所以这份文件守的不是某个函数怎么写，而是四件
// 换了实现也不许变的事——**没接就说没接**（fail closed，绝不伪造成功）、
// **停得下来**（signal 一断就是 cancelled）、**说得出跑到哪**（进度不回退）、
// **发出去的东西站点适配器认得**（逻辑 URL + 请求信封）。
//
// 全程不发真请求：网关传输注入假 fetcher，宿主传输注入假 fetchJson，
// `accessToken` / `GATEWAY_BASE` 在编译台上换成桩。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const {
  AI_CAPABILITIES,
  PLUGIN_AI_LOGICAL_URLS,
  PLUGIN_AI_REQUEST_SCHEMA,
  PluginAiError,
  createGatewayAiTransport,
  createHostFetchJsonAiTransport,
  createPluginAiClient,
  createUnavailableAiTransport,
  isPluginAiError,
} = await import(
  await compileModule("src/shell/plugin-ai/index.ts", {
    "../../lib/auth/client": dataModule(
      `export async function accessToken() { return globalThis.__pluginAiToken ?? null; }`,
    ),
    "../../lib/auth/config": dataModule(
      `export const GATEWAY_BASE = "https://gateway.invalid";`,
    ),
  })
);

/** 阶段词表的规范顺序（types.ts 的 AiProgressPhase 联合顺序），用来判「有没有倒退」。 */
const PHASE_ORDER = [
  "validating",
  "uploading",
  "queued",
  "processing",
  "streaming",
  "finalizing",
  "complete",
  "cancelling",
];

/** 任何一次真请求都是测试自己的失败，不是被测代码的失败——所以直接炸。 */
function forbiddenFetch() {
  return async () => {
    throw new Error("契约测试不许发真请求");
  };
}

function recordingFetch() {
  const calls = [];
  return {
    calls,
    fn: async (...args) => {
      calls.push(args);
      throw new Error("契约测试不许发真请求");
    },
  };
}

/** 宿主的 host.fetchJson 替身：记下收到的 URL 与 init，回一份预设负载。 */
function recordingFetchJson(response) {
  const calls = [];
  return {
    calls,
    fn: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(String(init?.body ?? "null")) });
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 只实现契约要求的那几样的假传输，用来单独盯客户端那一层的行为。 */
function fakeTransport(overrides = {}) {
  return {
    id: "fake",
    availability: () => ({ enabled: true }),
    async execute() {
      return { output: { text: "好了" } };
    },
    ...overrides,
  };
}

// ============================================================================
// 1. availability：这条能力今天到底能不能用
// ============================================================================

test("网关传输如实说自己没有 code.patch，其余能力都开着", () => {
  const transport = createGatewayAiTransport({ fetcher: forbiddenFetch() });
  const closed = AI_CAPABILITIES.filter(
    (capability) => !transport.availability(capability).enabled,
  );
  // 网关确实没有部署这条路由。多关一条是把能用的能力误伤成灰按钮，
  // 少关一条是让用户点下去等一个 404——两种都不许。
  assert.deepEqual(closed, ["code.patch"]);
  const { reason } = transport.availability("code.patch");
  assert.match(reason, /code\.patch/);
  assert.match(
    reason,
    /[\u4e00-\u9fff]/,
    "不可用的原因要原样显示给用户，必须是中文",
  );
});

test("网关没有的能力，客户端在发请求之前就拦下来", async () => {
  const fetcher = recordingFetch();
  const client = createPluginAiClient(
    createGatewayAiTransport({ fetcher: fetcher.fn }),
  );
  await assert.rejects(
    client.run({ capability: "code.patch", input: { instruction: "改一行" } }),
    (error) => {
      assert.ok(isPluginAiError(error));
      assert.equal(error.disposition, "unavailable");
      assert.match(error.message, /code\.patch/);
      return true;
    },
  );
  // 明知没有这条路由还发一趟，用户等的那几秒和可能被扣的钱都是白花的。
  assert.equal(fetcher.calls.length, 0);
});

test("宿主传输默认全开；宿主只路由了几条时，其余如实报不可用并点名逻辑 URL", () => {
  const full = createHostFetchJsonAiTransport(async () => ({}));
  assert.deepEqual(
    AI_CAPABILITIES.filter(
      (capability) => !full.availability(capability).enabled,
    ),
    [],
  );

  const partial = createHostFetchJsonAiTransport(async () => ({}), {
    capabilities: ["text.generate", "image.generate"],
  });
  assert.deepEqual(
    AI_CAPABILITIES.filter(
      (capability) => partial.availability(capability).enabled,
    ),
    ["text.generate", "image.generate"],
  );
  // 只说「不行」不说「差什么」，站点适配器那边没法照着补一条路由。
  const { reason } = partial.availability("video.generate");
  assert.match(reason, /video\.generate/);
  assert.ok(reason.includes(PLUGIN_AI_LOGICAL_URLS["video.generate"]));
});

test("宿主连 fetchJson 都没给时，退化成一条全不可用的通道而不是崩掉", () => {
  for (const nothing of [null, undefined, {}]) {
    const transport = createHostFetchJsonAiTransport(nothing);
    for (const capability of AI_CAPABILITIES) {
      const { enabled, reason } = transport.availability(capability);
      assert.equal(enabled, false);
      assert.match(reason, /host\.fetchJson/);
    }
  }
});

test("不可用传输对每条能力都不可用，并点名缺的是哪一样宿主能力", () => {
  const transport = createUnavailableAiTransport("宿主没有注入 host.fetchJson");
  for (const capability of AI_CAPABILITIES) {
    const { enabled, reason } = transport.availability(capability);
    assert.equal(enabled, false, `${capability} 竟然被报成可用`);
    assert.match(reason, /AI 能力不可用/);
    assert.match(reason, /host\.fetchJson/);
  }
});

test("不认识的能力名在客户端这一层就答不可用，不会捅到传输层", () => {
  const client = createPluginAiClient(
    fakeTransport({
      availability: () => assert.fail("越界能力不该问到传输层"),
    }),
  );
  const { enabled, reason } = client.availability("image.beautify");
  assert.equal(enabled, false);
  assert.match(reason, /image\.beautify/);
});

// ============================================================================
// 2. fail closed：没接就说没接
// ============================================================================

test("没有任何 AI 通道时 run() 明确失败，绝不返回伪造成功", async () => {
  const client = createPluginAiClient(
    createUnavailableAiTransport("宿主没有注入 host.fetchJson，也没有网关凭据"),
  );
  let leaked = null;
  const running = client
    .run({ capability: "image.generate", input: { prompt: "一只猫" } })
    .then((value) => {
      leaked = value;
    });
  await assert.rejects(running, (error) => {
    assert.ok(error instanceof PluginAiError);
    assert.equal(error.disposition, "unavailable");
    // 旧实现在这里给过占位图和空数组，用户以为图生成好了、保存完才发现什么都没有。
    assert.match(error.message, /AI 能力不可用/);
    assert.match(error.message, /host\.fetchJson/);
    assert.match(error.message, /这次请求没有发出/);
    assert.equal(
      error.retryable,
      false,
      "没接的通道重试多少次都一样，不该给重试按钮",
    );
    return true;
  });
  assert.equal(leaked, null);
});

test("传输报不可用时，execute 一次都不会被调用", async () => {
  let executed = 0;
  const client = createPluginAiClient(
    fakeTransport({
      availability: () => ({ enabled: false, reason: "这台宿主没接视频生成。" }),
      async execute() {
        executed += 1;
        return { output: { videos: [] } };
      },
    }),
  );
  await assert.rejects(
    client.run({ capability: "video.generate", input: { prompt: "海浪" } }),
    (error) => {
      assert.equal(error.disposition, "unavailable");
      assert.match(error.message, /这台宿主没接视频生成/);
      return true;
    },
  );
  assert.equal(executed, 0);
});

// ============================================================================
// 3. 取消：点了停止就得真停下
// ============================================================================

test("飞行中 abort 之后这次运行判为 cancelled，且结算后不再回调进度", async () => {
  const gate = deferred();
  const phases = [];
  let captured = null;
  const client = createPluginAiClient(
    fakeTransport({
      async execute(_capability, _input, context) {
        captured = context;
        context.onProgress({ phase: "processing", progress: 0.4 });
        await gate.promise;
        return { output: { text: "迟到的结果" } };
      },
    }),
  );
  const controller = new AbortController();
  const running = client.run({
    capability: "text.generate",
    input: { prompt: "写一段" },
    signal: controller.signal,
    onProgress: (progress) => phases.push(progress.phase),
  });
  await tick();
  controller.abort();
  gate.resolve();

  await assert.rejects(running, (error) => {
    // 取名以 types.ts 的 AiDisposition 为准：是 cancelled，不是 canceled。
    assert.ok(error instanceof PluginAiError);
    assert.equal(error.disposition, "cancelled");
    return true;
  });
  assert.deepEqual(phases, ["validating", "processing", "cancelling"]);

  // 结算之后上游还在报进度是常态（撤单只是尽力而为）。那些回调不许再打到插件身上：
  // 一次已经结束的运行还在推进度条，界面就永远转不完。
  captured.onProgress({ phase: "complete", progress: 1 });
  assert.deepEqual(phases, ["validating", "processing", "cancelling"]);
});

test("signal 进来就已经 abort 的，一趟网络都不走", async () => {
  let executed = 0;
  const client = createPluginAiClient(
    fakeTransport({
      async execute() {
        executed += 1;
        return { output: { text: "不该跑到这里" } };
      },
    }),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.run({
      capability: "text.generate",
      input: { prompt: "写一段" },
      signal: controller.signal,
    }),
    (error) => {
      assert.equal(error.disposition, "cancelled");
      return true;
    },
  );
  assert.equal(executed, 0, "已经取消了还发出去，只会白扣一次钱");
});

test("取消会尽力通知上游撤单；撤单本身失败不改变取消这个结论", async () => {
  const gate = deferred();
  const cancels = [];
  const client = createPluginAiClient(
    fakeTransport({
      async execute() {
        await gate.promise;
        return { output: { text: "迟到的结果" } };
      },
      async cancel(runId, providerRunId) {
        cancels.push([runId, providerRunId]);
        throw new Error("上游撤单接口也挂了");
      },
    }),
    { makeId: (prefix) => `${prefix}_1` },
  );
  const controller = new AbortController();
  const running = client.run({
    capability: "text.generate",
    input: { prompt: "写一段" },
    signal: controller.signal,
  });
  await tick();
  controller.abort();
  gate.resolve();

  await assert.rejects(running, (error) => {
    assert.equal(error.disposition, "cancelled");
    return true;
  });
  assert.equal(cancels.length, 1);
  assert.equal(
    cancels[0][0],
    "ai_run_1",
    "撤单要能对上这次运行，否则上游不知道该撤谁",
  );
});

test("上游在取消之后才把结果送回来，这次运行仍然是取消", async () => {
  const gate = deferred();
  let leaked = null;
  const client = createPluginAiClient(
    fakeTransport({
      async execute() {
        await gate.promise;
        return { output: { text: "取消之后才回来的正文" } };
      },
    }),
  );
  const controller = new AbortController();
  const running = client
    .run({
      capability: "text.generate",
      input: { prompt: "写一段" },
      signal: controller.signal,
    })
    .then((value) => {
      leaked = value;
    });
  await tick();
  controller.abort();
  gate.resolve();
  await assert.rejects(running, (error) => {
    assert.equal(error.disposition, "cancelled");
    return true;
  });
  // 用户按了停止，界面就不该再把这份内容落到文档里。
  assert.equal(leaked, null);
});

// ============================================================================
// 4. 进度：说得出跑到哪一步
// ============================================================================

test("上游把进度报回退了，插件收到的仍然单调不减", async () => {
  const seen = [];
  const client = createPluginAiClient(
    fakeTransport({
      async execute(_capability, _input, context) {
        context.onProgress({ phase: "processing", progress: 0.8 });
        context.onProgress({ phase: "processing", progress: 0.3 });
        context.onProgress({ phase: "finalizing", progress: 5 });
        context.onProgress({ phase: "finalizing", progress: Number.NaN });
        return { output: { text: "好了" } };
      },
    }),
  );
  await client.run({
    capability: "text.generate",
    input: { prompt: "写一段" },
    onProgress: (progress) => seen.push(progress.progress),
  });
  assert.ok(seen.length >= 1, "一次进度都不报，界面只能挂一个不动的转圈");
  for (const value of seen) {
    assert.ok(value >= 0 && value <= 1, `进度 ${value} 越界了，进度条画不出来`);
  }
  for (let index = 1; index < seen.length; index += 1) {
    assert.ok(
      seen[index] >= seen[index - 1],
      `进度从 ${seen[index - 1]} 退回了 ${seen[index]}`,
    );
  }
  assert.equal(seen.at(-1), 1, "跑完了进度条还停在半路");
});

test("宿主通道跑一趟真流程，阶段按词表顺序前进不倒退", async () => {
  const seen = [];
  const fetchJson = recordingFetchJson({ text: "改好了" });
  const client = createPluginAiClient(
    createHostFetchJsonAiTransport(fetchJson.fn),
  );
  await client.run({
    capability: "text.rewrite",
    input: { text: "原文", action: "polish" },
    onProgress: (progress) => seen.push(progress.phase),
  });
  assert.ok(seen.length >= 1);
  const ranks = seen.map((phase) => {
    const rank = PHASE_ORDER.indexOf(phase);
    assert.notEqual(rank, -1, `${phase} 不在 AiProgressPhase 词表里`);
    return rank;
  });
  for (let index = 1; index < ranks.length; index += 1) {
    assert.ok(
      ranks[index] >= ranks[index - 1],
      `阶段从 ${seen[index - 1]} 退回了 ${seen[index]}`,
    );
  }
  assert.equal(seen.at(-1), "complete");
});

test("插件的进度回调自己抛错，不许把这次生成的结果一起带走", async () => {
  const client = createPluginAiClient(
    fakeTransport({
      async execute(_capability, _input, context) {
        context.onProgress({ phase: "processing", progress: 0.5 });
        return { output: { text: "结果还在" } };
      },
    }),
  );
  const result = await client.run({
    capability: "text.generate",
    input: { prompt: "写一段" },
    onProgress: () => {
      throw new Error("插件自己 setState 写错了");
    },
  });
  assert.equal(result.output.text, "结果还在");
});

// ============================================================================
// 5. 宿主通道：发出去的 URL 与请求体，站点适配器认得
// ============================================================================

test("逻辑 URL 表覆盖每条能力且互不重复", () => {
  assert.deepEqual(
    Object.keys(PLUGIN_AI_LOGICAL_URLS).sort(),
    [...AI_CAPABILITIES].sort(),
  );
  const urls = Object.values(PLUGIN_AI_LOGICAL_URLS);
  // 两条能力共用一个 URL，站点适配器就分不出这次要它做哪件事。
  assert.equal(new Set(urls).size, urls.length);
});

test("每条能力落到自己那条逻辑 URL，请求体是本契约的信封", async () => {
  const cases = [
    {
      capability: "text.generate",
      input: { prompt: "写一段开场白", maxTokens: 100 },
      response: { text: "很久很久以前" },
    },
    {
      capability: "image.generate",
      input: { prompt: "一只猫", ratio: "1:1" },
      response: { images: [{ url: "https://cdn.invalid/cat.png" }] },
    },
    {
      capability: "code.patch",
      input: { instruction: "把跳跃改高一点" },
      response: {
        summary: "改了跳跃高度",
        files: [{ path: "game.js", content: "1" }],
      },
    },
  ];

  for (const item of cases) {
    const fetchJson = recordingFetchJson(item.response);
    const client = createPluginAiClient(
      createHostFetchJsonAiTransport(fetchJson.fn),
      { siteId: "word", makeId: (prefix) => `${prefix}_1` },
    );
    await client.run({ capability: item.capability, input: item.input });

    assert.equal(fetchJson.calls.length, 1);
    const call = fetchJson.calls[0];
    assert.equal(call.url, PLUGIN_AI_LOGICAL_URLS[item.capability]);
    assert.equal(call.init.method, "POST");
    // schema 是站点适配器判断「该按哪一版解包」的唯一依据，丢了它旧站点会静默解错。
    assert.equal(call.body.schema, PLUGIN_AI_REQUEST_SCHEMA);
    assert.equal(call.body.capability, item.capability);
    assert.equal(call.body.siteId, "word");
    assert.equal(call.body.requestId, "ai_req_1");
    assert.equal(call.body.runId, "ai_run_1");
    assert.deepEqual(call.body.input, item.input);
    assert.ok(call.init.signal, "没把取消通道递到宿主，插件就停不下这一趟");
  }
});

test("站点还在路由旧 URL 时，urls 覆盖单条能力即可迁移", async () => {
  const fetchJson = recordingFetchJson({ text: "改好了" });
  const client = createPluginAiClient(
    createHostFetchJsonAiTransport(fetchJson.fn, {
      urls: { "text.rewrite": "design://ai/chat" },
    }),
  );
  await client.run({
    capability: "text.rewrite",
    input: { text: "原文", action: "polish" },
  });
  assert.equal(fetchJson.calls[0].url, "design://ai/chat");
});

test("只有内存像素的底图，宿主 JSON 通道如实报不可用而不是静默丢图", async () => {
  const fetchJson = recordingFetchJson({ images: [] });
  const client = createPluginAiClient(
    createHostFetchJsonAiTransport(fetchJson.fn),
  );
  await assert.rejects(
    client.run({
      capability: "image.edit",
      input: {
        source: { blob: new Blob(["假装是像素"]) },
        prompt: "把背景换成海边",
      },
    }),
    (error) => {
      assert.equal(error.disposition, "unavailable");
      assert.match(error.message, /底图/);
      return true;
    },
  );
  assert.equal(fetchJson.calls.length, 0, "塞不进去的东西还是发了一趟");
});

// ============================================================================
// 6. 回执：谁跑的、花了多少、出事找哪条记录
// ============================================================================

test("回执把上游的 provider / model / 计费原样带出来", async () => {
  const billing = {
    charged: true,
    amount: 12,
    currency: "OCEANLEO_CREDITS",
    estimated: false,
    quoteId: "quote-9",
  };
  const client = createPluginAiClient(
    fakeTransport({
      async execute() {
        return {
          output: { text: "好了" },
          provider: "bailian",
          model: "qwen-max",
          providerRunId: "job-7",
          billing,
        };
      },
    }),
    { makeId: (prefix) => `${prefix}_1`, now: () => "2026-08-30T00:00:00.000Z" },
  );
  const { receipt } = await client.run({
    capability: "text.generate",
    input: { prompt: "写一段" },
  });
  assert.equal(receipt.provider, "bailian");
  assert.equal(receipt.model, "qwen-max");
  // 上游自己的 job id 是人工排查时唯一的对账口，丢了就查无此单。
  assert.equal(receipt.providerRunId, "job-7");
  assert.deepEqual(receipt.billing, billing);
  assert.equal(receipt.runId, "ai_run_1");
  assert.equal(receipt.startedAt, "2026-08-30T00:00:00.000Z");
  assert.equal(receipt.completedAt, "2026-08-30T00:00:00.000Z");
});

test("上游不说计费时金额写「不知道」，不拿 0 冒充免费", async () => {
  const fetchJson = recordingFetchJson({
    text: "改好了",
    receipt: { provider: "站点适配器", model: "site-default" },
  });
  const client = createPluginAiClient(
    createHostFetchJsonAiTransport(fetchJson.fn),
  );
  const { receipt } = await client.run({
    capability: "text.rewrite",
    input: { text: "原文", action: "polish" },
  });
  assert.equal(receipt.provider, "站点适配器");
  assert.equal(receipt.model, "site-default");
  // 0 会被界面显示成「本次免费」，而真相是「不知道扣没扣」。
  assert.equal(receipt.billing.amount, null);
  assert.equal(receipt.billing.estimated, true);
  assert.equal(receipt.billing.charged, false);
});

test("上游连自己是谁都没说时，回执退回通道自述而不是留空", async () => {
  const fetchJson = recordingFetchJson({ text: "改好了" });
  const client = createPluginAiClient(
    createHostFetchJsonAiTransport(fetchJson.fn),
    { model: "默认模型" },
  );
  const { receipt } = await client.run({
    capability: "text.rewrite",
    input: { text: "原文", action: "polish" },
  });
  assert.equal(receipt.provider, "host-fetch-json");
  assert.equal(receipt.model, "默认模型");
  assert.ok(receipt.runId, "没有 runId 就没法把进度、取消、日志串成一次运行");
});
