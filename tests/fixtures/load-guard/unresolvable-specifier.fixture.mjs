// 根因形态二：specifier 解析不到任何文件。
// `W34` 实测的真实例子——编译台把 `AppShell.tsx` 的 `./phone-shell.css` 交给
// TypeScript 剥类型，编成 `var ;`，两份测试一条断言都不执行。
//
// 这份文件登记了 2 处用例，加载期就炸。
import assert from "node:assert/strict";
import test from "node:test";

import "./this-module-does-not-exist-anywhere.mjs";

test("一", () => {
  assert.ok(true);
});

test("二", () => {
  assert.ok(true);
});
