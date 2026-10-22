import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stage = read("src/shell/workflow-carrier/VideoCanvasStage.tsx");
const route = read("src/shell/advanced-routes/VideoCanvasRoute.tsx");
const copy = read("src/i18n/ui/messages/collab-workflow-copy.ts");

test("画布不自己 postMessage、不开 iframe、不碰来源校验，也不嵌子站画布", () => {
  for (const [name, text] of [["stage", stage], ["route", route]]) {
    assert.doesNotMatch(text, /\.postMessage\(/, `${name} 不许自己发 postMessage`);
    assert.doesNotMatch(text, /<iframe/, `${name} 不许新开 iframe`);
    assert.doesNotMatch(text, /targetOrigin|"\*"/, `${name} 不许碰来源`);
    assert.doesNotMatch(text, /sandbox\s*=/, `${name} 不许改 sandbox`);
    assert.doesNotMatch(text, /EmbedEditorPane|workbench-embed/, `${name} 不许嵌子站画布`);
  }
});

test("协作只剩编辑锁（一次一人）：本地画布不再有 detect / collab 模式", () => {
  assert.match(stage, /useLockedEditCollab\(\{\s*item,/);
  assert.doesNotMatch(stage, /useEntityCollab|CanvasCollabLink|type Mode =/);
  assert.match(stage, /collab: lockedEdit\.collab/);
});

test("分表只含本单元的三条文案，且 16 个译文语种每条都有（加原文共 17 种）", () => {
  const source = [...copy.matchAll(/^ {2}(\w+): "/gm)].map((m) => m[1]);
  assert.deepEqual([...source].sort(), ["notAppliedNote", "tooBigNote", "viewerNote"]);
  for (const name of source) {
    const translated = [...copy.matchAll(new RegExp(`^ {4}${name}: "`, "gm"))].length;
    assert.equal(translated, 16, `${name} 应有 16 个译文`);
  }
  // 占位符两边一致
  assert.equal([...copy.matchAll(/tooBigNote: ".*\{n\}/g)].length, 17);
});
