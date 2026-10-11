// 安全矩阵：UC-4（报错内容是不可信文本，只按文本渲染；本文件断言没有注入点）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  currentBayAppSource,
  matchingRemembered,
  rememberBayAppEntry,
  resolveSource,
} from "../src/shell/bay/appinsights/app-source.ts";
import {
  appSharePath,
  errorActionLabel,
  errorActionStatus,
  errorEmptyText,
  errorFileShort,
  errorLocation,
  errorStatusActions,
  openRatio,
  shelfOpenEntry,
  sourceLabel,
} from "../src/shell/bay/appinsights/insights-model.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

const NOW = 1_000_000;
const remembered = (appId, entry, at = NOW - 1_000) => ({ appId, entry, at });

function resolve(extra = {}) {
  return resolveSource({
    search: "",
    remembered: null,
    now: NOW,
    siteKey: "game",
    referrer: "",
    host: "game.oceanleo.com",
    ...extra,
  });
}

test("resolveSource：查询串 src=share / follow 最先命中", () => {
  assert.equal(resolve({ search: "?bay=app:1&src=share", remembered: remembered("a", "search") }), "share");
  assert.equal(resolve({ search: "src=follow", remembered: remembered("a", "fresh") }), "follow");
  assert.equal(resolve({ search: "?src=search" }), "direct");
});

test("resolveSource：30 秒内记下的入口；过了 30 秒不算", () => {
  assert.equal(resolve({ remembered: remembered("a", "search") }), "search");
  assert.equal(resolve({ remembered: remembered("a", "fresh") }), "fresh");
  assert.equal(resolve({ remembered: remembered("a", "follow") }), "follow");
  assert.equal(resolve({ remembered: remembered("a", "shelf") }), "site:game");
  assert.equal(resolve({ remembered: remembered("a", "search", NOW - 30_001) }), "direct");
  assert.equal(resolve({ remembered: remembered("a", "search", NOW - 30_000) }), "search");
});

test("resolveSource：非法 siteKey 时 shelf 不写成 site:", () => {
  assert.equal(resolve({ remembered: remembered("a", "shelf"), siteKey: "g" }), "shelf");
  assert.equal(resolve({ remembered: remembered("a", "shelf"), siteKey: "Game" }), "shelf");
  assert.equal(resolve({ remembered: remembered("a", "shelf"), siteKey: "has_under" }), "shelf");
  assert.equal(resolve({ remembered: remembered("a", "shelf"), siteKey: "abcdefghijklmnopqrstuvwxy" }), "shelf");
  assert.equal(resolve({ remembered: remembered("a", "shelf"), siteKey: "ppt" }), "site:ppt");
});

test("resolveSource：别的 appId 不算", () => {
  const other = remembered("app-a", "search");
  assert.equal(matchingRemembered("app-b", other, NOW), null);
  assert.deepEqual(matchingRemembered("app-a", other, NOW), other);
  assert.equal(resolve({ remembered: matchingRemembered("app-b", other, NOW) }), "direct");
  assert.equal(resolve({ remembered: matchingRemembered("app-a", other, NOW) }), "search");
});

test("resolveSource：referrer 主机不同；oceanleo.com 子域算 direct；www. 去掉", () => {
  assert.equal(
    resolve({ referrer: "https://www.example.com/from", host: "game.oceanleo.com" }),
    "ext:example.com",
  );
  assert.equal(
    resolve({ referrer: "https://docs.example.com/x", host: "game.oceanleo.com" }),
    "ext:docs.example.com",
  );
  assert.equal(
    resolve({ referrer: "https://oceanleo.com/bay", host: "game.oceanleo.com" }),
    "direct",
  );
  assert.equal(
    resolve({ referrer: "https://www.oceanleo.com/bay", host: "game.oceanleo.com" }),
    "direct",
  );
  assert.equal(
    resolve({ referrer: "https://image.oceanleo.com/bay", host: "game.oceanleo.com" }),
    "direct",
  );
  assert.equal(
    resolve({ referrer: "https://game.oceanleo.com/other", host: "game.oceanleo.com" }),
    "direct",
  );
});

