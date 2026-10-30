// 上传进度的行为契约（W08 P1/P5）。
//
// 今天用户传一个 200MB 的视频，界面上只有一个转圈：传 200MB 和传 200KB 长得一模
// 一样。这份测试钉住「进度真的贯通」这件事，判据取**行为**而不是源码文本：
//
//   1. 读数**单调不减**——XHR 在内部重试时会把 `loaded` 归零重来，用户会看到
//      「刚才 80%，现在又 12%」。这一条不是洁癖，是它真的会发生。
//   2. 到得了 100%——XHR 不保证最后一个 progress 事件正好落在 total 上。
//   3. **失败之后不再回调**——`onerror` 之后 XHR 仍可能吐一个迟到的 progress，
//      那一个必须被吃掉，否则进度条会在错误提示旁边继续爬。
//   4. **估不出剩余时间就不显示**——假 ETA 比没有更糟，用户会按那个数字安排事情。
//   5. 三个消费点都收得到。前两个（`InputCard` / `LeoComposer`）按自己的文件头
//      契约**不负责上传**，它们靠的是 `progress.ts` 里那条按 **File 对象身份**
//      挂键的总线：`useAttachments.handleAttachFiles` 把收到的 File **原样**交给
//      `uploadFile`，所以两边键对得上。这一条是整个设计成立的支点，
//      **哪天业务层在中间 clone 一次 File，这条链就静默断了**——所以要钉。
//
// 组件用 jsdom + `react-dom/client` 真渲染（夹具抄 `tests/button-primitive.test.mjs`
// 那一套），不是 `renderToStaticMarkup`：总线订阅发生在事件处理器与 effect 里，
// 静态渲染根本跑不到，那样钉不住任何东西。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

// ---------------------------------------------------------------- 桩表
// 只桩「要联网 / 要 Next 运行时 / 要浏览器存储」的三类。`src/lib/upload/**` 与
// `uploadFile` 本体一律编真源码——被测的就是它们。
const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

