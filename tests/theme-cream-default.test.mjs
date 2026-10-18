import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LIGHT_BASE_CANVAS,
  LIGHT_VARIANT_THEMES,
  appearanceToHtmlClass,
  normalizeThemeMode,
  resolveThemeClass,
} from "../src/theme/theme-config.ts";

test("Light 就是暖灰米基座；旧冷白是浅色变体；auto 浅色解析成 light", () => {
  assert.equal(resolveThemeClass("auto", false), "light");
  assert.equal(resolveThemeClass("auto", true), "dark");
  assert.equal(resolveThemeClass("light", false), "light");
  assert.equal(resolveThemeClass("cool", false), "cool");
  assert.equal(normalizeThemeMode("cream"), "light");
  assert.equal(appearanceToHtmlClass("light"), "light");
  assert.equal(appearanceToHtmlClass("cool"), "cool");
  assert.deepEqual([...LIGHT_VARIANT_THEMES], ["cool", "paper", "mist", "dawn", "sakura"]);
  assert.equal(LIGHT_VARIANT_THEMES.includes("cream"), false);
});

test("Light 基座画布是 Claude 石色，比旧 Etsy 奶白暗", () => {
  assert.equal(LIGHT_BASE_CANVAS, "#f0eee6");
  const globals = readFileSync(new URL("../src/theme/globals.css", import.meta.url), "utf8");
  const lightBody = globals.match(/html\.light,\s*html\.light body \{[^}]+\}/);
  assert.ok(lightBody, "missing html.light body block");
  assert.match(lightBody[0], /background: #f0eee6;/);
  assert.doesNotMatch(lightBody[0], /#e8edf8/);
});

test("AppShell 侧栏颜色不放进 className 模板，避免 SWC 把后面的 ${ 当成标签", () => {
  const source = readFileSync(new URL("../src/shell/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /bg-\[var\(--sidebar\)\]/);
  assert.doesNotMatch(source, /className=\{`[^`]*bg-\[var\(--sidebar\)\]/s);
});
