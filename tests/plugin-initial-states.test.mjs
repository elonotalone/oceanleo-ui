// 插件初始态 —— 锁住「第一屏是什么」。
//
// 四条判据，缺一条这一波就白做：
//   1. 每个登记在册的初始态都能被真正的内核校验器接住（形状合法，不是看起来像）。
//   2. 地图三件的每一条依赖都**实际存在**，字节数与 sha256 与内容对得上 ——
//      直接把缺陷二（sha256 全 0、byteSize 写 1、文件不存在）锁死。
//   3. 没做初始态的插件查表返回空，**不是**通用模板。
//   4. 清册、发出去的按键、做出来的第一屏三份名单必须对得上；对不上时当场红，
//      而且红在具体是哪一种对不上。名单一律派生（见下面「两份名单从哪来」），
//      手抄名单过期正是这份文件上一次变红的原因。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  BUILT_IN_GEO_ASSETS,
  PLUGIN_INITIAL_STATE_IDS,
  builtInGeoAsset,
  hasPluginInitialState,
  loadBuiltInGeoPayload,
  loadGeoMapBuiltInFeatures,
  loadPluginGeoFeatures,
  pluginInitialItemInput,
  pluginInitialState,
} from "../src/shell/plugin-initial-states/index.ts";
import { GENERATED_APP_PLUGIN_MAP } from "../src/shell/app-plugins-generated.ts";
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
import {
  BLANK_DRAFT_FEATURE_IDS,
  blankDraftLibraryItem,
} from "../src/shell/blank-draft-items.ts";
import { DISHONEST_FIRST_SCREEN_VALUES } from "./fixtures/plugin-initial-state-dishonest-values.mjs";

const REQUIRED_SIX = [
  "annotatable-city-map",
  "interactive-globe",
  "ledger-register",
  "spaced-repetition-scheduler",
  "unit-converter",
  "financial-calculator",
];

/**
 * 按内核取插件。**不要在测试里手抄内核名单** —— 这份文件上一次变红就是因为手抄的
 * 名单跟不上新补的第一屏；一份新地图加进来，下面那几条地图断言必须自动罩住它。
 */
function kernelPlugins(kernel) {
  return PLUGIN_INITIAL_STATE_IDS.filter(
    (pluginId) => pluginInitialState(pluginId).kernel === kernel,
  );
}

const GEO_PLUGINS = kernelPlugins("geo-map");

// ---------------------------------------------------------------------------
// 两份名单从哪来：派生，不手抄
// ---------------------------------------------------------------------------
// 这份文件原来有两份手抄名单 —— 「本波明确留空的 12 件」与「清册登记的 9 个 id」。
// 补完十份第一屏之后两份同时过期，两条断言当场变红。过期的是**数据**不是判据，
// 所以名单换成派生的，两条断言的意图一个字没动：留空的必须回空、清册与实现一一对应。
//
// 三个源都用，因为「两侧对不上」本身就是要抓的缺陷，不是要绕开的麻烦：
//
//   1. `GENERATED_APP_PLUGIN_MAP` —— 清册在本仓的发布副本，随包，永远读得到。
//      它给出「今天真发了按键的是哪些 id」。
//   2. `PLUGIN_INITIAL_STATE_IDS` —— 实现这一侧，今天真有第一屏的 id。
//   3. 清册的派生视图（在 oceandino 仓，`existsSync` 软判）。它给出前两个源给不出的
//      两格：**册子上有、却一枚按键都没发的族**，以及那个族留空的裁定与理由。
//
// 单拿第 2 源派生是不够的：拿实现去对实现恒真，什么都锁不住。交叉对账才抓得住这一波
// 真发生过的两种事故 —— 清册发了按键没人补第一屏（上一轮 236 枚死按键），
// 以及补了第一屏清册没跟上（做完了没人用，或 hold 登记过期）。

