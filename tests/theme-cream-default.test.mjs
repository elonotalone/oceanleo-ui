import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { appearanceToHtmlClass, resolveThemeClass } from "../src/theme/theme-config.ts";

test("auto 浅色解析成奶白，显式浅色仍是原来的 light", () => {
  assert.equal(resolveThemeClass("auto", false), "cream");
  assert.equal(resolveThemeClass("auto", true), "dark");
  assert.equal(resolveThemeClass("light", false), "light");
  assert.equal(resolveThemeClass("cream", false), "cream");
  assert.equal(appearanceToHtmlClass("cream"), "cream");
  assert.equal(appearanceToHtmlClass("light"), "light");
});

test("AppShell 侧栏颜色不放进 className 模板，避免 SWC 把后面的 ${ 当成标签", () => {
  const source = readFileSync(new URL("../src/shell/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /bg-\[var\(--sidebar\)\]/);
  assert.doesNotMatch(source, /className=\{`[^`]*bg-\[var\(--sidebar\)\]/s);
});
