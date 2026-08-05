/**
 * 会话快照那一跳：`META_KEYS` 白名单必须让功能实例的身份与底图清单过去。
 *
 * 分工，先说清楚免得与前两份重复造：
 *   · `tests/plugin-instance-save-entry.test.mjs`（W19）锁的是**保存入口**
 *     ——「第一屏起手 → 用户填 → 存」走的是功能数据那条路，不发 revision。
 *   · `tests/w26-plugin-instance-reopen.test.mjs`（W26）锁的是**存完再重开**
 *     ——「保存交回来的那件东西写进会话，捡回来还是同一个功能实例」。它今天判绿
 *     靠的是 `pluginIdForItem()` 认实例键那条兜底，因为身份从 `meta` 里被吃掉了。
 *   · **本文件锁的是白名单本身**：身份不许只剩兜底那一份证据，且地图捡回来之后
 *     依赖闭包要真的核得动、底图要真的画得出来。
 *
 * 为什么这一跳要紧：`jsonSafeMeta()` 按 `META_KEYS`（`advanced-session.ts`）过滤
 * `meta`，表里少 `plugin_id` / `plugin_runtime` / `source_manifest` / `app_id` 时，
 * 从会话里捡回来的台账被判成**一件素材**，下一次保存就照素材链把用户记的账造成
 * xlsx 发进库 —— 保存入口堵掉的那个洞在下一跳原样复现。
 *
 * grid 这一侧刻意**不**编译 `use-grid-editor.ts`：那个文件此刻有人在改，
 * 真保存那一跳已由上面两份端到端锁住，本文件只需要它存完之后的那件东西的形状
 * （功能数据档的 grid 把用户的行写在 `meta.sheets` 里，`loadGridSheets()` 读的
 * 就是这一格）。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  inlineEditorItemsFromSession,
  withInlineEditorHistoryHead,
} from "../src/shell/advanced-session.ts";
import {
  MATERIAL_RECEIPT_META_KEYS,
  materialReceiptKeysIn,
  pluginInstanceSavedItem,
  withoutMaterialReceipts,
} from "../src/shell/advanced-routes/plugin-instance-saved-item.ts";
import { loadGridSheets } from "../src/shell/doc-editors/grid-model.ts";
import { commitGeoMapProject } from "../src/shell/geo-map-editor/geo-map-persistence.ts";
import { renderGeoMapToCanvas } from "../src/shell/geo-map-editor/geo-map-render.ts";
import {
  parseGeoMapSource,
  resolveGeoMapDependencyClosure,
} from "../src/shell/geo-map-editor/geo-map-source.ts";
import { commitInteractiveDocProject } from "../src/shell/interactive-doc-editor/interactive-doc-persistence.ts";
import { parseInteractiveDocSource } from "../src/shell/interactive-doc-editor/interactive-doc-source.ts";
import {
  pluginIdForItem,
  pluginInstanceLibraryItem,
  pluginRuntimeForItem,
  saveTargetForItem,
} from "../src/shell/plugin-initial-state.ts";
import { loadGeoMapBuiltInFeatures } from "../src/shell/plugin-initial-states/index.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

/* --------------------------- 取真函数：编译那一份 --------------------------- */
/**
 * `use-geo-map-workbench.ts` 经 i18n 链拖进 React，node 的 strip-types 载不了，
 * 但 `geoMapAvailableDependencies()` 是这一条判据的**真消费方**，不能拿一份手抄的
 * 副本顶替。走共享编译台：相对 specifier 自动解析，只桩真的加载不进来的那一个。
 */
const { geoMapAvailableDependencies } = await import(
  await compileModule("src/shell/geo-map-editor/use-geo-map-workbench.ts", {
    "../../i18n/ui/useUI": dataModule(
      "export function useUI() { return (value) => value; }",
    ),
  })
);

/* --------------------------------- 夹具 ---------------------------------- */

