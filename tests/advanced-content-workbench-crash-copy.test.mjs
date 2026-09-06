// ============================================================================
// 编辑器崩溃边界：文案人话、「重新载入」保留、原始错误不吞（plugin-chrome X4，规范 v2 §5）
// ----------------------------------------------------------------------------
// 操作员现场：库里打开编辑器崩了，屏幕上是「这个编辑器出错了 … Minified React error
// #185; visit https://react.dev/errors/185 …」。崩溃本体归 X2；这里只管**用户看到的话**：
//   ① 正文先说发生了什么、素材有没有事、下一步点哪里；
//   ② 原始 `error.message` 不再是正文，收进「技术细节」折叠——但**仍在 DOM 里**
//      （不吞：`route-error-isolation.test.mjs` 判 textContent 含文件名照旧成立）；
//   ③ 「重新载入」按钮保留（`data-chunk-action="retry"`），点它能真的重挂 children；
//   ④ 遥测照旧：`boundary.catch` 事件仍发。
//   ⑤ 边界的失败态在**没有 intl provider** 的树里也渲染得出来（不双重故障）。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";

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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://website.oceanleo.com/history/session-1",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ⑤ 的判据就藏在这一行：**不打 useUI / intl 桩**，边界必须自己活下来。
const { WorkbenchErrorBoundary } = await import(
  await compileModule("src/shell/WorkbenchErrorBoundary.tsx")
);
const telemetry = await import("../src/lib/telemetry/index.ts");
const { UIMessageProvider } = await import(
  await compileModule("src/i18n/ui/messages/context.tsx")
);
const { ADVANCED_ROUTE_MESSAGES } = await import(
  "../src/i18n/ui/messages/advanced-route-copy.ts"
);

const ITEM = Object.freeze({
  key: "creation:poster-1",
  source: "creation",
  id: "poster-1",
  title: "季度汇报海报",
  kind: "image",
  siteId: "website",
  url: "https://website.oceanleo.com/assets/poster-1.png",
  favorite: false,
  meta: {},
});
const RAW_MESSAGE =
  "Minified React error #185; visit https://react.dev/errors/185 for the full message";

function Boom() {
  throw new Error(RAW_MESSAGE);
}
function Editor() {
  return React.createElement("div", { "data-real-editor": true }, "editor body");
}

function Harness({ crash, scope, contained, messages }) {
  const tree = React.createElement(
    WorkbenchErrorBoundary,
    {
      ...(scope ? { scope } : {}),
      ...(contained === undefined ? {} : { contained }),
      routeId: "image",
      item: ITEM,
      onClose() {},
    },
    crash ? React.createElement(Boom) : React.createElement(Editor),
  );
  return messages
    ? React.createElement(UIMessageProvider, { messages }, tree)
    : tree;
}

async function mount(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Harness, props));
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(React.createElement(Harness, next));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function muteConsoleError() {
  const original = console.error;
  console.error = () => {};
  return { restore: () => (console.error = original) };
}

function collectTelemetry() {
  const events = [];
  telemetry.resetTelemetry();
  telemetry.configureTelemetry({ consoleSeverity: "off" });
  telemetry.registerTelemetrySink({
    id: "crash-copy-test",
    receive: (event) => events.push(event),
  });
  return { events, stop: () => telemetry.resetTelemetry() };
}

