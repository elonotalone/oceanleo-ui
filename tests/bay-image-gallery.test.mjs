// 安全矩阵：不适用（填写页作品图方格，无不可信注入）
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
  HTMLLabelElement: window.HTMLLabelElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  DragEvent: window.DragEvent,
  File: window.File,
  DataTransfer: window.DataTransfer,
  URL: window.URL,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:https://cdn.example/pending";
  URL.revokeObjectURL = () => {};
}
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const databaseStub = dataModule(`
  export async function uploadFile(file, opts) {
    (globalThis.__bayCoverUploads ||= []).push({ file, opts });
    const responder = globalThis.__bayCoverUpload;
    return responder ? responder(file, opts) : { ok: true, data: { file: { url: "https://cdn.example/" + (globalThis.__bayCoverUploads.length) + ".png" } } };
  }
`);

const { BayImageGallery, BayImageStage } = await import(
  await compileModule("src/shell/bay/form/BayImageGallery.tsx", {
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

function tinyPngFile(name = "cover.png") {
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
    (ch) => ch.charCodeAt(0),
  );
  return new File([png], name, { type: "image/png" });
}

function assignInputFiles(input, files) {
  if (typeof window.DataTransfer === "function") {
    const transfer = new window.DataTransfer();
    for (const file of files) transfer.items.add(file);
    input.files = transfer.files;
    return;
  }
  Object.defineProperty(input, "files", { configurable: true, value: files });
}

async function mount(props = {}) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const lists = [];
  let urls = props.urls ?? [];
  function render(nextUrls) {
    root.render(
      h(BayImageGallery, {
        urls: nextUrls,
        onUrls: (value) => {
          lists.push(value);
          urls = value;
        },
        disabled: props.disabled,
        variant: props.variant,
      }),
    );
  }
  await act(async () => {
    render(urls);
  });
  await flush();
  return {
    host,
    lists,
    get urls() {
      return urls;
    },
    async rerender(next) {
      urls = next;
      await act(async () => {
        render(next);
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

test("卖家是横排方格加添加细节图，不是买家那种左侧缩略图", async () => {
  const { host, unmount } = await mount();
  const input = host.querySelector("[data-bay-image-gallery] input[type=file]");
  assert.ok(input);
  assert.equal(input.multiple, true);
  assert.equal(host.querySelector("[data-bay-gallery-editor]").getAttribute("data-bay-gallery-editor"), "grid");
  assert.ok(host.querySelector("[data-bay-gallery-add]"));
  assert.ok(host.querySelector("[data-bay-gallery-empty]"));
  assert.match(host.textContent, /添加细节图/);
  assert.equal(host.querySelector("[data-bay-gallery-rail]"), null);
  assert.equal(host.querySelector("[data-bay-gallery-main]"), null);
  assert.equal(host.querySelector("input[type=text]"), null);
  await unmount();
});

test("已有一张时添加细节图还在，可以继续选", async () => {
  const { host, unmount } = await mount({ urls: ["https://cdn.example/1.png"] });
  assert.equal(host.querySelectorAll("[data-bay-gallery-tile]").length, 1);
  assert.ok(host.querySelector("[data-bay-gallery-add]"));
  assert.ok(host.querySelector("input[type=file][multiple]"));
  assert.equal(host.querySelector("[data-bay-gallery-rail]"), null);
  assert.equal(host.querySelector("[data-bay-gallery-main]"), null);
  await unmount();
});

test("一次选两张会追加，满 9 张不再出现添加格", async () => {
  globalThis.__bayCoverUploads = [];
  globalThis.__bayCoverUpload = async (file) => ({ ok: true, data: { file: { url: `https://cdn.example/${file.name}` } } });
  const { host, lists, rerender, unmount } = await mount();
  const input = host.querySelector("input[type=file]");
  assignInputFiles(input, [tinyPngFile("a.png"), tinyPngFile("b.png")]);
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
  await flush();
  assert.deepEqual(lists.at(-1), ["https://cdn.example/a.png", "https://cdn.example/b.png"]);
  const nine = Array.from({ length: 9 }, (_, i) => `https://cdn.example/${i}.png`);
  await rerender(nine);
  assert.equal(host.querySelector("[data-bay-gallery-add]"), null);
  assert.equal(host.querySelectorAll("[data-bay-gallery-tile]").length, 9);
  await unmount();
});

test("第一张还在传时仍能再选，不会卡死在一张", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let n = 0;
  globalThis.__bayCoverUploads = [];
  globalThis.__bayCoverUpload = async (file) => {
    n += 1;
    if (file.name === "a.png") await firstGate;
    return { ok: true, data: { file: { url: `https://cdn.example/${file.name}` } } };
  };
  const { host, lists, unmount } = await mount();
  const input = host.querySelector("input[type=file]");
  assignInputFiles(input, [tinyPngFile("a.png")]);
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  await flush();
  assert.ok(host.querySelector("[data-bay-gallery-pending]"));
  assert.ok(host.querySelector("[data-bay-gallery-add]"), "上传中也要留着添加格");
  assignInputFiles(host.querySelector("input[type=file]"), [tinyPngFile("b.png")]);
  await act(async () => {
    host.querySelector("input[type=file]").dispatchEvent(new window.Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  await flush();
  await act(async () => {
    releaseFirst();
    await Promise.resolve();
    await Promise.resolve();
  });
  await flush();
  await flush();
  const last = lists.at(-1) || [];
  assert.equal(last.includes("https://cdn.example/a.png"), true);
  assert.equal(last.includes("https://cdn.example/b.png"), true);
  assert.equal(last.length, 2);
  await unmount();
});

test("方格上的叉可以去掉一张", async () => {
  const urls = ["https://cdn.example/1.png", "https://cdn.example/2.png", "https://cdn.example/3.png"];
  const { host, lists, unmount } = await mount({ urls });
  assert.equal(host.querySelectorAll("[data-bay-gallery-tile]").length, 3);
  assert.ok(host.querySelector("[data-bay-gallery-add]"));
  await act(async () => {
    host.querySelector("[data-bay-gallery-remove='1']").click();
  });
  await flush();
  assert.deepEqual(lists.at(-1), ["https://cdn.example/1.png", "https://cdn.example/3.png"]);
  await unmount();
});

test("发帖 listing 空着也有缩略图轨和大主图", async () => {
  const { host, unmount } = await mount({ urls: [], variant: "listing" });
  assert.equal(host.querySelector("[data-bay-gallery-editor]").getAttribute("data-bay-gallery-editor"), "listing");
  assert.ok(host.querySelector("[data-bay-gallery-rail]"));
  assert.ok(host.querySelector("[data-bay-gallery-main]"));
  assert.ok(host.querySelector("[data-bay-gallery-add]"));
  assert.equal(host.querySelector("[data-bay-gallery-main] img"), null);
  await unmount();
});

test("发帖 listing 变体：左侧缩略图轨，右侧主图，原生文件框藏着", async () => {
  const { host, unmount } = await mount({
    urls: ["https://cdn.example/1.png", "https://cdn.example/2.png"],
    variant: "listing",
  });
  assert.equal(host.querySelector("[data-bay-gallery-editor]").getAttribute("data-bay-gallery-editor"), "listing");
  assert.ok(host.querySelector("[data-bay-gallery-rail]"));
  assert.ok(host.querySelector("[data-bay-gallery-main] img"));
  assert.equal(host.querySelectorAll("[data-bay-gallery-thumb]").length, 2);
  assert.ok(host.querySelector("[data-bay-gallery-add]"));
  const input = host.querySelector("input[type=file]");
  assert.equal(input.hidden, true);
  assert.match(input.className, /\bhidden\b/);
  await unmount();
});

test("买家看帖才是左侧缩略图加主图", async () => {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const urls = ["https://cdn.example/1.png", "https://cdn.example/2.png", "https://cdn.example/3.png"];
  await act(async () => {
    root.render(h(BayImageStage, { urls, active: 0, onActive: () => {} }));
  });
  assert.ok(host.querySelector("[data-bay-image-stage]"));
  assert.ok(host.querySelector("[data-bay-gallery-rail]"));
  assert.ok(host.querySelector("[data-bay-gallery-main] img"));
  assert.equal(host.querySelectorAll("[data-bay-gallery-thumb]").length, 3);
  assert.equal(host.querySelector("[data-bay-gallery-add]"), null);
  await act(async () => {
    root.unmount();
  });
  host.remove();
});
