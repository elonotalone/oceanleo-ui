/**
 * 图表换核接线闸（W12）。
 *
 * 纯模块内容在 chart-next-core.test.mjs。这里只问：有没有真接到 ChartRoute、
 * AVA 有没有漏进路由 chunk、专业模式是不是代码模式、旧核还在不在。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_EDITOR_CORE, setEditorCoreOverride } from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
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
  assert.match(leaf, /applyAvaAdviceToChartDocument/);
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

// ---------------------------------------------------------------------------
// A-48 行为闸（W09 代管 W12）：真调用 ChartRoute。源码正则是辅闸。
// V6 批 2b：保留 if 行、函数体 return null，上面那些正则仍全绿。
// jsdom 没有 layout —— 钉元素 type / 必需 prop。Native 件不承诺 iframe 刀。
// ---------------------------------------------------------------------------
const CHART_DYNAMIC_KEY = "__W09_CHART_DYNAMIC";

function chartFnExports(names, extra = "") {
  return dataModule(
    `${names.map((name) => `export function ${name}(){ return null; }`).join("\n")}\n${extra}`,
  );
}

const chartRouteStubs = {
  "next/dynamic": dataModule(`
    export default function dynamic(loader, opts) {
      function ChartNextDynamic() { return null; }
      ChartNextDynamic.displayName = "ChartNextDynamic";
      globalThis.${CHART_DYNAMIC_KEY} = { loader, opts, Stage: ChartNextDynamic };
      return ChartNextDynamic;
    }
  `),
  "../chart-editor/ChartNextStage": dataModule(`
    export function ChartNextStage() { return null; }
  `),
  "../AdvancedWorkbenchShell": chartFnExports(["AdvancedWorkbenchShell"]),
  "../advanced-recovery-store": dataModule(
    `export function advancedRecoveryKey(){ return ""; }`,
  ),
  "../advanced-session": dataModule(
    `export function advancedSavedItem(){ return null; }`,
  ),
  "../workbench-routes": dataModule(
    `export function editorRouteFor(){ return ""; }\nexport function editorToolLabel(){ return ""; }`,
  ),
  "../plugin-command": dataModule(
    `export function usePluginCommandSurface(){ return {}; }`,
  ),
  "../chart-editor/ChartContextToolbar": chartFnExports(["ChartContextToolbar"]),
  "../chart-editor/ChartControls": chartFnExports(["ChartControls"]),
  "../chart-editor/ChartStage": chartFnExports(["ChartStage"]),
  "../chart-editor/chart-render": dataModule(
    `export function chartExportOption(){ return ""; }`,
  ),
  "../chart-editor/chart-schema": dataModule(
    `export function chartDocumentToJson(){ return "{}"; }`,
  ),
  "../chart-editor/use-chart-workbench": dataModule(
    `export function chartEditorManifest(){ return {}; }\nexport function useChartWorkbench(){ return {}; }`,
  ),
  "../doc-editors/doc-io": dataModule(
    `export function downloadText(){}`,
  ),
  "../library-data": dataModule(
    `export function libraryContentDescriptor(){ return {}; }`,
  ),
  "../chart-editor/chart-command-surface": dataModule(
    `export function createChartCommandSurface(){ return {}; }`,
  ),
  "../media-editors/visual-formats": dataModule(
    `export function visualImportPlan(){ return {}; }`,
  ),
};

let chartRouteModPromise;

function installChartFlagStorage() {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    },
    addEventListener() {},
  };
}

async function loadChartRoute() {
  if (!chartRouteModPromise) {
    chartRouteModPromise = compileModule(
      "src/shell/advanced-routes/ChartRoute.tsx",
      chartRouteStubs,
    ).then((url) => import(url));
  }
  return chartRouteModPromise;
}

function chartWorkbenchProps() {
  const item = {
    key: "chart-wire",
    source: "creation",
    id: "chart-wire",
    title: "gate",
    kind: "image",
    siteId: "site",
    favorite: false,
    meta: {},
  };
  const onClose = () => {};
  return { item, onClose, siteId: "site", accent: "#4f46e5" };
}

function assertChartNextMounted(node, Stage, props) {
  assert.ok(
    node,
    "翻到 next 档用户必须看到新核。把 if 体改成 return null、保留 if 那行，就是 V6 批 2b 那个洞。",
  );
  assert.equal(
    node.type,
    Stage,
    "next 档必须挂 dynamic 叶子。改成恒假分支、换成 div、外包一层，用户仍停在旧核。",
  );
  assert.equal(
    node.props.item,
    props.item,
    "上层必须把这份 item 交给新核。传 null 或不再展开 props，图对不上那份素材。",
  );
  assert.equal(
    node.props.onClose,
    props.onClose,
    "上层必须把 onClose 交给新核。传 null 用户关不掉工作台。",
  );
  assert.notEqual(node.props.item, null);
  assert.notEqual(node.props.onClose, null);
  assert.notEqual(
    node.props.hidden,
    true,
    "新核根节点不能带 hidden。jsdom 没有 layout，只钉属性，不假装量了可见像素。",
  );
  assert.notEqual(node.props["aria-hidden"], true);
}

test("next flag mounts the chart next leaf with required props", async () => {
  const previousWindow = globalThis.window;
  installChartFlagStorage();
  try {
    const { ChartRoute } = await loadChartRoute();
    const captured = globalThis[CHART_DYNAMIC_KEY];
    assert.ok(captured?.Stage, "next/dynamic 必须接到加载函数。");
    assert.equal(captured.opts?.ssr, false);
    const loaded = await captured.loader();
    assert.equal(
      typeof loaded,
      "function",
      "dynamic 加载函数必须给出 ChartNextStage，不能 return null。",
    );
    assert.equal(loaded.name, "ChartNextStage");

    assert.equal(DEFAULT_EDITOR_CORE, "legacy");
    const props = chartWorkbenchProps();
    const legacyNode = ChartRoute(props);
    assert.ok(legacyNode, "默认档必须仍是旧核，不能是空白。");
    assert.notEqual(
      legacyNode.type,
      captured.Stage,
      "默认档必须走旧核。修闸不是放行。",
    );

    setEditorCoreOverride("chart-editor", "next");
    const nextNode = ChartRoute(props);
    assertChartNextMounted(nextNode, captured.Stage, props);
    setEditorCoreOverride("chart-editor", null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