/** 真的第一屏。造不出来就直接红 —— 不许在这里自造夹具顶上。 */
function firstScreen(pluginId, siteId, appId) {
  const item = pluginInstanceLibraryItem(pluginId, {
    siteId,
    appId,
    nonce: `cap:${siteId}/${appId}/${pluginId}:1`,
  });
  assert.ok(item, `${pluginId} 造不出第一屏实例`);
  return item;
}

/** 工作台那一跳：写进会话，再从会话里捡回来。走真链上的两个函数。 */
function throughSession(item, route) {
  const restored = inlineEditorItemsFromSession({
    snapshot: withInlineEditorHistoryHead({}, item, route, null),
  });
  assert.equal(restored.length, 1, "会话里没捡回那份存过的实例");
  return restored[0];
}

/** 网络与落库在功能数据这一层一律不许发生。 */
function forbiddenRuntime(label) {
  return {
    upload: async () => {
      throw new Error(`${label} 不许上传`);
    },
    publish: async () => {
      throw new Error(`${label} 不许发 revision`);
    },
    fork: async () => {
      throw new Error(`${label} 不许 fork`);
    },
    digest: async () => "0".repeat(64),
  };
}

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

const countOps = (context, op) =>
  context.ops.filter((entry) => entry[0] === op).length;

/* ===================== 一、身份不许只剩实例键那一份证据 ===================== */

test("三个内核：存过再捡回来，身份写在 meta 里，不靠实例键兜底", () => {
  const cases = [
    ["annotatable-city-map", "geo-map", "travel", "city-guide"],
    ["ledger-register", "grid", "excel", "bookkeeping"],
    ["unit-converter", "interactive-doc", "study", "unit-tools"],
  ];
  for (const [pluginId, route, siteId, appId] of cases) {
    const item = firstScreen(pluginId, siteId, appId);
    const restored = throughSession(item, route);

    assert.equal(restored.meta.plugin_id, pluginId, `${pluginId}: 身份被会话吃掉了`);
    assert.equal(
      restored.meta.plugin_runtime,
      route,
      `${pluginId}: 内核名被会话吃掉了`,
    );
    assert.equal(restored.meta.app_id, appId, `${pluginId}: 来源 app 被会话吃掉了`);

    // 关键的一条：把实例键那份兜底证据拿掉，身份仍然认得出来。
    // 认不出来就说明今天判绿全靠 `key`，`meta` 这一路其实是断的。
    const withoutKeyEvidence = { ...restored, key: `session:${pluginId}:1` };
    assert.equal(
      pluginIdForItem(withoutKeyEvidence),
      pluginId,
      `${pluginId}: 去掉实例键之后就认不出身份了，说明 meta 里没带回来`,
    );
    assert.equal(
      saveTargetForItem(withoutKeyEvidence),
      "plugin-instance",
      `${pluginId}: 捡回来的功能实例被判成素材 —— 下一次保存就把用户的数据发进库`,
    );
    assert.equal(pluginRuntimeForItem(withoutKeyEvidence), route);
  }
});

test("白名单没有被放宽成「全都过」：未登记的键仍然进不了会话", () => {
  const item = firstScreen("ledger-register", "excel", "bookkeeping");
  const restored = throughSession(
    {
      ...item,
      meta: {
        ...item.meta,
        // 三种典型的「别处才该信的东西」：凭据、大字节、随手挂的私有结构。
        access_token: "secret-token-value",
        inline_blob: "A".repeat(4096),
        whatever_the_route_stashed: { deep: { value: 1 } },
      },
    },
    "grid",
  );
  for (const key of ["access_token", "inline_blob", "whatever_the_route_stashed"]) {
    assert.ok(
      !(key in restored.meta),
      `${key} 跨过了会话快照 —— 白名单被放宽成了「全都过」`,
    );
  }
  // 同一跳里该过的还得过，否则上一条是靠「什么都不过」判绿的。
  assert.equal(restored.meta.plugin_id, "ledger-register");
});

