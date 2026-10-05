// 工作台 / Playground / 操作台目录页头（Manus 列表页 chrome，2026-10-05 W3）。
//
// 人侧：左上 17px 小标题，同一行右侧搜索；「点开即用」「浏览全家桶」介绍句不进 DOM。
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入，所以本文件可以直接
// `node --test tests/workspace-page-header.test.mjs` 跑。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const TITLE_CLASS = "text-[17px] font-semibold tracking-tight text-neutral-900";

function source(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

const workspace = source("../src/shell/WorkspaceMasterDetail.tsx");
const playground = source("../src/shell/Playground.tsx");
const operatorConsole = source("../src/shell/OperatorConsole.tsx");
const appDirectory = source("../src/shell/AppDirectory.tsx");

function withoutComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("工作台 / Playground 源码不含介绍拼句", () => {
  assert.doesNotMatch(workspace, /点开即用/);
  assert.doesNotMatch(workspace, /浏览全家桶/);
  assert.doesNotMatch(playground, /点开即用/);
  assert.doesNotMatch(playground, /浏览全家桶/);
});

test("页标题 class 为合同 17px，不再写 22px 页标题", () => {
  for (const [name, src] of [
    ["WorkspaceMasterDetail", workspace],
    ["Playground", playground],
    ["OperatorConsole", operatorConsole],
  ]) {
    assert.match(src, /APP_PAGE_TITLE_CLASS/, `${name} 未用 APP_PAGE_TITLE_CLASS`);
    assert.match(src, /APP_PAGE_FRAME_CLASS/, `${name} 未用 APP_PAGE_FRAME_CLASS`);
    assert.doesNotMatch(
      withoutComments(src),
      /<h1 className="text-\[22px\]/,
      `${name} 仍有 22px 页标题`,
    );
  }
  assert.match(workspace, /APP_PAGE_HEADER_ROW_CLASS/);
});

test("OperatorConsole 目录不渲染 directorySubtitle", () => {
  const code = withoutComments(operatorConsole);
  assert.doesNotMatch(code, /directorySubtitle &&/);
  assert.doesNotMatch(code, /typeof directorySubtitle/);
  assert.match(operatorConsole, /directorySubtitle\?: ReactNode/);
});

test("AppDirectory 支持 toolbarLeading 与 belowToolbar", () => {
  assert.match(appDirectory, /toolbarLeading\?: ReactNode/);
  assert.match(appDirectory, /belowToolbar\?: ReactNode/);
  assert.match(appDirectory, /leading=\{toolbarLeading\}/);
  assert.match(appDirectory, /\{belowToolbar\}/);
});

const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");
const appDirectoryUrl = await compileModule("src/shell/AppDirectory.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
});
const { AppDirectory } = await import(appDirectoryUrl);

test("渲染后标题 17px 在搜索左侧，介绍句不在 markup，belowToolbar 在搜索下方", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AppDirectory, {
      items: [{ id: "poster", name: "海报生成", tagline: "活动海报" }],
      accent: "#6366f1",
      toolbarLeading: React.createElement(
        "h1",
        { className: TITLE_CLASS },
        "工作台",
      ),
      belowToolbar: React.createElement("div", { "data-section-tabs": "1" }, "网站"),
      onOpen() {},
    }),
  );
  assert.match(markup, /工作台/);
  assert.match(markup, /text-\[17px\]/);
  assert.doesNotMatch(markup, /text-\[22px\]/);
  assert.doesNotMatch(markup, /点开即用/);
  assert.doesNotMatch(markup, /浏览全家桶/);
  const titleAt = markup.indexOf("工作台");
  const searchAt = markup.indexOf('type="search"');
  const tabsAt = markup.indexOf("data-section-tabs");
  assert.ok(titleAt >= 0 && searchAt > titleAt, "标题必须出现在搜索框之前");
  assert.ok(tabsAt > searchAt, "分区 tab 必须在搜索行之下");
});

test("Playground 把标题|搜索交给各分区，市场不再写介绍句", () => {
  assert.match(playground, /renderSites\(listChrome\)/);
  assert.match(playground, /toolbarLeading=\{pageTitle\}/);
  assert.doesNotMatch(playground, /function PlaygroundHeader/);
  const market = source("../src/shell/AppMarket.tsx");
  assert.doesNotMatch(market, /平台一共有/);
  assert.doesNotMatch(market, /跨站搜索，找到后加入工作台/);
  assert.match(market, /toolbarLeading/);
  assert.match(market, /hideView/);
});

test("工作台网站 tab 把 chrome 交给 renderSites，空态不再解释 app/agent", () => {
  assert.match(workspace, /renderSites\(listChrome\)/);
  assert.doesNotMatch(workspace, /一整套操作台/);
  assert.doesNotMatch(workspace, /纯聊天助手/);
});
