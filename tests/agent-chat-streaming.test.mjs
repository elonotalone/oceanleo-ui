// agent 对话的流式接线（W21 P2/P3/P5）。
//
// 锁四组东西：
//   1. **首字节到达就渲染**——第一个 delta 必须在流还开着的时候就交给界面，
//      而不是等整段收完；且读到 `[DONE]` **不许收手**（计费帧在它之后才发）。
//   2. **停止键真的掐断上游**——传给 fetch 的 signal 被 abort，不是拿到结果再丢掉；
//      已经收到的半截正文留在原地（用户多半正在读它），且取消不算错误。
//   3. **流不可用时回落轮询并告知**——四种坏法各自有可分辨的 reason，
//      其中「HTTP 200 但是错误帧」是最容易被当成成功的那一种。
//   4. **粘底三条语义**——在底部才跟随，往上翻就交出控制权。
//
// 另外守一条**本份活真出过的事故**：四棒把 `consumeAgentStream` 与
// `agentStreamEndpoint` 都写完了，却被打断在最后一步——`messageForBubble` 有定义
// 没有调用点、`streamNotice` 有 setter 没有渲染点。两个纯函数各自都是对的，
// 接线断了，于是「首字节即渲染」和「回落告知」双双不生效，而 typecheck 与既有
// 测试全绿。所以本文件末尾那组断言钉的是**消费点存在**，不是实现细节。
//
// 解析器一律用 W20 的 `src/lib/sse.ts`（全仓只有那一份），本文件不重写第二个。
// 假 fetch 走的是 `sse-contract@1` §2.2 明写的测试缝 `fetchImpl`。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

// 任意具名导入都拿得到一个无副作用的空函数——用于流式链路之外的第三方包。
const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

