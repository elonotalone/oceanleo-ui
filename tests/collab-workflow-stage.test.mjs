import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stage = read("src/shell/workflow-carrier/VideoCanvasStage.tsx");
const route = read("src/shell/advanced-routes/VideoCanvasRoute.tsx");
const copy = read("src/i18n/ui/messages/collab-workflow-copy.ts");

test("外壳只走 v1 协议已有的 recovery 消息：不自己 postMessage、不开 iframe、不碰来源校验", () => {
  for (const [name, text] of [["stage", stage], ["route", route]]) {
    assert.doesNotMatch(text, /\.postMessage\(/, `${name} 不许自己发 postMessage`);
    assert.doesNotMatch(text, /<iframe/, `${name} 不许新开 iframe`);
    assert.doesNotMatch(text, /targetOrigin|"\*"/, `${name} 不许碰来源`);
    assert.doesNotMatch(text, /sandbox\s*=/, `${name} 不许改 sandbox`);
  }
  for (const prop of ["recoveryCaptureRequestId", "onRecoverySnapshot", "recoveryRestore", "onRecoveryResult"]) {
    assert.match(stage, new RegExp(prop), `stage 应经 ${prop} 与画布交换`);
  }
});

test("三种模式：detect（问画布）→ collab（新画布按节点连线合并）/ lock（旧画布仍一次一人）", () => {
  assert.match(stage, /type Mode = "detect" \| "collab" \| "lock"/);
  // 一次只开一个房间：另一个 hook 拿到空条目
  assert.match(stage, /item: mode === "lock" \? item : null/);
  assert.match(stage, /item: mode === "collab" && !realigning \? \(item \?\? \{\}\) : \{\}/);
  // 没有可协同的画布（stand-in）一律走 lock，老测试与老行为不变
  assert.match(stage, /liveCanvasBase \? "detect" : "lock"/);
  // 旧画布 5 秒不回就退回 lock
  assert.match(stage, /if \(modeRef\.current === "detect"\) setMode\("lock"\)/);
});

test("画布整块 inert 只留给没法告诉它只读的情况（探测期、旧画布被别人锁住）", () => {
  assert.match(stage, /mode === "detect" \? true : mode === "collab" \? !controlReady : lockedEdit\.readOnly/);
  assert.match(stage, /inert=\{canvasInert \|\| undefined\}/);
  assert.doesNotMatch(stage, /inert=\{collabReadOnly/);
});

test("本端状态只来自抓取：补丁发完之前本端交给房间的是 null；保存回执告诉房间", () => {
  assert.match(stage, /link\.applyRemote\(state\)/);
  assert.match(stage, /setLocalGraph\(null\)/);
  assert.match(stage, /onVersionSaved=\{collabMode \? onCanvasSaved : undefined\}/);
  assert.match(stage, /markSavedRef\.current\(String\(saved\.revisionId\)\)/);
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
