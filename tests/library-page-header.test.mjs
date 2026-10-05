// 库 / 历史 / 文件库页头：17px 小标题与搜索同一行，介绍句 DOM 为零。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/library-page-header.test.mjs

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const FRAME_CLASS =
  "mx-auto flex min-h-0 w-full max-w-6xl flex-col px-4 pt-3 pb-5";
const TITLE_CLASS =
  "text-[17px] font-semibold tracking-tight text-neutral-900";

const source = (rel) => readFileSync(resolve(REPO, rel), "utf8");

function literal(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("full-page library drops the intro and 22px title; search sits in LibraryScope.header", () => {
  const artifacts = source("src/shell/ArtifactLibrary.tsx");
  const mine = source("src/shell/MyLibrary.tsx");
  const scope = source("src/shell/library-scope.tsx");
  assert.match(artifacts, /APP_PAGE_FRAME_CLASS/);
  assert.match(artifacts, /pageTitle="我的库"/);
  assert.doesNotMatch(artifacts, /text-\[22px\]/);
  assert.doesNotMatch(
    artifacts,
    /作品、网站、任务交付物和上传文件统一保存在这里/,
  );
  assert.match(mine, /header=/);
  assert.match(mine, /leading=/);
  assert.match(mine, /hideToolbar/);
  assert.match(mine, /APP_PAGE_TITLE_CLASS/);
  assert.match(scope, /header\?:/);
  assert.match(scope, /\{header\}/);
});

test("history, file library, and database pages use AppPageHeader without intro copy", () => {
  const history = source("src/shell/HistoryPage.tsx");
  const files = source("src/shell/FileLibrary.tsx");
  const database = source("src/pages/MyDatabasePage.tsx");
  const advanced = source("src/shell/AdvancedFeaturePages.tsx");
  for (const body of [history, files, database, advanced]) {
    assert.match(body, /AppPageHeader/);
    assert.match(body, /APP_PAGE_FRAME_CLASS/);
    assert.doesNotMatch(body, /text-\[22px\]/);
  }
  assert.doesNotMatch(history, /本站每次对话 \/ 工作都会记录在这里/);
  assert.doesNotMatch(history, /全家桶各站的每次对话 \/ 工作都会记录在这里/);
  assert.doesNotMatch(files, /上传文件供本站 AI 使用/);
  assert.doesNotMatch(database, /你在全 OceanLeo 系列里产出的作品/);
  assert.doesNotMatch(advanced, /独立于普通 App 的专业编辑空间/);
});

test("LibraryScope renders header above the cloud/local nav", async () => {
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

  const jsdom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://oceanleo.com/library",
  });
  for (const [name, value] of Object.entries({
    window: jsdom.window,
    document: jsdom.window.document,
    navigator: jsdom.window.navigator,
    HTMLElement: jsdom.window.HTMLElement,
    Element: jsdom.window.Element,
    Node: jsdom.window.Node,
    Event: jsdom.window.Event,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { createRoot } = await import("react-dom/client");
  const { LibraryScope } = await import(
    await compileModule("src/shell/library-scope.tsx", {
      "./library-scope-client": dataModule(`
        export const defaultLibraryScopeAdapter = {
          listDevices: async () => [],
          refreshLocalLibrary: async () => ({ files: [], updatedAt: Date.now() }),
        };
        export const normalizeAbsoluteLibraryPath = (value) => value || null;
      `),
    })
  );

  const host = jsdom.window.document.createElement("div");
  jsdom.window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        LibraryScope,
        {
          devices: [],
          header: React.createElement("h1", { className: TITLE_CLASS }, "我的库"),
        },
        React.createElement("div", { "data-cloud-body": "true" }, "body"),
      ),
    );
  });
  const html = host.innerHTML;
  const headerAt = html.indexOf("我的库");
  const navAt = html.indexOf("云端库");
  assert.ok(headerAt >= 0, "header title must render");
  assert.ok(navAt >= 0, "cloud/local nav must render");
  assert.ok(headerAt < navAt, "title must sit above 云端库");
  assert.match(html, new RegExp(literal(TITLE_CLASS)));
  root.unmount();
});

test("AppPageHeader contract class strings still match the visual contract", () => {
  const headerPath = resolve(REPO, "src/shell/AppPageHeader.tsx");
  if (!existsSync(headerPath)) return;
  const header = readFileSync(headerPath, "utf8");
  assert.match(header, new RegExp(literal(TITLE_CLASS)));
  assert.match(header, new RegExp(literal(FRAME_CLASS)));
});
