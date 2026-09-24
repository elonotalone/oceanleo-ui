import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ============================================================================
// W04（editors-and-shell-0924）· 全站同一个 leo
//   1. siteId 口径：子站 layout 的 6 个历史别名一律换成 TSV key，请求里带的是 TSV key；
//   2. 任意 siteId 渲染出的头部控件集合完全相同；
//   3. 同一文档挂两次只出现一个面板；壳挂载（LeoShellMount）优先于 layout 旧写法。
// jsdom 取自 `fabric/node` 自带那份，写法与 `leo-assistant-expand-and-task.test.mjs` 同源。
// ============================================================================

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://ppt.oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  CustomEvent: window.CustomEvent,
  localStorage: window.localStorage,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactNs = await import("react");
const React = reactNs.createElement ? reactNs : reactNs.default;
const { act } = reactNs.act ? reactNs : React;
const { createRoot } = await import("react-dom/client");

// authed 替身与真实现同形：没 token 不发请求（401）；失败时 error 取 detail 字符串，否则 `HTTP <status>`。
const agentStubUrl = dataModule(`
  export async function authed(path, init) {
    if (!globalThis.__w04Token) return { ok: false, error: "未登录", status: 401 };
    let res;
    try {
      res = await fetch("https://gateway.test" + path, { method: (init && init.method) || "GET", body: init && init.body });
    } catch {
      return { ok: false, error: "网络错误", status: 0 };
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      return { ok: false, error: data && typeof data.detail === "string" ? data.detail : "HTTP " + res.status, status: res.status };
    }
    return { ok: true, data };
  }
`);
const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");
const authClientStubUrl = dataModule("export async function accessToken(){ return globalThis.__w04Token || null; }");
const authConfigStubUrl = dataModule('export const GATEWAY_BASE = "https://gateway.test";');
// 两种相对写法都给：LeoAssistant（src/shell/）与 LeoShellMount（src/shell/leo/）共用一套编译产物。
const STUBS = {
  "../i18n/ui/useUI": uiStubUrl,
  "../../i18n/ui/useUI": uiStubUrl,
  "../lib/agent": agentStubUrl,
  "../../lib/agent": agentStubUrl,
  "../lib/auth/client": authClientStubUrl,
  "../../lib/auth/client": authClientStubUrl,
  "../lib/auth/config": authConfigStubUrl,
  "../../lib/auth/config": authConfigStubUrl,
};

const { LeoAssistant } = await import(await compileModule("src/shell/LeoAssistant.tsx", STUBS));

/** scripts/oceanleo-sites.tsv 的全部 site key（2026-09-24）。 */
const TSV_KEYS = [
  "agent", "website", "prompt", "ecommerce", "ppt", "excel", "word", "converter", "aihuman",
  "image", "video", "resume", "bizdev", "logo", "interior", "chat", "threed", "music",
  "meeting", "paper", "notebook", "law", "study", "edu", "novel", "script", "design", "make",
  "search", "finance", "med", "travel", "game", "aitools", "asset", "talent", "oceanleo",
];
/** 子站 app/layout.tsx 里仍在发的 6 个历史 siteId → TSV key。 */
const LEGACY_ALIASES = {
  leostudio: "ecommerce",
  leoslides: "ppt",
  leosheet: "excel",
  leoconvert: "converter",
  leohuman: "aihuman",
  studio: "video",
};

const calls = [];
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
const NOW = "2026-09-24T08:00:00Z";

function installGateway() {
  calls.length = 0;
  globalThis.__w04Token = "test-token";
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    if (call.url.includes("/v1/assistant/leo-sessions")) {
      if (call.method === "POST") {
        return jsonResponse(200, { session: { id: "s-new", title: "", created_at: NOW, updated_at: NOW, entry_count: 0 } });
      }
      return jsonResponse(200, { sessions: [{ id: "s1", title: "之前的会话", created_at: NOW, updated_at: NOW, entry_count: 2 }] });
    }
    if (call.url.includes("/v1/assistant/leo-transcript")) return jsonResponse(200, { entries: [] });
    if (call.url.includes("/v1/assistant/leo-turn/stream")) {
      // 非 SSE 的 200：客户端按旧合同回落到 /leo-turn。
      return jsonResponse(200, {});
    }
    if (call.url.includes("/v1/assistant/leo-turn")) {
      const text = call.body?.text ?? "";
      return jsonResponse(200, {
        reply: "在的。",
        action: "reply",
        entries: [
          { id: `u-${calls.length}`, role: "user", text },
          { id: `l-${calls.length}`, role: "leo", text: "在的。", task: null },
        ],
        task: null,
        error: "",
        session_id: "s1",
      });
    }
    if (call.url.includes("/v1/assistant/transform")) return jsonResponse(200, { result: "面板里的结果" });
    if (call.url.includes("/v1/assistant/board")) return jsonResponse(200, { question: "想要什么风格？", options: ["简洁"] });
    return jsonResponse(404, { detail: "Not Found" });
  };
}

