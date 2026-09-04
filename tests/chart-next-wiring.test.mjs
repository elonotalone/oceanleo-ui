/**
 * 图表换核接线闸（W12）。
 *
 * 纯模块内容在 chart-next-core.test.mjs。这里只问：有没有真接到 ChartRoute、
 * AVA 有没有漏进路由 chunk、专业模式是不是代码模式、旧核还在不在。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_EDITOR_CORE } from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  CHART_NEXT_DEFAULT_MODE,
  applyChartNextMode,
} from "../src/shell/chart-editor/chart-next-chrome.ts";
import {
  chartAgentChipsAreValid,
  chartToolsManifestChips,
} from "../src/shell/chart-editor/chart-next-l4-chips.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/ChartRoute.tsx");
const leaf = read("src/shell/chart-editor/ChartNextStage.tsx");
const chrome = read("src/shell/chart-editor/chart-next-chrome.ts");
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const routeCode = strip(route);
const leafCode = strip(leaf);

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("chart-editor"\) === "next"\)/);
  assert.doesNotMatch(route, /from "@antv\/ava"/);
  assert.doesNotMatch(routeCode, /@antv\/ava/);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/chart-editor\/ChartNextStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<ChartNextStage \{\.\.\.props\} \/>/);
  assert.match(route, /function ChartLegacyRoute/);
  assert.match(route, /<ChartStage editor=\{editor\} \/>/);
  assert.match(route, /useChartWorkbench/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
});

test("professional mode is option JSON code mode, no postMessage, same instance", () => {
  assert.equal(CHART_NEXT_DEFAULT_MODE, "normal");
  assert.equal(CHART_NEXT_DEFAULT_MODE, DEFAULT_EDITOR_MODE);
  assert.match(chrome, /buildSetModeMessage/);
  assert.match(leaf, /applyChartNextMode/);
  assert.match(leaf, /useState<EditorMode>\(CHART_NEXT_DEFAULT_MODE\)/);
  assert.match(leaf, /mode: \{\s*\n\s*current: chrome.mode,/);
  assert.match(leaf, /ChartOptionCodePanel/);
  assert.match(leaf, /codeModeVisible/);
  assert.doesNotMatch(routeCode, /postMessage/);
  assert.doesNotMatch(leafCode, /postMessage/);
  assert.doesNotMatch(routeCode, /buildSetModeMessage/);
  const pro = applyChartNextMode("oceanleo-chart-next", "pro");
  assert.equal(pro.codeModeVisible, true);
});

test("AVA is loaded only from the next-core leaf, via dynamic import", () => {
  assert.match(leaf, /chart-next-ava-advisor/);
  assert.match(leaf, /await import\(\s*"\.\/chart-next-ava-advisor"/);
  assert.doesNotMatch(route, /chart-next-ava-advisor/);
  const advisor = read("src/shell/chart-editor/chart-next-ava-advisor.ts");
  assert.match(advisor, /from "@antv\/ava"/);
  assert.match(advisor, /new Advisor/);
  assert.match(advisor, /\.advise\(/);
  assert.match(advisor, /\.lint\(/);
});

test("legacy kernel remains in the route file", () => {
  assert.match(route, /function ChartLegacyRoute/);
  assert.match(route, /<ChartControls[\s\S]*editor=\{editor\}/);
  assert.match(route, /<ChartContextToolbar[\s\S]*editor=\{editor\}/);
});

test("L4 chips are wired into the next leaf and pass the host validator", () => {
  assert.equal(chartAgentChipsAreValid(), true);
  assert.equal(chartToolsManifestChips().chips.length, 8);
  assert.match(leaf, /chartToolsManifestChips/);
  assert.match(leaf, /buildChartReviewProposal/);
});

test("legacy-render-only conversion is an explicit button, not a load side effect", () => {
  assert.match(leaf, /planChartLegacyConversion/);
  assert.match(leaf, /转换为新图表/);
  assert.match(leaf, /CHART_LEGACY_READONLY_NOTICE/);
});

test("code mode live-previews via optionOverride; Apply still commits", () => {
  const stage = read("src/shell/chart-editor/ChartStage.tsx");
  assert.match(stage, /optionOverride/);
  assert.match(stage, /data-chart-live-preview/);
  assert.match(leaf, /optionOverride=/);
  assert.match(leaf, /setPreviewOption/);
  assert.match(leaf, /editor\.loadDocument\(parsed\.document\)/);
});

test("dual-axis create entry and secondary-axis details are in the shared toolbar", () => {
  const toolbar = read("src/shell/chart-editor/ChartContextToolbar.tsx");
  const advanced = read("src/shell/chart-editor/chart-advanced-controls.ts");
  const workbench = read("src/shell/chart-editor/use-chart-workbench.ts");
  assert.match(toolbar, /id: "y-dual"/);
  assert.match(toolbar, /editor\.setYAxisCount/);
  assert.match(advanced, /axisKey: "x" \| "y" \| "y2"/);
  assert.match(advanced, /axisControls\("y2"/);
  assert.match(advanced, /\$\{axisKey\}-min/);
  assert.match(advanced, /editor\.setAxis\(axisKey, patch, axisIndex\)/);
  assert.match(workbench, /setYAxisCount:/);
  assert.match(workbench, /loadDocument:/);
});

test("create-from-range command uses typed artifact, not a grid import", () => {
  const commands = read("src/shell/chart-editor/chart-command-surface.ts");
  assert.match(commands, /CHART_CREATE_FROM_RANGE_COMMAND/);
  assert.match(commands, /chartTypedArtifactFromRangeSnapshot/);
  assert.doesNotMatch(commands, /from "\.\.\/doc-editors/);
  assert.doesNotMatch(commands, /from "\.\.\/grid/);
  const controls = read("src/shell/chart-editor/ChartControls.tsx");
  assert.match(controls, /data-chart-xlsx-options/);
  assert.match(controls, /chartXlsxListSheets/);
});
