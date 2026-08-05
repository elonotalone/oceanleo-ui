// 插件初始态 —— 锁住「第一屏是什么」。
//
// 三条判据，缺一条这一波就白做：
//   1. 每个登记在册的初始态都能被真正的内核校验器接住（形状合法，不是看起来像）。
//   2. 地图三件的每一条依赖都**实际存在**，字节数与 sha256 与内容对得上 ——
//      直接把缺陷二（sha256 全 0、byteSize 写 1、文件不存在）锁死。
//   3. 没做初始态的插件查表返回空，**不是**通用模板。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  BUILT_IN_GEO_ASSETS,
  PLUGIN_INITIAL_STATE_IDS,
  builtInGeoAsset,
  hasPluginInitialState,
  loadBuiltInGeoPayload,
  loadPluginGeoFeatures,
  pluginInitialItemInput,
  pluginInitialState,
} from "../src/shell/plugin-initial-states/index.ts";
import {
  GEO_MAP_PALETTE,
  parseGeoMapSource,
  resolveGeoMapDependencyClosure,
  validateGeoMapProject,
} from "../src/shell/geo-map-editor/geo-map-source.ts";
import { renderGeoMapToCanvas } from "../src/shell/geo-map-editor/geo-map-render.ts";
import {
  parseInteractiveDocSource,
  evaluateComputeGraph,
  linkInteractiveDocProject,
} from "../src/shell/interactive-doc-editor/interactive-doc-source.ts";
import { normalizeGridProjectSheets } from "../src/shell/doc-editors/grid-model.ts";
import { blankDraftLibraryItem } from "../src/shell/blank-draft-items.ts";

const REQUIRED_SIX = [
  "annotatable-city-map",
  "interactive-globe",
  "ledger-register",
  "spaced-repetition-scheduler",
  "unit-converter",
  "financial-calculator",
];

const GEO_PLUGINS = [
  "annotatable-city-map",
  "interactive-globe",
  "floorplan-annotation",
];

/** 本波明确留空的插件：查表必须回空，绝不允许悄悄回退成通用模板。 */
const DELIBERATELY_EMPTY = [
  "concept-knowledge-graph",
  "relationship-graph",
  "search-query-builder",
  "contract-assembly",
  "dialogue-branch-script",
  "voiceover-script",
  "medical-calculator",
  "legal-calculator",
  "metrics-dashboard",
  "self-test-quiz",
  "formula-derivation-walkthrough",
  "executable-notebook",
];

// `use-geo-map-workbench.ts` 拖 React 与 i18n 的 .tsx 进来，node 的 strip-types
// 载不了，所以这里按 `geo-map-workbench.test.mjs` 的既有做法读源文本对键名，
// 闭包判定本身用可直接 import 的纯函数 `resolveGeoMapDependencyClosure` 跑。
const HOOK_SOURCE = readFileSync(
  new URL("../src/shell/geo-map-editor/use-geo-map-workbench.ts", import.meta.url),
  "utf8",
);

function stubContext() {
  const ops = [];
  const state = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    lineJoin: "round",
    lineCap: "round",
    ops,
    save: () => ops.push(["save"]),
    restore: () => ops.push(["restore"]),
    beginPath: () => ops.push(["beginPath"]),
    closePath: () => ops.push(["closePath"]),
    moveTo: (x, y) => ops.push(["moveTo", x, y]),
    lineTo: (x, y) => ops.push(["lineTo", x, y]),
    arc: (x, y, r) => ops.push(["arc", x, y, r]),
    fill: () => ops.push(["fill", state.fillStyle]),
    stroke: () => ops.push(["stroke", state.strokeStyle, state.lineWidth]),
    fillRect: (x, y, w, h) => ops.push(["fillRect", state.fillStyle, x, y, w, h]),
    fillText: (text, x, y) => ops.push(["fillText", text, state.fillStyle, x, y]),
    strokeText: (text) => ops.push(["strokeText", text, state.strokeStyle]),
    measureText: (text) => ({ width: text.length * 7 }),
    setLineDash: (segments) => ops.push(["setLineDash", segments.join(",")]),
  };
  return state;
}

