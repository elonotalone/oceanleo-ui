// 安全矩阵：不适用（只显示自己的汇总数字）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  changeOf,
  chartPoints,
  donutItems,
  donutSegments,
  productOpenTarget,
} from "../src/shell/bay/dashboard/dashboard-model.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

test("changeOf 覆盖上一段为 0、两段都为 0、升、降、持平", () => {
  assert.deepEqual(changeOf(12, 0), { kind: "from-zero", label: "上一段为 0" });
  assert.deepEqual(changeOf(0, 0), { kind: "empty", label: "—" });
  assert.deepEqual(changeOf(112, 100), { kind: "up", label: "↑ 12%" });
  assert.deepEqual(changeOf(92, 100), { kind: "down", label: "↓ 8%" });
  assert.deepEqual(changeOf(100, 100), { kind: "flat", label: "持平" });
});

test("chartPoints 空数组、全 0、单点、普通", () => {
  assert.deepEqual(chartPoints([], 100, 50, 10), []);
  const zeros = chartPoints([0, 0, 0], 100, 50, 10);
  assert.equal(zeros.length, 3);
  assert.equal(zeros[0].x, 10);
  assert.equal(zeros[2].x, 90);
  assert.ok(zeros.every((point) => point.y === 40));
  const one = chartPoints([8], 100, 50, 10);
  assert.equal(one.length, 1);
  assert.equal(one[0].x, 50);
  assert.equal(one[0].y, 10);
  const normal = chartPoints([0, 10, 5], 100, 50, 10);
  assert.equal(normal.length, 3);
  assert.equal(normal[0].y, 40);
  assert.equal(normal[1].y, 10);
  assert.equal(normal[2].y, 25);
});

test("donutSegments 占比之和不为 1、超过 6 件并成其他、全 0", () => {
  assert.deepEqual(donutSegments([0, 0, 0]), []);
  const parts = donutSegments([0.2, 0.2, 0.1]);
  assert.equal(parts.length, 3);
  assert.ok(Math.abs(parts[0].start) < 1e-9);
  assert.ok(Math.abs(parts[2].end - 1) < 1e-9);
  assert.ok(Math.abs(parts.reduce((sum, row) => sum + row.share, 0) - 1) < 1e-9);
  const many = donutSegments([10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal(many.length, 7);
  assert.equal(many[6].isOther, true);
  const items = donutItems(
    [10, 9, 8, 7, 6, 5, 4, 3].map((income_fen, index) => ({
      title: `p${index}`,
      share: income_fen / 52,
      income_fen,
    })),
  );
  assert.equal(items.length, 7);
  assert.equal(items[6].title, "其他");
  assert.equal(items[6].isOther, true);
  assert.equal(items[6].income_fen, 7);
});

test("商品行跳转目标", () => {
  assert.deepEqual(productOpenTarget({ item_kind: "app", item_id: "a1" }), {
    kind: "app-manage",
    appId: "a1",
    tab: "feedback",
  });
  assert.deepEqual(productOpenTarget({ item_kind: "lesson", item_id: "l1" }), { kind: "lesson", id: "l1" });
  assert.deepEqual(productOpenTarget({ item_kind: "bundle", item_id: "b1" }), { kind: "bundle", id: "b1" });
  assert.deepEqual(productOpenTarget({ item_kind: "service", item_id: "s1" }), { kind: "service", id: "s1" });
  assert.equal(productOpenTarget({ item_kind: "service", item_id: "other" }), null);
});

test("面板源码不引图表库，图有 role=img 与 aria-label，对比有箭头，表可横滑", () => {
  const files = [
    "src/shell/bay/dashboard/DashboardPane.tsx",
    "src/shell/bay/dashboard/LineChart.tsx",
    "src/shell/bay/dashboard/DonutChart.tsx",
    "src/shell/bay/dashboard/ProductTable.tsx",
    "src/shell/bay/dashboard/StatTile.tsx",
    "src/shell/bay/dashboard/dashboard-model.ts",
  ];
  const all = files.map(source).join("\n");
  assert.doesNotMatch(all, /from ["'](?:recharts|chart\.js|d3|victory|nivo|echarts)/);
  assert.match(source("src/shell/bay/dashboard/LineChart.tsx"), /role="img"/);
  assert.match(source("src/shell/bay/dashboard/LineChart.tsx"), /aria-label=\{ariaLabel\}/);
  assert.match(source("src/shell/bay/dashboard/DonutChart.tsx"), /role="img"/);
  assert.match(source("src/shell/bay/dashboard/DonutChart.tsx"), /aria-label=\{ariaLabel\}/);
  assert.match(source("src/shell/bay/dashboard/dashboard-model.ts"), /↑/);
  assert.match(source("src/shell/bay/dashboard/dashboard-model.ts"), /↓/);
  assert.match(source("src/shell/bay/dashboard/ProductTable.tsx"), /overflow-x-auto/);
  assert.match(source("src/shell/bay/dashboard/DashboardPane.tsx"), /from "\.\.\/\.\.\/\.\.\/lib\/bay\/dashboard"/);
  assert.match(source("src/shell/bay/dashboard/DashboardPane.tsx"), /getBayDashboard/);
  assert.doesNotMatch(source("src/shell/bay/dashboard/DashboardPane.tsx"), /\/v1\/bay\/dashboard/);
});
