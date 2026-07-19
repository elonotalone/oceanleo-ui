import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";

import { normalizeChartDocument } from "../src/shell/chart-editor/chart-schema.ts";
import { chartExportOption } from "../src/shell/chart-editor/chart-render.ts";

test(
  "Chart PNG and SVG exports render the pinned model and bottom legend",
  { timeout: 30_000 },
  async (t) => {
    const document = normalizeChartDocument({
      title: { text: "季度收入" },
      legend: { show: true, position: "bottom" },
      xAxis: { type: "category", data: ["Q1", "Q2", "Q3"] },
      yAxis: { type: "value" },
      series: [
        {
          id: "revenue",
          name: "收入",
          type: "bar",
          data: [120, 180, 240],
          label: { show: true },
        },
      ],
    });
    const option = chartExportOption(document.option);
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`
      <div id="canvas" style="width:800px;height:450px"></div>
      <div id="svg" style="width:800px;height:450px"></div>
    `);
    await page.addScriptTag({
      path: resolve("node_modules/echarts/dist/echarts.min.js"),
    });
    const result = await page.evaluate((pinnedOption) => {
      const canvasHost = document.querySelector("#canvas");
      const canvas = window.echarts.init(canvasHost, undefined, {
        renderer: "canvas",
        width: 800,
        height: 450,
      });
      canvas.setOption(pinnedOption, { notMerge: true, lazyUpdate: false });
      const png = canvas.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const svgHost = document.querySelector("#svg");
      const svg = window.echarts.init(svgHost, undefined, {
        renderer: "svg",
        width: 800,
        height: 450,
      });
      svg.setOption(pinnedOption, { notMerge: true, lazyUpdate: false });
      const svgUrl = svg.getDataURL({ type: "svg" });
      const legend = [...svgHost.querySelectorAll("text")].find(
        (node) => node.textContent === "收入",
      );
      const hostRect = svgHost.getBoundingClientRect();
      const legendRect = legend?.getBoundingClientRect();
      const output = {
        pngPrefix: png.slice(0, 30),
        pngLength: png.length,
        svgPrefix: svgUrl.slice(0, 40),
        svgLength: svgUrl.length,
        legendBelowMiddle:
          Boolean(legendRect) && legendRect.top > hostRect.top + hostRect.height / 2,
        titlePresent: [...svgHost.querySelectorAll("text")].some(
          (node) => node.textContent === "季度收入",
        ),
      };
      canvas.dispose();
      svg.dispose();
      return output;
    }, option);
    assert.match(result.pngPrefix, /^data:image\/png/);
    assert.ok(result.pngLength > 5_000);
    assert.match(result.svgPrefix, /^data:image\/svg\+xml/);
    assert.ok(result.svgLength > 1_000);
    assert.equal(result.legendBelowMiddle, true);
    assert.equal(result.titlePresent, true);
    assert.deepEqual(errors, []);
  },
);