test("必做的六个插件都有初始态，且都不是通用起手件", () => {
  for (const pluginId of REQUIRED_SIX) {
    const state = pluginInitialState(pluginId);
    assert.ok(state, `${pluginId} 必须有初始态`);
    assert.equal(state.pluginId, pluginId);
    assert.ok(state.displayName.length >= 2, `${pluginId} 要有中文名`);
    assert.ok(state.firstScreen.length >= 8, `${pluginId} 要写清第一屏有什么`);
    assert.ok(state.firstAction.length >= 2, `${pluginId} 要写清第一个动作`);
    // 面向用户的文案里不许出现「插件」二字（既有红线）。
    for (const text of [state.displayName, state.title, state.firstScreen, state.firstAction]) {
      assert.ok(!text.includes("插件"), `${pluginId} 的用户文案不许出现「插件」：${text}`);
    }
  }
});

test("没有初始态的插件查表回空，不许回退到通用模板", () => {
  for (const pluginId of DELIBERATELY_EMPTY) {
    assert.equal(pluginInitialState(pluginId), null, `${pluginId} 应当留空`);
    assert.equal(hasPluginInitialState(pluginId), false);
    assert.equal(pluginInitialItemInput(pluginId), null);
  }
  for (const bogus of ["", "   ", "不存在的插件", "interactive_doc_editing", null, undefined, 42]) {
    assert.equal(pluginInitialState(bogus), null);
    assert.equal(pluginInitialItemInput(bogus), null);
  }
  // 通用起手件仍然存在（它是编辑类载体的空手起手路径），但初始态清册与它无关：
  // 清册里一个 id 都不是那五个 featureId。
  assert.ok(blankDraftLibraryItem("interactive_doc_editing"));
  for (const pluginId of PLUGIN_INITIAL_STATE_IDS) {
    assert.equal(blankDraftLibraryItem(pluginId), null, `${pluginId} 不该是通用起手件 id`);
  }
});

test("内置底图逐件存在，字节数与 sha256 与内容对得上", async () => {
  assert.ok(BUILT_IN_GEO_ASSETS.length >= 3);
  for (const asset of BUILT_IN_GEO_ASSETS) {
    const payload = await loadBuiltInGeoPayload(asset.path);
    assert.ok(payload, `${asset.path} 必须取得到字节`);
    const byteSize = Buffer.byteLength(payload, "utf8");
    assert.equal(byteSize, asset.byteSize, `${asset.path} 字节数对不上`);
    assert.notEqual(asset.byteSize, 1, "byteSize 写 1 是缺陷二那份假摘要的特征");
    const sha256 = createHash("sha256").update(payload, "utf8").digest("hex");
    assert.equal(sha256, asset.sha256, `${asset.path} sha256 对不上`);
    assert.notEqual(
      asset.sha256,
      "0".repeat(64),
      "sha256 全 0 是缺陷二那份假摘要的特征",
    );
    const parsed = JSON.parse(payload);
    assert.equal(parsed.type, "FeatureCollection");
    assert.equal(parsed.features.length, asset.featureCount);
    assert.ok(parsed.features.length >= 1, `${asset.path} 不能是空要素集`);
  }
  assert.equal(await loadBuiltInGeoPayload("geo/不存在.geojson"), null);
  assert.equal(builtInGeoAsset("geo/不存在.geojson"), null);
});

test("Natural Earth 底图标 PDM，不是 CC0", () => {
  const land = builtInGeoAsset("geo/ne-110m-land.geojson");
  assert.ok(land);
  assert.equal(land.licenseCode, "PDM");
  for (const pluginId of ["annotatable-city-map", "interactive-globe"]) {
    const state = pluginInitialState(pluginId);
    assert.equal(state.project.basemap.licenseCode, "PDM");
    const codes = state.project.attribution.entries.map((entry) => entry.licenseCode);
    assert.ok(codes.includes("PDM"), `${pluginId} 的署名要标 PDM`);
    assert.ok(!codes.includes("CC0"), `${pluginId} 不许把 Natural Earth 标成 CC0`);
  }
});