test("grid：捡回来还是台账，用户记的账与列头都在", async () => {
  const item = firstScreen("ledger-register", "excel", "bookkeeping");
  const sheets = await loadGridSheets(item);
  const header = [...sheets[0].rows[0]];
  assert.ok(header.length >= 3, `第一屏的台账没有列头：${JSON.stringify(header)}`);
  sheets[0].rows[1][0] = "2026-08-05";
  sheets[0].rows[1][1] = "地铁";
  sheets[0].rows[1][2] = "6";

  // 功能数据档的 grid 把用户的行冻在 `meta.sheets` 里（`gridPluginInstanceVersion()`
  // 交回来的就是这个形状，端到端在 W26 那份里）。这一跳测的是它过不过得了会话。
  const saved = { ...item, meta: { ...item.meta, sheets } };
  const restored = throughSession(saved, "grid");
  assert.equal(saveTargetForItem(restored), "plugin-instance");

  const reopened = await loadGridSheets(restored);
  assert.deepEqual(reopened[0].rows[1].slice(0, 3), ["2026-08-05", "地铁", "6"]);
  assert.deepEqual(reopened[0].rows[0], header, "列头这类插件自己的结构不许丢");
});

test("interactive-doc：存过再捡回来，填的数还在，身份还在", async () => {
  const item = firstScreen("unit-converter", "study", "unit-tools");
  const project = parseInteractiveDocSource(item.content);
  const numeric = project.parameters.find(
    (parameter) => parameter.kind === "number",
  );
  assert.ok(numeric, "第一屏没有可填的数值参数");
  assert.notEqual(numeric.default, 42, "夹具与第一屏缺省撞上了，这条会假绿");
  const filled = {
    ...project,
    parameters: project.parameters.map((parameter) =>
      parameter.id === numeric.id ? { ...parameter, default: 42 } : parameter,
    ),
  };
  const saved = await commitInteractiveDocProject({
    item,
    project: filled,
    dependencies: {
      upload: async () => {
        throw new Error("功能数据不许上传");
      },
      publish: async () => {
        throw new Error("功能数据不许发 revision");
      },
    },
  });
  assert.equal(saved.saveTarget, "plugin-instance");

  // 路由层今天交回来的就是这件东西（`InteractiveDocRoute.buildSavedItem()`）。
  const handoff = pluginInstanceSavedItem(saved.item, { content: saved.json });
  const restored = throughSession(handoff, "interactive-doc");
  assert.equal(restored.meta.plugin_id, "unit-converter");
  assert.equal(
    saveTargetForItem({ ...restored, key: "session:x" }),
    "plugin-instance",
  );
  assert.equal(
    parseInteractiveDocSource(restored.content).parameters.find(
      (parameter) => parameter.id === numeric.id,
    ).default,
    42,
    "重开之后用户填的数没了，只剩第一屏的示例值",
  );
});

/* ================= 二、地图：捡回来还核得动闭包、还画得出底图 ================= */

test("geo-map：捡回来的地图带着底图清单，闭包是真的核过的", async () => {
  const item = firstScreen("annotatable-city-map", "travel", "city-guide");
  const manifest = item.meta.source_manifest;
  assert.ok(Array.isArray(manifest) && manifest.length > 0, "第一屏没有内置底图清单");

  const project = parseGeoMapSource(item.content);
  const saved = await commitGeoMapProject({
    item,
    title: project.metadata.title,
    editRevision: 0,
    project,
    durableDependencies: manifest,
    runtime: forbiddenRuntime("地图功能数据"),
  });
  assert.equal(saved.ok, true, JSON.stringify(saved.ok === false ? saved.errors : []));
  const restored = throughSession(
    pluginInstanceSavedItem(item, { content: saved.json }),
    "geo-map",
  );

  const report = geoMapAvailableDependencies(restored);
  assert.equal(
    report.verified,
    true,
    "捡回来的地图没带底图清单：闭包只能拿工程自己声明的依赖跟自己核对，那是自证",
  );
  assert.deepEqual(
    report.available.map((entry) => entry.path).sort(),
    manifest.map((entry) => entry.path).sort(),
  );

  const closure = resolveGeoMapDependencyClosure(
    parseGeoMapSource(restored.content),
    report.available,
  );
  assert.equal(closure.verdict, "ready", JSON.stringify(closure.errors));
  assert.equal(closure.canSave, true);
  assert.deepEqual(closure.missingPaths, []);
  assert.deepEqual(closure.digestMismatchPaths, []);

  // 「核过」不是一句形容词：把清单里的摘要改坏，这一关必须当场判不过。
  // 清单缺席时走的那条自证路径（拿 declared 当 available）永远发现不了这个。
  const tampered = resolveGeoMapDependencyClosure(
    parseGeoMapSource(restored.content),
    report.available.map((entry) => ({ ...entry, sha256: "b".repeat(64) })),
  );
  assert.notEqual(
    tampered.verdict,
    "ready",
    "摘要改坏了还判 ready —— 这一关是空的",
  );
  assert.equal(tampered.canSave, false);
  assert.deepEqual(
    tampered.digestMismatchPaths,
    manifest.map((entry) => entry.path),
  );
  const selfCertified = resolveGeoMapDependencyClosure(
    parseGeoMapSource(restored.content),
    parseGeoMapSource(restored.content).dependencies ?? [],
  );
  assert.equal(
    selfCertified.verdict,
    "ready",
    "自证路径本来就恒判 ready，上面那条 verified 断言正是为了不让它顶替真检查",
  );
});

