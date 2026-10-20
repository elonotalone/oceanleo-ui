// 安全矩阵：不适用（列表页 chrome，无不可信注入）

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (rel) => readFileSync(resolve(REPO, rel), "utf8");

test("library chrome uses CollectionFilterSelect / viewOptions; favorites leave chips", () => {
  const artifacts = source("src/shell/ArtifactLibrary.tsx");
  const mine = source("src/shell/MyLibrary.tsx");
  assert.match(artifacts, /CollectionFilterSelect|viewOptions/);
  assert.match(mine, /CollectionFilterSelect|viewOptions/);
  assert.match(mine, /CollectionFilterRow/);
  assert.match(mine, /COLLECTION_ACTION_BTN_PRIMARY/);
  assert.doesNotMatch(mine, /rounded-lg border border-\[var\(--border,#e7e5e4\)\] px-2\.5 text-\[11px\]/);
  assert.doesNotMatch(
    artifacts,
    /\{\s*id:\s*"favorites",\s*label:\s*"我的收藏"\s*\}/,
  );
  assert.doesNotMatch(
    mine,
    /\{\s*id:\s*"favorites",\s*label:\s*"我的收藏"\s*\}/,
  );
  assert.match(artifacts, /onlyFavorites/);
  assert.match(mine, /onlyFavorites/);
  assert.match(mine, /favoritesOnly/);
  assert.doesNotMatch(mine, /加载中…" : "刷新"/);
  assert.doesNotMatch(mine, /加载中…" : "继续加载"/);
  assert.doesNotMatch(artifacts, /加载中…" : "继续加载"/);
  assert.match(mine, /onLoadMore=\{loadMore\}/);
  assert.match(artifacts, /CollectionInfiniteSentinel/);
  assert.match(artifacts, /COLLECTION_CARD_GRID_STYLE|CollectionCardGrid/);
  const toolbar = source("src/shell/LibraryLayout.tsx");
  assert.match(toolbar, /ml-auto/);
  assert.match(toolbar, /justify-end/);
  const searchAt = toolbar.indexOf("<CollectionSearchField");
  const actionsAt = toolbar.indexOf("{actions}");
  assert.ok(searchAt >= 0 && actionsAt > searchAt, "上传等动作必须排在搜索右侧");
});