/** 发布副本里出现过的插件 id：发了按键的那一侧。 */
const SHIPPED_PLUGIN_IDS = Object.freeze(
  [
    ...new Set(
      Object.values(GENERATED_APP_PLUGIN_MAP.apps).flatMap((rows) =>
        rows.map((entry) => String(entry?.id || "").trim()).filter(Boolean),
      ),
    ),
  ].sort(),
);

/** 清册派生视图。路径与环境变量与 `app-capability-entry.test.mjs` 同一条。 */
const REGISTRY_SOURCE =
  process.env.OCEANLEO_APP_PLUGINS ||
  "/opt/cursor-workspaces/oceandino/scripts/data/oceanleo-app-plugins.json";
const REGISTRY = existsSync(REGISTRY_SOURCE)
  ? JSON.parse(readFileSync(REGISTRY_SOURCE, "utf8"))
  : null;

/** 册子：非编辑类插件的全集。清册不在本仓，读不到时是 `null` —— **不是空集**。 */
const ROSTER_IDS = REGISTRY
  ? Object.freeze(Object.keys(REGISTRY.plugins ?? {}).sort())
  : null;

/** 登记为留空的族 → 裁定与理由。今天是仲裁 A-7 撤掉的概念图谱与关系图。 */
const HELD = new Map();
for (const entry of REGISTRY?.pluginsWithoutApps ?? []) {
  const id = String(entry?.id || "").trim();
  if (id) HELD.set(id, { ruling: String(entry?.ruling || ""), reason: String(entry?.reason || "") });
}
for (const [id, meta] of Object.entries(REGISTRY?.plugins ?? {})) {
  if (!meta?.hold) continue;
  HELD.set(id, {
    ruling: String(meta.hold.ruling || ""),
    reason: String(meta.hold.reason || ""),
  });
}

const IMPLEMENTED = new Set(PLUGIN_INITIAL_STATE_IDS);

/**
 * 第一屏计算节点给出的值是否诚实：要么如实空着（null），要么是有限数。
 * NaN / Infinity / 非数字占位一律不许。
 *
 * 抽成具名函数是为了和反面夹具拴死同一条谓词（VF2）：改成恒 true 时，
 * 下面「反面夹具」那条必须当场红，不能只靠活数据扫描（活数据今天本来就没有 NaN）。
 */
