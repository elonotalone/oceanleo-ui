import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ============================================================================
// W04（editors-and-shell-0924）· 网关缺 leo 路由时说实话
//   api.dev.oceanleo.com / api.oceanleo.com 今天对 leo-transcript / leo-sessions /
//   leo-turn / leo-turn/stream 一律回 404 {"detail":"Not Found"}（只有 transform 在）。
//   · 记录区说「Leo 服务版本过旧，暂时不能保存对话」，不说「记录暂时不可用」；
//   · 头部控件与新网关上完全相同，会话选择器与「+」给出同样的原因，不静默消失；
//   · 发出去的话说「Leo 服务版本过旧，暂时不能对话」；stream 路由缺失时先回落 /leo-turn；
//   · 记录级 404（leo_session_not_found）、401、断网维持原有语义。
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

const OUTDATED = "Leo 服务版本过旧，暂时不能保存对话";
const OUTDATED_TURN = "Leo 服务版本过旧，暂时不能对话";
const MISLEADING = "记录暂时不可用";
const NOW = "2026-09-24T08:00:00Z";

const calls = [];
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
const routeMissing = () => jsonResponse(404, { detail: "Not Found" });

/**
 * gateway：
 *   "current"   —— 新网关（api.oceanbizs.com 今天的样子）；
 *   "outdated"  —— 四条 leo 路由都 404 Not Found，只有 transform / board（槽位与生产网关今天的样子）；
 *   "no-stream" —— 有 /leo-turn 但没有 /leo-turn/stream（v0.226–v0.228.1 的网关）。
 */
function installGateway({ gateway = "current", token = "test-token", transcript = null, offline = false } = {}) {
  calls.length = 0;
  globalThis.__w04Token = token;
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    if (offline) throw new TypeError("Failed to fetch");
    if (call.url.includes("/v1/assistant/transform")) return jsonResponse(200, { result: "面板里的结果" });
    if (call.url.includes("/v1/assistant/board")) return jsonResponse(200, { question: "想要什么风格？", options: [] });
    const outdated = gateway === "outdated";
    if (call.url.includes("/v1/assistant/leo-sessions")) {
      if (outdated) return routeMissing();
      if (call.method === "POST") {
        return jsonResponse(200, { session: { id: "s-new", title: "", created_at: NOW, updated_at: NOW, entry_count: 0 } });
      }
      return jsonResponse(200, { sessions: [{ id: "s1", title: "之前的会话", created_at: NOW, updated_at: NOW, entry_count: 2 }] });
    }
    if (call.url.includes("/v1/assistant/leo-transcript")) {
      if (outdated) return routeMissing();
      if (transcript) return jsonResponse(transcript.status, transcript.body);
      return jsonResponse(200, { entries: [] });
    }
    if (call.url.includes("/v1/assistant/leo-turn/stream")) {
      if (outdated || gateway === "no-stream") return routeMissing();
      return jsonResponse(200, {});
    }
    if (call.url.includes("/v1/assistant/leo-turn")) {
      if (outdated) return routeMissing();
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
      });
    }
    return routeMissing();
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

function titleBar(scope) {
  const bar = scope.querySelector("[data-leo-panel] .cursor-move");
  assert.ok(bar, "leo 标题栏");
  return bar;
}

function headerSignature(scope) {
  return [...titleBar(scope).querySelectorAll("button")].map(
    (button) => button.getAttribute("aria-label") || (button.hasAttribute("aria-expanded") ? "会话选择器" : "?"),
  );
}

function sessionPicker(scope) {
  return [...titleBar(scope).querySelectorAll("button")].find(
    (button) => !button.getAttribute("aria-label") && button.hasAttribute("aria-expanded"),
  );
}

async function withLeo(options, run) {
  installGateway(options);
  const view = await mount(React.createElement(LeoAssistant, { siteId: "ppt", docType: "ppt" }));
  try {
    await openPanel();
    await run(view);
  } finally {
    await view.cleanup();
  }
}

test("旧网关：记录区明说「Leo 服务版本过旧，暂时不能保存对话」，不再说「记录暂时不可用」", async () => {
  await withLeo({ gateway: "outdated" }, async (view) => {
    const transcript = view.host.querySelector("[data-leo-transcript]");
    assert.ok(transcript);
    assert.match(transcript.textContent, new RegExp(OUTDATED));
    assert.doesNotMatch(view.host.textContent, new RegExp(MISLEADING));
  });
});

