// 对照组一：一份完全正常的测试文件。闸对它必须**一个字都不喊**。
import assert from "node:assert/strict";
import test from "node:test";

test("一", () => {
  assert.ok(true);
});

test("二", () => {
  assert.ok(true);
});