// `./auth/client` 的桩必须把**整张导出表**摆齐，不能只摆 `accessToken`。
// ESM 的具名导入是静态解析的：编译图里 `workflows.ts` / `agent.ts` / `media-proxy.ts`
// 都从同一个说明符取 `browserClient` 等等，桩少一个名字就是整图 `SyntaxError`，
// 而且报错点在那个无关模块上，看不出是桩的问题。
const STUBS = {
  "./auth/client": dataModule(`
    export function browserClient(){ return null; }
    export function oceanleoConfigured(){ return true; }
    export async function accessToken(){ return "test-token"; }
    export function cachedAccessToken(){ return "test-token"; }
    export async function isSignedIn(){ return true; }
    export async function getUserEmail(){ return "test@example.com"; }
    export async function getUserId(){ return "user-test"; }
    export async function getUserIdSnapshot(){ return { userId: "user-test" }; }
    export function desktopBrowserLoginAvailable(){ return false; }
    export async function startDesktopBrowserSignIn(){ return {}; }
    export async function signIn(){ return {}; }
    export async function signUp(){ return {}; }
    export function normalizeCnPhone(raw){ return String(raw); }
    export async function sendPhoneOtp(){ return {}; }
    export async function verifyPhoneOtp(){ return {}; }
    export const AUTH_STATE_EVENT = "oceanleo:auth-state";
    export const PHONE_REQUIRED_EVENT = "oceanleo:phone-required";
    export function announcePhoneRequired(){}
    export function cnPhoneIsBound(){ return false; }
    export function maskCnPhone(){ return "****"; }
    export async function getAuthPhoneUser(){ return { user: null }; }
    export async function requestPhoneChange(){ return {}; }
    export async function verifyPhoneChange(){ return {}; }
    export async function wechatLoginUrl(){ return {}; }
    export async function startOauthSignIn(){ return {}; }
    export const PASSWORD_RESET_PATH = "/account?reset=1";
    export function isPasswordResetLanding(){ return false; }
    export function passwordResetRedirectTo(){ return "/account?reset=1"; }
    export async function sendPasswordReset(){ return {}; }
    export async function reauthenticate(){ return {}; }
    export async function updatePassword(){ return {}; }
    export async function listMfaFactors(){ return { factors: [] }; }
    export async function enrollTotp(){ return {}; }
    export async function challengeAndVerify(){ return {}; }
    export async function unenrollFactor(){ return {}; }
    export async function currentAal(){ return { current: null, next: null }; }
    export function needsMfaChallenge(){ return false; }
    export async function signOutEverywhere(){}
  `),
  "./auth/config": dataModule(`
    export const GATEWAY_BASE = "https://gateway.test";
    export const SUPABASE_URL = "https://supabase.test";
    export const SUPABASE_ANON_KEY = "anon-test";
    export function isLeoDevPreviewHost(){ return false; }
    export function configured(){ return true; }
    export function cookieDomainFor(){ return undefined; }
    export function cookieOptions(){ return {}; }
    export function loginUnavailableNoticeFor(){ return null; }
    export function loginUnavailableNotice(){ return null; }
  `),
  // node 里没有 indexedDB，`openRecoveryDatabase()` 会 reject。换成同形状的内存实现，
  // 被测的是 `chunked.ts` 怎么用它，不是 IndexedDB 本身。
  "../../shell/advanced-recovery-store": dataModule(`
    const rows = new Map();
    export function advancedRecoveryKey(...parts){ return parts.join(":"); }
    export async function writeAdvancedRecovery(record){ rows.set(record.key, record); }
    export async function readAdvancedRecovery(key){ return rows.get(key) ?? null; }
    export async function deleteAdvancedRecovery(key){ rows.delete(key); }
  `),
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
  ),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
      return createElement("textarea", { placeholder: props.placeholder, defaultValue: props.value || "", readOnly: true });
    });
    export const TemplateFillArea = PromptHighlightArea;
    export function templateSegments(){ return []; }
    export function highlightSegments(){ return []; }
    export function stripPromptPlaceholders(text){ return text; }
  `),
};

const OPTIONS = { missingPackageStub: lazyStub };

// 同一张桩表 = 同一个编译上下文 = 同一份模块实例。这一点是**必须**的：
// 进度总线是 `progress.ts` 的模块级 WeakMap，编两份的话组件订阅的是另一条总线，
// 测试怎么发都收不到（`module-bench.mjs:521-528` 明写了这个坑）。
const load = (path) => compileModule(path, STUBS, OPTIONS).then((url) => import(url));

const progressModule = await load("src/lib/upload/progress.ts");
const {
  createProgressTracker,
  publishUploadProgress,
  subscribeUploadProgress,
  formatBytes,
  formatDuration,
  progressPercent,
} = progressModule;
const { uploadFile } = await load("src/lib/database.ts");
const { LeoComposer } = await load("src/shell/LeoComposer.tsx");
const { InputCard } = await load("src/shell/InputCard.tsx");

// ---------------------------------------------------------------- 假 XHR
/**
 * 只实现 `xhrUpload()` 真正用到的那几个面（`progress.ts:293-378`）。
 * `script` 是一串「这次传输依次发生了什么」，测试因此能造出
 * 「进度倒退」「失败之后还有一个迟到的 progress」这类真实但难复现的时序。
 */
function installFakeXhr(script) {
  const previous = globalThis.XMLHttpRequest;
  const calls = [];
  class FakeXhr {
    constructor() {
      this.upload = {};
      this.status = 0;
      this.responseText = "";
      this.headers = {};
      calls.push(this);
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    abort() {
      this.onabort?.();
    }
    send(body) {
      this.body = body;
      // 同步走完脚本：`xhrUpload` 返回的是 promise，测试 await 它即可。
      for (const step of script) {
        if (step.progress) {
          this.upload.onprogress?.({
            loaded: step.progress.loaded,
            total: step.progress.total ?? 0,
            lengthComputable: step.progress.lengthComputable !== false,
          });
        }
        if (step.load) {
          this.status = step.load.status;
          this.responseText = step.load.responseText ?? "";
          this.onload?.();
        }
        if (step.error) this.onerror?.();
      }
    }
  }
  globalThis.XMLHttpRequest = FakeXhr;
  return {
    calls,
    restore() {
      if (previous === undefined) delete globalThis.XMLHttpRequest;
      else globalThis.XMLHttpRequest = previous;
    },
  };
}

function installFakeFetch(handler) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => handler(String(url), init);
  return () => {
    if (previous === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous;
  };
}

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function smallFile(name = "报表.pdf", bytes = 4096) {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

// ---------------------------------------------------------------- 读数本身

test("读数单调不减：XHR 内部重试把 loaded 归零，进度条不许倒退", () => {
  let clock = 0;
  const tracker = createProgressTracker(1000, () => clock);
  clock = 100;
  assert.equal(tracker.report(400).loaded, 400);
  clock = 200;
  // XHR 重试：这一发真的会来。
  assert.equal(tracker.report(0).loaded, 400, "loaded 倒退了——用户会看到进度条往回跑");
  clock = 300;
  assert.equal(tracker.report(120).loaded, 400);
  clock = 400;
  assert.equal(tracker.report(700).loaded, 700);
});

test("到得了 100%：最后一个 progress 事件没落在 total 上也要补齐", () => {
  const tracker = createProgressTracker(1000, () => 0);
  tracker.report(998);
  const done = tracker.finish();
  assert.equal(done.loaded, 1000);
  assert.equal(progressPercent(done), 100);
  assert.equal(done.done, true);
  assert.equal(done.failed, false);
});

test("估不出剩余时间就给 null，不给 0——假 ETA 比没有更糟", () => {
  let clock = 0;
  const tracker = createProgressTracker(10_000, () => clock);
  clock = 100; // 还不到 MIN_ELAPSED_FOR_ETA_MS
  assert.equal(tracker.report(1000).remainingMs, null, "样本不够就不许给 ETA");
  clock = 2000;
  const later = tracker.report(5000);
  assert.ok(later.remainingMs !== null, "攒够样本之后应该给得出 ETA");
  assert.ok(later.remainingMs > 0);
  // 结束之后不再是「还剩多久」。
  assert.equal(tracker.finish().remainingMs, null);
});

test("失败停在当前读数，不归零——用户想知道断在哪儿", () => {
  const tracker = createProgressTracker(1000, () => 0);
  tracker.report(640);
  const failed = tracker.fail();
  assert.equal(failed.loaded, 640);
  assert.equal(failed.failed, true);
  assert.equal(failed.done, false);
});

// ---------------------------------------------------------------- 真上传方

test("uploadFile（≤8MB multipart 路）：回调单调递增、到 100%、且不手写 Content-Type", async () => {
  const xhr = installFakeXhr([
    { progress: { loaded: 1024, total: 4096 } },
    { progress: { loaded: 0, total: 4096 } }, // 内部重试
    { progress: { loaded: 3072, total: 4096 } },
    { load: { status: 200, responseText: JSON.stringify({ ok: true, file: { id: "f1" } }) } },
  ]);
  try {
    const seen = [];
    const file = smallFile();
    const result = await uploadFile(file, {
      siteId: "home",
      onProgress: (loaded, total) => seen.push([loaded, total]),
    });

    assert.equal(result.ok, true, `上传应该成功，实际：${result.error}`);
    assert.ok(seen.length >= 3, "一次都没回调");
    const loadedSeries = seen.map(([loaded]) => loaded);
    for (let i = 1; i < loadedSeries.length; i += 1) {
      assert.ok(
        loadedSeries[i] >= loadedSeries[i - 1],
        `第 ${i} 次回调倒退了：${JSON.stringify(loadedSeries)}`,
      );
    }
    assert.equal(loadedSeries.at(-1), 4096, "最后一次回调没到 100%");

    // multipart 的 boundary 必须让浏览器自己加。手写一个 Content-Type 会覆盖掉它，
    // 网关拿不到 boundary，请求体解不出来——表现是 422，很难查。
    const sent = xhr.calls.at(-1);
    assert.equal(sent.method, "POST");
    assert.deepEqual(Object.keys(sent.headers), ["Authorization"]);
  } finally {
    xhr.restore();
  }
});

test("失败之后不再回调：onerror 之后那个迟到的 progress 必须被吃掉", async () => {
  const xhr = installFakeXhr([
    { progress: { loaded: 2048, total: 4096 } },
    { error: true },
    { progress: { loaded: 4096, total: 4096 } }, // 迟到的那一发
  ]);
  try {
    const seen = [];
    const result = await uploadFile(smallFile(), {
      siteId: "home",
      onProgress: (loaded) => seen.push(loaded),
    });
    assert.equal(result.ok, false);
    // 2048（真读数）+ fail() 那一次收口读数；那个迟到的 4096 不许出现。
    assert.ok(seen.length >= 1 && seen.length <= 2, `回调次数异常：${JSON.stringify(seen)}`);
    assert.ok(
      !seen.slice(1).some((loaded) => loaded > 2048),
      `失败之后还在报数：${JSON.stringify(seen)}`,
    );
  } finally {
    xhr.restore();
  }
});

test("消费点三（真上传方）走的是同一条总线：uploadFile 按 File 身份发布读数", async () => {
  const xhr = installFakeXhr([
    { progress: { loaded: 2048, total: 4096 } },
    { load: { status: 200, responseText: JSON.stringify({ ok: true, file: { id: "f1" } }) } },
  ]);
  try {
    const file = smallFile();
    const fromBus = [];
    // `AdvancedWorkbenchBlankStage` 订阅的就是这个（它不看 onProgress 回调，
    // 因为总线送的是算好的整份读数，含已用时与剩余估算）。
    const unsubscribe = subscribeUploadProgress(file, (snapshot) => fromBus.push(snapshot));
    await uploadFile(file, { siteId: "home" });
    unsubscribe();

    assert.ok(fromBus.length >= 2, "总线上一条读数都没有");
    assert.equal(fromBus.at(-1).done, true);
    assert.equal(progressPercent(fromBus.at(-1)), 100);
    // 换一个 File 对象不该收到别人的读数（WeakMap 按对象身份挂键）。
    const other = [];
    const off = subscribeUploadProgress(smallFile("别人的.pdf"), (s) => other.push(s));
    off();
    assert.equal(other.length, 0);
  } finally {
    xhr.restore();
  }
});

// ---------------------------------------------------------------- 两个消费点

/**
 * jsdom 取自 `fabric/node` 自带那份（仓内唯一可用），它的 `canvas` 依赖在本容器里
 * 装不上，所以先拿空对象把 require 缓存顶掉，建完再还回去。
 * 与 `tests/button-primitive.test.mjs:365-423` 同一套写法。
 */
async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const render = (Component, props) =>
    act(async () => root.render(React.createElement(Component, props)));
  const find = (selector) => container.querySelector(selector);
  const html = () => container.innerHTML;
  /** 造一次粘贴。jsdom 没有可用的 DataTransfer，而三个提取函数只读 items/files。 */
  const paste = async (selector, given) => {
    const node = find(selector);
    assert.ok(node, `粘贴目标 ${selector} 不在`);
    // 传数组：items 与 files 是同一批 File 对象；传 `{ items, files }`：两边各给各的
    // （Chrome 对截图就是这样——两个不同的 File、不同的 lastModified）。
    const itemFiles = Array.isArray(given) ? given : given.items;
    const files = Array.isArray(given) ? given : given.files;
    const transfer = {
      items: itemFiles.map((file) => ({ kind: "file", getAsFile: () => file })),
      files,
    };
    await act(async () => {
      const event = new window.Event("paste", { bubbles: true });
      Object.defineProperty(event, "clipboardData", { value: transfer });
      node.dispatchEvent(event);
    });
    // 压缩那一步是 async（`compressImageFiles`），交出去发生在它之后。
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  };

  try {
    await run({ window, render, find, html, paste, container });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

/** 造一份「已经传了一半、且估得出剩余时间」的真读数（不是手搓的对象字面量）。 */
function halfwaySnapshot(total) {
  let clock = 0;
  const tracker = createProgressTracker(total, () => clock);
  clock = 1000;
  return tracker.report(total / 2);
}

for (const [label, Component, baseProps, target] of [
  ["LeoComposer", () => LeoComposer, { value: "", onChange() {} }, "textarea"],
  ["InputCard", () => InputCard, { value: "", onChange() {} }, "textarea"],
]) {
  const attachProp = label === "LeoComposer" ? "onAttachFiles" : "onFiles";

  test(`消费点：${label} 订阅自己刚交出去的那几个 File，进度画在方块的小圆环里，不另起进度行`, async () => {
    await withDom(async ({ render, html, paste }) => {
      const emitted = [];
      const props = { ...baseProps, [attachProp]: (files) => emitted.push(...files) };
      await render(Component(), props);

      const file = smallFile("会议纪要.pdf", 4096);
      await paste(target, [file]);
      assert.equal(emitted.length, 1, "粘贴没把文件交给宿主");
      assert.equal(emitted[0], file, "交出去的应当就是这个 File 对象本身");

      // 宿主（useAttachments）的做法：按文件名挂一条 uploading 附件，不回传进度。
      const hosted = { id: "h1", name: file.name, mime: file.type, uploading: true };
      await render(Component(), { ...props, attachments: [hosted] });
      // 还没人报数：方块上只是不确定态小圈。
      assert.match(html(), /data-attachment-spinner/, "没人报数时应是不确定态小圈");
      assert.equal(/data-attachment-progress=/.test(html()), false, "没人报数却画了百分比");

      await act(async () => {
        publishUploadProgress(emitted[0], halfwaySnapshot(4096));
      });
      const shown = html();
      assert.match(shown, /data-upload-tile="uploading"/, `${label} 没有上传中方块`);
      assert.match(shown, /data-attachment-progress="50"/, "总线读数没配到方块的圆环上");
      assert.equal(/data-upload-progress/.test(shown), false, "不许再有整行进度");
      assert.equal(/2\.0 KB|4\.0 KB|已用|剩余约/.test(shown), false, "方块上不许出现字节或用时");

      // 传完：读数撤掉，宿主把 uploading 翻成 false 后就是普通方块。
      const tracker = createProgressTracker(4096, () => 0);
      await act(async () => {
        publishUploadProgress(emitted[0], tracker.finish());
      });
      assert.equal(/data-attachment-progress=/.test(html()), false, "done 之后圆环读数没撤掉");
      await render(Component(), { ...props, attachments: [{ ...hosted, uploading: false }] });
      assert.match(html(), /data-upload-tile="ready"/);
      assert.equal(/data-attachment-spinner/.test(html()), false, "传完了还在转");
    });
  });

  test(`消费点：${label} 的方块：progress 字段画真圆环、失败给红色重试徽章`, async () => {
    await withDom(async ({ window, render, html, find }) => {
      const spinnerOnly = { id: "a1", name: "报表.xlsx", uploading: true };
      await render(Component(), { ...baseProps, attachments: [spinnerOnly] });
      assert.match(html(), /data-attachment-spinner/, "不传 progress 时应是不确定态小圈");
      assert.equal(/data-attachment-progress=/.test(html()), false);

      await render(Component(), {
        ...baseProps,
        attachments: [{ ...spinnerOnly, progress: halfwaySnapshot(8192) }],
      });
      const shown = html();
      assert.match(shown, /data-attachment-progress="50"/, "方块没换成真圆环");
      assert.equal(/4\.0 KB \/ 8\.0 KB/.test(shown), false, "方块上不许再有字节读数");
      assert.equal(/data-attachment-spinner/.test(shown), false, "有真读数时不该再转圈");

      const retried = [];
      await render(Component(), {
        ...baseProps,
        attachments: [{ id: "f1", name: "坏掉.png", mime: "image/png", failed: true }],
        onRetryAttachment: (id) => retried.push(id),
      });
      assert.match(html(), /data-upload-tile="failed"/, "失败方块没标出来");
      const retry = find("[data-upload-retry]");
      assert.ok(retry, "失败方块没有重试键");
      await act(async () => {
        retry.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      assert.deepEqual(retried, ["f1"]);
    });
  });

  test(`消费点：${label} 粘贴纯文本一个字都不拦（粘贴文字必须照常插入）`, async () => {
    await withDom(async ({ render, find }) => {
      const emitted = [];
      await render(Component(), {
        ...baseProps,
        [attachProp]: (files) => emitted.push(...files),
      });
      const node = find(target);
      let defaultPrevented = false;
      await act(async () => {
        const event = new window.Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", {
          value: { items: [{ kind: "string", getAsFile: () => null }], files: [] },
        });
        node.dispatchEvent(event);
        defaultPrevented = event.defaultPrevented;
      });
      assert.equal(emitted.length, 0, "粘贴纯文本被当成了上传");
      assert.equal(defaultPrevented, false, "粘贴纯文本被 preventDefault 了，文字插不进去");
    });
  });

  test(`消费点：${label} 一次截图粘贴只交出一个文件（Chrome 给 items 与 files 两个不同的 File）`, async () => {
    await withDom(async ({ render, paste }) => {
      const emitted = [];
      await render(Component(), {
        ...baseProps,
        [attachProp]: (files) => emitted.push(...files),
      });
      const fromItems = new File([new Uint8Array(4096)], "image.png", { type: "image/png", lastModified: 1_000 });
      const fromFiles = new File([new Uint8Array(4096)], "image.png", { type: "image/png", lastModified: 2_000 });
      assert.notEqual(fromItems, fromFiles);
      await paste(target, { items: [fromItems], files: [fromFiles] });
      assert.equal(emitted.length, 1, `一次粘贴交出了 ${emitted.length} 个文件——会传两次、显示两块`);
      assert.match(emitted[0].name, /^粘贴图片-\d{14}\.png$/, "通用名的截图没改成带时刻的名字");
    });
  });
}

test("拖进 LeoComposer 的文件只处理一次：不冒泡到宿主页面的整页 drop 监听", async () => {
  await withDom(async ({ window, render, find, container }) => {
    const emitted = [];
    await render(LeoComposer, { value: "", onChange() {}, onAttachFiles: (files) => emitted.push(...files) });
    let pageDrops = 0;
    const onPageDrop = () => { pageDrops += 1; };
    window.addEventListener("drop", onPageDrop);
    try {
      const root = find("[data-oceanleo-leo-entry-root]");
      const file = smallFile("拖进来.pdf", 4096);
      await act(async () => {
        const event = new window.Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", {
          value: { types: ["Files"], items: [{ kind: "file", getAsFile: () => file }], files: [file] },
        });
        root.dispatchEvent(event);
      });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      assert.equal(emitted.length, 1, "一次拖拽应交出恰好一个文件");
      assert.equal(pageDrops, 0, "drop 冒泡到了整页监听，宿主会再交一遍");
      assert.ok(container);
    } finally {
      window.removeEventListener("drop", onPageDrop);
    }
  });
});

// ---------------------------------------------------------------- 压缩（P3）
//
// 分两层钉，因为这两层在 node 里能验到的东西不一样：
//
//   · 真 `image-compress.ts`：它的**不变量**——永远同时带回原图、只碰该碰的、
//     且在压不动的环境里绝不抛也绝不吞文件。jsdom 里 canvas 装不上，压缩必然走
//     「压不动」那条路，而那恰好就是要钉的那条：压缩失败绝不能让上传失败。
//   · 组件那一层：默认开、压缩期间先画上传中方块、输入框里不挂回执（2026-10-31）。
//     这一层需要「压缩真的发生过」，所以在第二个编译上下文里把 `./image-compress`
//     换成一个必压的桩（可用 `globalThis.__compressGate` 卡住）。

const { compressImageFile, compressImageFiles, savedBytes, isImageFile } = await load(
  "src/lib/upload/image-compress.ts",
);

function imageFile(name, bytes, type = "image/png") {
  return new File([new Uint8Array(bytes)], name, { type, lastModified: 1_700_000_000_000 });
}

test("压缩永远同时带回原图——没有「原图」这一份，「用原图」就无从谈起", async () => {
  const png = imageFile("大图.png", 2 * 1024 * 1024);
  const [outcome] = await compressImageFiles([png]);
  assert.equal(outcome.original, png, "原图没带回来");
  assert.ok(outcome.upload, "要传的那一份没给");
  assert.equal(outcome.originalBytes, png.size);
  // 这台机器上 canvas 装不上 ⇒ 压不动 ⇒ 必须原样放行，而不是抛或吞。
  if (!outcome.compressed) {
    assert.equal(outcome.upload, png, "压不动时没有原样放行——用户的文件被换掉了");
    assert.ok(outcome.skippedReason, "压不动却没说为什么");
  }
});

test("只碰该碰的：非图片、GIF、SVG、已经很小的，一律不动", async () => {
  const cases = [
    ["视频不碰", new File([new Uint8Array(4096)], "片子.mp4", { type: "video/mp4" })],
    // GIF 走 canvas 只会拿到第一帧，压完动图就死了。
    ["GIF 不碰", imageFile("动图.gif", 2 * 1024 * 1024, "image/gif")],
    // SVG 是矢量，重编码只会变大；网关另有 sanitize_svg。
    ["SVG 不碰", imageFile("图标.svg", 2 * 1024 * 1024, "image/svg+xml")],
    ["小图不碰", imageFile("图标.png", 4096)],
  ];
  for (const [label, file] of cases) {
    const outcome = await compressImageFile(file);
    assert.equal(outcome.compressed, false, `${label}：不该压却压了`);
    assert.equal(outcome.upload, file, `${label}：文件被换掉了`);
    assert.equal(outcome.original, file, `${label}：原图没带回来`);
    assert.ok(outcome.skippedReason, `${label}：跳过了却没说为什么`);
  }
  assert.equal(isImageFile(imageFile("a.png", 10)), true);
  assert.equal(
    isImageFile(new File([new Uint8Array(10)], "a.mp4", { type: "video/mp4" })),
    false,
  );
});

test("前后字节算得出来：一个都没压就是 0，不是 NaN", async () => {
  assert.equal(savedBytes([]), 0);
  assert.equal(
    savedBytes([
      { originalBytes: 4_200_000, uploadBytes: 900_000, compressed: true },
      { originalBytes: 1000, uploadBytes: 1000, compressed: false },
    ]),
    3_300_000,
  );
});

// 第二个编译上下文：压缩必成。被测的是组件这一层，不是压缩算法。
const compressStub = dataModule(`
  export const DEFAULT_MAX_EDGE = 4096;
  export const MIN_COMPRESS_BYTES = 512 * 1024;
  export const DEFAULT_QUALITY = 0.82;
  export function isImageFile(file){ return String(file?.type || "").startsWith("image/"); }
  export function scaleToMaxEdge(width, height){ return { width, height }; }
  export function savedBytes(outcomes){
    return outcomes.reduce((n, o) => n + (o.originalBytes - o.uploadBytes), 0);
  }
  export async function compressImageFile(file){ return (await compressImageFiles([file]))[0]; }
  export async function compressImageFiles(files){
    if (globalThis.__compressGate) await globalThis.__compressGate;
    return Array.from(files).map((file) => {
      if (!String(file.type || "").startsWith("image/")) {
        return { original: file, upload: file, compressed: false,
                 originalBytes: file.size, uploadBytes: file.size, skippedReason: "not-image" };
      }
      const upload = new File([new Uint8Array(1024)], file.name,
        { type: file.type, lastModified: file.lastModified });
      return { original: file, upload, compressed: true,
               originalBytes: file.size, uploadBytes: 1024, skippedReason: null };
    });
  }