test("geo-map：捡回来之后接着存，底图清单要能自己供上", async () => {
  const item = firstScreen("annotatable-city-map", "travel", "city-guide");
  const first = await commitGeoMapProject({
    item,
    title: "初次",
    editRevision: 0,
    project: parseGeoMapSource(item.content),
    durableDependencies: item.meta.source_manifest,
    runtime: forbiddenRuntime("地图功能数据"),
  });
  assert.equal(first.ok, true);
  const restored = throughSession(
    pluginInstanceSavedItem(item, { content: first.json }),
    "geo-map",
  );

  /**
   * 保存那一跳自己去问 `geoMapAvailableDependencies(item)` 要闭包
   * （`use-geo-map-workbench.ts:500`），**不是调用方喂进来的**。清单被会话吃掉之后
   * 这里拿到空数组，`commitGeoMapProject` 就按「声明了依赖却既没有待传字节、
   * 也不在持久闭包里」判拒 —— 用户从会话里把地图捡回来、加一个标注、点保存，
   * 当场存不下去。这不是形容词，下面这一跳就是真链上的那一跳。
   */
  const project = parseGeoMapSource(restored.content);
  const again = await commitGeoMapProject({
    item: restored,
    title: project.metadata.title,
    editRevision: 1,
    project,
    durableDependencies: geoMapAvailableDependencies(restored).available,
    runtime: forbiddenRuntime("地图功能数据"),
  });
  assert.equal(
    again.ok,
    true,
    `捡回来的地图再存一次被拒：${JSON.stringify(
      again.ok === false ? again.errors.map((entry) => entry.message) : [],
    )}`,
  );
  assert.equal(again.saveTarget, "plugin-instance");
  assert.equal(again.closure.length, item.meta.source_manifest.length);
});

