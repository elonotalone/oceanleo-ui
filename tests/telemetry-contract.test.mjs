// ============================================================================
// W09 · 遥测管道的契约
// ----------------------------------------------------------------------------
// 本波只建管道，不建后端（`web-vitals` / Sentry / OpenTelemetry 在四仓 17 份
// package.json 里一个都不存在 ⇒ chunk 加载失败这类故障在生产上根本没有信号）。
// 「只建管道」不代表随便建：**管道的形状现在就得定死**，否则下一波接后端时读端
// 要认三套形状，而那一波已经来不及改 31 个站的发端。
//
// 锁五件事：
//   ① 三个来源（错误边界 / chunk / 自动保存）的事件形状**一致**
//      —— `schema:1`、`severity:"error"`、detail 含四个核心键；
//   ② 事件里**没有用户内容**。给一个消息里带素材文件名的错误，序列化之后搜不到；
//   ③ `redactValue()` 该拦的拦住（文件名 / 路径 / URL / blob / 邮箱），
//      **该放过的放过** —— 把 `save-snapshot` 也脱敏掉的话事件就没有信息量了，
//      这条反向断言与②同等重要；
//   ④ sink 可插拔，且 `remote` sink 在默认 `forwardSampleRate: 0` 下**一个字节都收不到**；
//   ⑤ 环形缓冲只留最近 N 条，且遥测**永不把调用方带崩**。
//
// 外加 vitals 的两条：注入式确实在用注入进来的模块，而 `vitals.ts` 里**没有**
// 对 `web-vitals` 的 import —— 这是「依赖没装也能交付」那条缩小的承诺的判据。
//
// 不用 jsdom：这一份判的是纯数据形状。vitals 的注入路径只需要 `window` 存在，
// 给一个最小替身即可（注入分支不碰 `document`、也不碰 `PerformanceObserver`）。
// ============================================================================

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// 三份都是 `.ts`，node 直接加载，彼此拿到的是同一份实例（环形缓冲共享）。
const telemetry = await import("../src/lib/telemetry/index.ts");
const {
  ERROR_EVENT_CORE_KEYS,
  describeError,
  reportAutosaveError,
  reportBoundaryError,
  reportChunkFailure,
  reportChunkRecovered,
  reportChunkRetry,
} = await import("../src/lib/telemetry/errors.ts");

const {
  REDACTED,
  clearTelemetry,
  configureTelemetry,
  emitTelemetry,
  redactValue,
  registerTelemetrySink,
  registeredTelemetrySinks,
  resetTelemetry,
  telemetryConfig,
  telemetrySnapshot,
} = telemetry;

/** 每份用例都从出厂状态起跑，并收一份事件流。 */
function harness() {
  const events = [];
  resetTelemetry();
  configureTelemetry({ consoleSeverity: "off" });
  registerTelemetrySink({ id: "contract-test", receive: (event) => events.push(event) });
  return events;
}

/** 一个消息里嵌着素材文件名的错误 —— 编辑器最常见的那种。 */
function filenameError() {
  return new Error("无法解析 季度汇报-v3.xlsx：第 3 张工作表的合并单元格损坏");
}

/**
 * 去掉注释之后再判 import。
 *
 * `vitals.ts` 的文件头有一段「调用方该怎么注入」的示例，里面逐字写着
 * `import * as webVitals from "web-vitals"` —— 那是文档，不是依赖。
 * 直接拿正则搜整份源码会命中它，判出来的是工具错误而不是事实（`_COMMON.md` §7b③）。
 *
 * 扫描要认字符串边界：注释里有 `https://`，而字符串里的 `//` 不是注释开头，
 * 一刀切会把半行吃掉，那样反倒可能漏掉真的 import。
 */
function stripComments(source) {
  let out = "";
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      out += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 1;
      out += " ";
      continue;
    }
    out += char;
  }
  return out;
}