test("地图三件的工程能过 geo-map 校验，依赖闭包判 ready", () => {
  for (const pluginId of GEO_PLUGINS) {
    const state = pluginInitialState(pluginId);
    assert.ok(state, pluginId);
    assert.equal(state.kernel, "geo-map");
    const validated = validateGeoMapProject(state.project);
    assert.equal(
      validated.ok,
      true,
      `${pluginId}: ${JSON.stringify(validated.errors ?? [])}`,
    );
    // 编辑器真正走的是「字节 → 解析」这条路，所以按字节再过一遍。
    const project = parseGeoMapSource(JSON.stringify(state.project));

    // 声明的每一条依赖都要在内置清单里，且摘要一致。
    const declared = project.dependencies ?? [];
    assert.ok(declared.length >= 1, `${pluginId} 必须声明依赖`);
    for (const dependency of declared) {
      const asset = builtInGeoAsset(dependency.path);
      assert.ok(asset, `${pluginId} 的依赖 ${dependency.path} 不在内置清单里`);
      assert.equal(dependency.sha256, asset.sha256);
      assert.equal(dependency.byteSize, asset.byteSize);
    }
    // sources 引用的路径必须都被 dependencies 声明过。
    const declaredPaths = new Set(declared.map((entry) => entry.path));
    for (const source of Object.values(project.sources)) {
      assert.ok(
        declaredPaths.has(source.dependencyPath),
        `${pluginId}: ${source.dependencyPath} 未被 dependencies 声明`,
      );
    }

    // 入口层给出的 source_manifest 要让工作台判 ready（而不是 degraded / invalid）。
    const input = pluginInitialItemInput(pluginId);
    assert.equal(input.kind, "geo_map");
    assert.ok(
      HOOK_SOURCE.includes("item.meta.source_manifest"),
      "工作台读的键改了名，初始态要跟着改",
    );
    const available = input.meta.source_manifest;
    assert.ok(Array.isArray(available) && available.length >= 1, `${pluginId} 必须带 source_manifest`);
    for (const entry of available) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/, "工作台会丢掉摘要不合法的条目");
    }
    const closure = resolveGeoMapDependencyClosure(project, available);
    assert.equal(closure.verdict, "ready", `${pluginId}: ${JSON.stringify(closure.errors)}`);
    assert.deepEqual(closure.missingPaths, []);
    assert.deepEqual(closure.digestMismatchPaths, []);
    assert.equal(closure.canSave, true);
  }
});

