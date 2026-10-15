import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

test("我发布的课程只列我的课：没有套餐段、没有卖出的订单段（卖出的课程在「我卖出的」）", () => {
  const mine = src("src/shell/bay/lessons/MyLessonsPane.tsx");
  assert.match(mine, /data-bay-pane="mine-lessons"/);
  assert.match(mine, /PublishedCategoryTag category="lesson"/);
  assert.doesNotMatch(mine, /my-bundles/);
  assert.doesNotMatch(mine, /deleteBayLessonBundle|listMyBayLessonBundles/);
  assert.doesNotMatch(mine, /sold-orders/);
  assert.doesNotMatch(mine, /SoldOrders/);
  const sold = src("src/shell/bay/mine/MySoldPane.tsx");
  assert.match(sold, /listSoldBayLessonOrders/);
  assert.match(sold, /MineTradeList/);
  assert.doesNotMatch(sold, /SoldOrders/);
});

test("状态标来自 lessonStatusLabel", () => {
  const mine = src("src/shell/bay/lessons/MyLessonsPane.tsx");
  assert.match(mine, /lessonStatusLabel/);
  assert.match(mine, /tt\(lessonStatusLabel\(/);
});

test("退款两个按钮的确认标记都在，拒绝要说明", () => {
  const sold = src("src/shell/bay/lessons/SoldOrders.tsx");
  assert.match(sold, /data-bay-confirm="agree-refund"/);
  assert.match(sold, /data-bay-confirm="decline-refund"/);
  assert.match(sold, /decideBayLessonRefund/);
  assert.match(sold, /请写一句拒绝说明/);
  assert.match(sold, /!note\.trim\(\)/);
});

test("删除有确认", () => {
  const mine = src("src/shell/bay/lessons/MyLessonsPane.tsx");
  assert.match(mine, /ConfirmDialog/);
  assert.match(mine, /pendingDelete/);
  assert.match(mine, /deleteBayLesson/);
});
