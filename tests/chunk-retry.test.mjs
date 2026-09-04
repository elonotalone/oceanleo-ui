// ============================================================================
// W09 · chunk 退避重试的行为契约
// ----------------------------------------------------------------------------
// 这份测试锁的是操作员亲眼看到的那个故障的修法：
//
//     …Model3DRoute_tsx_….js:1
//     Failed to load resource: net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH
//
// 在 W09 之前，11 条编辑器路由都是裸的
// `dynamic(() => import(…), { ssr:false, loading: WorkbenchRouteLoading })`，
// chunk 一挂就是**永久 spinner**（全仓搜 `ChunkLoadError` 零命中）。
//
// 锁四件事，每一件都做过反面验证（把实现改回去当场红，见 verdicts/W09-delivery.md）：
//   ① 失败后指数退避重试三次，延迟带抖动（不是固定值，也不是 0）；
//   ② 每次重试都带 cache-busting 查询参数去探，且**同一毫秒内**两次重试的 token 也不同；
//   ③ 三次都失败 ⇒ 进失败态，且**渲染出来的不是 spinner**；
//   ④ chunk 404 ⇒ 走「版本已更新，请刷新」，并且**不白等三轮退避**。
//
// 不用 jsdom：`renderToStaticMarkup` 就够判「渲染出来的是失败态还是 spinner」，
// 而 `useSyncExternalStore` 在 SSR 下走 getServerSnapshot，行为与客户端一致。
// ============================================================================

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule } from "./helpers/module-bench.mjs";

const retryUrl = await compileModule("src/lib/lazy-with-retry.tsx");
const {
  CHUNK_CACHE_BUST_PARAM,
  CHUNK_IMPORT_RETRY_DELAYS_MS,
  CHUNK_RELOAD_STORAGE_KEY,
  CHUNK_RETRY_DELAYS_MS,
  chunkRetryLoader,
  chunkRouteState,
  chunkUrlFromError,
  importWithChunkReload,
  isChunkLoadError,
  jitteredDelay,
  loadChunkWithRetry,
  requestChunkRetry,
  resetChunkRoutes,
  withCacheBust,
  withChunkRetry,
} = await import(retryUrl);

// 编译台把 `./telemetry/errors` 解析成真模块（`.ts` 能被 node 直接加载），
// 所以这里直接 import 到的是**同一份实例**，环形缓冲共享。
const telemetry = await import("../src/lib/telemetry/index.ts");

const loadingUrl = await compileModule(
  "src/shell/advanced-routes/WorkbenchRouteLoading.tsx",
);
const { WorkbenchRouteChunkError, WorkbenchRouteLoading } = await import(loadingUrl);

const CHUNK_URL = "https://cdn.oceanleo.com/_next/static/chunks/Model3DRoute-abc123.js";

/** webpack 5 的形状：`error.request` + 消息里带 URL，`name = "ChunkLoadError"`。 */
function chunkError(url = CHUNK_URL) {
  const error = new Error(`Loading chunk 42 failed.\n(error: ${url})`);
  error.name = "ChunkLoadError";
  error.request = url;
  return error;
}

/** 一个探针，把每次被探的 URL 记下来，状态码由调用方给。 */
function recordingProbe(status) {
  const urls = [];
  return {
    urls,
    async probe(url, token) {
      urls.push(withCacheBust(url, token));
      return { status, ok: status !== null && status >= 200 && status < 300, cacheBusted: true };
    },
  };
}

function collectTelemetry() {
  const events = [];
  telemetry.resetTelemetry();
  telemetry.configureTelemetry({ consoleSeverity: "off" });
  telemetry.registerTelemetrySink({ id: "chunk-retry-test", receive: (e) => events.push(e) });
  return events;
}

function named(name) {
  return (event) => event.name === name;
}