test("currentBayAppSource 在没有 window 时是 direct", () => {
  rememberBayAppEntry("app-1", "search");
  assert.equal(currentBayAppSource("app-1", "game"), "direct");
});

test("sourceLabel 覆盖每一种来源", () => {
  assert.equal(sourceLabel("site:game", "LeoPlay"), "LeoPlay 的 Bay");
  assert.equal(sourceLabel("site:game", ""), "game 的 Bay");
  assert.equal(sourceLabel("search", ""), "Bay 搜索");
  assert.equal(sourceLabel("fresh", ""), "新作品推荐位");
  assert.equal(sourceLabel("shelf", ""), "作品货架");
  assert.equal(sourceLabel("share", ""), "分享链接");
  assert.equal(sourceLabel("follow", ""), "关注列表与更新通知");
  assert.equal(sourceLabel("direct", ""), "直接打开");
  assert.equal(sourceLabel("ext:example.com", ""), "站外：example.com");
  assert.equal(sourceLabel("other", ""), "其他");
  assert.equal(sourceLabel("unknown", ""), "其他");
});

test("报错卡：文件只显示最后两段；状态对应两个按钮", () => {
  assert.equal(errorFileShort("https://cdn.example.com/a/b/c.js?x=1"), "b/c.js");
  assert.equal(errorFileShort("/only.js"), "only.js");
  assert.equal(errorFileShort("app.js"), "app.js");
  assert.equal(errorLocation("https://x.test/pkg/src/main.ts", 12, 3), "src/main.ts:12:3");
  assert.deepEqual(errorStatusActions("open"), ["resolve", "ignore"]);
  assert.deepEqual(errorStatusActions("resolved"), ["ignore", "reopen"]);
  assert.deepEqual(errorStatusActions("ignored"), ["resolve", "reopen"]);
  assert.equal(errorActionStatus("resolve"), "resolved");
  assert.equal(errorActionStatus("ignore"), "ignored");
  assert.equal(errorActionStatus("reopen"), "open");
  assert.equal(errorActionLabel("resolve"), "标为已解决");
  assert.equal(errorEmptyText("open"), "没有未处理的报错");
});

test("货架入口与分享路径、打开占比", () => {
  assert.equal(shelfOpenEntry({ q: " 画 " }), "search");
  assert.equal(shelfOpenEntry({ q: "" }), "shelf");
  assert.equal(shelfOpenEntry({ q: "" }, { fresh: true }), "fresh");
  assert.equal(appSharePath("abc"), "/bay?bay=app:abc&src=share");
  assert.equal(openRatio(3, 10), 30);
  assert.equal(openRatio(0, 10), 0);
  assert.equal(openRatio(3, 0), 0);
});

// UC-4：报错内容是不可信文本，只按文本渲染；来源标签不落任何浏览器存储。
test("两个面板与新文件没有 dangerouslySetInnerHTML；app-source 不用浏览器存储；货架调用了 rememberBayAppEntry", () => {
  const files = [
    "src/shell/bay/appinsights/ErrorsManagePanel.tsx",
    "src/shell/bay/appinsights/SourcesManagePanel.tsx",
    "src/shell/bay/appinsights/ShareLinkButton.tsx",
    "src/shell/bay/appinsights/insights-model.ts",
    "src/shell/bay/appinsights/app-source.ts",
  ];
  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${file} 不得注入 HTML`);
    assert.doesNotMatch(text, /innerHTML\s*=/, `${file} 不得写 innerHTML`);
  }
  const appSource = source("src/shell/bay/appinsights/app-source.ts");
  assert.doesNotMatch(appSource, /localStorage/);
  assert.doesNotMatch(appSource, /sessionStorage/);
  assert.doesNotMatch(appSource, /document\.cookie/);
  const shelf = source("src/shell/bay/apps/BayAppShelf.tsx");
  assert.match(shelf, /rememberBayAppEntry\(app\.id,/);
  assert.match(source("src/shell/bay/appinsights/ErrorsManagePanel.tsx"), /data-bay-error-card/);
  assert.match(source("src/shell/bay/appinsights/SourcesManagePanel.tsx"), /data-bay-sources-table/);
  assert.match(source("src/shell/bay/appinsights/ShareLinkButton.tsx"), /data-bay-share-copy/);
});
