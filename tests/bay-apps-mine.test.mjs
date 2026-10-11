import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

test("四种状态标来自 statusLabel", () => {
  const pane = src("src/shell/bay/apps/MyAppsPane.tsx");
  assert.match(pane, /statusLabel/);
  assert.match(pane, /tt\(statusLabel\(/);
});

test("只对已上架的取数", () => {
  const pane = src("src/shell/bay/apps/MyAppsPane.tsx");
  assert.match(pane, /status === "published"/);
  assert.match(pane, /getBayAppStats/);
  assert.match(pane, /filter\(\(row\) => row\.status === "published"\)/);
});

test("删除有确认", () => {
  const pane = src("src/shell/bay/apps/MyAppsPane.tsx");
  assert.match(pane, /ConfirmDialog/);
  assert.match(pane, /pendingDelete/);
  assert.match(pane, /deleteBayApp/);
});

test("根元素是 mine-apps", () => {
  const pane = src("src/shell/bay/apps/MyAppsPane.tsx");
  assert.match(pane, /data-bay-pane="mine-apps"/);
});

test("柱条没有引图表库", () => {
  const bars = src("src/shell/bay/apps/AppStatsBars.tsx");
  assert.doesNotMatch(bars, /recharts/);
  assert.doesNotMatch(bars, /chart\.js/);
  assert.doesNotMatch(bars, /from ["']d3["']/);
  assert.doesNotMatch(bars, /from ["']d3-/);
});
