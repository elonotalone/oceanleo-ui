import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

test("我的课程三段与 pane 标记都在", () => {
  const mine = src("src/shell/bay/lessons/MyLessonsPane.tsx");
  assert.match(mine, /data-bay-pane="mine-lessons"/);
  assert.match(mine, /data-bay-section="my-lessons"/);
  assert.match(mine, /data-bay-section="my-bundles"/);
  assert.match(mine, /data-bay-section="sold-orders"/);
  assert.match(mine, /SoldOrders/);
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
  assert.match(mine, /deleteBayLessonBundle/);
});
