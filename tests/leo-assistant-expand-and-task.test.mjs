import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));

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

const ANCHOR = { left: 460, top: 600, right: 500, bottom: 628, width: 40, height: 28 };

function installFetch({
  leoStatus = 200,
  leoBody = { reply: "在的。", action: "reply", entries: null, task: null, error: "" },
  transcriptStatus = 200,
  transcriptEntries = [],
} = {}) {
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
      const body = { ...leoBody };
      if (!Array.isArray(body.entries)) {
        // 默认照合同 I4：entries 是这一轮新增的两条（用户 + leo）。
        body.entries = [
          { id: `srv-u-${calls.length}`, role: "user", text: call.body?.text ?? "" },
          { id: `srv-l-${calls.length}`, role: "leo", text: body.reply ?? "", task: body.task ?? null },
        ];
      }
      return jsonResponse(200, body);
    }
    if (call.url.includes("/v1/assistant/leo-transcript")) {
      if (call.method === "DELETE") return jsonResponse(200, { ok: true });
      if (transcriptStatus !== 200) return jsonResponse(transcriptStatus, { detail: "no" });
      return jsonResponse(200, { entries: transcriptEntries });
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

async function openPanel(detail = { text: "一段需要处理的原文", source: "selection" }) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("oceanleo:open-leo", { detail }));
  });
  await settle();
}

async function typeAndSend(host, value) {
  const input = host.querySelector("textarea[data-leo-composer]");
  const send = [...host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "发送");
  assert.ok(input, "composer textarea");
  assert.ok(send, "send button");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
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

test("带锚点打开：面板底边在锚点之上 8px、右对齐，发送键不被盖住", async () => {
  installFetch();
  const view = await renderAssistant();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    const frame = view.host.querySelector("[data-leo-panel]");
    assert.equal(frame.getAttribute("data-leo-expanded"), "0");
    const left = parseFloat(frame.style.left);
    const top = parseFloat(frame.style.top);
    const width = parseFloat(frame.style.width);
    const height = parseFloat(frame.style.height);
    assert.equal(left + width, ANCHOR.right);
    assert.equal(ANCHOR.top - (top + height), 8);
    // 发送键（锚点所在输入框那一行）在面板底边之下 → 不被盖住。
    const send = [...view.host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "发送");
    assert.ok(send);
    assert.ok(top + height <= ANCHOR.top);
  } finally {
    await view.cleanup();
  }
});

test("紧凑态标题栏拖拽改变 left/top；放大到 94vw×90vh 居中，再按一次回到紧凑", async () => {
  installFetch();
  const view = await renderAssistant();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    const frame = view.host.querySelector("[data-leo-panel]");
    const titlebar = frame.querySelector(".cursor-move");
    assert.ok(titlebar, "title bar");
    const beforeLeft = parseFloat(frame.style.left);
    const beforeTop = parseFloat(frame.style.top);

    const down = new window.MouseEvent("pointerdown", { bubbles: true, clientX: beforeLeft + 50, clientY: beforeTop + 10 });
    await act(async () => {
      titlebar.dispatchEvent(down);
    });
    await act(async () => {
      titlebar.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: beforeLeft + 150, clientY: beforeTop + 70 }));
    });
    await act(async () => {
      titlebar.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true, clientX: beforeLeft + 150, clientY: beforeTop + 70 }));
    });
    assert.equal(parseFloat(frame.style.left), beforeLeft + 100);
    assert.equal(parseFloat(frame.style.top), beforeTop + 60);

    const grow = view.host.querySelector('[aria-label="放大"]');
    await act(async () => {
      grow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(frame.getAttribute("data-leo-expanded"), "1");
    const width = Math.round(window.innerWidth * 0.94);
    const height = Math.round(window.innerHeight * 0.9);
    assert.equal(frame.style.width, `${width}px`);
    assert.equal(frame.style.height, `${height}px`);
    assert.equal(frame.style.left, `${Math.round((window.innerWidth - width) / 2)}px`);
    assert.equal(frame.style.top, `${Math.round((window.innerHeight - height) / 2)}px`);

    await act(async () => {
      grow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(frame.getAttribute("data-leo-expanded"), "0");
    assert.equal(frame.style.width, "384px");
  } finally {
    await view.cleanup();
  }
});

test("打开面板即拉服务端记录，紧凑态就显示；重开再拉一次（记录存服务器）", async () => {
  installFetch({
    transcriptEntries: [
      { id: "e1", role: "user", text: "之前的问题" },
      { id: "e2", role: "leo", text: "之前的回答", task: null },
    ],
  });
  const view = await renderAssistant();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    const list = view.host.querySelector("[data-leo-transcript]");
    assert.ok(list, "紧凑态也渲染记录");
    assert.match(list.textContent, /之前的问题/);
    assert.match(list.textContent, /之前的回答/);
    const gets = calls.filter((c) => c.url.includes("/v1/assistant/leo-transcript") && c.method === "GET");
    assert.ok(gets.length >= 1);
    assert.match(gets[0].url, /limit=100/);
    // 没有放大也看得见——不需要点「放大」。
    assert.equal(view.host.querySelector("[data-leo-panel]").getAttribute("data-leo-expanded"), "0");
  } finally {
    await view.cleanup();
  }
});