// 只桩「要联网 / 要 Next 运行时 / 要浏览器才跑得起来」的那几个，其余编真源码。
// `../lib/sse` **绝不桩**：这份测试的全部意义就是证明真的解析器接对了。
const OVERRIDES = {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
  ),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "./CloudBrowserPanel": dataModule(
    "export function CloudBrowserPanel(){ return null; }",
  ),
  "./ResultCanvas": dataModule(
    "export function ResultCanvas(){ return null; }\nexport function CanvasEmpty(){ return null; }\nexport function CanvasSubTabs(){ return null; }",
  ),
  "./ArtifactRenderer": dataModule(
    "export function ArtifactRenderer(){ return null; }\nexport function artifactToLibraryItem(){ return {}; }",
  ),
  "./MaterialLibrary": dataModule(
    "export function MaterialLibrary(){ return null; }",
  ),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
      return createElement("textarea", {
        placeholder: props.placeholder,
        defaultValue: props.value || "",
        readOnly: true,
      });
    });
    export const TemplateFillArea = PromptHighlightArea;
    export function templateSegments(){ return []; }
    export function highlightSegments(){ return []; }
    export function stripPromptPlaceholders(text){ return text; }
  `),
};

const {
  consumeAgentStream,
  streamedBubbleContent,
  isNearBottom,
  nextPollCadence,
  resolveTaskStatus,
} = await import(
  await compileModule("src/shell/AgentChat.tsx", OVERRIDES, {
    missingPackageStub: lazyStub,
  })
);

const source = await readFile(
  new URL("../src/shell/AgentChat.tsx", import.meta.url),
  "utf8",
);

// 改成自适应之前的轮询节奏：首轮 120ms，其后固定 450ms
// （`359739e` 的 `setTimeout(poll, 450)`）。轮询节奏的两组判据都拿它当基准线。
const LEGACY_FIRST_MS = 120;
const LEGACY_INTERVAL_MS = 450;
const FIRST_BYTE_WINDOW_MS = 2000;

// ---------------------------------------------------------------------------
// 线格式（`signals/W20-request.md` §1.1 的四种载荷，逐字照抄后端的形状）
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/** 正文增量。provider 原样透传的 OpenAI 形状。 */
function delta(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

/** 只带 finish_reason 的收尾帧：`content` 是空串，那不是内容。 */
function finishOnly() {
  return `data: ${JSON.stringify({
    choices: [{ delta: {}, finish_reason: "stop" }],
  })}\n\n`;
}

/** provider 侧的结束标记——**不是**整条流的终点。 */
const DONE = "data: [DONE]\n\n";

/** 整条流真正的最后一帧：计费回执。读到 `[DONE]` 就 break 会把它吞掉。 */
const CHARGE = `data: ${JSON.stringify({
  oceanleo_charge: {
    tokens: 128,
    price_cny: 0.0031,
    model: "qwen-max",
    key_mode: "platform",
    request_id: "req-w21",
    balance_yuan: 9.87,
  },
})}\n\n`;

/** 错误帧。**HTTP 状态码仍然是 200**，这是本契约最容易踩的一处。 */
function errorFrame(message) {
  return `data: ${JSON.stringify({
    error: message,
    blocked: true,
    content_safety: { label: "sensitive" },
  })}\n\n`;
}

/**
 * 一条假 SSE 响应 + 配套的假 fetch。
 *
 * `parts` 里的元素是字符串，或一个 `async () => 字符串` 的闸门——闸门用来把流
 * **停在中间**，好在流还开着的时候断言界面已经拿到字了。这是「首字节即渲染」
 * 唯一诚实的验法：等流收完再看，什么实现都能过。
 */
function sseSource(parts, options = {}) {
  const {
    status = 200,
    contentType = "text/event-stream",
    withBody = true,
    errorBody = "网关拒绝了这次请求",
  } = options;

  const state = {
    /** 流被读到自然结束（= 读过了最后一帧）。 */
    closed: false,
    /** 交出去的分片数。 */
    delivered: 0,
    /** 传给 fetch 的那个 signal，用来验取消是否真的到了网络层。 */
    signal: null,
    calls: 0,
    requestInit: null,
  };

  let cursor = 0;
  const body = withBody
    ? new ReadableStream({
        async pull(controller) {
          if (cursor >= parts.length) {
            state.closed = true;
            controller.close();
            return;
          }
          const part = parts[cursor++];
          const text = typeof part === "function" ? await part() : part;
          state.delivered += 1;
          controller.enqueue(encoder.encode(text));
        },
      })
    : null;

  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        String(name).toLowerCase() === "content-type" ? contentType : null,
    },
    body,
    text: async () => errorBody,
  };

  const fetchImpl = async (url, init) => {
    state.calls += 1;
    state.requestInit = init;
    state.signal = init?.signal ?? null;
    return response;
  };

  return { fetchImpl, state };
}

async function waitUntil(predicate, label, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error(`等超时：${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// ===========================================================================
// 1. 首字节即渲染
// ===========================================================================

test("第一个 delta 在流还开着的时候就进了界面，不是等整段收完", async () => {
  let openGate;
  const gate = new Promise((resolve) => {
    openGate = resolve;
  });
  const seen = [];

  const { fetchImpl, state } = sseSource([
    delta("先"),
    async () => {
      await gate;
      return delta("说一句");
    },
    DONE,
    CHARGE,
  ]);

  const run = consumeAgentStream(
    { url: "/v1/agent/stream", body: { task_id: "t1" }, fetchImpl },
    (full) => seen.push(full),
  );

  // 关键的一刻：流被闸门停在第二片，此时界面必须已经有第一个字了。
  await waitUntil(() => seen.length >= 1, "首字节交给 onText");
  assert.equal(seen[0], "先", "首字节到了却没把它交出去");
  assert.equal(
    state.closed,
    false,
    "断言发生在流已经结束之后 —— 那就证明不了「首字节即渲染」，这条测试本身失效了",
  );

  openGate();
  const outcome = await run;

  assert.equal(outcome.kind, "complete");
  assert.equal(outcome.text, "先说一句", "增量必须是累加的，不是覆盖");
  assert.deepEqual(
    seen,
    ["先", "先说一句"],
    "每个 delta 都该触发一次渲染，且每次给的是到目前为止的全文",
  );
});

test("读到 [DONE] 不许收手：它之后还有计费帧，流要读到真正关闭", async () => {
  const seen = [];
  const { fetchImpl, state } = sseSource([delta("答案"), DONE, CHARGE]);

  const outcome = await consumeAgentStream(
    { url: "/v1/agent/stream", fetchImpl },
    (full) => seen.push(full),
  );

  assert.equal(outcome.kind, "complete");
  assert.equal(state.delivered, 3, "有分片没被读走 —— 十有八九是在 [DONE] 处 break 了");
  assert.equal(
    state.closed,
    true,
    "流没有被读到自然结束：计费回执就是这样被吞掉的",
  );
});

test("只带 finish_reason 的空 delta 不算内容，不触发多余的一次渲染", async () => {
  const seen = [];
  const { fetchImpl } = sseSource([delta("嗨"), finishOnly(), DONE]);

  const outcome = await consumeAgentStream(
    { url: "/v1/agent/stream", fetchImpl },
    (full) => seen.push(full),
  );

  assert.equal(outcome.kind, "complete");
  assert.equal(outcome.text, "嗨");
  assert.deepEqual(seen, ["嗨"], "空 delta 被当成了内容，界面白重渲一次");
});

test("跨分片被切断的一帧照样收得齐（半行缓冲是 W20 解析器的活，这里验它真接上了）", async () => {
  const whole = delta("跨片");
  const seen = [];
  const { fetchImpl } = sseSource([
    whole.slice(0, 12),
    whole.slice(12),
    DONE,
  ]);

  const outcome = await consumeAgentStream(
    { url: "/v1/agent/stream", fetchImpl },
    (full) => seen.push(full),
  );

  assert.equal(outcome.kind, "complete");
  assert.equal(outcome.text, "跨片", "半行没拼回来 —— 自己写解析器就会栽在这里");
});

// ===========================================================================
// 2. 停止键真的掐断
// ===========================================================================

test("停止：上游请求被 abort，已收到的半截留着，且取消不算错误", async () => {
  const controller = new AbortController();
  let openGate;
  const gate = new Promise((resolve) => {
    openGate = resolve;
  });
  const seen = [];

  const { fetchImpl, state } = sseSource([
    delta("我正在写"),
    async () => {
      await gate;
      return delta("后面还有很多");
    },
  ]);

  const run = consumeAgentStream(
    { url: "/v1/agent/stream", signal: controller.signal, fetchImpl },
    (full) => seen.push(full),
  );

  await waitUntil(() => seen.length >= 1, "停止之前先收到一点正文");
  controller.abort();
  const outcome = await run;

  assert.equal(outcome.kind, "stopped", "取消被当成了失败");
  assert.notEqual(
    outcome.kind,
    "unavailable",
    "用户自己按的停止不该走「流不可用」那条回落告知",
  );
  assert.equal(
    outcome.text,
    "我正在写",
    "已经收到的部分被清空了 —— 用户正在读的东西不许没收",
  );
  assert.equal(
    state.signal.aborted,
    true,
    "传给 fetch 的 signal 没被 abort：那是在前端丢弃结果，上游还在烧算力，等于没取消",
  );

  openGate();
});

test("停止之后服务端还说 running，界面也不许自己活过来", () => {
  // 服务端要过一会儿才把状态落成 stopped，这期间每一次拉取都会把状态写回
  // running。少了本地判定，停止键按下去就是「停了半秒它自己又动起来」。
  assert.equal(
    resolveTaskStatus({
      serverStatus: "running",
      taskId: "t1",
      stoppedTaskId: "t1",
    }),
    "stopped",
    "本地已按过停止，服务端的 running 不该被采信",
  );

  assert.equal(
    resolveTaskStatus({
      serverStatus: "done",
      taskId: "t1",
      stoppedTaskId: "t1",
    }),
    "done",
    "服务端已经落到终态，就该以它为准（本地判定只压 running 这一种）",
  );

  assert.equal(
    resolveTaskStatus({
      serverStatus: "running",
      taskId: "t2",
      stoppedTaskId: "t1",
    }),
    "running",
    "停的是上一个 task，不许把新 task 一起按停",
  );

  assert.equal(
    resolveTaskStatus({
      serverStatus: "running",
      taskId: "t1",
      stoppedTaskId: "",
    }),
    "running",
    "没按过停止就不许改动服务端状态",
  );
});

// ===========================================================================
// 3. 流不可用 → 回落轮询 + 告知
// ===========================================================================

test("HTTP 200 但是错误帧：必须当失败处理，且原文直接可显示", async () => {
  const seen = [];
  const { fetchImpl } = sseSource([
    delta("已经写了一半"),
    errorFrame("这段内容不合规，已停止生成。"),
  ]);

  const outcome = await consumeAgentStream(
    { url: "/v1/agent/stream", fetchImpl },
    (full) => seen.push(full),
  );

  assert.equal(
    outcome.kind,
    "unavailable",
    "流一开始 HTTP 状态码就改不了了，只看 response.ok 会把「被拦截」显示成成功",
  );
  assert.equal(outcome.reason, "frame");
  assert.equal(
    outcome.message,
    "这段内容不合规，已停止生成。",
    "后端给的已经是可直接显示的中文，不许再包一层「生成失败」",
  );
  assert.equal(
    outcome.text,
    "已经写了一半",
    "出错也要保留已收到的部分并标未完成，不许清空",
  );
});

test("四种开不起来的坏法各自有可分辨的 reason（调用方按 reason 分支，不做正则）", async () => {
  const http = await consumeAgentStream(
    { url: "/x", fetchImpl: sseSource([], { status: 500 }).fetchImpl },
    () => {},
  );
  assert.equal(http.kind, "unavailable");
  assert.equal(http.reason, "http");
  assert.equal(http.message, "网关拒绝了这次请求", "响应体里的原因该带出来");

  const wrongType = await consumeAgentStream(
    {
      url: "/x",
      fetchImpl: sseSource([], { contentType: "application/json" }).fetchImpl,
    },
    () => {},
  );
  assert.equal(wrongType.reason, "not-event-stream");

  const noBody = await consumeAgentStream(
    { url: "/x", fetchImpl: sseSource([], { withBody: false }).fetchImpl },
    () => {},
  );
  assert.equal(noBody.reason, "no-body");

  const thrown = await consumeAgentStream(
    {
      url: "/x",
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    },
    () => {},
  );
  assert.equal(thrown.reason, "network");
  assert.equal(thrown.text, "", "一个字都没收到时不该编出正文来");
});

test("回落不是重试：轮询始终在旁边跑，所以只需要把话说清楚", () => {
  // 正文的真源一直是 GET /tasks/{id}，流只负责让它早一点出现。
  // 于是「流挂了」这件事对内容零影响，节奏策略照旧生效。
  assert.deepEqual(
    nextPollCadence({ hidden: false, changed: true, idleStep: 3, waitedMs: 9999 }),
    { delayMs: 200, idleStep: -1, waitedMs: 0 },
    "拿到新内容就该跟紧，并把空转档位和干等累计一起清零",
  );

  // 梯子要从**首字窗口之外**起步（窗口内不许退避，见下一条判据）。
  let step = -1;
  let waited = FIRST_BYTE_WINDOW_MS;
  const ladder = [];
  for (let i = 0; i < 6; i += 1) {
    const cadence = nextPollCadence({
      hidden: false,
      changed: false,
      idleStep: step,
      waitedMs: waited,
    });
    step = cadence.idleStep;
    waited = cadence.waitedMs;
    ladder.push(cadence.delayMs);
  }
  assert.deepEqual(
    ladder,
    [300, 500, 800, 1200, 1200, 1200],
    "没动静就该一档档退到上限并停在那儿，不许无限翻倍也不许一直 300",
  );

  assert.deepEqual(
    nextPollCadence({ hidden: true, changed: true, idleStep: 2, waitedMs: 700 }),
    { delayMs: 1000, idleStep: 2, waitedMs: 700 },
    "页面在后台就不发请求，哪怕上一轮正在出字；档位与干等累计要原样带回来",
  );
});

// ---------------------------------------------------------------------------
// 3b. 等首字的那几秒不许退避
// ---------------------------------------------------------------------------
// 这条判据钉的是**产品判据本身**，不是实现：操作员的原话是「点了发送，界面呆住
// 一秒多，然后整段文字啪一下出现」。退避档一旦从第一轮就开始爬，「呆住」这段
// 会被拉得比改成自适应之前的固定 450ms **更长**——量出来是均值 1217.0 → 1390.6ms、
// 最坏 2370 → 2920ms。所以首字窗口内的节奏必须锁住。

/** 把真的 nextPollCadence 推成一张时刻表。`seesNew(t)` 决定那一轮 changed。 */
function pollSchedule(seesNew, horizonMs) {
  const times = [];
  let t = LEGACY_FIRST_MS;
  let idleStep = -1;
  let waitedMs = 0;
  while (t <= horizonMs) {
    times.push(t);
    const c = nextPollCadence({
      hidden: false,
      changed: seesNew(t),
      idleStep,
      waitedMs,
    });
    idleStep = c.idleStep;
    waitedMs = c.waitedMs;
    t += c.delayMs;
  }
  return times;
}

function legacySchedule(horizonMs) {
  const times = [];
  for (let t = LEGACY_FIRST_MS; t <= horizonMs; t += LEGACY_INTERVAL_MS) {
    times.push(t);
  }
  return times;
}

const firstPollAtOrAfter = (times, t) =>
  times.find((x) => x >= t) ?? Number.POSITIVE_INFINITY;

test("等首字的那几秒不许退避：新时刻表是旧时刻表的超集，任何 T_write 都不会比改前慢", () => {
  const horizon = 12000;
  const sched = pollSchedule(() => false, horizon);

  // ① 窗口内每一步都是紧凑档，且空转档位不许被推上去——
  //    推上去的话窗口一到期就从梯子中段起步，等于偷偷退避。
  let waited = 0;
  let idleStep = -1;
  const insideWindow = [];
  while (waited < FIRST_BYTE_WINDOW_MS) {
    const c = nextPollCadence({
      hidden: false,
      changed: false,
      idleStep,
      waitedMs: waited,
    });
    insideWindow.push(c.delayMs);
    assert.equal(
      c.idleStep,
      -1,
      "还在等首字就把空转档位往上推了——窗口一到期会直接从梯子中段起步",
    );
    idleStep = c.idleStep;
    waited = c.waitedMs;
  }
  assert.ok(
    insideWindow.every((d) => d === insideWindow[0]),
    `首字窗口内的间隔必须恒定，实际拿到 ${JSON.stringify(insideWindow)}`,
  );
  assert.ok(
    insideWindow[0] < LEGACY_INTERVAL_MS,
    `首字窗口内的间隔 ${insideWindow[0]}ms 不比改之前的 ${LEGACY_INTERVAL_MS}ms 紧，那这次改动对「呆住」这条没有任何意义`,
  );

  // ② 结构判据：窗口内旧时刻表的每一个时刻，新时刻表都有。
  //    有了这条，「任何 T_write 都不会比改前慢」是结构上成立的，不是扫出来碰巧。
  for (const legacyTime of legacySchedule(FIRST_BYTE_WINDOW_MS)) {
    assert.ok(
      sched.includes(legacyTime),
      `旧时刻表在 ${legacyTime}ms 有一次轮询，新时刻表没有——` +
        `这个时刻附近的 T_write 会比改之前更晚看到首字。新表：${sched.slice(0, 12).join(",")}`,
    );
  }

  // ③ 逐点扫 T_write：一个点都不许比改之前慢，且均值与最坏都要真的变好。
  const legacy = legacySchedule(horizon);
  let sumLegacy = 0;
  let sumNext = 0;
  let points = 0;
  let worstLegacy = 0;
  let worstNext = 0;
  for (let tWrite = 0; tWrite <= FIRST_BYTE_WINDOW_MS; tWrite += 10) {
    const l = firstPollAtOrAfter(legacy, tWrite);
    const n = firstPollAtOrAfter(sched, tWrite);
    assert.ok(
      n <= l,
      `T_write=${tWrite}ms 时首字要等到 ${n}ms，改之前只要 ${l}ms——退避又爬进首字窗口了`,
    );
    sumLegacy += l;
    sumNext += n;
    worstLegacy = Math.max(worstLegacy, l);
    worstNext = Math.max(worstNext, n);
    points += 1;
  }
  assert.ok(
    sumNext / points < sumLegacy / points,
    `首字可见延迟均值没有变好：改前 ${(sumLegacy / points).toFixed(1)}ms，现在 ${(sumNext / points).toFixed(1)}ms`,
  );
  assert.ok(
    worstNext < worstLegacy,
    `首字可见延迟最坏值没有变好：改前 ${worstLegacy}ms，现在 ${worstNext}ms`,
  );

  // ④ 退避本身不许被这条判据顺手废掉：熬过窗口还是要退，空转要真的省下请求。
  const idle60 = pollSchedule(() => false, 60000).length;
  const legacy60 = legacySchedule(60000).length;
  assert.ok(
    idle60 < legacy60 * 0.7,
    `空转 60s 发了 ${idle60} 次请求，改之前是 ${legacy60} 次——退避没生效，紧凑档一路跑到底了`,
  );

  // ⑤ 出字期间仍是 200ms 稳态：首字这条不许把已经拿到的那半份好处退回去。
  const streaming = pollSchedule(() => true, 3000);
  assert.equal(
    streaming[2] - streaming[1],
    200,
    "上一轮拿到了新内容就该按出字节奏跟紧",
  );
});

// ===========================================================================
// 4. 尾条气泡显示哪份正文
// ===========================================================================

test("流比轮询早到就显示流的那份；轮询追上之后回到真源，正文不许缩回去", () => {
  assert.equal(
    streamedBubbleContent({
      content: "",
      streamText: "流先到的半句",
      isLastAssistant: true,
    }),
    "流先到的半句",
    "轮询还没取到正文时，流的内容就该显示出来 —— 这就是首字可见延迟省下来的地方",
  );

  assert.equal(
    streamedBubbleContent({
      content: "轮询取回来的完整一段回答",
      streamText: "流断在这",
      isLastAssistant: true,
    }),
    "轮询取回来的完整一段回答",
    "流断在半截时若还按流显示，用户已经读到的完整回答会当着他的面缩回去",
  );

  assert.equal(
    streamedBubbleContent({
      content: "历史消息",
      streamText: "很长很长的流内容",
      isLastAssistant: false,
    }),
    "历史消息",
    "只有尾部那条 assistant 消息才可能有流，不许污染历史",
  );

  assert.equal(
    streamedBubbleContent({
      content: "没接流时的正文",
      streamText: "",
      isLastAssistant: true,
    }),
    "没接流时的正文",
    "没传 agentStreamEndpoint 的 31 个站必须逐字不变",
  );
});

// ===========================================================================
// 5. 粘底三条语义
// ===========================================================================

test("粘底：在底部才跟随，往上翻就交出控制权", () => {
  assert.equal(
    isNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 }),
    true,
    "正贴着底部却判成没在底部",
  );

  assert.equal(
    isNearBottom({ scrollTop: 300, scrollHeight: 1000, clientHeight: 100 }),
    false,
    "用户往上翻了 600px 还判成在底部 —— 他会被硬拽回去",
  );

  // 阈值本身：80px 之内算「还在追最新」，之外算「在看历史」。
  assert.equal(
    isNearBottom({ scrollTop: 820, scrollHeight: 1000, clientHeight: 100 }),
    true,
    "离底 80px（阈值上）该算跟随",
  );
  assert.equal(
    isNearBottom({ scrollTop: 819, scrollHeight: 1000, clientHeight: 100 }),
    false,
    "离底 81px（阈值外）该停止跟随",
  );

  // 流式期间内容一直在变长。用户没动，就不该因为 scrollHeight 变大而被判离底。
  assert.equal(
    isNearBottom({ scrollTop: 1900, scrollHeight: 2000, clientHeight: 100 }),
    true,
    "内容长高了但用户仍在底部，跟随不该断",
  );
});