/** 三种把 `web-vitals` 变成真依赖的写法。判据是这三条在代码里都不许命中。 */
const WEB_VITALS_IMPORTS = [
  [/\bfrom\s*["']web-vitals["']/, "出现了对 web-vitals 的静态 import"],
  [/\bimport\s*\(\s*["']web-vitals["']\s*\)/, "出现了对 web-vitals 的动态 import"],
  [/\brequire\s*\(\s*["']web-vitals["']\s*\)/, '出现了 require("web-vitals")'],
];

test("三个来源一个形状：schema / severity / 四个核心 detail 键", () => {
  const events = harness();
  const error = new TypeError("boom");

  reportBoundaryError({
    boundary: "workbench:route",
    routeId: "threed",
    error,
    recoverable: true,
  });
  reportChunkFailure({ routeId: "threed", attempts: 4, kind: "network", error });
  reportAutosaveError({ stage: "save-snapshot", error, willRetry: true });

  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => event.source),
    ["error-boundary", "chunk", "autosave"],
  );
  assert.deepEqual(
    events.map((event) => event.name),
    ["boundary.catch", "chunk.failed", "autosave.error"],
  );

  for (const event of events) {
    assert.equal(event.schema, 1, "schema 分叉了，读端就得认两套形状");
    assert.equal(event.severity, "error");
    assert.equal(typeof event.id, "string");
    assert.ok(event.id.length > 0);
    assert.equal(typeof event.ts, "number");
    assert.ok(Number.isFinite(event.ts));
    // 四个核心键，一个不少。
    for (const key of ERROR_EVENT_CORE_KEYS) {
      assert.ok(key in event.detail, `${event.name} 少了核心 detail 键 ${key}`);
    }
    // 同一个 error 走三条路，指纹必须一样 —— 否则跨来源去重是假的。
    assert.equal(event.detail.errorName, "TypeError");
    assert.equal(event.detail.fingerprint, describeError(error).fingerprint);
    assert.equal(typeof event.detail.recoverable, "boolean");
  }

  // 事件与 detail 都冻上：读端（W10 的闸）拿到的快照不该被谁改一笔。
  assert.equal(Object.isFrozen(events[0]), true);
  assert.equal(Object.isFrozen(events[0].detail), true);
});

test("chunk.retry / chunk.recovered 刻意不是 error 档：它们不是终局", () => {
  const events = harness();
  const error = new Error("Loading chunk 42 failed.");

  reportChunkRetry({ routeId: "threed", attempt: 2, delayMs: 1125.4, cacheBusted: true, error });
  reportChunkRecovered({ routeId: "threed", attempts: 3 });

  const [retry, recovered] = events;
  // 还有机会救回来 ⇒ warn。把它抬成 error 会让「重试一次就成功」也进错误率。
  assert.equal(retry.severity, "warn");
  assert.equal(retry.value, 2);
  assert.equal(retry.detail.delayMs, 1125, "delayMs 该取整");
  assert.equal(retry.detail.cacheBusted, true);
  // 救回来了是好消息。没有这条就看不出重试到底有没有用。
  assert.equal(recovered.severity, "info");
  assert.equal(recovered.value, 3);
  assert.equal(recovered.name, "chunk.recovered");
});

test("事件里没有用户内容：带文件名的错误，三个来源序列化之后都搜不到", () => {
  const events = harness();
  const error = filenameError();

  reportBoundaryError({ boundary: "workbench:route", routeId: "grid", error, recoverable: true });
  reportChunkFailure({ routeId: "grid", attempts: 4, kind: "network", error });
  reportAutosaveError({ stage: "save-snapshot", error, willRetry: false });

  assert.equal(events.length, 3);
  for (const event of events) {
    const serialized = JSON.stringify(event);
    assert.doesNotMatch(serialized, /季度汇报/, `${event.name} 里出现了文件名`);
    assert.doesNotMatch(serialized, /\.xlsx/, `${event.name} 里出现了扩展名`);
    assert.doesNotMatch(serialized, /无法解析/, `${event.name} 里出现了错误消息正文`);
    assert.doesNotMatch(serialized, /工作表/, `${event.name} 里出现了文档内容`);
    // 换成够用的：errorName + 不可逆指纹。
    assert.equal(event.detail.errorName, "Error");
    assert.match(String(event.detail.fingerprint), /^[0-9a-f]{8}$/);
  }
  // 环形缓冲里那一份也一样干净（读端读的是它，不是 sink）。
  const buffered = JSON.stringify(telemetrySnapshot());
  assert.doesNotMatch(buffered, /季度汇报/);
  assert.doesNotMatch(buffered, /\.xlsx/);

  // 指纹是单向的：同消息同指纹（可分组），而指纹本身推不回消息。
  assert.equal(describeError(error).fingerprint, describeError(filenameError()).fingerprint);
  assert.notEqual(
    describeError(error).fingerprint,
    describeError(new Error("别的错误")).fingerprint,
  );
});

test("throw 非 Error 也不许把内容带进事件", () => {
  const events = harness();
  // `throw "季度汇报-v3.xlsx 打不开"` 这种写法是有的，stringify 进事件就漏了。
  reportAutosaveError({ stage: "ensure-session", error: "季度汇报-v3.xlsx 打不开", willRetry: true });
  reportAutosaveError({ stage: "ensure-session", error: { file: "季度汇报-v3.xlsx" }, willRetry: true });

  assert.equal(events.length, 2);
  assert.equal(events[0].detail.errorName, "ThrownValue");
  assert.equal(events[1].detail.errorName, "ThrownObject");
  for (const event of events) {
    assert.doesNotMatch(JSON.stringify(event), /季度汇报|\.xlsx/);
  }
});

test("redactValue 该拦的拦住：文件名 / 路径 / URL / blob / 邮箱", () => {
  const shouldRedact = [
    "季度汇报-v3.xlsx",
    "report.pdf",
    "IMG_2049.HEIC",
    "/Users/leo/Documents/季度汇报.xlsx",
    "C:\\Users\\leo\\Desktop\\a",
    "https://image.oceanleo.com/assets/poster-1.png",
    "blob:https://image.oceanleo.com/8f2c-4a1b",
    "data:image/png;base64,iVBORw0KGgo",
    "leo@oceanleo.com",
  ];
  for (const value of shouldRedact) {
    assert.equal(redactValue(value), REDACTED, `没拦住：${value}`);
  }
});

test("redactValue 该放过的放过：脱敏过度等于把信号也删了", () => {
  // 这些是 detail 里真正会出现的值。全都脱敏掉的话事件还在、信息没了，
  // 而「事件都在、内容全是 «redacted»」比没有遥测更难发现。
  const shouldPass = [
    "save-snapshot",
    "ensure-session",
    "record-saved-item",
    "workbench-route",
    "workbench-shell",
    "session",
    "workbench:route",
    "ChunkLoadError",
    "TypeError",
    "AutosaveRejected",
    "stale-version",
    "network",
    "threed",
    "video-timeline",
    "web-vitals",
    "native",
  ];
  for (const value of shouldPass) {
    assert.equal(redactValue(value), value, `被过度脱敏：${value}`);
  }

  // 数字与布尔原样；非有限值挡成 0（`NaN` 进 JSON 会变 null，读端会当缺字段）。
  assert.equal(redactValue(42), 42);
  assert.equal(redactValue(0), 0);
  assert.equal(redactValue(-1.5), -1.5);
  assert.equal(redactValue(Number.NaN), 0);
  assert.equal(redactValue(Number.POSITIVE_INFINITY), 0);
  assert.equal(redactValue(true), true);
  assert.equal(redactValue(false), false);

  // 长字符串截断：文档正文的形状就是「很长」，即使没命中任何模式也不许整段进去。
  const long = "a".repeat(200);
  const redacted = redactValue(long);
  assert.equal(redacted.length, 121);
  assert.ok(redacted.endsWith("…"));
});

test("detail 里新加的字段也过闸：redactDetail 对每个值都跑一遍", () => {
  const events = harness();
  // 走公开入口，模拟「将来谁往 detail 里加一个字段」。
  emitTelemetry({
    source: "autosave",
    name: "autosave.error",
    severity: "error",
    detail: {
      stage: "save-snapshot",
      assetName: "季度汇报-v3.xlsx",
      assetPath: "/Users/leo/Documents/季度汇报.xlsx",
      attempts: 3,
    },
  });
  const [event] = events;
  assert.equal(event.detail.stage, "save-snapshot", "该放过的被脱敏了");
  assert.equal(event.detail.assetName, REDACTED, "新字段绕过了闸");
  assert.equal(event.detail.assetPath, REDACTED, "新字段绕过了闸");
  assert.equal(event.detail.attempts, 3);
  assert.doesNotMatch(JSON.stringify(event), /季度汇报|\.xlsx/);
});

test("sink 可插拔：注册拿到注销函数，注销之后收不到", () => {
  resetTelemetry();
  configureTelemetry({ consoleSeverity: "off" });

  const seen = [];
  const unregister = registerTelemetrySink({ id: "pluggable", receive: (e) => seen.push(e.name) });
  assert.deepEqual(registeredTelemetrySinks(), ["pluggable"]);

  emitTelemetry({ source: "chunk", name: "chunk.failed" });
  assert.deepEqual(seen, ["chunk.failed"]);

  unregister();
  assert.deepEqual(registeredTelemetrySinks(), []);
  emitTelemetry({ source: "chunk", name: "chunk.failed" });
  assert.deepEqual(seen, ["chunk.failed"], "注销之后还在收");

  // 同 id 重复注册是「换一套」，不是叠加。
  registerTelemetrySink({ id: "dup", receive: () => {} });
  registerTelemetrySink({ id: "dup", receive: () => {} });
  assert.deepEqual(registeredTelemetrySinks(), ["dup"]);
});

test("默认 0% 外发：remote sink 在出厂配置下一个事件都收不到", () => {
  resetTelemetry();
  configureTelemetry({ consoleSeverity: "off" });

  // 出厂就是 0，不是靠调用方记得关。
  assert.equal(telemetryConfig().forwardSampleRate, 0);
  assert.equal(telemetryConfig().bufferSampleRate, 1);

  const remote = [];
  const local = [];
  registerTelemetrySink({ id: "remote", remote: true, receive: (e) => remote.push(e) });
  registerTelemetrySink({ id: "local", receive: (e) => local.push(e) });

  for (let index = 0; index < 50; index += 1) {
    emitTelemetry({ source: "vitals", name: "vitals.INP", value: index });
  }

  assert.equal(remote.length, 0, "默认配置下有事件被送出本机了");
  assert.equal(local.length, 50, "本地 sink 该 100% 收到");
  assert.equal(telemetrySnapshot().length, 50, "本地缓冲该 100% 采");

  // 闸是采样率，不是 bug：打开就该通。下一波接后端时改的就是这一个数。
  configureTelemetry({ forwardSampleRate: 1 });
  emitTelemetry({ source: "vitals", name: "vitals.INP", value: 99 });
  assert.equal(remote.length, 1);
});

test("环形缓冲只留最近 N 条，clearTelemetry 清空", () => {
  resetTelemetry();
  configureTelemetry({ consoleSeverity: "off", bufferCapacity: 3 });

  for (const name of ["a", "b", "c", "d", "e"]) {
    emitTelemetry({ source: "chunk", name });
  }
  const snapshot = telemetrySnapshot();
  assert.equal(snapshot.length, 3);
  assert.deepEqual(
    snapshot.map((event) => event.name),
    ["c", "d", "e"],
    "环形缓冲留错了一头：该留最近的",
  );

  // 快照是副本，改它不该动到缓冲。
  snapshot.push({ name: "injected" });
  assert.equal(telemetrySnapshot().length, 3);

  clearTelemetry();
  assert.deepEqual(telemetrySnapshot(), []);
  // 出厂容量是 128（W10 的闸按这个数读）。
  resetTelemetry();
  assert.equal(telemetryConfig().bufferCapacity, 128);
});

test("遥测永不把调用方带崩：sink 抛了照样返回事件，后面的 sink 照样收", () => {
  resetTelemetry();
  configureTelemetry({ consoleSeverity: "off" });

  const after = [];
  registerTelemetrySink({
    id: "throwing",
    receive() {
      throw new Error("sink 自己炸了");
    },
  });
  registerTelemetrySink({ id: "after", receive: (e) => after.push(e.name) });

  const event = emitTelemetry({ source: "chunk", name: "chunk.failed", severity: "error" });
  assert.equal(event.name, "chunk.failed");
  assert.deepEqual(after, ["chunk.failed"], "前一个 sink 抛了就不往后发了");
  assert.equal(telemetrySnapshot().length, 1);

  // 报错入口也一样：三个来源都不许因为自己而抛。
  assert.doesNotThrow(() => reportAutosaveError({ stage: "x", error: null, willRetry: true }));
  assert.doesNotThrow(() => reportChunkFailure({ routeId: "x", attempts: 1, kind: "network", error: undefined }));
});

test("vitals：注入的模块真的在用，读数打上 collector=web-vitals", async () => {
  const events = harness();
  const { startWebVitals } = await import("../src/lib/telemetry/vitals.ts");

  // 注入分支只需要 `window` 存在；它不碰 document，也不碰 PerformanceObserver。
  const hadWindow = "window" in globalThis;
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    const handlers = [];
    const stop = startWebVitals({
      module: {
        onINP: (handler) => handlers.push(["INP", handler]),
        onLCP: (handler) => handlers.push(["LCP", handler]),
        onCLS: (handler) => handlers.push(["CLS", handler]),
      },
    });
    assert.equal(handlers.length, 3, "注入的模块没被调用 ⇒ 注入式接法是假的");

    for (const [name, handler] of handlers) {
      handler({ name, value: name === "CLS" ? 0.12345 : 1234.6, rating: "good" });
    }
    stop();

    const vitals = events.filter((event) => event.source === "vitals");
    assert.equal(vitals.length, 3);
    for (const event of vitals) {
      // 两条采集路不许混算：官方口径的 INP 与原生近似不是同一个量。
      assert.equal(event.detail.collector, "web-vitals");
      assert.equal(event.severity, "info");
      assert.equal(event.detail.rating, "good");
    }
    const byName = Object.fromEntries(vitals.map((event) => [event.name, event.value]));
    assert.equal(byName["vitals.INP"], 1235, "毫秒该取整");
    assert.equal(byName["vitals.LCP"], 1235);
    assert.equal(byName["vitals.CLS"], 0.123, "CLS 是无量纲分值，保留三位");
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
});

test("vitals.ts 里没有对 web-vitals 的 import：依赖没装也交付得了", async () => {
  const source = await readFile(new URL("../src/lib/telemetry/vitals.ts", import.meta.url), "utf8");
  const code = stripComments(source);

  // 这是「缩小的承诺」的判据。`package.json` 现在是脏的（混着别人未提交的 exports），
  // 红线 3 又要求限定路径提交，所以这一波不装 `web-vitals`，改成调用方注入。
  // 一旦有人把它改成静态 import，31 个站会在依赖装上之前就构建失败。
  // 正则自证（零命中最贵）：同一把正则搜确定存在的 `startWebVitals` 必须命中。
  assert.match(code, /\bstartWebVitals\b/, "正则本身或文件路径不对");

  for (const [pattern, message] of WEB_VITALS_IMPORTS) {
    assert.doesNotMatch(code, pattern, message);
  }

  // 判据自证（`_COMMON.md` §7b③：零命中最贵）。上面三条是在**剥掉注释之后**的源码上
  // 跑的，那就得先证明剥完还认得出真的 import —— 否则 `stripComments` 把整份源码
  // 吃光了也是「零命中」，判据会安静地失效。
  const realImports = [
    'import * as webVitals from "web-vitals";',
    'const mod = await import("web-vitals");',
    'const mod = require("web-vitals");',
  ];
  realImports.forEach((line, index) => {
    const [pattern, message] = WEB_VITALS_IMPORTS[index];
    assert.match(stripComments(line), pattern, `剥注释之后认不出真的 import：${message}`);
  });
  // 而同一行写进注释里就不算数 —— `vitals.ts` 文件头那段「调用方该怎么注入」的
  // 示例正是这个形状，它是文档，不是依赖。
  for (const [pattern] of WEB_VITALS_IMPORTS) {
    assert.doesNotMatch(stripComments(`// ${realImports[0]}`), pattern);
  }

  // 注入面还在（改成别的接法要连这条一起改，不能悄悄换）。
  assert.match(code, /module\?:\s*WebVitalsModule/);
});
