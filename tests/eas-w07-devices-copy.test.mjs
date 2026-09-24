// DevicesPage 三处模板字符串曾经当 tt() 键用：键每次都不同，非中文用户看到的是中文。
// 现在改成带参键；中文渲染逐字不变（见 eas-w07-page-forms 快照），英文必须不是中文。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { EAS_W07_MESSAGES } from "../src/i18n/ui/messages/eas-w07-copy.ts";
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
  url: "https://oceanleo.com/devices",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
globalThis.__easW07En = EAS_W07_MESSAGES.en;

const { DevicesPage } = await import(
  await compileModule("src/pages/DevicesPage.tsx", {
    "../facades/devices": dataModule(`export const devicesFacade = null;`),
    "../i18n/ui/useUI": dataModule(`
      const dict = globalThis.__easW07En;
      export function useUI() {
        return (value, vars) => {
          const translated = dict?.[value] ?? value;
          return translated.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
        };
      }
    `),
    "../ui": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function ConfirmDialog({ title }) {
        return React.createElement("div", { "data-testid": "confirm-dialog" }, title);
      }
    `),
    "./CloudComputersPage": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function CloudComputersSection() { return null; }
    `),
  })
);

const CJK = /[\u4e00-\u9fff]/;
const KEYS = [
  "撤销「{name}」？",
  "{n} 台在线",
  "{name}现在离线，需要它执行的步骤会排队等它上线",
];

const devicesClient = {
  async listDevices() {
    return {
      ok: true,
      data: [
        { device_id: "d-1", platform: "windows", device_name: "Studio", online: true, local_exec_enabled: true, granted_kinds: ["read"], last_seen_at: "" },
        { device_id: "d-2", platform: "macos", device_name: "Office", online: false, local_exec_enabled: false, granted_kinds: [], last_seen_at: "" },
      ],
    };
  },
};

test("英文词典与页面上这三处都不是中文", async () => {
  for (const key of KEYS) {
    const en = EAS_W07_MESSAGES.en[key];
    assert.ok(en, `分表缺英文：${key}`);
    assert.equal(CJK.test(en), false, `英文译文里不该有汉字：${en}`);
  }

  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(DevicesPage, { client: devicesClient })));
  for (let i = 0; i < 6; i += 1) await act(async () => {});

  const text = host.textContent || "";
  assert.match(text, /1 online/);
  assert.equal(text.includes("台在线"), false);
  assert.equal(text.includes("现在离线"), false);
  assert.match(text, /Office is offline/);

  const revoke = [...host.querySelectorAll("button")].find((node) => (node.textContent || "").includes("撤销设备"));
  assert.ok(revoke);
  await act(async () => {
    revoke.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  for (let i = 0; i < 3; i += 1) await act(async () => {});
  const title = host.querySelector("[data-testid=confirm-dialog]")?.textContent || "";
  assert.match(title, /Revoke/);
  assert.equal(CJK.test(title), false, `撤销确认标题不该是中文：${title}`);

  await act(async () => root.unmount());
  host.remove();
});
