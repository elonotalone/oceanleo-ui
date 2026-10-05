// AppPageHeader + LibraryToolbar.leading：列表页 17px 左上标题，搜索在同一行右侧。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/app-page-header.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const TITLE_CLASS =
  "text-[17px] font-semibold tracking-tight text-neutral-900";
const FRAME_CLASS =
  "mx-auto flex min-h-0 w-full max-w-6xl flex-col px-4 pt-3 pb-5";
const HEADER_ROW_CLASS =
  "mb-3 flex min-h-9 shrink-0 items-center justify-between gap-3";

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
  url: "https://oceanleo.com/library",
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
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const { createRoot } = await import("react-dom/client");

const {
  AppPageHeader,
  APP_PAGE_TITLE_CLASS,
  APP_PAGE_FRAME_CLASS,
  APP_PAGE_HEADER_ROW_CLASS,
} = await import(
  await compileModule("src/shell/AppPageHeader.tsx", {
    "../i18n/ui/useUI": dataModule(`export function useUI() { return (value) => value; }`),
  })
);

const { LibraryToolbar } = await import(
  await compileModule("src/shell/LibraryLayout.tsx")
);

async function mount(node) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return { host, root };
}

test("AppPageHeader markup is 17px, not 22px, with children to the right of the title", async () => {
  const { host, root } = await mount(
    React.createElement(
      AppPageHeader,
      { title: "我的库" },
      React.createElement("span", { "data-header-child": "true" }, "搜索槽"),
    ),
  );
  const html = host.innerHTML;
  assert.match(html, /text-\[17px\]/);
  assert.doesNotMatch(html, /text-\[22px\]/);
  const title = host.querySelector("h1");
  const child = host.querySelector("[data-header-child]");
  assert.equal(title?.textContent, "我的库");
  assert.equal(child?.textContent, "搜索槽");
  assert.equal(
    Boolean(
      title &&
        child &&
        title.compareDocumentPosition(child) &
          window.Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    true,
  );
  root.unmount();
  host.remove();
});

test("LibraryToolbar leading text appears before the search box", async () => {
  const { host, root } = await mount(
    React.createElement(LibraryToolbar, {
      search: "",
      setSearch() {},
      view: "grid",
      setView() {},
      placeholder: "搜索",
      tt: (value) => value,
      leading: React.createElement("span", { "data-toolbar-leading": "true" }, "页头标题"),
    }),
  );
  const leading = host.querySelector("[data-toolbar-leading]");
  const search = host.querySelector("input[type=search]");
  assert.equal(leading?.textContent, "页头标题");
  assert.ok(search);
  assert.equal(
    Boolean(
      leading &&
        search &&
        leading.compareDocumentPosition(search) &
          window.Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    true,
  );
  root.unmount();
  host.remove();
});

test("contract classes and PageTitle no longer write 22px", () => {
  assert.equal(APP_PAGE_TITLE_CLASS, TITLE_CLASS);
  assert.equal(APP_PAGE_FRAME_CLASS, FRAME_CLASS);
  assert.equal(APP_PAGE_HEADER_ROW_CLASS, HEADER_ROW_CLASS);

  const pageTitle = readFileSync(
    new URL("../src/shell/AppShell.tsx", import.meta.url),
    "utf8",
  ).match(/export function PageTitle[\s\S]*?\n\}/);
  assert.ok(pageTitle, "PageTitle export exists");
  assert.doesNotMatch(pageTitle[0], /text-\[22px\]/);
  assert.match(pageTitle[0], /AppPageHeader/);

  const indexFirst = readFileSync(
    new URL("../src/shell/index.ts", import.meta.url),
    "utf8",
  )
    .split("\n")[0];
  assert.equal(
    indexFirst,
    'export { AppShell, PageTitle, AppPageHeader, APP_PAGE_TITLE_CLASS, APP_PAGE_FRAME_CLASS, APP_PAGE_HEADER_ROW_CLASS } from "./AppShell";',
  );
  const indexLines = readFileSync(
    new URL("../src/shell/index.ts", import.meta.url),
    "utf8",
  ).split("\n").length;
  assert.ok(indexLines <= 800, `index.ts has ${indexLines} lines`);

  const library = readFileSync(
    new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url),
    "utf8",
  );
  assert.match(library, /pageTitle\?: ReactNode/);
  assert.match(library, /hideToolbar\?: boolean/);
  assert.match(library, /hideToolbar \? null/);
  assert.match(library, /APP_PAGE_TITLE_CLASS/);
});
