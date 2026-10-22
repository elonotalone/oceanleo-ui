import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/shell/advanced-routes/ImageRoute.tsx", "utf8");
const embedded = readFileSync("src/shell/advanced-routes/EmbeddedRoute.tsx", "utf8");

test("图片编辑器没有第二个模式页，也不挂第三方保存", () => {
  assert.equal(/setPluginModeState|applyImageL0Mode/.test(route), false);
  assert.equal(route.includes("专业编辑还没确认保存"), false);
  assert.equal(/<iframe/i.test(route), false);
});

test("同一条 flush：Fabric editor.save 自动保存", () => {
  assert.match(route, /flush: saveBeforeNewConversation/);
  assert.match(route, /const saved = await editor\.save\(\)/);
  assert.match(route, /autoSave: true/);
  assert.match(route, /dirty: editor\.dirty && collab\.saveGate/);
});

test("设计 canvas 一份工作文档 schema；website 不假装有第二套专业保存", () => {
  assert.match(embedded, /DESIGN_CANVAS_WORKING_SCHEMA = "oceanleo\.design\.canvas\.v1"/);
  assert.match(embedded, /draftSchema:\s*\n\s*hostedMediaType === "canvas"\s*\n\s*\? DESIGN_CANVAS_WORKING_SCHEMA/);
  assert.equal(/oceanleo\.design\.canvas\.pro\.v1|oceanleo\.design\.edit\.v1/.test(embedded), false);
  assert.match(embedded, /autoSave: hostedMediaType !== "website"/);
  assert.match(embedded, /Pro mode uses this same flush\. Do not add a second confirmation/);
  assert.equal(/confirmation:\s*\{/.test(embedded), false);
  assert.match(embedded, /Switching never waits on a save/);
});
