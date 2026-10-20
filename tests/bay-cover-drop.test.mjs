// 安全矩阵：不适用（填写页展开表单，无不可信注入）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

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
  url: "https://video.oceanleo.com/bay",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  DragEvent: window.DragEvent,
  File: window.File,
  DataTransfer: window.DataTransfer,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const databaseStub = dataModule(`
  export async function uploadFile(file, opts) {
    (globalThis.__bayCoverUploads ||= []).push({ file, opts });
    const responder = globalThis.__bayCoverUpload;
    return responder ? responder(file, opts) : { ok: true, data: { file: { url: "https://cdn.example/cover.png" } } };
  }
`);

const { BayCoverDrop } = await import(
  await compileModule("src/shell/bay/form/BayCoverDrop.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../lib/database": databaseStub,
  }),
);
const h = React.createElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function tinyPngFile() {
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
    (ch) => ch.charCodeAt(0),
  );
  return new File([png], "cover.png", { type: "image/png" });
}

function assignInputFile(input, file) {
  if (typeof window.DataTransfer === "function") {
    const transfer = new window.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return;
  }
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
}

async function mount(props = {}) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const urls = [];
  await act(async () => {
    root.render(
      h(BayCoverDrop, {
        url: props.url ?? "",
        onUrl: (url) => {
          urls.push(url);
        },
        disabled: props.disabled,
      }),
    );
  });
  await flush();
  return {
    host,
    urls,
    async rerender(next) {
      await act(async () => {
        root.render(
          h(BayCoverDrop, {
            url: next.url ?? "",
            onUrl: (url) => {
              urls.push(url);
            },
            disabled: next.disabled,
          }),
        );
      });
      await flush();
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test("有 input[type=file] 与拖拽目标，没有文本 URL 框", async () => {
  const { host, unmount } = await mount();
  assert.ok(host.querySelector("input[type=file]"));
  assert.ok(host.querySelector("[data-bay-cover-drop]"));
  assert.equal(host.querySelector("input[type=text]"), null);
  assert.equal(host.querySelector("input[type=url]"), null);
  assert.equal(host.querySelector("textarea"), null);
  // 说明一句、按钮一句，不再把同一句话写两遍。
  assert.equal(host.querySelector("[data-bay-cover-hint]")?.textContent, "把图片拖到这里");
  assert.equal(host.querySelector("[data-bay-cover-pick]")?.textContent, "选择图片");
  assert.equal(host.querySelector("[data-bay-cover-drop]").getAttribute("data-bay-cover-state"), "empty");
  // 白底、看得清的虚线边：它是必填的第一项，不能是半透明灰块。
  const tile = host.querySelector("[data-bay-cover-drop]").className;
  assert.match(tile, /\bbg-white\b/);
  assert.match(tile, /\bborder-neutral-300\b/);
  assert.doesNotMatch(tile, /bg-neutral-50\/60/);
  await unmount();
});

test("点选本地文件后走 uploadFile 桩，成功则 onUrl(https) 并显示预览", async () => {
  globalThis.__bayCoverUploads = [];
  globalThis.__bayCoverUpload = async () => ({ ok: true, data: { file: { url: "https://cdn.example/cover.png" } } });
  const { host, urls, rerender, unmount } = await mount();
  const input = host.querySelector("input[type=file]");
  assert.ok(input);
  assignInputFile(input, tinyPngFile());
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
  await flush();
  assert.equal(globalThis.__bayCoverUploads.length, 1);
  assert.equal(globalThis.__bayCoverUploads[0].opts.siteId, "oceanleo");
  assert.equal(String(globalThis.__bayCoverUploads[0].opts.idempotencyKey || "").includes(" "), false);
  assert.deepEqual(urls, ["https://cdn.example/cover.png"]);
  await rerender({ url: urls[0] });
  assert.ok(host.querySelector("img[src='https://cdn.example/cover.png']"));
  assert.equal(host.querySelector("input[type=text]"), null);
  await unmount();
});

test("拖入图片同样走 uploadFile 桩", async () => {
  globalThis.__bayCoverUploads = [];
  globalThis.__bayCoverUpload = async () => ({ ok: true, data: { file: { url: "https://cdn.example/drop.png" } } });
  const { host, urls, unmount } = await mount();
  const drop = host.querySelector("[data-bay-cover-drop]");
  assert.ok(drop);
  const file = tinyPngFile();
  await act(async () => {
    const event = new window.Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
    drop.dispatchEvent(event);
    await Promise.resolve();
    await Promise.resolve();
  });
  await flush();
  assert.equal(globalThis.__bayCoverUploads.length, 1);
  assert.deepEqual(urls, ["https://cdn.example/drop.png"]);
  await unmount();
});
