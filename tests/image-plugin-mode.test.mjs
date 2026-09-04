import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  applyImageL0Mode,
  bindImageModeAdapter,
  IMAGE_PLUGIN_ID,
  rememberedImagePluginMode,
} from "../src/shell/image-editor/design-mode/image-plugin-mode.ts";
import {
  currentPluginMode,
  resetPluginModeCache,
  setPluginMode,
} from "../src/shell/plugin-chrome/plugin-mode-store.ts";

test("没存过就是普通模式（R3）", () => {
  resetPluginModeCache();
  assert.equal(rememberedImagePluginMode(), DEFAULT_EDITOR_MODE);
  assert.equal(applyImageL0Mode("normal").showPhotopea, false);
});

test("记住的档位是专业模式时，打开就进专业模式", () => {
  resetPluginModeCache();
  setPluginMode(IMAGE_PLUGIN_ID, "pro");
  assert.equal(currentPluginMode("image"), "pro");
  assert.equal(rememberedImagePluginMode(), "pro");
  assert.equal(applyImageL0Mode(rememberedImagePluginMode()).showPhotopea, true);
});

test("setMode(\"pro\") 必须改状态，空转不算接上", () => {
  const applied = applyImageL0Mode("pro");
  assert.equal(applied.mode, "pro");
  assert.equal(applied.showPhotopea, true);
  const back = applyImageL0Mode("normal");
  assert.equal(back.mode, "normal");
  assert.equal(back.showPhotopea, false);
});

test("adapter.mode 必须挂上 setMode，undefined 当场拒", () => {
  const calls = [];
  const adapter = bindImageModeAdapter("normal", (mode) => {
    calls.push(mode);
  });
  assert.equal(adapter.current, "normal");
  adapter.setMode("pro");
  assert.deepEqual(calls, ["pro"]);
  assert.throws(
    () => bindImageModeAdapter("normal", undefined),
    /setMode/,
  );
});

test("认不出的档位一律当普通模式，不另开第三条路", () => {
  const applied = applyImageL0Mode(/** @type {never} */ ("studio"));
  assert.equal(applied.mode, "normal");
  assert.equal(applied.showPhotopea, false);
});
