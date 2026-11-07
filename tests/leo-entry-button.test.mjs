import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ============================================================================
// W5B · leo 入口按钮（合同 I5/I7，验收判据 #5）
// ----------------------------------------------------------------------------
// 判的是行为，不是源码行：
//   1. 按钮渲染出来（✦ leo、data-oceanleo-leo-entry、每实例渐变 id 唯一）；
//   2. leo 总开关关掉时按钮整颗不渲染；
//   3. 点击 → window 收到 oceanleo:open-leo，detail 带
//      { toggle:true, source:"input", anchor, context }，且宿主输入框被标记聚焦；
//
// jsdom 取自 `fabric/node` 自带那份（仓内唯一可用），写法与
// `tests/leo-assistant-expand-and-task.test.mjs` 同源。
// ============================================================================

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

const reactNs = await import("react");
const React = reactNs.createElement ? reactNs : reactNs.default;
const { act } = reactNs.act ? reactNs : React;
const { createRoot } = await import("react-dom/client");

const uiStubUrl = dataModule(
  "export function useUI(){ return (zh) => zh; }",
);

const { LeoEntryButton } = await import(
  await compileModule("src/shell/LeoEntryButton.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
  })
);
const { LEO_ENABLED_KEY, OPEN_LEO_EVENT, setLeoEnabled } = await import(
  await compileModule("src/shell/LeoAssistant.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
  })
);

async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderInto(element) {
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
    },
  };
}

function resetLeoSwitch() {
  window.localStorage.removeItem(LEO_ENABLED_KEY);
}

test("LeoEntryButton：渲染 ✦ leo 按钮，两个实例的渐变 id 不共用", async () => {
  resetLeoSwitch();
  const view = await renderInto(
    React.createElement(
      "div",
      null,
      React.createElement(LeoEntryButton, {
        tone: "light",
        context: { page: "home" },
      }),
      React.createElement(LeoEntryButton, {
        tone: "dark",
        context: { page: "shell" },
      }),
    ),
  );
  try {
    const buttons = view.host.querySelectorAll("[data-oceanleo-leo-entry]");
    assert.equal(buttons.length, 2, "两颗按钮都渲染");
    for (const button of buttons) {
      assert.equal(button.getAttribute("aria-label"), "leo");
      assert.equal(button.textContent.trim(), "leo");
      assert.ok(
        button.querySelector("svg linearGradient"),
        "Sparkle 渐变图标在按钮里",
      );
    }
    const ids = [...buttons].map((button) =>
      button.querySelector("linearGradient").getAttribute("id"),
    );
    assert.notEqual(ids[0], ids[1], "同一页多颗按钮不能共用 SVG 渐变 id");
    // tone：浅色输入框用深文字，Shell 深色底用浅文字。
    assert.match(buttons[0].className, /text-neutral-600/);
    assert.match(buttons[1].className, /text-neutral-300/);
  } finally {
    await view.cleanup();
  }
});

test("LeoEntryButton：leo 总开关关闭时整颗不渲染", async () => {
  resetLeoSwitch();
  setLeoEnabled(false);
  const view = await renderInto(
    React.createElement(LeoEntryButton, {
      tone: "light",
      context: { page: "home" },
    }),
  );
  try {
    assert.equal(
      view.host.querySelector("[data-oceanleo-leo-entry]"),
      null,
      "开关关掉后按钮返回 null",
    );
  } finally {
    await view.cleanup();
    setLeoEnabled(true);
  }
});

test("LeoEntryButton：点击派发 open-leo（toggle/input/anchor/context）并标记宿主输入框", async () => {
  resetLeoSwitch();
  const events = [];
  const onOpen = (event) => events.push(event.detail);
  window.addEventListener(OPEN_LEO_EVENT, onOpen);
  const view = await renderInto(
    React.createElement(
      "form",
      null,
      React.createElement("textarea", { defaultValue: "草稿" }),
      React.createElement(LeoEntryButton, {
        tone: "light",
        context: { page: "task", taskId: "task-1" },
      }),
    ),
  );
  try {
    const button = view.host.querySelector("[data-oceanleo-leo-entry]");
    const textarea = view.host.querySelector("textarea");
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    assert.equal(events.length, 1, "点击只派发一次 open-leo");
    const detail = events[0];
    assert.equal(detail.toggle, true);
    assert.equal(detail.source, "input");
    assert.ok(detail.anchor, "anchor 带按钮的视口位置（面板从按钮上方弹出）");
    assert.deepEqual(detail.context, { page: "task", taskId: "task-1" });
    assert.ok(
      textarea.hasAttribute("data-ai-assistant-target"),
      "点击后宿主输入框被标记（面板读草稿用）",
    );
    assert.equal(document.activeElement, textarea, "点击后焦点落在宿主输入框");
  } finally {
    window.removeEventListener(OPEN_LEO_EVENT, onOpen);
    await view.cleanup();
  }
});