async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  await settle();
  return {
    host,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      await settle(2);
    },
  };
}

const ANCHOR = { left: 460, top: 600, right: 500, bottom: 628, width: 40, height: 28 };

async function openPanel(detail = { toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } }) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("oceanleo:open-leo", { detail }));
  });
  await settle();
}

async function closePanel() {
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await settle(2);
}

async function typeAndSend(scope, value) {
  const input = scope.querySelector("textarea[data-leo-composer]");
  const send = [...scope.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "发送");
  assert.ok(input, "composer textarea");
  assert.ok(send, "send button");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => {
    send.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

/** 标题栏里可点的控件：aria-label；没有 aria-label、带 aria-expanded 的是会话选择器。 */
function headerSignature(scope) {
  const bar = scope.querySelector("[data-leo-panel] .cursor-move");
  assert.ok(bar, "leo 标题栏");
  return [...bar.querySelectorAll("button")].map(
    (button) => button.getAttribute("aria-label") || (button.hasAttribute("aria-expanded") ? "会话选择器" : "?"),
  );
}

function panels() {
  return [...document.querySelectorAll("[data-leo-panel]")];
}

test("canonicalLeoSiteId：6 个历史别名换成 TSV key，TSV key 与未知值原样返回", async () => {
  const { canonicalLeoSiteId } = await import(await compileModule("src/shell/leo/leo-site-registry.ts"));
  for (const [alias, key] of Object.entries(LEGACY_ALIASES)) {
    assert.equal(canonicalLeoSiteId(alias), key, alias);
  }
  for (const key of TSV_KEYS) assert.equal(canonicalLeoSiteId(key), key, key);
  assert.equal(canonicalLeoSiteId("somewhere-new"), "somewhere-new");
  assert.equal(canonicalLeoSiteId("  leoslides "), "ppt");
  assert.equal(canonicalLeoSiteId("constructor"), "constructor");
  assert.equal(canonicalLeoSiteId(undefined), "");
});

test("任意 siteId（37 个 TSV key + 6 个别名）：头部控件集合完全相同，leo-turn 带的是 TSV key", async () => {
  installGateway();
  let reference = null;
  for (const siteId of [...TSV_KEYS, ...Object.keys(LEGACY_ALIASES)]) {
    const view = await mount(React.createElement(LeoAssistant, { siteId }));
    try {
      await openPanel();
      const signature = headerSignature(view.host);
      if (!reference) reference = signature;
      assert.deepEqual(signature, reference, `${siteId} 的头部控件`);
      calls.length = 0;
      await typeAndSend(view.host, "你好");
      const turn = calls.find((c) => c.method === "POST" && /\/v1\/assistant\/leo-turn$/.test(c.url));
      assert.ok(turn, `${siteId} 发出了 leo-turn`);
      assert.equal(turn.body.site_id, LEGACY_ALIASES[siteId] ?? siteId, `${siteId} 的 site_id`);
      await closePanel();
    } finally {
      await view.cleanup();
    }
  }
  assert.deepEqual(reference, ["会话选择器", "新会话", "放大", "停用", "关闭"]);
});

async function askLeoQuestion(scope) {
  const ask = [...scope.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "让 leo 提问");
  assert.ok(ask, "「让 leo 提问」按钮");
  await act(async () => {
    ask.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
  const call = calls.find((c) => c.url.includes("/v1/assistant/board"));
  assert.ok(call, "提问走 /v1/assistant/board");
  return call;
}

test("别名站的面板动词、提问与新建会话也带 TSV key（leoslides → ppt）", async () => {
  installGateway();
  const view = await mount(React.createElement(LeoAssistant, { siteId: "leoslides", docType: "ppt" }));
  try {
    await openPanel({ text: "一段需要处理的原文", source: "selection", anchor: ANCHOR });
    const board = await askLeoQuestion(view.host);
    assert.equal(board.body.site_id, "ppt");
    assert.equal(board.body.doc_type, "ppt");
    await typeAndSend(view.host, "翻译");
    const transform = calls.find((c) => c.url.includes("/v1/assistant/transform"));
    assert.ok(transform, "动词走 transform");
    assert.equal(transform.body.site_id, "ppt");
    const plus = view.host.querySelector('[aria-label="新会话"]');
    await act(async () => {
      plus.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const created = calls.find((c) => c.method === "POST" && c.url.endsWith("/v1/assistant/leo-sessions"));
    assert.ok(created, "新建会话");
    assert.equal(created.body.site_id, "ppt");
  } finally {
    await view.cleanup();
  }
});

test("同一文档挂两次旧写法：只有一个面板，打开只拉一次记录", async () => {
  installGateway();
  const first = await mount(React.createElement(LeoAssistant, { siteId: "leoslides", docType: "ppt" }));
  const second = await mount(React.createElement(LeoAssistant, { siteId: "ppt", docType: "ppt" }));
  try {
    assert.equal(panels().length, 1, "挂载后只有一个面板");
    calls.length = 0;
    await openPanel();
    assert.equal(panels().length, 1, "打开后仍只有一个面板");
    const gets = calls.filter((c) => c.method === "GET" && c.url.includes("/v1/assistant/leo-transcript"));
    assert.equal(gets.length, 1, "记录只拉一次");
    // 先来的那个在用；它卸载后另一个接手，页面上仍有 leo。
    assert.ok(first.host.querySelector("[data-leo-panel]"));
    await first.cleanup();
    assert.equal(panels().length, 1, "先来的卸载后另一个接手");
    assert.ok(second.host.querySelector("[data-leo-panel]"));
  } finally {
    await second.cleanup();
  }
  assert.equal(panels().length, 0);
});

test("壳挂载优先：先 layout 后壳、先壳后 layout、同一次渲染里并排，都只剩壳那一个", async () => {
  installGateway();
  const { LeoShellMount } = await import(await compileModule("src/shell/leo/LeoShellMount.tsx", STUBS));
  const layoutEl = () => React.createElement(LeoAssistant, { siteId: "leoslides", docType: "ppt" });
  const shellEl = () => React.createElement(LeoShellMount, { siteKey: "ppt" });

  // 1. layout 先挂，壳后到：layout 让位。
  {
    const layout = await mount(layoutEl());
    assert.equal(panels().length, 1);
    const shell = await mount(shellEl());
    try {
      assert.equal(panels().length, 1, "壳到了之后仍只有一个面板");
      assert.ok(shell.host.querySelector("[data-leo-panel]"), "留下的是壳那一个");
      assert.equal(layout.host.querySelector("[data-leo-panel]"), null, "layout 旧写法让位");
      assert.equal(shell.host.querySelector("[data-leo-mount]").getAttribute("data-leo-mount"), "shell");
      await openPanel();
      await typeAndSend(shell.host, "你好");
      const turn = calls.find((c) => c.method === "POST" && /\/v1\/assistant\/leo-turn$/.test(c.url));
      assert.equal(turn.body.site_id, "ppt");
      await closePanel();
      // 壳卸载（例如换到不用 AppShell 的页面）：layout 那一个接手。
      await shell.cleanup();
      assert.equal(panels().length, 1);
      assert.ok(layout.host.querySelector("[data-leo-panel]"));
    } finally {
      await shell.cleanup();
      await layout.cleanup();
    }
  }

  // 2. 壳先挂，layout 后到：layout 渲染 null。
  {
    const shell = await mount(shellEl());
    const layout = await mount(layoutEl());
    try {
      assert.equal(panels().length, 1);
      assert.ok(shell.host.querySelector("[data-leo-panel]"));
      assert.equal(layout.host.querySelector("[data-leo-panel]"), null);
    } finally {
      await layout.cleanup();
      await shell.cleanup();
    }
  }

  // 3. 子站 layout 的真实形状：同一次渲染里 <SiteShell>（内含壳）与 <LeoAssistant> 并排。
  {
    const page = await mount(
      React.createElement(
        React.Fragment,
        null,
        React.createElement("main", { "data-site-shell": "" }, shellEl()),
        layoutEl(),
      ),
    );
    try {
      assert.equal(panels().length, 1, "并排挂载只出一个面板");
      assert.ok(page.host.querySelector("[data-site-shell] [data-leo-panel]"), "是壳里那一个");
    } finally {
      await page.cleanup();
    }
  }
  assert.equal(panels().length, 0);
});

test("LeoShellMount 不带 docType 时取该站 layout 原来的 docType（ppt → ppt）", async () => {
  installGateway();
  const { LeoShellMount } = await import(await compileModule("src/shell/leo/LeoShellMount.tsx", STUBS));
  const view = await mount(React.createElement(LeoShellMount, { siteKey: "ppt" }));
  try {
    await openPanel({ text: "一段需要处理的原文", source: "selection", anchor: ANCHOR });
    const board = await askLeoQuestion(view.host);
    assert.equal(board.body.site_id, "ppt");
    assert.equal(board.body.doc_type, "ppt");
  } finally {
    await view.cleanup();
  }
});
