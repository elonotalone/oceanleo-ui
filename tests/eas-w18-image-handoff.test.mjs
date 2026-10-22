import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/shell/advanced-routes/ImageRoute.tsx", "utf8");

test("ImageRoute 单一模式：保存只认画布 dirty，flush 走 Fabric editor.save", () => {
  assert.match(route, /flush: saveBeforeNewConversation/);
  assert.match(route, /const saved = await editor\.save\(\)/);
  assert.match(route, /dirty: editor\.dirty && collab\.saveGate/);
  assert.match(route, /autoSave: true/);
  assert.equal(/bindProFaceHandoff|bindNormalFaceHandoff|togglePro|proSwitch/.test(route), false);
});

test("图片编辑器不另走导出 PNG 写回、没有 iframe", () => {
  assert.match(route, /<FabricImageStage /);
  assert.equal(/<iframe/i.test(route), false);
  assert.equal(/saveToOE/.test(route), false);
});
