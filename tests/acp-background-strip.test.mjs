// W13: the ACP background-task strip stays to one line until the user opens its bounded list.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
  url: "https://oceanbizs.com/task",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Text: window.Text,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  MutationObserver: window.MutationObserver,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const clipboardStub = dataModule(`export async function writeClipboardText() { return true; }`);
const { AcpBackgroundTaskStrip } = await import(await compileModule("src/acp/AcpTranscript.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./share/share-clipboard": clipboardStub,
}));

const startedAt = "2026-11-09T09:00:00.000Z";
function task(id, overrides = {}) {
  return {
    id,
    name: id,
    taskType: "shell",
    description: `${id} description`,
    summary: "",
    lastToolName: "",
    state: "running",
    canStop: true,
    toolCallId: "",
    outputFilePath: "",
    startedAt,
    updatedAt: startedAt,
    ...overrides,
  };
}

function staticStrip(tasks, onStopTask) {
  return renderToStaticMarkup(React.createElement(AcpBackgroundTaskStrip, { tasks, onStopTask }));
}

function bodyFor(markup) {
  const body = window.document.createElement("div");
  body.innerHTML = markup;
  return body;
}

async function mount(tasks, onStopTask) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(AcpBackgroundTaskStrip, { tasks, onStopTask })));
  return {
    container,
    root,
    async rerender(nextTasks) {
      await act(async () => root.render(React.createElement(AcpBackgroundTaskStrip, { tasks: nextTasks, onStopTask })));
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("zero, one, and many running tasks use the collapsed one-line summary", () => {
  assert.equal(staticStrip([]), "");

  const one = bodyFor(staticStrip([task("build")], () => {}));
  assert.ok(one.querySelector("[data-acp-background-strip]"));
  assert.match(one.querySelector("[data-acp-background-summary]").textContent, /后台任务运行中 · build · \d+(?:s|m \d+s)/);
  assert.equal(one.querySelector('[data-acp-background-toggle]').getAttribute("aria-expanded"), "false");
  assert.equal(one.querySelector('[data-acp-background-list]'), null);
  assert.ok(one.querySelector('[data-acp-stop-task="build"]'));

  const many = bodyFor(staticStrip([task("build"), task("test"), task("lint", { canStop: false })]));
  assert.match(many.querySelector("[data-acp-background-summary]").textContent, /3 个后台任务运行中/);
  assert.equal(many.querySelector('[data-acp-background-toggle]').getAttribute("aria-expanded"), "false");
  assert.match(many.querySelector('[data-acp-background-toggle]').textContent, /⌄/);
  assert.equal(many.querySelector('[data-acp-background-list]'), null);
  assert.equal(many.querySelectorAll("[data-acp-stop-task]").length, 0, "collapsed many-task rows have no per-task controls");
});

test("the toggle expands all live tasks into a max-height scrolling list and stop only appears when allowed", async () => {
  const stopped = [];
  const tasks = [task("build"), task("test"), task("lint", { canStop: false }), task("package")];
  const view = await mount(tasks, (id) => stopped.push(id));
  try {
    const toggle = () => view.container.querySelector("[data-acp-background-toggle]");
    assert.equal(toggle().getAttribute("aria-expanded"), "false");
    await act(async () => toggle().dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(toggle().getAttribute("aria-expanded"), "true");
    const list = view.container.querySelector("[data-acp-background-list]");
    assert.ok(list);
    assert.match(list.className, /max-h-48/);
    assert.match(list.className, /overflow-y-auto/);
    assert.equal(list.querySelectorAll('[role="listitem"]').length, 4);
    assert.equal(list.querySelectorAll("[data-acp-stop-task]").length, 3);
    await act(async () => list.querySelector('[data-acp-stop-task="test"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.deepEqual(stopped, ["test"]);
    await act(async () => toggle().dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(toggle().getAttribute("aria-expanded"), "false");
    assert.equal(view.container.querySelector("[data-acp-background-list]"), null);
  } finally {
    await view.unmount();
  }
});

test("finished tasks never enter the strip, and a drop to one live task auto-collapses it", async () => {
  const finished = [
    task("done", { state: "completed" }),
    task("failed", { state: "failed" }),
    task("stopped", { state: "stopped" }),
    task("cancelled", { state: "cancelled" }),
  ];
  const view = await mount([task("build"), task("test"), ...finished]);
  try {
    const toggle = () => view.container.querySelector("[data-acp-background-toggle]");
    await act(async () => toggle().dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(view.container.querySelectorAll('[data-acp-background-task]').length, 2);
    for (const id of ["done", "failed", "stopped", "cancelled"]) {
      assert.equal(view.container.querySelector(`[data-acp-background-task="${id}"]`), null);
    }
    await view.rerender([task("build"), ...finished]);
    assert.equal(toggle().getAttribute("aria-expanded"), "false");
    assert.equal(view.container.querySelector("[data-acp-background-list]"), null);
  } finally {
    await view.unmount();
  }
});