test("未登录：记录区显示「登录后 leo 才能记住对话」", async () => {
  installFetch({ transcriptStatus: 401 });
  const view = await renderAssistant();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    assert.ok(view.host.querySelector("[data-leo-transcript-anonymous]"));
    assert.match(view.host.textContent, /登录后 leo 才能记住对话/);
  } finally {
    await view.cleanup();
  }
});

test("输入「你好」走 leo-turn（带 context、不带 history），不建任务", async () => {
  installFetch({ leoBody: { reply: "在的。", action: "reply", entries: null, task: null, error: "" } });
  const view = await renderAssistant();
  const history = historyPings();
  try {
    await openPanel({
      toggle: true,
      source: "input",
      anchor: ANCHOR,
      context: { page: "shell", computerId: "c1", shellSessionId: "s1", computerName: "新加坡" },
    });
    await typeAndSend(view.host, "你好");
    const turns = postsTo("/v1/assistant/leo-turn");
    assert.equal(turns.length, 1);
    assert.equal(turns[0].body.site_id, "test-site");
    assert.equal(turns[0].body.text, "你好");
    assert.equal(typeof turns[0].body.board_text, "string");
    assert.deepEqual(turns[0].body.context, {
      page: "shell",
      computer_id: "c1",
      shell_session_id: "s1",
    });
    assert.equal("history" in turns[0].body, false);
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
    assert.match(view.host.textContent, /在的。/);
    assert.equal(history.count, 0);

    // 放大态显示「这台电脑：新加坡」（来自 context，不发请求）。
    const grow = view.host.querySelector('[aria-label="放大"]');
    await act(async () => {
      grow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const line = view.host.querySelector("[data-leo-computer-line]");
    assert.ok(line);
    assert.match(line.textContent, /这台电脑/);
    assert.match(line.textContent, /新加坡/);
  } finally {
    history.stop();
    await view.cleanup();
  }
});

test("leo-turn 带回任务时，那句带任务卡片（标题 + 「打开任务」链接），不展开执行过程", async () => {
  installFetch({
    leoBody: {
      reply: "已经建成任务。",
      action: "task",
      entries: [
        { id: "u1", role: "user", text: "帮我做一个产品介绍网站" },
        {
          id: "l1",
          role: "leo",
          text: "已经建成任务。",
          task: { task_id: "task_abc", title: "产品介绍网站", href: "/history?task=task_abc" },
        },
      ],
      task: { task_id: "task_abc", title: "产品介绍网站", href: "/history?task=task_abc" },
      error: "",
    },
  });
  const view = await renderAssistant();
  const history = historyPings();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    await typeAndSend(view.host, "帮我做一个产品介绍网站");
    assert.equal(postsTo("/v1/assistant/leo-turn").length, 1);
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
    const card = view.host.querySelector("[data-leo-task-card]");
    assert.ok(card, "任务卡片");
    assert.match(card.textContent, /产品介绍网站/);
    const link = card.querySelector('a[href*="/history?task="]');
    assert.ok(link);
    assert.equal(link.getAttribute("href"), "/history?task=task_abc");
    assert.equal((link.textContent || "").trim(), "打开任务");
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
    await openPanel({ text: "一段需要处理的原文", source: "selection" });
    await typeAndSend(view.host, "翻译");
    assert.equal(postsTo("/v1/assistant/leo-turn").length, 0);
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
    assert.ok(
      calls.some(
        (call) => call.url.includes("/v1/assistant/transform") && call.body?.action === "translate",
      ),
    );
  } finally {
    await view.cleanup();
  }
});

test("leo-turn HTTP 失败：乐观句撤掉、明说没发出去，不假装已交办", async () => {
  installFetch({ leoStatus: 500 });
  const view = await renderAssistant();
  const history = historyPings();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    await typeAndSend(view.host, "帮我做一个产品介绍网站");
    assert.equal(postsTo("/v1/assistant/leo-turn").length, 1);
    assert.equal(postsTo("/v1/agent/tasks").length, 0);
    assert.ok(view.host.querySelector("[data-leo-turn-error]"));
    assert.doesNotMatch(view.host.textContent, /已经放进「我的任务」/);
    assert.equal(history.count, 0);
  } finally {
    history.stop();
    await view.cleanup();
  }
});

