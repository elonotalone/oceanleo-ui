// ui.css 的消费端合同（2026-11-11）。
//
// 门户 `app/globals.css` 自己也跑 Tailwind，但在 `app/layout.tsx` 里先于 `@oceanleo/ui/theme/ui.css` 加载。
// 一个门户元素若同时带「两份产物都有的基础类」（如 `inline-flex`）和「只在门户产物里的变体类」
// （如 `md:hidden`），后加载的 ui.css 赢，变体失效。v0.256.0 清掉旧外壳后 ui.css 掉了 36 个类，
// oceanbizs 桌面左上角于是冒出移动端「打开菜单」键（操作员 2026-11-11 报）。
//
// `src/theme/_ui-input.css` 用 `@source inline(...)` 把这 36 个类钉回产物；这条测试保证
// 清单里的每一个类都真的编进了 `src/theme/ui.css`，而且门户外壳依赖的几个一个都不能少。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const input = readFileSync(new URL("../src/theme/_ui-input.css", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/theme/ui.css", import.meta.url), "utf8");

/** Tailwind 的类名转义：`md:hidden` → `md\:hidden`，`w-[256px]` → `w-\[256px\]`。 */
function escapeClass(name) {
  return name.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`);
}

function inlineSafelist() {
  const match = /@source\s+inline\("([^"]*)"\)\s*;/.exec(input);
  assert.ok(match, "src/theme/_ui-input.css 里找不到 @source inline(...) 消费端清单");
  return match[1].split(/\s+/).filter(Boolean);
}

test("每个消费端保留类都编进了 ui.css", () => {
  const classes = inlineSafelist();
  assert.ok(classes.length >= 36, `清单只剩 ${classes.length} 个类`);
  const missing = classes.filter((name) => !css.includes(`.${escapeClass(name)}`));
  assert.deepEqual(missing, [], `这些类在清单里但不在 ui.css：${missing.join(" ")}`);
});

test("门户外壳依赖的桌面变体类一个都不能少", () => {
  const classes = new Set(inlineSafelist());
  for (const name of ["md:hidden", "md:pl-0", "pl-14", "md:fixed", "md:top-0", "md:start-0", "md:z-30"]) {
    assert.ok(classes.has(name), `消费端清单缺了 ${name}（门户 clone-shell 的移动端菜单键 / 主区让位靠它）`);
  }
});
