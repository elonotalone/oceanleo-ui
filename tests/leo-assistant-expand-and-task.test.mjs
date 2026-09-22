import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/",
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
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const name of ["attachEvent", "detachEvent"]) {
  if (typeof window.HTMLElement.prototype[name] !== "function") {
    window.HTMLElement.prototype[name] = function attachEventPolyfill() {};
  }
}

const reactNs = await import("react");
const React = reactNs.createElement ? reactNs : reactNs.default;
const { act } = reactNs.act ? reactNs : React;
const { createRoot } = await import("react-dom/client");

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      return String(value).replace(/\\{(\\w+)\\}/g, (_, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : "{" + key + "}",
      );
    };
  }
`);
const agentStubUrl = dataModule(`
  export async function createTask(body) {
    const res = await fetch("https://gateway.test/v1/agent/tasks", {
      method: "POST",
      body: JSON.stringify({
        prompt: body.prompt,
        created_by: body.created_by,
        site_id: body.siteId || "",
        mode: body.mode || "agent",
      }),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) return { ok: false, error: "fail", status: res.status };
    return { ok: true, data };
  }
`);

const {
  LeoAssistant,
  leoTypedWorkStaysInPanel,
} = await import(
  await compileModule("src/shell/LeoAssistant.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "../lib/agent": agentStubUrl,
  })
);

const calls = [];

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function installFetch({ taskStatus = 200 } = {}) {
  calls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    if (call.url.includes("/v1/agent/tasks")) {
      if (taskStatus !== 200) return jsonResponse(taskStatus, { detail: "no" });
      return jsonResponse(200, { task_id: "task_leo_1", status: "queued", mode: "agent" });
    }
    return jsonResponse(200, { result: "面板里的结果" });
  };
}

function taskPosts() {
  return calls.filter((call) => call.url.includes("/v1/agent/tasks") && call.method === "POST");
}

async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function buttonNamed(host, label) {
  return [...host.querySelectorAll("button")].find((node) => (node.textContent || "").trim() === label) || null;
}

async function renderAssistant() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(LeoAssistant, { siteId: "test-site" }));
  });
  await settle();
  return {
    host,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function openWithText(text) {
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent("oceanleo:open-leo", {
        detail: { text, source: "selection" },
      }),
    );
  });
  await settle();
}

async function typeAndSend(host, value) {
  const input = host.querySelector('input[type="text"]');
  const send = host.querySelector('button[type="submit"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  assert.equal(send.disabled, false);
  await act(async () => {
    send.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

test("输入分界：五类和现有快捷动作留在面板，其他句子不留", () => {
  for (const sample of [
    "翻译",
    "精简",
    "总结",
    "解释",
    "改写",
    "扩充",
    "润色",
    "请翻译成英文",
    "帮我总结一下",
    "把这段改写得更正式",
    "翻译一下这段",
  ]) {
    assert.equal(leoTypedWorkStaysInPanel(sample), true, sample);
  }
  for (const sample of [
    "在新加坡那台电脑上查看磁盘空间",
    "部署翻译服务",
    "翻译并部署到生产环境",
    "帮我把网站首页改成深色然后发布",
    "",
  ]) {
    assert.equal(leoTypedWorkStaysInPanel(sample), false, sample);
  }
});

test("放大后面板是四边各 3% 的矩形，再按一次回到原来的宽高", async () => {
  const view = await renderAssistant();
  try {
    const frame = view.host.querySelector("[data-leo-panel]");
    const grow = view.host.querySelector('[aria-label="放大"]');
    assert.equal(frame.getAttribute("data-leo-shape"), "rect");
    assert.equal(frame.getAttribute("data-leo-expanded"), "0");
    assert.equal(frame.style.width, "384px");
    assert.equal(frame.style.height, "560px");
    assert.equal(view.host.querySelector("button.fixed.bottom-5"), null);
    assert.match(frame.querySelector(".font-semibold").textContent, /\bleo\b/);
    assert.doesNotMatch(view.host.textContent, /OceanLeo agent/);

    await act(async () => {
      grow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(frame.getAttribute("data-leo-expanded"), "1");
    assert.equal(frame.getAttribute("data-leo-shape"), "rect");
    assert.equal(frame.style.left, "3%");
    assert.equal(frame.style.top, "3%");
    assert.equal(frame.style.width, "94%");
    assert.equal(frame.style.height, "94%");
    assert.equal(frame.style.right, "");
    assert.equal(frame.style.bottom, "");
    assert.match(frame.className, /rounded-2xl/);
    assert.doesNotMatch(frame.className, /rounded-full/);
    assert.equal(view.host.querySelector("button.fixed.bottom-5"), null);
    assert.equal((grow.textContent || "").trim(), "放大");

    await act(async () => {
      grow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(frame.getAttribute("data-leo-expanded"), "0");
    assert.equal(frame.style.width, "384px");
    assert.equal(frame.style.height, "560px");
    assert.equal(frame.getAttribute("data-leo-shape"), "rect");
    assert.equal(view.host.querySelector("button.fixed.bottom-5"), null);
  } finally {
    await view.cleanup();
  }
});

test("快捷翻译不发任务；其他句子 POST /v1/agent/tasks 且 created_by 为 leo", async () => {
  installFetch();
  const view = await renderAssistant();
  try {
    await openWithText("一段需要处理的原文");
    const translate = buttonNamed(view.host, "翻译");
    assert.ok(translate);
    await act(async () => {
      translate.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    assert.equal(taskPosts().length, 0);
    assert.ok(calls.some((call) => call.url.includes("/v1/assistant/transform") && call.body?.action === "translate"));

    const sentence = "在新加坡那台电脑上查看磁盘空间";
    await typeAndSend(view.host, sentence);
    const posts = taskPosts();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.prompt, sentence);
    assert.equal(posts[0].body.created_by, "leo");
    assert.match(view.host.textContent, /已经放进「我的任务」/);
    assert.doesNotMatch(view.host.textContent, /没建成/);

    const before = taskPosts().length;
    await typeAndSend(view.host, "请翻译成英文");
    assert.equal(taskPosts().length, before);
    assert.ok(
      calls.some(
        (call) =>
          call.url.includes("/v1/assistant/transform") &&
          call.body?.action === "translate" &&
          call.body?.instruction === "请翻译成英文",
      ),
    );
  } finally {
    await view.cleanup();
  }
});

test("建任务失败时说没建成，不假装已经有任务", async () => {
  installFetch({ taskStatus: 500 });
  const view = await renderAssistant();
  try {
    await openWithText("一段需要处理的原文");
    await typeAndSend(view.host, "在新加坡那台电脑上查看磁盘空间");
    assert.equal(taskPosts().length, 1);
    assert.equal(taskPosts()[0].body.created_by, "leo");
    assert.match(view.host.textContent, /没建成/);
    assert.doesNotMatch(view.host.textContent, /已经放进「我的任务」/);
  } finally {
    await view.cleanup();
  }
});