test("地图与地球仪第一屏真的画得出陆地，而不是一个空矩形", async () => {
  for (const pluginId of ["annotatable-city-map", "interactive-globe"]) {
    const state = pluginInitialState(pluginId);
    const project = parseGeoMapSource(JSON.stringify(state.project));
    const features = await loadPluginGeoFeatures(pluginId);
    assert.ok(features, `${pluginId} 必须取得到要素`);
    assert.ok(features.land.features.length >= 100, "1:110m 国界面应有上百个面");
    const context = stubContext();
    const result = renderGeoMapToCanvas({
      project,
      context,
      width: 1600,
      height: 1000,
      features,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.missingSourceKeys, [], `${pluginId} 不许有取不到的 source`);
    for (const layerId of ["ocean-base", "land-fill", "coast-line", "country-border"]) {
      assert.ok(result.drawnLayerIds.includes(layerId), `${pluginId}: ${layerId} 没画出来`);
    }
    // 画布上既要有海也要有陆：只剩一种颜色就是那个淡蓝空矩形。
    assert.ok(result.colors.includes(GEO_MAP_PALETTE["map.water"]));
    assert.ok(result.colors.includes(GEO_MAP_PALETTE["map.land"]));
    assert.ok(
      result.colors.includes(GEO_MAP_PALETTE["map.boundary.coast"]),
      "海陆两色只差 1.79:1，必须有海岸线",
    );
    const fills = context.ops.filter((op) => op[0] === "fill");
    assert.ok(fills.length >= 100, `${pluginId} 应当逐个面填色，实际 ${fills.length}`);
  }
});

test("户型标注第一屏是空量图纸：有网格有图框，没有房间", async () => {
  const state = pluginInitialState("floorplan-annotation");
  const project = parseGeoMapSource(JSON.stringify(state.project));
  assert.deepEqual(project.annotations, [], "空图纸上不许预置标注");
  const features = await loadPluginGeoFeatures("floorplan-annotation");
  assert.equal(features.sheet.features.length, 1, "只有一圈图框");
  assert.equal(features.grid.features.length, 44, "24 m × 18 m 图纸的 1 m 网格线");
  const result = renderGeoMapToCanvas({
    project,
    context: stubContext(),
    width: 1600,
    height: 1000,
    features,
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.missingSourceKeys, []);
  assert.ok(result.drawnLayerIds.includes("grid-line"));
  assert.ok(result.drawnLayerIds.includes("sheet-border"));
});

test("地图三件都是零数据：没有预置标注", () => {
  for (const pluginId of GEO_PLUGINS) {
    const state = pluginInitialState(pluginId);
    assert.deepEqual(state.project.annotations, [], `${pluginId} 不许预置标注`);
  }
});

test("台账第一屏：四列列头，零行数据", () => {
  const state = pluginInitialState("ledger-register");
  assert.equal(state.kernel, "grid");
  const sheets = normalizeGridProjectSheets(
    state.sheets.map((sheet) => ({ ...sheet, rows: sheet.rows.map((row) => [...row]) })),
  );
  assert.equal(sheets.length, 1);
  const [sheet] = sheets;
  assert.deepEqual(sheet.rows[0], ["日期", "项目", "金额", "备注"]);
  assert.ok(sheet.rows.length >= 20, "空行要够铺满一屏");
  for (const row of sheet.rows.slice(1)) {
    assert.deepEqual(
      row.filter((cell) => cell !== ""),
      [],
      "台账不许预置任何一笔账",
    );
  }
  assert.equal(sheet.formats["0:0"].bold, true, "列头要加粗");
  const input = pluginInitialItemInput("ledger-register");
  assert.equal(input.kind, "sheet");
  assert.equal(input.contentType, "grid");
  assert.equal(input.content, undefined, "表格类没有内联源，走 meta.sheets");
  assert.equal(input.meta.sheets.length, 1);
});

test("文献矩阵与三表模型：列头与科目行齐全，数字格全空", () => {
  const matrix = pluginInitialState("literature-matrix");
  const matrixSheets = normalizeGridProjectSheets(
    matrix.sheets.map((sheet) => ({ ...sheet, rows: sheet.rows.map((row) => [...row]) })),
  );
  assert.equal(matrixSheets.length, 3);
  assert.ok(matrixSheets[0].rows[0].length >= 12, "抽取表至少 12 个字段");
  assert.ok(matrixSheets[0].rows[0].includes("样本量"));
  for (const row of matrixSheets[0].rows.slice(1)) {
    assert.deepEqual(row.filter((cell) => cell !== ""), [], "不许预置题录");
  }

  const model = pluginInitialState("three-statement-model");
  const modelSheets = normalizeGridProjectSheets(
    model.sheets.map((sheet) => ({ ...sheet, rows: sheet.rows.map((row) => [...row]) })),
  );
  assert.deepEqual(
    modelSheets.map((sheet) => sheet.name),
    ["假设", "利润表", "现金流量表", "资产负债表", "检查"],
  );
  const income = modelSheets[1];
  assert.equal(income.rows[0][0], "科目");
  assert.ok(income.rows.some((row) => row[0] === "营业收入"));
  assert.ok(income.rows.some((row) => row[0] === "净利润"));
  for (const row of income.rows.slice(1)) {
    // 首列是科目名，其余五期必须是空的。
    assert.deepEqual(row.slice(1).filter((cell) => cell !== ""), [], "不许预置数字");
  }
});

test("三个可算文档插件的工程能过 interactive-doc 校验并连得通", () => {
  for (const pluginId of [
    "spaced-repetition-scheduler",
    "unit-converter",
    "financial-calculator",
  ]) {
    const state = pluginInitialState(pluginId);
    assert.equal(state.kernel, "interactive-doc");
    const project = parseInteractiveDocSource(JSON.stringify(state.project));
    const linked = linkInteractiveDocProject(project);
    assert.deepEqual(linked.errors, [], `${pluginId} 的表达式图连不通`);
    assert.equal(linked.state, "ready", pluginId);
    assert.deepEqual(linked.cycle, [], `${pluginId} 有循环引用`);
    assert.deepEqual(
      linked.deadComputationIds,
      [],
      `${pluginId} 有算了但没人显示的结果`,
    );
    // 第一屏是「打开就有数」：用参数默认值真跑一遍，四则结果必须落地。
    const evaluated = evaluateComputeGraph(project, {});
    assert.equal(evaluated.ok, true, `${pluginId}: ${JSON.stringify(evaluated.graphErrors)}`);
    for (const node of project.computations) {
      const value = evaluated.values[node.id];
      assert.equal(
        typeof value,
        "number",
        `${pluginId}.${node.id} 第一屏就该算出数，实际 ${JSON.stringify(value)}`,
      );
      assert.ok(Number.isFinite(value), `${pluginId}.${node.id} 不是有限数`);
    }
    // 参数要有名有姓：一个「输入 A / 输入 B」都不许留。
    for (const parameter of project.parameters) {
      assert.ok(
        !/^输入\s*[A-Z]$/.test(parameter.label) && parameter.label !== "比例",
        `${pluginId} 还留着通用模板的参数名 ${parameter.label}`,
      );
    }
    const input = pluginInitialItemInput(pluginId);
    assert.equal(input.kind, "interactive_doc");
    assert.equal(JSON.parse(input.content).schema, "oceanleo.interactive-doc.v1");
  }
});

test("间隔排程：零张卡是正常初始态，SM-2 参数照 L3 取值摆在明处", () => {
  const state = pluginInitialState("spaced-repetition-scheduler");
  const project = parseInteractiveDocSource(JSON.stringify(state.project));
  // 零张卡：既没有内联数据集（载体 schema 逼着 inline ≥ 1 行，宁可不放），
  // 也没有任何预置卡片；空队列由「今日到期 = 0」如实呈现。
  assert.equal(project.datasets, undefined, "不许为了凑格式预置示例卡");
  const dueToday = project.computations.find((node) => node.id === "due_today");
  assert.equal(dueToday.expression, "0", "零张卡时今日到期就是 0");
  assert.ok(
    project.blocks.some((block) => block.kind === "metric" && block.bind === "due_today"),
    "空队列要在第一屏上看得见",
  );

  const byId = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
  assert.equal(byId.get("ef_initial").default, 2.5);
  assert.equal(byId.get("ef_floor").default, 1.3);
  assert.equal(byId.get("first_interval_days").default, 1);
  assert.equal(byId.get("second_interval_days").default, 6);
  // I(3) = ceil(I(2) × EF) = ceil(6 × 2.5) = 15
  const third = project.computations.find((node) => node.id === "third_interval_days");
  assert.equal(third.expression, "ceil(second_interval_days * ef_initial)");
});

test("换算器：默认打开的三组单位是写死的，因子取定义值", () => {
  const state = pluginInitialState("unit-converter");
  const project = parseInteractiveDocSource(JSON.stringify(state.project));
  const byId = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
  assert.equal(byId.get("length_metres").unit, "m");
  assert.equal(byId.get("mass_kilograms").unit, "kg");
  assert.equal(byId.get("temperature_celsius").unit, "°C");
  // 定义值：英尺 0.3048 m、磅 0.453 592 37 kg。
  assert.equal(byId.get("length_target_factor").default, 0.3048);
  assert.equal(byId.get("mass_target_factor").default, 0.45359237);
  const fahrenheit = project.computations.find(
    (node) => node.id === "temperature_fahrenheit",
  );
  assert.equal(fahrenheit.expression, "temperature_celsius * 1.8 + 32");
});

test("金融计算器：参数与公式有名有姓，不是「输入 A / 输入 B / 比例」", () => {
  const state = pluginInitialState("financial-calculator");
  const project = parseInteractiveDocSource(JSON.stringify(state.project));
  const labels = project.parameters.map((parameter) => parameter.label);
  assert.deepEqual(labels, ["贷款本金", "年利率", "期数"]);
  const payment = project.computations.find((node) => node.id === "monthly_payment");
  assert.equal(payment.expression, "pmt(monthly_rate, months, principal)");
  const months = project.parameters.find((parameter) => parameter.id === "months");
  assert.equal(months.max, 600, "期数上限 600 期（50 年按月）");
});

test("三个可算文档第一屏的数字是对的，不是占位", () => {
  const values = (pluginId) =>
    evaluateComputeGraph(
      parseInteractiveDocSource(JSON.stringify(pluginInitialState(pluginId).project)),
      {},
    ).values;

  // 100 万、年利率 4.20 %、360 期等额本息：月供 4 890.17 元，首月利息 3 500 元。
  const finance = values("financial-calculator");
  assert.equal(Number(finance.monthly_rate.toFixed(6)), 0.0035);
  assert.equal(Number(finance.monthly_payment.toFixed(2)), 4890.17);
  assert.equal(Number(finance.first_month_interest.toFixed(2)), 3500);
  assert.equal(
    Number(finance.total_interest.toFixed(2)),
    Number((finance.total_payment - 1000000).toFixed(2)),
  );

  // 定义值换算：1 m = 3.280 839 895 ft，1 kg = 2.204 622 622 lb，25 °C = 77 °F = 298.15 K。
  const units = values("unit-converter");
  assert.equal(Number(units.length_converted.toFixed(9)), 3.280839895);
  assert.equal(Number(units.mass_converted.toFixed(9)), 2.204622622);
  assert.equal(units.temperature_fahrenheit, 77);
  assert.equal(units.temperature_kelvin, 298.15);

  // SM-2：I(3) = ceil(6 × 2.5) = 15，I(4) = ceil(15 × 2.5) = 38；
  // 一张今天加进来的卡在第 1 / 7 / 22 / 60 天回来。
  const srs = values("spaced-repetition-scheduler");
  assert.equal(srs.third_interval_days, 15);
  assert.equal(srs.fourth_interval_days, 38);
  assert.deepEqual(
    [srs.review_day_1, srs.review_day_2, srs.review_day_3, srs.review_day_4],
    [1, 7, 22, 60],
  );
  assert.equal(srs.due_today, 0, "零张卡");
});

test("清册只登记做过的插件，形状统一", () => {
  assert.deepEqual(
    [...PLUGIN_INITIAL_STATE_IDS].sort(),
    [
      "annotatable-city-map",
      "financial-calculator",
      "floorplan-annotation",
      "interactive-globe",
      "ledger-register",
      "literature-matrix",
      "spaced-repetition-scheduler",
      "three-statement-model",
      "unit-converter",
    ],
  );
  for (const pluginId of PLUGIN_INITIAL_STATE_IDS) {
    const state = pluginInitialState(pluginId);
    assert.ok(["geo-map", "grid", "interactive-doc"].includes(state.kernel));
    assert.ok(["geo_map", "grid", "interactive_doc"].includes(state.contentType));
    const input = pluginInitialItemInput(pluginId);
    assert.equal(input.meta.plugin_id, pluginId);
    assert.equal(input.meta.content_type, state.contentType);
    // 插件永不进库、永不上架：初始态里不许出现任何货架字段。
    for (const forbidden of ["position", "preview_key", "download_kind", "artifact_id", "shelf"]) {
      assert.equal(input.meta[forbidden], undefined, `${pluginId} 不许带货架字段 ${forbidden}`);
    }
  }
});
