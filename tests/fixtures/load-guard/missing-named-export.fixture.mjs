// 根因形态一：桩缺具名导出。
// `W34` 实测的真实例子——两份外壳测试的 `next/navigation` 桩缺 `useRouter`，
// `AppShell` 自 `1f88c0f` 起要它，于是两份整份没跑起来。
//
// 这份文件登记了 3 处用例；加载期就炸，所以 `node --test` 只会记 1 条。
// 那个 3 与 1 的差，就是这条闸存在的理由。
import assert from "node:assert/strict";
import test from "node:test";

import { thisExportDoesNotExist } from "./export-target.mjs";

test("一", () => {
  assert.equal(thisExportDoesNotExist, 1);
});

test("二", () => {
  assert.ok(true);
});

test("三", () => {
  assert.ok(true);
});