/** 让微任务与 `setTimeout(0)` 都排空，供「不 await 的循环」推进到下一个断点。 */
async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("重试三次之后成功：退避档位带抖动，每次都带 cache-busting 参数去探", async () => {
  resetChunkRoutes();
  const events = collectTelemetry();
  const sleeps = [];
  const { urls, probe } = recordingProbe(200);
  let calls = 0;

  const outcome = await loadChunkWithRetry(
    "threed",
    async () => {
      calls += 1;
      if (calls <= 3) throw chunkError();
      return "Model3DRoute";
    },
    {
      sleep: async (ms) => void sleeps.push(ms),
      random: () => 0.5,
      probe,
    },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.value, "Model3DRoute");
  // 一次首发 + 三次重试。
  assert.equal(outcome.attempts, 4);
  assert.equal(calls, 4);

  // ① 退避真的退了三次，且每一档都落在 [base/2, base] —— equal jitter 的区间。
  assert.equal(sleeps.length, 3);
  sleeps.forEach((delay, index) => {
    const base = CHUNK_RETRY_DELAYS_MS[index];
    assert.ok(
      delay >= base / 2 && delay <= base,
      `第 ${index + 1} 次退避 ${delay}ms 不在 [${base / 2}, ${base}] 内`,
    );
  });
  // 抖动存在的正面证据：档位之间是递增的，且不等于裸 base（random=0.5 ⇒ 恰好 0.75×base）。
  assert.deepEqual(sleeps, [375, 1125, 3000]);

  // ② 三次探测全都带上了 cache-busting 参数。
  assert.equal(urls.length, 3);
  for (const url of urls) {
    assert.ok(
      url.includes(`${CHUNK_CACHE_BUST_PARAM}=`),
      `重试探测的 URL 少了 cache-busting 参数：${url}`,
    );
  }
  // 每次的 token 不同，否则换缓存键就是假的。
  assert.equal(new Set(urls).size, 3);

  // 遥测：三条 retry + 一条 recovered，且 retry 记了 cacheBusted。
  assert.equal(events.filter(named("chunk.retry")).length, 3);
  assert.equal(events.filter(named("chunk.recovered")).length, 1);
  assert.equal(events.filter(named("chunk.failed")).length, 0);
  for (const event of events.filter(named("chunk.retry"))) {
    assert.equal(event.detail.cacheBusted, true);
    assert.equal(event.detail.routeId, "threed");
  }
});

test("同一毫秒内的两次快速重试，token 仍然不同 —— cache-busting 不许靠时钟精度", async () => {
  resetChunkRoutes();
  collectTelemetry();
  const { urls, probe } = recordingProbe(null);

  // 上一条用例的 `new Set(urls).size === 3` 也在判 token 不同，但它默认依赖
  // 「两次重试之间时钟恰好走了一格」这种运气。而 cache-busting 最需要生效的场合
  // 恰恰是**时钟没动**的快速重试 —— 那正是当初那个 bug 的现场：token 落在同一毫秒
  // ⇒ 缓存键没换 ⇒ 重试一次次命中同一条坏缓存，而那正是它要解决的问题。
  // 这里把时钟与随机数同时钉死，token 里就只剩单调序号还会变。
  const realNow = Date.now;
  Date.now = () => 1767225600000;
  let tokens;
  try {
    const outcome = await loadChunkWithRetry("threed", async () => { throw chunkError(); }, {
      sleep: async () => {},
      random: () => 0.5,
      probe,
      delays: [1, 1],
    });
    assert.equal(outcome.ok, false);
    tokens = urls.map((url) => new URL(url).searchParams.get(CHUNK_CACHE_BUST_PARAM));
  } finally {
    Date.now = realNow;
  }

  // 首发 + 两次重试，每次失败都探一遍。
  assert.equal(tokens.length, 3);
  for (const token of tokens) assert.ok(token, "探测 URL 上没有 cache-busting token");

  // token 的三段：毫秒 / 单调序号 / 随机段。
  const segments = tokens.map((token) => token.split("-"));
  // 判据自证：时钟与随机段真的被钉住了。这两条一旦松掉，下面那条「token 不同」
  // 就可能因为时钟走了一格而假绿 —— 那样这条用例其实什么都没锁住。
  assert.equal(new Set(segments.map((parts) => parts[0])).size, 1, "时钟没钉住，判据失效");
  assert.equal(new Set(segments.map((parts) => parts[2])).size, 1, "随机段没钉住，判据失效");

  // 判据本身：两次快速重试的 token 不同。唯一能让它成立的就是那个单调序号。
  assert.equal(new Set(segments.map((parts) => parts[1])).size, 3, "单调序号没有递增");
  assert.equal(
    new Set(tokens).size,
    3,
    "同一毫秒内 token 撞了 ⇒ 缓存键没换，cache-busting 白做",
  );
});

