// 安全矩阵：不适用（列表页 chrome，无不可信注入）
// 列表页共用 chrome：项目页搜索、查看选项、网格/列表、LeoBay 胶囊。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

function source(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

const chromeUrl = await compileModule("src/shell/collection-chrome.tsx", {
  "../i18n/ui/useUI": uiStub,
});
const {
  CollectionSearchField,
  CollectionPageToolbar,
  CollectionFilterSelect,
  CollectionInfiniteSentinel,
  CollectionCardGrid,
  COLLECTION_CARD_GRID_STYLE,
} = await import(chromeUrl);

const html = (node) => renderToStaticMarkup(node);

test("搜索 markup 含项目页 class", () => {
  const markup = html(
    React.createElement(CollectionSearchField, {
      value: "",
      onChange() {},
      placeholder: "搜索",
    }),
  );
  assert.match(markup, /h-9 w-56 rounded-xl/);
  assert.match(markup, /focus:border-sky-400/);
  assert.match(markup, /data-collection-search/);
  assert.match(markup, /padding-left:36px/);
});

test("toolbar 标题在 type=search 之前", () => {
  const markup = html(
    React.createElement(CollectionPageToolbar, {
      title: "我的库",
      search: "",
      onSearch() {},
      searchPlaceholder: "搜索",
      view: "grid",
      onViewChange() {},
      viewOptions: [],
      extraActions: React.createElement("button", { type: "button" }, "上传文件"),
    }),
  );
  const titleAt = markup.indexOf("我的库");
  const searchAt = markup.indexOf('type="search"');
  const actionAt = markup.indexOf("上传文件");
  assert.ok(titleAt >= 0 && searchAt > titleAt, "标题必须出现在搜索框之前");
  assert.ok(actionAt > searchAt, "页面动作必须排在搜索和查看键右侧");
  assert.match(markup, /data-collection-toolbar-chrome/);
  assert.match(markup, /justify-between/);
  assert.match(markup, /justify-end/);
});

test("传入 Favorites option 时有查看选项", () => {
  const markup = html(
    React.createElement(CollectionPageToolbar, {
      title: "库",
      search: "",
      onSearch() {},
      searchPlaceholder: "搜索",
      view: "grid",
      onViewChange() {},
      viewOptions: [{ id: "favorites", label: "仅看收藏", onSelect() {} }],
    }),
  );
  assert.match(markup, /查看选项|data-collection-view-options/);
  const src = source("../src/shell/collection-chrome.tsx");
  assert.match(src, /查看选项|data-collection-view-options/);
});

test("FilterSelect 未选显示 allLabel，选中显示该项 label", () => {
  const options = [
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
  ];
  const none = html(
    React.createElement(CollectionFilterSelect, {
      label: "类型",
      name: "type",
      value: "",
      options,
      onChange() {},
      allLabel: "全部",
    }),
  );
  assert.match(none, /全部/);
  const picked = html(
    React.createElement(CollectionFilterSelect, {
      label: "类型",
      name: "type",
      value: "image",
      options,
      onChange() {},
      allLabel: "全部",
    }),
  );
  assert.match(picked, /图片/);
});

test("LibraryLayout 用 CollectionSearchField，无旧搜索壳", () => {
  const src = source("../src/shell/LibraryLayout.tsx");
  assert.match(src, /CollectionSearchField/);
  assert.doesNotMatch(src, /sm:max-w-64/);
});

test("card grid is four equal columns that fill the row", () => {
  const markup = html(
    React.createElement(CollectionCardGrid, null, "card"),
  );
  assert.match(markup, /data-collection-card-grid/);
  assert.match(markup, /grid gap-2.5/);
  assert.equal(
    COLLECTION_CARD_GRID_STYLE.gridTemplateColumns,
    "repeat(4, minmax(0, 1fr))",
  );
  assert.doesNotMatch(COLLECTION_CARD_GRID_STYLE.gridTemplateColumns, /auto-fill/);
  assert.doesNotMatch(COLLECTION_CARD_GRID_STYLE.gridTemplateColumns, /12rem/);
});

test("页头动作胶囊与四列货架写在同一份 chrome", () => {
  const src = source("../src/shell/collection-chrome.tsx");
  assert.match(src, /COLLECTION_ACTION_BTN_PRIMARY/);
  assert.match(src, /COLLECTION_CARD_GRID_COLUMNS = 4/);
  const bay = source("../src/shell/bay/shell/LeoBayPage.tsx");
  assert.match(bay, /COLLECTION_ACTION_BTN_PRIMARY/);
  const assets = source("../src/shell/bay/asset/BayAssetLibrary.tsx");
  assert.doesNotMatch(assets, /lg:grid-cols-6/);
  assert.match(assets, /PREVIEW_PER_ROW = 4/);
});

test("下拉菜单搜索与页头同一只白框；箭头打开朝上", () => {
  const src = source("../src/shell/collection-chrome.tsx");
  assert.match(src, /CollectionMenuSearchField/);
  assert.match(src, /data-collection-menu-search/);
  assert.match(src, /data-collection-filter-chevron/);
  assert.match(src, /rotate-180/);
  assert.match(src, /COLLECTION_FILTER_ROW_CLASS/);
  assert.doesNotMatch(src, /rounded-full border-0 bg-neutral-200/);
});

test("infinite sentinel has a silent load-more hook, not a chrome button", () => {
  const markup = html(
    React.createElement(CollectionInfiniteSentinel, {
      active: true,
      onLoadMore() {},
    }),
  );
  assert.match(markup, /data-collection-infinite-sentinel/);
  assert.match(markup, /data-collection-load-more/);
  assert.match(markup, /继续加载/);
  assert.doesNotMatch(markup, /rounded-lg border/);
  assert.doesNotMatch(markup, /rounded-full border/);
});
