import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  export async function authed(path, init) {
    const res = await fetch("https://gateway.test" + path, {
      method: init && init.method,
      body: init && init.body,
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

function installFetch({ leoStatus = 200, leoBody = { reply: "在的。", task: null } } = {}) {
  calls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    if (call.url.includes("/v1/assistant/leo-turn")) {
      if (leoStatus !== 200) return jsonResponse(leoStatus, { detail: "no" });
      return jsonResponse(200, leoBody);
    }
    if (call.url.includes("/v1/agent/tasks")) {
      return jsonResponse(500, { detail: "card must not create tasks" });
    }
    return jsonResponse(200, { result: "面板里的结果" });
  };
}

function postsTo(path) {
  return calls.filter((call) => call.url.includes(path) && call.method === "POST");
}

async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderAssistant({ resetTranscript = true } = {}) {
  if (resetTranscript) window.localStorage.removeItem("oceanleo:leo-transcript:v1");
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

function historyPings() {
  let count = 0;
  const onHistory = () => {
    count += 1;
  };
  window.addEventListener("oceanleo:history-changed", onHistory);
  return {
    get count() {
      return count;
    },
    stop() {
      window.removeEventListener("oceanleo:history-changed", onHistory);
    },
  };
}

test("输入「你好」走 leo-turn，不建任务，也不说已经放进「我的任务」", async () => {
  installFetch({ leoBody: { reply: "在的。", task: null } });
  const view = await renderAssistant();
  const history = historyPings();
  try {
    await typeAndSend(view.host, "你好");
    const turns = postsTo("/v1/assistant/leo-turn");
    assert.equal(turns.length, 1);
    assert.equal(turns[0].body.site_id, "test-site");
    assert.equal(turns[0].body.text, "你好");
    assert.equal(turns[0].body.board_text, "");
    assert.deepEqual(turns[0].body.history, []);
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
    assert.match(view.host.textContent, /在的。/);
    assert.doesNotMatch(view.host.textContent, /已经放进「我的任务」/);
    assert.equal(history.count, 0);
    assert.equal(view.host.querySelector('a[href*="/history?task="]'), null);

    await typeAndSend(view.host, "在吗");
    const again = postsTo("/v1/assistant/leo-turn");
    assert.equal(again.length, 2);
    assert.equal(again[1].body.history.length, 2);
    assert.equal(again[1].body.history[0].role, "user");
    assert.equal(again[1].body.history[0].content, "你好");
    assert.equal(again[1].body.history[1].role, "leo");
    assert.equal(again[1].body.history[1].content, "在的。");
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
  } finally {
    history.stop();
    await view.cleanup();
  }
});

test("leo-turn 带回 task_id 时，卡片里是任务标题链接，不展开执行过程", async () => {
  installFetch({
    leoBody: {
      reply: "已经交给 OceanLeo agent。",
      task: {
        task_id: "task_abc",
        title: "产品介绍网站",
        href: "/history?task=task_abc",
      },
    },
  });
  const view = await renderAssistant();
  const history = historyPings();
  try {
    await typeAndSend(view.host, "帮我做一个产品介绍网站");
    assert.equal(postsTo("/v1/assistant/leo-turn").length, 1);
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
    const link = view.host.querySelector('a[href*="/history?task="]');
    assert.ok(link);
    assert.equal(link.getAttribute("href"), "/history?task=task_abc");
    assert.equal((link.textContent || "").trim(), "产品介绍网站");
    assert.equal(link.getAttribute("target"), null);
    assert.equal(history.count, 1);
    assert.equal(view.host.querySelector("[data-task-messages]"), null);
  } finally {
    history.stop();
    await view.cleanup();
  }
});

test("输入「翻译」且板上有字时，不请求 leo-turn，也不建任务", async () => {
  installFetch();
  const view = await renderAssistant();
  try {
    await openWithText("一段需要处理的原文");
    await typeAndSend(view.host, "翻译");
    assert.equal(postsTo("/v1/assistant/leo-turn").length, 0);
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
    assert.ok(
      calls.some(
        (call) => call.url.includes("/v1/assistant/transform") && call.body?.action === "translate",
      ),
    );
    assert.doesNotMatch(view.host.textContent, /已经放进「我的任务」/);
  } finally {
    await view.cleanup();
  }
});

test("leo-turn 失败时说没说成，不说已经放进「我的任务」", async () => {
  installFetch({ leoStatus: 500 });
  const view = await renderAssistant();
  const history = historyPings();
  try {
    await typeAndSend(view.host, "帮我做一个产品介绍网站");
    assert.equal(postsTo("/v1/assistant/leo-turn").length, 1);
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
    assert.match(view.host.textContent, /没说成。/);
    assert.doesNotMatch(view.host.textContent, /已经放进「我的任务」/);
    assert.equal(history.count, 0);
  } finally {
    history.stop();
    await view.cleanup();
  }
});

test("收起只留最新一句 leo，放大后能翻到前面的话和链接，刷新后还在", async () => {
  let replyCount = 0;
  installFetch();
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    replyCount += 1;
    if (replyCount === 1) {
      return jsonResponse(200, { reply: "第一句", task: null });
    }
    return jsonResponse(200, {
      reply: "第二句",
      task: { task_id: "task_2", title: "后面的任务", href: "/history?task=task_2" },
    });
  };
  const first = await renderAssistant();
  try {
    await typeAndSend(first.host, "你好");
    calls.length = 0;
    await typeAndSend(first.host, "帮我做一个产品介绍网站");
    assert.match(first.host.textContent, /第二句/);
    assert.doesNotMatch(first.host.textContent, /第一句/);
    assert.equal(first.host.querySelector("[data-leo-transcript]"), null);
    const collapsedLink = first.host.querySelector('a[href="/history?task=task_2"]');
    assert.ok(collapsedLink);
    assert.equal((collapsedLink.textContent || "").trim(), "后面的任务");

    const grow = first.host.querySelector('[aria-label="放大"]');
    await act(async () => {
      grow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const list = first.host.querySelector("[data-leo-transcript]");
    assert.ok(list);
    assert.match(list.textContent, /你好/);
    assert.match(list.textContent, /第一句/);
    assert.match(list.textContent, /第二句/);
    assert.match(list.textContent, /后面的任务/);
  } finally {
    await first.cleanup();
  }

  const second = await renderAssistant({ resetTranscript: false });
  try {
    assert.match(second.host.textContent, /第二句/);
    assert.doesNotMatch(second.host.textContent, /第一句/);
    const saved = JSON.parse(window.localStorage.getItem("oceanleo:leo-transcript:v1"));
    assert.equal(saved.length, 4);
    assert.equal(saved[0].role, "user");
    assert.equal(saved[3].role, "leo");
    assert.equal(saved[3].task.href, "/history?task=task_2");
  } finally {
    await second.cleanup();
  }
});

test("Shell 顶栏不再有第二颗 leo，门户用 launcher，首页隐藏浮动按钮", () => {
  const shell = readFileSync(
    "/root/projects/oceanleo-ui/src/shell/cloud-computer/ShellTaskView.tsx",
    "utf8",
  );
  assert.equal(shell.includes("data-oceanleo-cc-leo-toggle"), false);
  assert.match(shell, /用对话界面继续/);
  assert.match(shell, /结束 Shell/);

  const chrome = readFileSync("/root/projects/oceanleo/app/_components/root-chrome.tsx", "utf8");
  assert.match(chrome, /leo-launcher/);
  assert.doesNotMatch(chrome, /siteId="home"/);
  assert.doesNotMatch(chrome, /<LeoAssistant/);

  const launcher = readFileSync("/root/projects/oceanleo/app/_components/leo-launcher.tsx", "utf8");
  assert.match(launcher, /siteId="oceanleo"/);
  assert.match(launcher, /docType="doc"/);
  assert.match(launcher, /hideFloatingButton=\{leoFloatingButtonHidden\(pathname\)\}/);
  assert.doesNotMatch(launcher, /OceanLeo agent/);
  const hidden = leoFloatingButtonHiddenFrom(launcher);
  assert.equal(hidden("/"), true);
  assert.equal(hidden("/settings"), false);
});

function leoFloatingButtonHiddenFrom(source) {
  const match = source.match(
    /export function leoFloatingButtonHidden\(pathname: string \| null\): boolean \{\r?\n([\s\S]*?)\r?\n\}/,
  );
  assert.ok(match, "leoFloatingButtonHidden");
  return new Function("pathname", match[1]);
}
