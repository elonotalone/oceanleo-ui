// V2：我买到的课源码合同。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

test("MyBoughtLessonsPane 调 listPurchasedBayLessons，空态与状态标来自 purchaseStage", () => {
  const pane = source("src/shell/bay/lessons/MyBoughtLessonsPane.tsx");
  assert.match(pane, /listPurchasedBayLessons/);
  assert.match(pane, /data-bay-pane="mine-bought-lessons"/);
  assert.match(pane, /data-bay-empty="bought-lessons"/);
  assert.match(pane, /purchaseStage/);
});