test("旧网关：头部控件与新网关完全相同；会话选择器与「+」给出同一原因，而不是消失", async () => {
  let current = null;
  await withLeo({ gateway: "current" }, async (view) => {
    current = headerSignature(view.host);
  });
  assert.deepEqual(current, ["会话选择器", "新会话", "放大", "停用", "关闭"]);

  await withLeo({ gateway: "outdated" }, async (view) => {
    assert.deepEqual(headerSignature(view.host), current, "旧网关的头部控件");
    const plus = titleBar(view.host).querySelector('[aria-label="新会话"]');
    assert.equal(plus.disabled, true, "「+」可见但不可点");
    assert.equal(plus.getAttribute("title"), OUTDATED);
    const picker = sessionPicker(view.host);
    await act(async () => {
      picker.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const reason = document.querySelector("[data-leo-sessions-unavailable]");
    assert.ok(reason, "会话选择器打开后说明原因");
    assert.match(reason.textContent, new RegExp(OUTDATED));
    assert.equal(calls.filter((c) => c.method === "POST" && c.url.endsWith("/v1/assistant/leo-sessions")).length, 0);
  });
});

test("旧网关：说一句话 → 明说「暂时不能对话」，并且先试过不流式的 /leo-turn", async () => {
  await withLeo({ gateway: "outdated" }, async (view) => {
    calls.length = 0;
    await typeAndSend(view.host, "你好");
    const stream = calls.find((c) => c.method === "POST" && c.url.endsWith("/v1/assistant/leo-turn/stream"));
    const plain = calls.find((c) => c.method === "POST" && c.url.endsWith("/v1/assistant/leo-turn"));
    assert.ok(stream, "先走流式路由");
    assert.ok(plain, "流式路由缺失时回落 /leo-turn");
    const error = view.host.querySelector("[data-leo-turn-error]");
    assert.ok(error, "这一轮没说成要明说");
    assert.match(error.textContent, new RegExp(OUTDATED_TURN));
    assert.doesNotMatch(view.host.textContent, new RegExp(MISLEADING));
    assert.doesNotMatch(view.host.textContent, /你好/, "没说成的那句撤掉");
  });
});

test("旧网关上面板动词照常可用（transform 路由在）", async () => {
  installGateway({ gateway: "outdated" });
  const view = await mount(React.createElement(LeoAssistant, { siteId: "ppt", docType: "ppt" }));
  try {
    await openPanel({ text: "一段需要处理的原文", source: "selection", anchor: ANCHOR });
    await typeAndSend(view.host, "翻译");
    assert.ok(calls.some((c) => c.url.includes("/v1/assistant/transform") && c.body?.action === "translate"));
    assert.match(view.host.textContent, /面板里的结果/);
  } finally {
    await view.cleanup();
  }
});

test("只有 /leo-turn、没有 /leo-turn/stream 的网关：回落后这一轮照常说成", async () => {
  await withLeo({ gateway: "no-stream" }, async (view) => {
    await typeAndSend(view.host, "你好");
    assert.equal(view.host.querySelector("[data-leo-turn-error]"), null);
    assert.match(view.host.querySelector("[data-leo-transcript]").textContent, /在的。/);
  });
});

test("记录级 404（leo_session_not_found）不是旧网关：仍是可重试的「记录暂时不可用」", async () => {
  await withLeo({ transcript: { status: 404, body: { detail: "leo_session_not_found" } } }, async (view) => {
    const transcript = view.host.querySelector("[data-leo-transcript]");
    assert.match(transcript.textContent, new RegExp(MISLEADING));
    assert.doesNotMatch(transcript.textContent, new RegExp(OUTDATED));
    assert.ok([...transcript.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "重试"));
  });
});

test("未登录维持原语义：记录区「登录后 leo 才能记住对话」，头部控件不变，选择器说同一句", async () => {
  await withLeo({ token: null }, async (view) => {
    assert.ok(view.host.querySelector("[data-leo-transcript-anonymous]"));
    assert.deepEqual(headerSignature(view.host), ["会话选择器", "新会话", "放大", "停用", "关闭"]);
    const plus = titleBar(view.host).querySelector('[aria-label="新会话"]');
    assert.equal(plus.disabled, true);
    assert.equal(plus.getAttribute("title"), "登录后 leo 才能记住对话");
    assert.doesNotMatch(view.host.textContent, new RegExp(OUTDATED));
  });
});

test("断网维持原语义：不说版本过旧", async () => {
  await withLeo({ offline: true }, async (view) => {
    assert.match(view.host.querySelector("[data-leo-transcript]").textContent, new RegExp(MISLEADING));
    assert.doesNotMatch(view.host.textContent, new RegExp(OUTDATED));
    await typeAndSend(view.host, "你好");
    assert.match(view.host.querySelector("[data-leo-turn-error]").textContent, /网络错误/);
  });
});
