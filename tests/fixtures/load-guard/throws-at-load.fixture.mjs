// 根因形态三：模块图没问题，但顶层代码自己抛了。
// 建台代码写在文件顶层的测试很多，这一形态与前两种在计数上是同一副面孔。
//
// 这份文件登记了 2 处用例，加载期就炸。
import assert from "node:assert/strict";
import test from "node:test";

throw new Error("顶层就炸了（这是 load-guard 的判据素材，不是真故障）");

test("一", () => {
  assert.ok(true);
});

test("二", () => {
  assert.ok(true);
});
