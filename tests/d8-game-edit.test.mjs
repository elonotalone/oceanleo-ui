import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("游戏素材的编辑回调与公开试玩回调保持分离", () => {
  const open = source("../src/shell/material-library-open.ts");
  const feed = source("../src/shell/ExplorePlayableFeed.tsx");
  // Edit has already prepared/forked the durable item before this callback.
  // The editable branch must win; only a read-only item may fall through to
  // public play, and an unplayable/uneditable item must reach the error.
  const body = open.slice(open.indexOf("export function useMaterialLibraryOpenItem"));
  const editableAt = body.indexOf("if (!isAdvancedEditableShelfItem(item)) {");
  const playAt = body.indexOf("if (openArtifactPlay(item)) return;");
  const throwAt = body.indexOf("throw new Error(\"当前 revision 缺少可验证的编辑器 source。\");");
  assert.ok(editableAt >= 0, "缺少编辑器能力判断");
  assert.ok(playAt >= 0, "缺少只读游戏试玩分流");
  assert.ok(throwAt >= 0, "缺少不可编辑错误");
  assert.ok(editableAt < playAt && playAt < throwAt, "编辑判断、试玩分流、报错顺序错误");
  assert.match(feed, /const playHref = item \? artifactPlayHref\(item\) : ""/);
  assert.match(feed, /href=\{playHref\}/);
});

test("公开 artifact 播放页仍只读官方目录投影", () => {
  const lookup = source("../../game/app/play/artifact/artifact-play-lookup.ts");
  assert.match(lookup, /game-official\/board-ref/);
  assert.match(lookup, /v1\/library\/items/);
  assert.doesNotMatch(lookup, /getArtifactEditDecision|forkArtifact/);
});