test("中文输入法候选态按 Enter 不发送；候选结束后 Enter 才发送", async () => {
  installFetch();
  const view = await renderAssistant();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    const input = view.host.querySelector("textarea[data-leo-composer]");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    await act(async () => {
      setter.call(input, "你好");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    const composing = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(composing, "isComposing", { value: true });
    await act(async () => {
      input.dispatchEvent(composing);
    });
    await settle();
    assert.equal(postsTo("/v1/assistant/leo-turn").length, 0);
    assert.equal(input.value, "你好", "候选态 Enter 不清输入");

    const done = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(done, "isComposing", { value: false });
    await act(async () => {
      input.dispatchEvent(done);
    });
    await settle();
    assert.equal(postsTo("/v1/assistant/leo-turn").length, 1);
  } finally {
    await view.cleanup();
  }
});

test("Esc 关闭面板；打开时焦点进输入框", async () => {
  installFetch();
  const view = await renderAssistant();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    const frame = view.host.querySelector("[data-leo-panel]");
    assert.match(frame.className, /flex/);
    assert.equal(document.activeElement, view.host.querySelector("textarea[data-leo-composer]"));
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.match(frame.className, /hidden/);
  } finally {
    await view.cleanup();
  }
});

test("清空记录走 DELETE，面板清空", async () => {
  installFetch({
    transcriptEntries: [
      { id: "e1", role: "user", text: "之前的问题" },
      { id: "e2", role: "leo", text: "之前的回答", task: null },
    ],
  });
  const view = await renderAssistant();
  try {
    await openPanel({ toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } });
    assert.match(view.host.textContent, /之前的回答/);
    const clear = [...view.host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "清空记录");
    assert.ok(clear, "清空记录按钮");
    await act(async () => {
      clear.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    assert.ok(calls.some((c) => c.url.includes("/v1/assistant/leo-transcript") && c.method === "DELETE"));
    assert.doesNotMatch(view.host.textContent, /之前的回答/);
    assert.match(view.host.textContent, /还没有对话，开始第一句吧。/);
  } finally {
    await view.cleanup();
  }
});

test("全站无悬浮气泡；门户 launcher 只挂一次 LeoAssistant，无 hideFloatingButton", () => {
  const assistant = readFileSync(
    join(TESTS_DIR, "../src/shell/LeoAssistant.tsx"),
    "utf8",
  );
  assert.equal(assistant.includes("data-oceanleo-leo-fab"), false);
  assert.equal(assistant.includes("hideFloatingButton"), false);

  const shell = readFileSync(
    join(TESTS_DIR, "../src/shell/cloud-computer/ShellTaskView.tsx"),
    "utf8",
  );
  assert.equal(shell.includes("data-oceanleo-cc-leo-toggle"), false);

  const launcher = readFileSync(
    join(TESTS_DIR, "../../oceanleo/app/_components/leo-launcher.tsx"),
    "utf8",
  );
  assert.match(launcher, /siteId="oceanleo"/);
  assert.match(launcher, /docType="doc"/);
  // 属性与按路径判断函数都已不再使用（注释里提到名字不算）。
  assert.doesNotMatch(launcher, /hideFloatingButton\s*=/);
  assert.doesNotMatch(launcher, /leoFloatingButtonHidden\s*\(/);
  assert.doesNotMatch(launcher, /OceanLeo agent/);
});