`);

const loadCompressing = (path) =>
  compileModule(path, { ...STUBS, "./image-compress": compressStub }, OPTIONS).then(
    (url) => import(url),
  );

const squeezing = {
  LeoComposer: (await loadCompressing("src/shell/LeoComposer.tsx")).LeoComposer,
  InputCard: (await loadCompressing("src/shell/InputCard.tsx")).InputCard,
};

for (const [label, attachProp] of [
  ["LeoComposer", "onAttachFiles"],
  ["InputCard", "onFiles"],
]) {
  test(`压缩在 ${label} 上：默认开；压缩中先画上传中方块；输入框里不再挂压缩回执`, async () => {
    await withDom(async ({ render, html, paste }) => {
      const batches = [];
      await render(squeezing[label], {
        value: "",
        onChange() {},
        [attachProp]: (files) => batches.push(files),
      });

      // 压缩卡住的那一刻：文件还没交给宿主，但用户已经看得见一块上传中方块。
      let release;
      globalThis.__compressGate = new Promise((resolve) => { release = resolve; });
      const original = imageFile("截图.png", 4096);
      await paste("textarea", [original]);
      assert.equal(batches.length, 0, "压缩还没完就交出去了");
      assert.match(html(), /data-upload-tile="uploading"/, "压缩期间没有上传中方块");
      assert.equal(/正在压缩图片/.test(html()), false, "不许再另起一行「正在压缩图片…」");
      delete globalThis.__compressGate;
      await act(async () => { release(); await Promise.resolve(); await Promise.resolve(); });

      // 默认开：交出去的是压过的那一份，不是原图。
      assert.equal(batches.length, 1, "粘贴没把文件交给宿主");
      assert.equal(batches[0].length, 1);
      assert.notEqual(batches[0][0], original, "压缩默认开，交出去的却还是原图");
      assert.equal(batches[0][0].size, 1024);

      // 2026-10-31：输入框只显示方块，「已压缩：A → B · 用原图」回执撤掉。
      const shown = html();
      assert.equal(/data-upload-compression|用原图/.test(shown), false, "输入框里还挂着压缩回执");
      assert.equal(/data-upload-tile/.test(shown), false, "交出去之后压缩占位方块没撤");
    });
  });
}

// ---------------------------------------------------------------- 入口去重（2026-10-31「上传文件显示两次」）

const { filesFromTransfer, filesFromPaste } = await load("src/lib/upload/intake.ts");
const { withBusProgress } = await load("src/lib/upload/upload-tile.tsx");

test("items 给出了文件就不读 files：两个不同的 File、不同的 lastModified 也只算一个", () => {
  const a = new File([new Uint8Array(4096)], "image.png", { type: "image/png", lastModified: 111 });
  const b = new File([new Uint8Array(4096)], "image.png", { type: "image/png", lastModified: 222 });
  const picked = filesFromTransfer({ items: [{ kind: "file", getAsFile: () => a }], files: [b] });
  assert.equal(picked.length, 1, "一次粘贴被拆成了两个文件");
  assert.equal(picked[0], a, "应当用 items 给的那一个");
});

test("items 一个文件都没给时才退到 files（部分浏览器截图 items 为空）", () => {
  const f = new File([new Uint8Array(10)], "设计稿-v3.png", { type: "image/png" });
  const picked = filesFromTransfer({ items: [{ kind: "string", getAsFile: () => null }], files: [f] });
  assert.deepEqual(picked, [f]);
  assert.deepEqual(filesFromTransfer({ items: [], files: [] }), []);
});

test("一次粘多张通用名的图：按次序编 -1、-2；只粘一张不带序号；真名字原样保留", () => {
  const now = new Date(2026, 9, 31, 9, 8, 7);
  const shot = (lastModified) => new File([new Uint8Array(8)], "image.png", { type: "image/png", lastModified });
  const real = new File([new Uint8Array(8)], "设计稿-v3.png", { type: "image/png" });
  const many = filesFromPaste(
    { items: [shot(1), real, shot(2)].map((file) => ({ kind: "file", getAsFile: () => file })), files: [] },
    now,
  );
  assert.deepEqual(
    many.map((file) => file.name),
    ["粘贴图片-20261031090807-1.png", "设计稿-v3.png", "粘贴图片-20261031090807-2.png"],
  );
  const one = filesFromPaste({ items: [{ kind: "file", getAsFile: () => shot(3) }], files: [] }, now);
  assert.deepEqual(one.map((file) => file.name), ["粘贴图片-20261031090807.png"]);
});

test("总线读数按名一对一配给上传中的方块；宿主自己给了 progress 的不动", () => {
  const snap = halfwaySnapshot(4096);
  const other = halfwaySnapshot(8192);
  const own = halfwaySnapshot(1024);
  const out = withBusProgress(
    [
      { id: "1", name: "a.png", uploading: true },
      { id: "2", name: "a.png", uploading: true },
      { id: "3", name: "b.pdf", uploading: false },
      { id: "4", name: "c.pdf", uploading: true, progress: own },
    ],
    [
      { file: new File([], "a.png"), name: "a.png", snapshot: snap },
      { file: new File([], "c.pdf"), name: "c.pdf", snapshot: other },
    ],
  );
  assert.equal(out[0].progress, snap);
  assert.equal(out[1].progress, undefined, "一条读数只配一个方块");
  assert.equal(out[2].progress, undefined, "不在上传的不配");
  assert.equal(out[3].progress, own, "宿主给的 progress 被覆盖了");
});

// ---------------------------------------------------------------- 同一套字

test("格式化只有一套：一处叫「4.0 KB」，别处就不许叫「4K」", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(4096), "4.0 KB");
  assert.equal(formatBytes(20 * 1024 * 1024), "20 MB");
  assert.equal(formatDuration(1), "0:01", "1 秒以内显示 0:00 会让人以为卡住了");
  assert.equal(formatDuration(65_000), "1:05");
  assert.equal(formatDuration(3_930_000), "1:05:30");
});
