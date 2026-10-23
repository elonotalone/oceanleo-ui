// Native DOM checks only; no browser or external data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule } from "./helpers/module-bench.mjs";

const { OverviewChart, overviewGeometry, chartSelection } = await import(await compileModule("src/shell/bay/dashboard/OverviewChart.tsx"));
const labels = { overview: "Overview", products: "Income by product", income: "Income", users: "New users", opens: "Opens", count: "Users / Opens", empty: "No data", noIncome: "No income" };
const days = [
  { day: "2026-10-21", income_fen: 10000, new_users: 2, opens: 100 },
  { day: "2026-10-22", income_fen: 5000, new_users: 5, opens: 50 },
];
const props = { days, products: [{ item_kind: "app", item_id: "a", title: "Sample app", income_fen: 15000 }], money: (n) => `$${(n / 100).toFixed(2)}`, count: String, labels, summary: React.createElement("span", null, "Lifetime $150.00") };

test("one plot retains units, exact date readout and footer; empty and single point remain truthful", () => {
  const html = renderToStaticMarkup(React.createElement(OverviewChart, props));
  assert.equal((html.match(/<svg /g) || []).length, 1);
  assert.match(html, /Income by product/);
  assert.match(html, /Users \/ Opens/);
  assert.match(html, /2026-10-22 · Income \$50.00 · New users 5 · Opens 50/);
  assert.match(html, /Lifetime \$150.00/);
  const geometry = overviewGeometry(days);
  assert.equal(geometry.moneyMax, 10000);
  assert.equal(geometry.countMax, 100);
  assert.equal(geometry.points[0].incomeY, 44);
  assert.equal(geometry.points[0].opensY, 44);
  assert.ok(geometry.points[0].usersY > 300, "2 users must not share the income axis or get its own normalized max");
  const zero = overviewGeometry([{ day: "x", income_fen: 0, new_users: 0, opens: 0 }]);
  assert.equal(zero.points[0].x, 480);
  assert.equal(zero.points[0].incomeY, 312);
  assert.equal(zero.points[0].usersY, 312);
  const empty = renderToStaticMarkup(React.createElement(OverviewChart, { ...props, days: [], products: [] }));
  assert.match(empty, /role="status"/);
  assert.doesNotMatch(empty, /role="slider"|NaN|Infinity/);
});

test("keyboard selection clamps at bounds and reaches first/last values", () => {
  assert.equal(chartSelection("ArrowLeft", 0, 2), 0);
  assert.equal(chartSelection("ArrowRight", 1, 2), 1);
  assert.equal(chartSelection("Home", 1, 2), 0);
  assert.equal(chartSelection("End", 0, 2), 1);
});

test("keyboard, pointer and product toggle update the same plot and exact accessible values", async () => {
  const require = createRequire(import.meta.url);
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previous = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previous) require.cache[canvasEntry] = previous; else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(OverviewChart, props)));
  const slider = host.querySelector('[role="slider"]');
  await act(async () => slider.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true })));
  assert.match(slider.getAttribute("aria-valuetext"), /2026-10-21 · Income \$100.00 · New users 2 · Opens 100/);
  await act(async () => slider.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  assert.equal(slider.getAttribute("aria-valuenow"), "2");
  slider.getBoundingClientRect = () => ({ left: 0, width: 960 });
  await act(async () => slider.dispatchEvent(new dom.window.MouseEvent("pointermove", { clientX: 100, bubbles: true })));
  assert.equal(slider.getAttribute("aria-valuenow"), "1");
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === labels.products).click());
  assert.equal(host.querySelectorAll("svg").length, 1);
  assert.equal(host.querySelectorAll("polyline").length, 0);
  assert.match(host.querySelector('[role="slider"]').getAttribute("aria-valuetext"), /Sample app · Income \$150.00/);
  await act(async () => root.unmount());
  host.remove();
  dom.window.close();
});
