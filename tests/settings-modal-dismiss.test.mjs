// 设置卡遮罩：点遮罩关掉；从卡片里拖选到外面松开不关。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/settings-modal-dismiss.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const modalSource = readFileSync(new URL("../src/pages/settings/SettingsModal.tsx", import.meta.url), "utf8");
assert.match(modalSource, /backdropPress/);
assert.match(modalSource, /fromBackdrop && event\.target === event\.currentTarget/);
assert.match(modalSource, /onPointerDown/);
assert.match(modalSource, /data-settings-frame/);

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
  url: "https://oceanleo.com/settings/general",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const { SettingsModal } = await import(
  await compileModule("src/pages/settings/SettingsModal.tsx", {
    "../../i18n/ui/useUI": dataModule(`export function useUI() { return (value) => value; }`),
    "./SettingsHub": dataModule(`
      export function SettingsHub() {
        return null;
      }
    `),
  })
);

function fire(node, type) {
  node.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }));
}

async function mount() {
  const closed = { n: 0 };
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(SettingsModal, {
        open: true,
        onClose() {
          closed.n += 1;
        },
      }),
    );
  });
  for (let i = 0; i < 4; i += 1) await act(async () => {});
  const backdrop = window.document.querySelector("[data-settings-backdrop]");
  const frame = window.document.querySelector("[data-settings-frame]");
  assert.ok(backdrop);
  assert.ok(frame);
  return {
    closed,
    backdrop,
    frame,
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test("从卡片里按下、在遮罩上松开，设置卡不关", async () => {
  const view = await mount();
  await act(async () => {
    fire(view.frame, "pointerdown");
    fire(view.backdrop, "click");
  });
  assert.equal(view.closed.n, 0);
  await view.cleanup();
});

test("按下和松开都在遮罩上，设置卡关掉", async () => {
  const view = await mount();
  await act(async () => {
    fire(view.backdrop, "pointerdown");
    fire(view.backdrop, "click");
  });
  assert.equal(view.closed.n, 1);
  await view.cleanup();
});
