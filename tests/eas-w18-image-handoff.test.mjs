import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/shell/advanced-routes/ImageRoute.tsx", "utf8");

test("ImageRoute 两页共用 Fabric：切页只改 L0，保存只认画布 dirty", () => {
  assert.match(route, /setPluginModeState\(applyImageL0Mode\(mode\)\.mode\)/);
  assert.match(route, /bindProFaceHandoff\(/);
  assert.match(route, /bindNormalFaceHandoff\(/);
  assert.match(route, /hasUnsavedChanges: \(\) => editor\.dirty/);
  assert.match(route, /flush: saveBeforeNewConversation/);
  assert.match(route, /const saved = await editor\.save\(\)/);
  assert.equal(/togglePro|proSwitch/.test(route), false);
});

test("专业页不再另走导出 PNG 写回", () => {
  assert.match(route, /<FabricImageStage /);
  assert.equal(/<iframe/i.test(route), false);
  assert.equal(/saveToOE/.test(route), false);
});