async function click(target) {
  assert.ok(target, "要点的按钮不在 DOM 里");
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

test("路由级失败态：人话正文 + 技术细节折叠 + 「重新载入」能真的重挂", async () => {
  const muted = muteConsoleError();
  const mounted = await mount({ crash: true, scope: "route" });
  try {
    const box = mounted.container.querySelector("[data-workbench-route-error]");
    assert.ok(box, "失败态没渲染出来");
    const text = box.textContent;

    // ① 人话：先说发生了什么、素材有没有事、下一步。
    assert.match(text, /编辑器刚才出了问题，已经停下/);
    assert.match(text, /你的素材没有被改动/);
    assert.doesNotMatch(text, /这个编辑器出错了/, "旧标题不许再出现");

    // ② 原始消息不当正文：正文段落里没有它；折叠里有（不吞）。
    const paragraphs = [...box.querySelectorAll("p")].map((p) => p.textContent).join("\n");
    assert.doesNotMatch(paragraphs, /Minified React error/, "原始错误被当正文印给用户");
    const details = box.querySelector("details[data-workbench-error-details]");
    assert.ok(details, "技术细节折叠不存在 = 把错误吞了");
    assert.match(details.textContent, /技术细节/);
    assert.match(details.textContent, /Minified React error #185/);
    assert.equal(details.open, false, "折叠默认收起");

    // ③ 重新载入保留且有效。
    const retry = box.querySelector('[data-chunk-action="retry"]');
    assert.ok(retry);
    assert.match(retry.textContent, /重新载入/);
    await mounted.rerender({ crash: false, scope: "route" });
    // 边界的 error 状态还在（同一个 item），点重新载入才清。
    assert.ok(mounted.container.querySelector("[data-workbench-route-error]"));
    await click(mounted.container.querySelector('[data-chunk-action="retry"]'));
    assert.ok(
      mounted.container.querySelector("[data-real-editor]"),
      "点了重新载入，children 该重新挂上",
    );
    assert.equal(mounted.container.querySelector("[data-workbench-route-error]"), null);
  } finally {
    muted.restore();
    await mounted.unmount();
  }
});

test("外壳级失败态（contained）：人话标题、关闭 / 重新载入 / 打开原内容三键齐全，遥测照旧", async () => {
  const muted = muteConsoleError();
  const collected = collectTelemetry();
  const mounted = await mount({ crash: true, contained: true });
  try {
    const dialog = mounted.container.querySelector('[role="dialog"]');
    assert.ok(dialog, "contained 失败态该留在容器内");
    assert.equal(dialog.getAttribute("aria-label"), "季度汇报海报 · 编辑器错误");
    assert.match(dialog.textContent, /这件素材暂时打不开编辑器/);
    assert.doesNotMatch(dialog.textContent, /暂时无法载入编辑器/, "旧标题不许再出现");
    const buttons = [...dialog.querySelectorAll("button")].map((b) => b.textContent.trim());
    assert.deepEqual(buttons, ["重新载入", "关闭"]);
    const link = dialog.querySelector('a[href="https://website.oceanleo.com/assets/poster-1.png"]');
    assert.ok(link);
    assert.equal(link.textContent.trim(), "打开原内容");
    assert.ok(dialog.querySelector("details[data-workbench-error-details]"));

    // ④ 不吞：遥测事件仍发，且事件里仍然没有 error.message（口径同 route-error-isolation）。
    const caught = collected.events.filter((event) => event.name === "boundary.catch");
    assert.equal(caught.length, 1, "componentDidCatch 的上报没了");
    assert.doesNotMatch(JSON.stringify(caught[0]), /Minified React error/);
  } finally {
    collected.stop();
    muted.restore();
    await mounted.unmount();
  }
});

test("挂了词典就翻译：英文站看到的是英文，不再是中文原文", async () => {
  const muted = muteConsoleError();
  const mounted = await mount({
    crash: true,
    scope: "route",
    messages: ADVANCED_ROUTE_MESSAGES.en,
  });
  try {
    const box = mounted.container.querySelector("[data-workbench-route-error]");
    assert.match(box.textContent, /The editor hit a problem and stopped/);
    assert.match(box.textContent, /Technical details \(for developers\)/);
    assert.match(
      box.querySelector('[data-chunk-action="retry"]').textContent,
      /^Reload$/,
    );
    assert.doesNotMatch(box.textContent, /编辑器刚才出了问题/);
  } finally {
    muted.restore();
    await mounted.unmount();
  }
});