test("geo-map：捡回来还画得出底图 —— 判据是画布上落了多少笔", async () => {
  const item = firstScreen("annotatable-city-map", "travel", "city-guide");
  const project = parseGeoMapSource(item.content);
  const annotated = {
    ...project,
    metadata: { ...project.metadata, title: "我的成都散步路线" },
    annotations: [
      {
        id: "annotation-1",
        kind: "marker",
        geometry: { type: "Point", coordinates: [104.0668, 30.5728] },
        text: "宽窄巷子",
      },
    ],
  };
  const saved = await commitGeoMapProject({
    item,
    title: annotated.metadata.title,
    editRevision: 0,
    project: annotated,
    durableDependencies: item.meta.source_manifest,
    runtime: forbiddenRuntime("地图功能数据"),
  });
  assert.equal(saved.ok, true, JSON.stringify(saved.ok === false ? saved.errors : []));

  const restored = throughSession(
    pluginInstanceSavedItem(item, { content: saved.json }),
    "geo-map",
  );
  const reopened = parseGeoMapSource(restored.content);
  assert.equal(reopened.annotations.at(-1).text, "宽窄巷子", "标注没跟着回来");

  // 渲染层按工程自己的 `sources` 取字节，走的就是舞台那条路。
  // 说清楚这一条锁的是什么：**渲染本来就不读 `source_manifest`**，所以它不是
  // 白名单那个洞的受害者，去掉四个键这一条照样绿。它锁的是「捡回来的那份字节
  // 真的还能画出底图」这个结果本身 —— 工程被会话截断、标注丢了、sources 被吃掉，
  // 这一条都会红。清单管的是上面那两条（闭包核得动、接着存得下去）。
  const features = await loadGeoMapBuiltInFeatures(reopened);
  const drawn = stubContext();
  const result = renderGeoMapToCanvas({
    project: reopened,
    context: drawn,
    width: 1600,
    height: 1000,
    features,
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.degraded, false);
  assert.deepEqual(result.missingSourceKeys, []);
  assert.ok(result.drawnLayerIds.includes("land-fill"));

  // 陆地是上万个顶点连出来的折线：只画一块底色的话一笔都不会有。
  // 本机实测 30 918 笔（与 V4 复现的读数一致）。
  const lineTo = countOps(drawn, "lineTo");
  assert.ok(lineTo >= 5000, `捡回来的地图画不出底图：lineTo 只有 ${lineTo} 笔`);
  assert.ok(countOps(drawn, "fill") >= 100, "陆地面没被逐个填色");

  // 反面：不接通要素就是接通之前那个淡蓝空矩形，一笔地理线都没有。
  // 这一对保证上面那条不是恒真的。
  const bare = stubContext();
  const bareResult = renderGeoMapToCanvas({
    project: reopened,
    context: bare,
    width: 1600,
    height: 1000,
  });
  assert.equal(bareResult.degraded, true);
  assert.equal(countOps(bare, "lineTo"), 0);
});

/* ======================== 三、功能数据档不许套素材回执 ======================== */

test("功能数据的交回件里一个素材回执字段都不许有", () => {
  const item = firstScreen("annotatable-city-map", "travel", "city-guide");
  const polluted = pluginInstanceSavedItem(
    {
      ...item,
      meta: {
        ...item.meta,
        // 摘之前两个 route 就是这么写的：值全是空串，形状照素材来。
        editor_project_url: "",
        editor_revision_id: "",
        previous_revision_id: "",
      },
    },
    {
      content: item.content,
      meta: { content_type: "geo_map", representation: "geo-map-project" },
    },
  );
  assert.deepEqual(
    materialReceiptKeysIn(polluted.meta),
    [],
    "功能数据的 meta 里还留着素材回执",
  );
  // 该留的没被顺手摘掉。
  assert.equal(polluted.meta.plugin_id, "annotatable-city-map");
  assert.equal(polluted.meta.content_type, "geo_map");
  assert.equal(polluted.meta.representation, "geo-map-project");
  assert.ok(Array.isArray(polluted.meta.source_manifest));

  // `withoutMaterialReceipts` 逐个键都认，不是只认前三个。
  const all = Object.fromEntries(
    MATERIAL_RECEIPT_META_KEYS.map((key) => [key, ""]),
  );
  assert.deepEqual(withoutMaterialReceipts({ ...all, keep_me: 1 }), { keep_me: 1 });
});

test("两个 route 在功能数据那一档都走摘回执的那条路", () => {
  for (const file of [
    "src/shell/advanced-routes/GeoMapRoute.tsx",
    "src/shell/advanced-routes/InteractiveDocRoute.tsx",
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const branch = source.indexOf('=== "plugin-instance"');
    assert.ok(branch > 0, `${file} 没有按 saveTarget 分档`);
    const handoff = source.indexOf("pluginInstanceSavedItem(", branch);
    const receipt = source.indexOf("editor_revision_id", branch);
    assert.ok(
      handoff > branch,
      `${file} 的功能数据档没走 pluginInstanceSavedItem()`,
    );
    assert.ok(
      receipt < 0 || handoff < receipt,
      `${file} 的功能数据档在交回件之前又写了素材回执`,
    );
  }
});
