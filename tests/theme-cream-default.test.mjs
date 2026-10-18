import assert from "node:assert/strict";
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
