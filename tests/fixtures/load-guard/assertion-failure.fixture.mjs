// 对照组二：文件跑得好好的，只是**真有一条断言判红**。
//
// 这一份是整条闸最要紧的反面素材。闸对它必须**一个字都不喊**：
// 喊了就说明它把普通红也标成「整份没跑起来」，那比不设闸更坏
// —— 从此没人再信它喊的话（`_COMMON.md §7b⑨`：反面验证要验的是「不该响时不响」）。
import assert from "node:assert/strict";
import test from "node:test";

test("这条是绿的", () => {
  assert.ok(true);
});

test("这条是真的红", () => {
  assert.equal(1, 2);
});
