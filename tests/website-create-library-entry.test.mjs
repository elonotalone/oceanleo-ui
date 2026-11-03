import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
  url: "https://oceanleo.com/library",
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  Event: dom.window.Event,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

globalThis.__createdWebsiteDescription = "";
const { CreateWebsiteEntry } = await import(
  await compileModule("src/shell/website-platform/create-website-entry.tsx", {
    "../../i18n/ui/useUI": dataModule(`export function useUI() { return (value) => value; }`),
    "../collection-chrome": dataModule(`export const COLLECTION_ACTION_BTN_PRIMARY = "primary";`),
    "../library-data": dataModule(``),
    "./create-website": dataModule(`export async function createWebsiteFromDescription(description) { globalThis.__createdWebsiteDescription = description; return { item: { artifactId: "a", revisionId: "r" } }; }`),
  }),
);
const { createRoot } = await import("react-dom/client");

test("My Library has no website creation entry in any shared surface", () => {
  const source = readFileSync("src/shell/MyLibrary.tsx", "utf8");
  assert.doesNotMatch(source, /CreateWebsiteEntry|handleWebsiteCreated|create-website-entry|新建网站/);
});

test("task website creation still accepts a description and returns the created artifact", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const opened = [];
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(CreateWebsiteEntry, { onCreated: (item) => opened.push(item) }));
  });
  await act(async () => {
    host.querySelector("[data-library-create-website]").click();
  });
  const dialog = host.querySelector('[data-library-create-website-dialog=""]');
  assert.ok(dialog);
  const input = dialog.querySelector("textarea");
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  ).set;
  await act(async () => {
    setValue.call(input, "一个展示作品集的简洁网站");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => {
    dialog.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(globalThis.__createdWebsiteDescription, "一个展示作品集的简洁网站");
  assert.equal(opened[0]?.artifactId, "a");
  await act(async () => root.unmount());
  host.remove();
});