test("三次重试都失败：进可重试的失败态，而渲染出来的不是 spinner", async () => {
  resetChunkRoutes();
  const events = collectTelemetry();
  const { probe } = recordingProbe(null); // 连接都建不起来 = 网络失败

  const outcome = await loadChunkWithRetry("threed", async () => { throw chunkError(); }, {
    sleep: async () => {},
    random: () => 0.5,
    probe,
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.kind, "network");
  assert.equal(outcome.attempts, 4);
  assert.equal(events.filter(named("chunk.failed")).length, 1);
  assert.equal(events.filter(named("chunk.failed"))[0].detail.kind, "network");

  // 失败态渲染出来是什么。spinner 的签名是 `animate-spin` + data-workbench-route-loading。
  const spinner = renderToStaticMarkup(React.createElement(WorkbenchRouteLoading));
  assert.match(spinner, /animate-spin/);

  const failure = renderToStaticMarkup(
    React.createElement(WorkbenchRouteChunkError, {
      kind: "network",
      attempts: outcome.attempts,
      onRetry() {},
      onReload() {},
    }),
  );
  assert.match(failure, /data-workbench-route-error/);
  assert.match(failure, /data-chunk-failure-kind="network"/);
  assert.doesNotMatch(failure, /animate-spin/);
  assert.doesNotMatch(failure, /data-workbench-route-loading/);
  // 可重试：给的是「重试」，不是「刷新页面」。
  assert.match(failure, /重试/);
  assert.match(failure, /data-chunk-action="retry"/);
  assert.doesNotMatch(failure, /刷新页面/);
  // 已经自动试过的次数要说出来，否则用户不知道系统已经努力过了。
  assert.match(failure, /已自动重试 3 次/);
});

test("chunk 404 走「版本已更新，请刷新」，并且不白等三轮退避", async () => {
  resetChunkRoutes();
  const events = collectTelemetry();
  const sleeps = [];
  const { probe } = recordingProbe(404);

  const outcome = await loadChunkWithRetry("threed", async () => { throw chunkError(); }, {
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    probe,
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.kind, "stale-version");
  // 关键：探到 404 就立刻停。旧 chunk 名在换版后不存在，退避再多也变不出来。
  assert.equal(outcome.attempts, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(events.filter(named("chunk.retry")).length, 0);
  assert.equal(events.filter(named("chunk.failed"))[0].detail.kind, "stale-version");

  const failure = renderToStaticMarkup(
    React.createElement(WorkbenchRouteChunkError, {
      kind: "stale-version",
      attempts: 1,
      onRetry() {},
      onReload() {},
    }),
  );
  assert.match(failure, /data-chunk-failure-kind="stale-version"/);
  assert.match(failure, /版本已更新/);
  assert.match(failure, /data-chunk-action="reload"/);
  // 换版之后「重试」永远不会成功，不许给这个按钮。
  assert.doesNotMatch(failure, /data-chunk-action="retry"/);
});

test("失败态可重试：点了重试，loader 真的再跑一轮并解析出组件", async () => {
  resetChunkRoutes();
  collectTelemetry();
  const { probe } = recordingProbe(null);
  let calls = 0;

  // 前四次（首发 + 三次重试）全挂，之后恢复。
  const loader = chunkRetryLoader(
    "threed",
    async () => {
      calls += 1;
      if (calls <= 4) throw chunkError();
      return "Model3DRoute";
    },
    { sleep: async () => {}, random: () => 0.5, probe },
  );

  let resolved = null;
  const pending = loader().then((value) => {
    resolved = value;
  });

  await settle();
  // 退避耗尽，store 里应当是可重试的失败态；loader 的 promise **还活着**。
  assert.equal(chunkRouteState("threed").phase, "network-error");
  assert.equal(chunkRouteState("threed").attempts, 4);
  assert.equal(resolved, null);

  // 这就是「失败态可重试」的实测：把重试信号送回还在 await 的那个循环。
  requestChunkRetry("threed");
  await pending;

  assert.equal(resolved, "Model3DRoute");
  assert.equal(chunkRouteState("threed").phase, "loading");
  assert.equal(calls, 5);
});

test("gate 组件按 store 的相位选渲染：loading 给 Dynamic，失败给失败态", async () => {
  resetChunkRoutes();
  collectTelemetry();
  const { probe } = recordingProbe(null);

  const Dynamic = () => React.createElement("div", { "data-real-editor": "" }, "editor");
  const Gate = withChunkRetry("threed", Dynamic, WorkbenchRouteChunkError);

  // 相位 loading（初始）⇒ 渲染真正的路由组件。
  assert.match(renderToStaticMarkup(React.createElement(Gate)), /data-real-editor/);

  // 驱动到失败态。loader 不 await —— 它会停在等重试那一步。
  const loader = chunkRetryLoader("threed", async () => { throw chunkError(); }, {
    sleep: async () => {},
    random: () => 0.5,
    probe,
  });
  void loader();
  await settle();

  const markup = renderToStaticMarkup(React.createElement(Gate));
  assert.match(markup, /data-workbench-route-error/);
  assert.doesNotMatch(markup, /data-real-editor/);
  assert.doesNotMatch(markup, /animate-spin/);
});

test("cache-busting 参数拼在既有查询串之后，不覆盖它", () => {
  assert.equal(
    withCacheBust("https://cdn.test/a.js", "tok"),
    `https://cdn.test/a.js?${CHUNK_CACHE_BUST_PARAM}=tok`,
  );
  assert.equal(
    withCacheBust("https://cdn.test/a.js?v=2", "tok"),
    `https://cdn.test/a.js?v=2&${CHUNK_CACHE_BUST_PARAM}=tok`,
  );
});

test("chunk 错误的几种形状都认得出，URL 两条路都抠得到", () => {
  assert.equal(isChunkLoadError(chunkError()), true);
  assert.equal(isChunkLoadError(new Error("Loading chunk 7 failed.")), true);
  assert.equal(
    isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/y.js")),
    true,
  );
  assert.equal(isChunkLoadError(new Error("字段校验没过")), false);
  assert.equal(isChunkLoadError("boom"), false);

  // webpack 挂 `request`；原生 ESM 只把 URL 写进消息。
  assert.equal(chunkUrlFromError(chunkError()), CHUNK_URL);
  const bare = new Error(`Failed to fetch dynamically imported module: ${CHUNK_URL}`);
  assert.equal(chunkUrlFromError(bare), CHUNK_URL);
  assert.equal(chunkUrlFromError(new Error("no url here")), null);
});

function memoryStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    getItem(key) {
      return Object.hasOwn(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
  };
}

test("importWithChunkReload：首发成功就清掉刷新标记，不 reload", async () => {
  const storage = memoryStorage({ [CHUNK_RELOAD_STORAGE_KEY]: "1" });
  const reloads = [];
  const value = await importWithChunkReload(async () => ({ ok: true }), {
    storage,
    reload: () => reloads.push(1),
    sleep: async () => {
      throw new Error("成功路径不该 sleep");
    },
  });
  assert.deepEqual(value, { ok: true });
  assert.equal(storage.getItem(CHUNK_RELOAD_STORAGE_KEY), null);
  assert.equal(reloads.length, 0);
});

test("importWithChunkReload：ChunkLoadError 后下一次成功，不 reload", async () => {
  const storage = memoryStorage();
  const sleeps = [];
  let calls = 0;
  const value = await importWithChunkReload(
    async () => {
      calls += 1;
      if (calls === 1) throw chunkError();
      return { ok: true };
    },
    {
      storage,
      reload: () => {
        throw new Error("不该 reload");
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
  );
  assert.deepEqual(value, { ok: true });
  assert.deepEqual(sleeps, [CHUNK_IMPORT_RETRY_DELAYS_MS[0]]);
  assert.equal(calls, 2);
  assert.equal(storage.getItem(CHUNK_RELOAD_STORAGE_KEY), null);
});

test("importWithChunkReload：重试耗尽后刷新恰好一次，promise 挂起", async () => {
  const storage = memoryStorage();
  const reloads = [];
  const pending = importWithChunkReload(async () => {
    throw chunkError();
  }, {
    storage,
    reload: () => reloads.push(1),
    sleep: async () => {},
  });
  const raced = await Promise.race([
    pending.then(
      () => "resolved",
      () => "rejected",
    ),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
  ]);
  assert.equal(raced, "pending");
  assert.equal(reloads.length, 1);
  assert.equal(storage.getItem(CHUNK_RELOAD_STORAGE_KEY), "1");
});

test("importWithChunkReload：已经刷新过还失败就抛出，不再 reload", async () => {
  const storage = memoryStorage({ [CHUNK_RELOAD_STORAGE_KEY]: "1" });
  const reloads = [];
  await assert.rejects(
    () =>
      importWithChunkReload(async () => {
        throw chunkError();
      }, {
        storage,
        reload: () => reloads.push(1),
        sleep: async () => {},
      }),
    (error) => error instanceof Error && error.name === "ChunkLoadError",
  );
  assert.equal(reloads.length, 0);
  assert.equal(storage.getItem(CHUNK_RELOAD_STORAGE_KEY), null);
});

test("importWithChunkReload：非 chunk 错误立刻抛，不重试", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      importWithChunkReload(async () => {
        calls += 1;
        throw new Error("字段校验没过");
      }, {
        sleep: async () => {
          throw new Error("不该 sleep");
        },
        reload: () => {
          throw new Error("不该 reload");
        },
      }),
    /字段校验没过/,
  );
  assert.equal(calls, 1);
});

test("抖动区间：任何 random 取值都落在 [base/2, base] 且是整数毫秒", () => {
  for (const base of CHUNK_RETRY_DELAYS_MS) {
    for (const r of [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1]) {
      const delay = jitteredDelay(base, () => r);
      assert.ok(Number.isInteger(delay), `${delay} 不是整数`);
      assert.ok(delay >= base / 2 && delay <= base, `${delay} 不在 [${base / 2}, ${base}]`);
    }
  }
  // 全随机（0..base）会退化出「几乎立刻重试」，equal jitter 不允许下界低于 base/2。
  assert.equal(jitteredDelay(500, () => 0), 250);
  assert.equal(jitteredDelay(500, () => 1), 500);
});