test("粘底的三条语义在组件里都有落点：跟随 / 浮标带未读 / 发言恢复跟随", () => {
  // 语义一：只有 following 才自动滚。
  assert.match(source, /if \(followingRef\.current\) \{\s*scrollToLatest/);
  // 语义二：不跟随时累计未读，并渲染「回到最新」浮标。
  assert.match(source, /if \(added > 0\) setUnread\(\(current\) => current \+ added\)/);
  assert.match(source, /tt\("回到最新 · \{count\} 条新消息", \{ count: unread \}\)/);
  // 语义三：点浮标或自己发言都回到跟随态。
  assert.match(source, /const resumeFollowing = useCallback\(/);
  assert.match(source, /const beginUserTurn = useCallback\(/);
  // 而且原来那个无条件拽底必须已经没了。
  assert.doesNotMatch(
    source,
    /useEffect\(\(\) => \{\s*scrollRef\.current\?\.scrollTo/,
    "无条件拽到底的老写法还在",
  );
});

// ===========================================================================
// 6. 接线的消费点（本份活真出过的事故：纯函数都对，没人调用）
// ===========================================================================

test("流的正文真的接进了气泡，回落告知真的渲染出来", () => {
  assert.match(
    source,
    /message=\{messageForBubble\(item\)\}/,
    "气泡还在直接吃 item.message —— 流收到的字进不了界面，首字节即渲染是空的",
  );
  assert.match(
    source,
    /streamedBubbleContent\(\{/,
    "messageForBubble 没走那条被测过的裁决",
  );
  assert.match(
    source,
    /\{streamNotice && \(/,
    "streamNotice 只有 setter 没有渲染点 —— 回落这件事用户看不到",
  );
  assert.match(
    source,
    /setStreamNotice\(tt\(/,
    "回落告知要走 tt()，不许硬编码中文",
  );
});

test("停止键把流一起掐掉，且解析器只用 W20 那一份", () => {
  assert.match(
    source,
    /streamAbortRef\.current\?\.abort\(\)/,
    "停止键没有 abort 那条流",
  );
  assert.match(
    source,
    /from "\.\.\/lib\/sse"/,
    "SSE 解析器必须 import W20 的 src/lib/sse.ts，本仓不许有第二份",
  );
  assert.doesNotMatch(
    source,
    /function createSseParser/,
    "AgentChat 自己写了一份 SSE 解析器",
  );
});
