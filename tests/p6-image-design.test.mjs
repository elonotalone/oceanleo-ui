import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/shell/advanced-routes/ImageRoute.tsx", "utf8");

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