function isHonestFirstScreenValue(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/**
 * 归一时废掉的四个旧短 id 加两个同源的。这是一个**封闭的历史集合**，不是会变的名单：
 * canonical id 已裁定为 L3 族 id，不留别名、不留映射表，所以这六个只会一直是废的。
 */
const RETIRED_SHORT_IDS = Object.freeze([
  "city-map",
  "concept-graph",
  "floorplan",
  "geo-map",
  "ledger",
  "spaced-repetition",
]);

/**
 * 查表必须回空的 id。三段都是派生的：
 *   · 册子上有、没有第一屏的族（今天 = 登记为留空的那两个）；
 *   · 五个通用起手件 featureId —— 「查不到就回退成通用模板」正是本条要防的事；
 *   · 归一时废掉的短 id。
 * 后两段与清册在不在本机无关，所以这份名单**任何时候都非空**，断言不会退化成空转。
 */
const EMPTY_LOOKUP_IDS = Object.freeze([
  ...(ROSTER_IDS ?? []).filter((id) => !IMPLEMENTED.has(id)),
  ...BLANK_DRAFT_FEATURE_IDS,
  ...RETIRED_SHORT_IDS,
]);

/**
 * 三份名单的对账。返回的每一格都是「一种具体的不一致」，全空才算对得上。
 *
 * 抽成纯函数是为了让反面用例能喂**同一段逻辑**：真数据判绿的这段代码，
 * 换上「清册多一个 id」「第一屏多一个 id」的假局面必须当场判红，
 * 否则上面那几条 `deepEqual([])` 只是恒真。
 */
function reconcileInitialStateRoster({ roster, held, shipped, implemented }) {
  const heldSet = new Set(held ?? []);
  const shippedSet = new Set(shipped ?? []);
  const implementedSet = new Set(implemented ?? []);
  const rosterSet = roster ? new Set(roster) : null;
  const sorted = (values) => [...values].sort();
  return {
    /** 发了按键、却没有第一屏 —— 用户点下去是死按键。 */
    deadButtons: sorted([...shippedSet].filter((id) => !implementedSet.has(id))),
    /** 有第一屏、却没发按键，也没登记为留空 —— 做完了没人用，或漏了登记。 */
    unshipped: sorted(
      [...implementedSet].filter((id) => !shippedSet.has(id) && !heldSet.has(id)),
    ),
    /** 登记为留空、却又有了第一屏或按键 —— 登记过期。 */
    staleHold: sorted(
      [...heldSet].filter((id) => implementedSet.has(id) || shippedSet.has(id)),
    ),
    /** 册子上有、既没第一屏也没登记留空 —— 「没人知道它没做完」。 */
    unresolved: rosterSet
      ? sorted(
          [...rosterSet].filter(
            (id) => !implementedSet.has(id) && !heldSet.has(id),
          ),
        )
      : [],
    /** 册子上没有、却发了按键或做了第一屏 —— 发布副本与清册漂移。 */
    offRoster: rosterSet
      ? sorted(
          [...new Set([...shippedSet, ...implementedSet])].filter(
            (id) => !rosterSet.has(id),
          ),
        )
      : [],
  };
}

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
  assert.ok(
    EMPTY_LOOKUP_IDS.length >= BLANK_DRAFT_FEATURE_IDS.length,
    "这条断言的名单是派生的；派生成空集等于这条没测",
  );
  for (const pluginId of EMPTY_LOOKUP_IDS) {
    assert.equal(pluginInitialState(pluginId), null, `${pluginId} 应当留空`);
    assert.equal(hasPluginInitialState(pluginId), false);
    assert.equal(pluginInitialItemInput(pluginId), null);
  }
  for (const bogus of ["", "   ", "不存在的插件", null, undefined, 42]) {
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
  assert.ok(GEO_PLUGINS.length >= 3, "地图内核至少三件：地图 / 地球仪 / 户型标注");
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

test("底图要素真的落到画布上：接通与不接通两次渲染必须判然不同", async () => {
  const state = pluginInitialState("annotatable-city-map");
  const project = parseGeoMapSource(JSON.stringify(state.project));

  // 渲染层实际走的那条路：按工程自己的 sources 取要素，不认插件 id。
  const features = await loadGeoMapBuiltInFeatures(project);
  assert.deepEqual(Object.keys(features), ["land"]);

  const wired = stubContext();
  const wiredResult = renderGeoMapToCanvas({
    project,
    context: wired,
    width: 1600,
    height: 1000,
    features,
  });

  // 「画到了画布上」的判据是画布上的笔画，不是依赖存不存在：
  // 陆地是上万个顶点连出来的折线，只画一块底色的话一笔都不会有。
  const strokesOf = (context, op) => context.ops.filter((entry) => entry[0] === op);
  const wiredLineTo = strokesOf(wired, "lineTo").length;
  const wiredLandFills = strokesOf(wired, "fill").filter(
    (entry) => entry[1] === GEO_MAP_PALETTE["map.land"],
  ).length;
  assert.ok(
    wiredLineTo >= 5000,
    `底图顶点没进画布：lineTo 只有 ${wiredLineTo} 笔`,
  );
  assert.ok(
    wiredLandFills >= 100,
    `陆地面没被填色：只填了 ${wiredLandFills} 个面`,
  );
  assert.ok(wiredResult.drawnLayerIds.includes("land-fill"));
  assert.deepEqual(wiredResult.missingSourceKeys, []);
  assert.equal(wiredResult.degraded, false);

  // 反面：这正是接通之前的样子 —— 一块淡蓝底色，别的什么都没有。
  // 这一对断言保证上面那几条不是恒真的。
  const bare = stubContext();
  const bareResult = renderGeoMapToCanvas({
    project,
    context: bare,
    width: 1600,
    height: 1000,
  });
  assert.deepEqual(bareResult.missingSourceKeys, ["land"]);
  assert.equal(bareResult.degraded, true);
  assert.deepEqual(bareResult.drawnLayerIds, ["ocean-base"]);
  assert.equal(
    strokesOf(bare, "lineTo").length,
    0,
    "不传 features 时画布上不该有任何地理笔画",
  );
});

test("两个渲染调用点都把要素传进去了", () => {
  const read = (relative) =>
    readFileSync(new URL(`../src/${relative}`, import.meta.url), "utf8");
  for (const file of [
    "shell/geo-map-editor/GeoMapStage.tsx",
    "shell/advanced-routes/GeoMapRoute.tsx",
  ]) {
    const source = read(file);
    assert.ok(
      source.includes("loadBuiltInGeoFeatures"),
      `${file} 必须去取内置底图要素`,
    );
    assert.match(
      source,
      /renderGeoMapToCanvas\(\{[^}]*features/s,
      `${file} 调渲染器时必须带上 features`,
    );
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

test("每一份可算文档的第一屏都连得通，算不出的地方如实空着而不是 NaN", () => {
  // 这一条罩的是**全部**可算文档，名单按内核派生：新补一份第一屏，它自动进来。
  // 上面那条只罩「打开就有数」的三件，是设计取值的判据，不是名单。
  const docPlugins = kernelPlugins("interactive-doc");
  assert.ok(docPlugins.length >= 3, "可算文档内核一件都没有？名单派生错了");
  for (const pluginId of docPlugins) {
    const project = parseInteractiveDocSource(
      JSON.stringify(pluginInitialState(pluginId).project),
    );
    const linked = linkInteractiveDocProject(project);
    assert.deepEqual(linked.errors, [], `${pluginId} 的表达式图连不通`);
    assert.equal(linked.state, "ready", pluginId);
    assert.deepEqual(linked.cycle, [], `${pluginId} 有循环引用`);
    assert.deepEqual(
      linked.deadComputationIds,
      [],
      `${pluginId} 有算了但没人显示的结果`,
    );
    const evaluated = evaluateComputeGraph(project, {});
    assert.equal(evaluated.ok, true, `${pluginId}: ${JSON.stringify(evaluated.graphErrors)}`);
    for (const node of project.computations) {
      const value = evaluated.values[node.id];
      // 零数据的第一屏有两种诚实的样子：默认值算得出数（月供 4 890.17），
      // 或者还没有数据可算（体重没填，BMI 就是空）。**第三种不许有**：
      // 0 ÷ 0 冒出来的 NaN / Infinity、或者一串占位文本被摆到用户面前。
      assert.ok(
        isHonestFirstScreenValue(value),
        `${pluginId}.${node.id} 第一屏给出了 ${String(value)}：` +
          "零数据处要么算出数、要么如实空着",
      );
    }
    for (const parameter of project.parameters) {
      assert.ok(
        !/^输入\s*[A-Z]$/.test(parameter.label) && parameter.label !== "比例",
        `${pluginId} 还留着通用模板的参数名 ${parameter.label}`,
      );
    }
  }
});

test("「打开就有数」的三件：工程连得通，默认值真跑得出结果", () => {
  // 这三件是刻意设计成打开即有真实数字的（月供、换算、SM-2 间隔），所以这里逐个
  // 计算节点都要求落地成有限数。**这是设计取值，不是名单** —— 别的可算文档零数据时
  // 空着才是对的，它们由上面那条派生的断言罩着。
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

test("清册、按键与第一屏三份名单对得上（名单派生，不是手抄的）", () => {
  // 名单空了这条就成了空转，所以先证明两侧都真有东西可比。
  assert.ok(SHIPPED_PLUGIN_IDS.length >= 1, "发布副本一枚按键都没有，对账无从谈起");
  assert.ok(PLUGIN_INITIAL_STATE_IDS.length >= 1, "初始态表是空的");

  const report = reconcileInitialStateRoster({
    roster: ROSTER_IDS,
    held: [...HELD.keys()],
    shipped: SHIPPED_PLUGIN_IDS,
    implemented: PLUGIN_INITIAL_STATE_IDS,
  });
  assert.deepEqual(
    report.deadButtons,
    [],
    "这些 id 发了按键却查不到第一屏，用户点下去是死按键：" +
      "补 plugin-initial-states/，或在清册里登记为留空",
  );
  assert.deepEqual(
    report.unshipped,
    [],
    "这些 id 有第一屏，清册却没发按键、也没登记为留空 —— " +
      "要么跑一次 scripts/sync-app-plugins.mjs，要么在清册里说清为什么不发",
  );
  assert.deepEqual(
    report.staleHold,
    [],
    "这些 id 在清册里登记为留空，却已经有第一屏或按键了：hold 登记过期",
  );
  assert.deepEqual(
    report.unresolved,
    [],
    "清册认了这些族，却既没有第一屏、也没有留空登记 —— 「没做完」可以，「没人知道它没做完」不行",
  );
  assert.deepEqual(
    report.offRoster,
    [],
    "这些 id 不在清册册子上，却发了按键或做了第一屏：发布副本与清册漂移了",
  );

  // 留空那一侧同样是派生的：册子减去实现，必须逐条对上 hold 登记，理由不许含糊。
  if (ROSTER_IDS) {
    const withoutFirstScreen = ROSTER_IDS.filter((id) => !IMPLEMENTED.has(id));
    assert.deepEqual(
      withoutFirstScreen,
      [...HELD.keys()].sort(),
      "「该留空的」这份名单只能从清册的 hold 登记来，不许在测试里手抄",
    );
    for (const id of withoutFirstScreen) {
      const { ruling, reason } = HELD.get(id);
      assert.ok(ruling.trim().length >= 2, `${id} 留空要写清是哪一条裁定`);
      assert.ok(
        reason.trim().length >= 10,
        `${id} 留空要写清理由，否则 hold 就成了万能静音开关`,
      );
    }
  }

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

test("运行期兜底：起手路径先问一次「有没有第一屏」，路由层刻意不问", () => {
  const read = (relative) =>
    readFileSync(new URL(`../src/${relative}`, import.meta.url), "utf8");

  // 生成期（清册只给做出了第一屏的功能发按键）与构建期（上面那条对账）两道闸都在
  // 发布之前。它们被忽略过去的时候，用户手上那枚按键还是点得下去 —— 所以起手路径
  // 必须自己再判一次，判不过就给一句读得懂的话，而不是挂一个空壳。
  const canvas = read("shell/ResultCanvas.tsx");
  assert.match(
    canvas,
    /pluginInitialStateAvailable/,
    "ResultCanvas 的起手路径必须自己判一次有没有第一屏",
  );
  assert.match(
    canvas,
    /if \(!pluginInitialStateAvailable\(launch\.pluginId\)\) \{[\s\S]{0,400}?setFeatureLaunchError\(/,
    "判不过要给出失败态文案，不许静默 return",
  );
  // 失败态要说清缺什么、下一步做什么（形状对齐 GridStage 的取源失败态）。
  const message = canvas.slice(
    canvas.indexOf("if (!pluginInitialStateAvailable(launch.pluginId))"),
  );
  const panel = message.slice(0, message.indexOf("return;"));
  assert.match(panel, /还没有做出打开后的第一屏/, "要说清缺的是什么");
  assert.match(panel, /请先用|可以反馈/, "要说清用户下一步能做什么");
  // 用户看得见的文案里不许出现「插件」二字（既有红线）。
  assert.doesNotMatch(panel, /插件/, "面向用户的失败态文案不许出现「插件」");

  // 路由层不加这道判定：那里还流过用户自己存下来的功能实例，它们的字节是用户数据，
  // 不是第一屏。第一屏被撤掉之后，用它存过的东西必须照样打得开。
  assert.doesNotMatch(
    read("shell/workbench-routes.ts"),
    /pluginInitialStateAvailable/,
    "路由层拿「有没有第一屏」当门槛，会把用户已经存下来的数据一起锁死",
  );
});

test("反面用例：任一侧多出一个 id，对账当场红（上面那几条不是恒真的）", () => {
  const base = {
    roster: ROSTER_IDS,
    held: [...HELD.keys()],
    shipped: SHIPPED_PLUGIN_IDS,
    implemented: PLUGIN_INITIAL_STATE_IDS,
  };
  const [sample] = [...PLUGIN_INITIAL_STATE_IDS].sort();
  assert.ok(sample, "初始态表是空的，反面用例无从造起");

  // ① 清册里多了一件工具、按键也发了，第一屏没人补 —— 上一轮 236 枚死按键的形状。
  const added = reconcileInitialStateRoster({
    ...base,
    roster: ROSTER_IDS ? [...ROSTER_IDS, "brand-new-plugin"] : null,
    shipped: [...SHIPPED_PLUGIN_IDS, "brand-new-plugin"],
  });
  assert.deepEqual(added.deadButtons, ["brand-new-plugin"]);
  assert.deepEqual(added.unresolved, ROSTER_IDS ? ["brand-new-plugin"] : []);

  // ①b 清册加了一件、连按键都还没发：没有死按键，但「没人知道它没做完」要红。
  if (ROSTER_IDS) {
    const silent = reconcileInitialStateRoster({
      ...base,
      roster: [...ROSTER_IDS, "brand-new-plugin"],
    });
    assert.deepEqual(silent.deadButtons, []);
    assert.deepEqual(silent.unresolved, ["brand-new-plugin"]);
  }

  // ② 反向：第一屏做了，清册这一侧没有它 —— 做完了没人用，两条同时红。
  const dropped = reconcileInitialStateRoster({
    ...base,
    shipped: SHIPPED_PLUGIN_IDS.filter((id) => id !== sample),
    roster: ROSTER_IDS ? ROSTER_IDS.filter((id) => id !== sample) : null,
  });
  assert.deepEqual(dropped.unshipped, [sample]);
  assert.deepEqual(dropped.offRoster, ROSTER_IDS ? [sample] : []);

  // ③ hold 登记过期：登记为留空的族后来做了第一屏，却没人撤登记。
  const stale = reconcileInitialStateRoster({
    ...base,
    held: [...base.held, sample],
  });
  assert.deepEqual(stale.staleHold, [sample]);

  // ④ 今天这份真数据五格全空 —— 与上面三个假局面用的是同一段逻辑。
  const today = reconcileInitialStateRoster(base);
  assert.deepEqual(
    Object.entries(today).filter(([, ids]) => ids.length > 0),
    [],
  );
});

test("反面夹具：含 NaN/Infinity 的值必须被诚实谓词拒掉（改松谓词当场红）", () => {
  // VF2：活数据扫描 alone 挡不住「把 honest 改成 true」——今天的第一屏本来就没有 NaN。
  // 固定夹具与 `isHonestFirstScreenValue` 拴死：改松谓词时本条红，活数据那条也一起失守。
  assert.ok(
    DISHONEST_FIRST_SCREEN_VALUES.length >= 3,
    "夹具被掏空等于这条没测",
  );
  for (const value of DISHONEST_FIRST_SCREEN_VALUES) {
    assert.equal(
      isHonestFirstScreenValue(value),
      false,
      `诚实谓词放过了 ${String(value)}：改松谓词或夹具与谓词脱钩了`,
    );
  }
  // 对照：合法的两种第一屏样子仍绿，免得有人把谓词改成恒 false 蒙混。
  assert.equal(isHonestFirstScreenValue(null), true);
  assert.equal(isHonestFirstScreenValue(0), true);
  assert.equal(isHonestFirstScreenValue(4890.17), true);
});
