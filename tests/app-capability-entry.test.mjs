// 操控台按键条【入口侧】的数据驱动契约。
//
// 这里守的不是「函数返回值对不对」，而是几条会被下一轮悄悄改回去的纪律：
//   1. 按钮**只能**来自 W10 的清册。删掉清册里一行，那枚按钮必须消失 —— 所以测试里
//      真的删一行再问一次，而不是断言某个硬编码清单。
//   2. 前端**不许**持有站点清单／app 清单／工具清单。所以直接读入口侧三个源文件，
//      断言清册里出现过的 siteKey / appId / 工具 id / 文案一个都没被写进代码。
//   3. 编辑类工具没有按键：它们的 runtime 不在三个非编辑类内核里，即使被写进数据
//      也不许渲染成按钮。这是「一个东西不可能既是工具又是素材」在入口侧的机检。
//   4. 选中态只加 query、不动路径 —— `?cap=` 的往返必须保留其它参数。
//
// 全部走真模块：`app-capability-entry.ts` 是刻意无 React 无 JSX 的纯函数层，
// `node --experimental-strip-types` 可以直接 import 它连同随包发布的生成数据。

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PLUGIN_INITIAL_STATE_IDS,
  hasPluginInitialState,
} from "../src/shell/plugin-initial-states/index.ts";

import {
  APP_CAPABILITY_MAP_SCHEMA,
  APP_CAPABILITY_QUERY_KEY,
  appCapabilityEntries,
  appCapabilityFamilyFromSearch,
  appCapabilityFromSearch,
  appCapabilitySearch,
  isUsableAppCapabilityEntry,
  readAppCapabilityMap,
  registerAppCapabilityMap,
  resolveAppCapabilityEntries,
} from "../src/shell/app-capability-entry.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = readAppCapabilityMap();

/** W10 的清册派生视图。它和本仓并行落盘，所以这里只问「在不在」，不假设它在。 */
const REGISTRY_SOURCE =
  process.env.OCEANLEO_APP_PLUGINS ||
  "/opt/cursor-workspaces/oceandino/scripts/data/oceanleo-app-plugins.json";

/** 三个非编辑类运行时内核（分类裁定 §4.3）。夹具用它造合法数据。 */
const RUNTIME = "interactive-doc";

function row(id, label, runtime = RUNTIME) {
  return {
    id,
    label,
    runtime,
    doc: `docs/specs/oceanleo-plugins-v1/plugins/${id}.md`,
  };
}

function fixture(apps) {
  return { schema: APP_CAPABILITY_MAP_SCHEMA, apps };
}

/** 随包数据里任取一个真实的 (siteKey, appId, 按钮数≥n) 样本；没有就用夹具。 */
function sampleApp(minEntries = 2) {
  for (const [key, rows] of Object.entries(SHIPPED.apps)) {
    if (rows.length >= minEntries) {
      const slash = key.indexOf("/");
      return {
        key,
        siteKey: key.slice(0, slash),
        appId: key.slice(slash + 1),
        rows,
        shipped: true,
      };
    }
  }
  const rows = [row("probe-a", "探针甲"), row("probe-b", "探针乙")].slice(
    0,
    Math.max(minEntries, 2),
  );
  return {
    key: "probe-site/probe-app",
    siteKey: "probe-site",
    appId: "probe-app",
    rows,
    shipped: false,
  };
}

test("随包数据的 schema 就是 W10 清册派生视图的 schema", () => {
  assert.equal(SHIPPED.schema, APP_CAPABILITY_MAP_SCHEMA);
  assert.equal(APP_CAPABILITY_MAP_SCHEMA, "oceanleo.app-plugins.v1");
  assert.equal(typeof SHIPPED.apps, "object");
});

test("随包数据与 W10 的清册同步：清册在，按钮就得在；清册不在，一枚都不许有", () => {
  const appCount = Object.keys(SHIPPED.apps).length;
  if (!existsSync(REGISTRY_SOURCE)) {
    // 清册还没落盘（W10 与本份活并行）。此时**空表就是正确答案**：
    // fail-closed 到零枚按钮，而不是留着旧的 2177 枚配额按钮继续发。
    assert.equal(
      appCount,
      0,
      `清册 ${REGISTRY_SOURCE} 不存在，随包数据却有 ${appCount} 个 app —— ` +
        "这些按钮无源可查，只可能是从别处抄进来的。",
    );
    return;
  }
  assert.ok(
    appCount > 0,
    `清册 ${REGISTRY_SOURCE} 已落盘，随包数据却是空的 —— ` +
      "跑一次 `node scripts/sync-app-plugins.mjs`，否则 36 站一枚按钮都不会长出来。",
  );
});

// ---------------------------------------------------------------------------
// 这道闸：**发出去的每一枚按键都点得开**
// ---------------------------------------------------------------------------
// V4 实测：278 枚按键里只有 42 枚点得开。成因是两侧 id 空间对不上——发按键的一侧用
// 短 id（`ledger`），查第一屏的一侧用 L3 族 id（`ledger-register`），中间没有任何东西
// 会因为「对不上」而报警，于是 236 枚按键静默地变成点开没反应的死按键。
//
// 父 agent 2026-08-05 裁定 canonical id = L3 族 id（不留别名、不留映射表：两套 id 加
// 一张映射表正是这次的成因）。下面这两条就是那道闸：id 空间一旦再次分叉，这里立刻红。
//
// 「还没做第一屏」是允许的，但必须**显式登记**：清册里把那件工具记成留空（hold），
// 同步脚本据此不发它的按键。**查不到第一屏、又没登记 ⇒ 红。**

/** 一枚按键的完整身份链：清册 id → 初始态表的键。两处必须是同一个 id 空间。 */
function shippedIdCounts() {
  const counts = new Map();
  for (const rows of Object.values(SHIPPED.apps)) {
    for (const entry of rows) {
      counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
    }
  }
  return counts;
}

test("随包发布的每一枚按键都点得开：id 在初始态表里查得到", () => {
  const counts = shippedIdCounts();
  const dead = [...counts.entries()]
    .filter(([id]) => !hasPluginInitialState(id))
    .sort((a, b) => b[1] - a[1]);
  const deadButtons = dead.reduce((sum, [, n]) => sum + n, 0);
  assert.deepEqual(
    dead.map(([id, n]) => `${id}（${n} 枚）`),
    [],
    `这些 id 在 src/shell/plugin-initial-states/index.ts 里查不到，` +
      `共 ${deadButtons} 枚按键点开没反应：\n` +
      dead.map(([id, n]) => `  · ${id} —— ${n} 枚`).join("\n") +
      "\n两条出路，任选其一，都在 W10 的清册那一侧：\n" +
      "  ① 把这件工具在清册里登记为留空（`pluginsWithoutApps` 或 `plugins[id].hold`，" +
      "带一句 ≥10 字的理由），同步脚本会据此不发它的按键；\n" +
      "  ② 等它的第一屏落进 plugin-initial-states/ 之后再授权。\n" +
      `初始态表今天有 ${PLUGIN_INITIAL_STATE_IDS.length} 件：${PLUGIN_INITIAL_STATE_IDS.join(" ")}`,
  );
});

test("canonical id 就是 L3 族 id：不与三个内核名撞名，也没有第二套 id", () => {
  // 裁定的第 2 条理由：族 id 天然不与内核 id 撞名，`ERR_ID_COLLIDES_WITH_RUNTIME`
  // 因此恒真。这条断言把「恒真」钉住——一旦有人又造一套短 id，它就可能不再恒真。
  const kernels = new Set(["geo-map", "grid", "interactive-doc"]);
  for (const id of shippedIdCounts().keys()) {
    assert.ok(!kernels.has(id), `${id} 与内核名撞名 —— canonical id 必须是 L3 族 id`);
  }
});

test("清册里每个 id 要么有第一屏、要么显式登记为留空", () => {
  if (!existsSync(REGISTRY_SOURCE)) return;
  const source = JSON.parse(readFileSync(REGISTRY_SOURCE, "utf8"));
  const held = new Map();
  for (const item of source.pluginsWithoutApps ?? []) {
    held.set(String(item?.id || "").trim(), String(item?.reason || item?.ruling || ""));
  }
  for (const [id, meta] of Object.entries(source.plugins ?? {})) {
    if (meta?.hold) held.set(id, String(meta.hold?.reason || meta.hold?.ruling || ""));
  }
  const declared = new Set([...Object.keys(source.plugins ?? {})]);
  const unresolved = [...declared].filter(
    (id) => !hasPluginInitialState(id) && !held.has(id),
  );
  assert.deepEqual(
    unresolved,
    [],
    "清册认了这些工具，却既查不到第一屏、也没登记为留空 —— " +
      "「没做完」可以，「没人知道它没做完」不行：\n" +
      unresolved.map((id) => `  · ${id}`).join("\n"),
  );
  // 登记为留空的必须给出理由，否则 hold 会变成一个万能的静音开关。
  for (const [id, reason] of held) {
    if (hasPluginInitialState(id)) continue;
    assert.ok(
      reason.trim().length >= 10,
      `${id} 登记为留空却没写清理由（当前 ${JSON.stringify(reason)}）`,
    );
  }
});

test("发布副本与清册逐字节同步（`--check` 就是这条判据本身）", () => {
  if (!existsSync(REGISTRY_SOURCE)) return;
  // 上一轮的红就出在这里：发布副本是某一刻的快照，清册后来又走了三轮，
  // 撤下的两件工具在清册里没了、在共享包里还在，等于缺陷只在上游修掉、线上没修。
  // 把 `--check` 拉进 focused test，快照落后就当场红，而不是等验收去人工比对。
  execFileSync(
    process.execPath,
    ["scripts/sync-app-plugins.mjs", "--check"],
    { cwd: REPO_ROOT, stdio: "pipe" },
  );
});

test("随包数据里没有一行是残缺的（坏行不许随包发出去）", () => {
  for (const [key, rows] of Object.entries(SHIPPED.apps)) {
    assert.ok(Array.isArray(rows) && rows.length > 0, `${key} 的值不是非空数组`);
    for (const entry of rows) {
      assert.ok(
        isUsableAppCapabilityEntry(entry),
        `${key} 里有一行长不成按钮：${JSON.stringify(entry)}`,
      );
    }
  }
});

test("删掉清册里一行，对应按钮就消失（按钮不是硬编码的）", () => {
  const { siteKey, appId, key, rows } = sampleApp(2);
  registerAppCapabilityMap(fixture({ [key]: rows }));
  try {
    const before = appCapabilityEntries(siteKey, appId);
    assert.deepEqual(
      before.map((entry) => entry.id),
      rows.map((r) => r.id),
    );

    const dropped = rows[0].id;
    registerAppCapabilityMap(fixture({ [key]: rows.slice(1) }));
    const after = appCapabilityEntries(siteKey, appId);
    assert.ok(
      !after.some((entry) => entry.id === dropped),
      `删掉 ${key} 的 ${dropped} 之后按钮还在，说明它不是从清册读的`,
    );
    assert.equal(after.length, before.length - 1);
  } finally {
    registerAppCapabilityMap(null);
  }
});

test("清册里没有的 app 一枚按钮都没有，也不报错", () => {
  assert.deepEqual(appCapabilityEntries("no-such-site", "no-such-app"), []);
  assert.deepEqual(appCapabilityEntries("", ""), []);
  registerAppCapabilityMap(fixture({ "s/a": [row("ledger", "台账", "grid")] }));
  try {
    // 「这个 app 一个工具都不需要」是正常且常见的结论，不是错误。
    assert.deepEqual(appCapabilityEntries("s", "b"), []);
    assert.deepEqual(appCapabilityEntries("other", "a"), []);
    assert.equal(appCapabilityEntries("s", "a").length, 1);
  } finally {
    registerAppCapabilityMap(null);
  }
});

test("schema 对不上的数据一律不采信（fail-closed，不猜形状）", () => {
  try {
    registerAppCapabilityMap({
      schema: "oceanleo.app-capability-map.v1",
      apps: { "s/a": [row("ledger", "台账", "grid")] },
    });
    assert.deepEqual(
      appCapabilityEntries("s", "a"),
      [],
      "旧的按键映射 schema 不许再被采信 —— 那份数据是配额凑出来的",
    );
  } finally {
    registerAppCapabilityMap(null);
  }
});

test("残缺行与含「插件」的文案都不渲染成按钮（红线 8）", () => {
  assert.equal(isUsableAppCapabilityEntry(null), false);
  assert.equal(
    isUsableAppCapabilityEntry({ ...row("x", "台账", "grid"), runtime: "" }),
    false,
    "缺 runtime 的按钮点下去无处可挂，不许长出来",
  );
  assert.equal(
    isUsableAppCapabilityEntry({ ...row("x", "台账", "grid"), doc: "" }),
    false,
    "缺 doc 的工具没有规格文档，不许长出来",
  );
  assert.equal(isUsableAppCapabilityEntry(row("x", "台账插件", "grid")), false);
  const map = fixture({
    "s/a": [
      row("good", "台账", "grid"),
      row("bad", "台账插件", "grid"),
      row("good", "台账", "grid"),
    ],
  });
  assert.deepEqual(
    resolveAppCapabilityEntries(map, "s", "a").map((entry) => entry.id),
    ["good"],
    "重复工具只保留一枚，含「插件」的一枚不渲染",
  );
});

test("编辑类工具即使被写进数据也不发按键（它们的入口是打开一件素材）", () => {
  // 编辑类的 13 个适配器 id 一个都不在三个非编辑类内核里，所以逐个都长不出按钮。
  for (const runtime of [
    "image",
    "deck",
    "richdoc",
    "design-canvas",
    "pdf",
    "video-timeline",
    "audio",
    "threed",
    "chart-editor@1",
    "website",
    "game",
    "video-canvas",
  ]) {
    assert.equal(
      isUsableAppCapabilityEntry(row("editor-probe", "探针编辑器", runtime)),
      false,
      `runtime=${runtime} 是编辑类适配器，不许长出按键`,
    );
  }
  const map = fixture({
    "s/a": [row("ledger", "台账", "grid"), row("deck-editor", "PPT 编辑器", "deck")],
  });
  assert.deepEqual(
    resolveAppCapabilityEntries(map, "s", "a").map((entry) => entry.id),
    ["ledger"],
  );
  // 三个非编辑类内核逐个都要通得过，否则这条闸就把正常工具也挡了。
  for (const runtime of ["geo-map", "grid", "interactive-doc"]) {
    assert.equal(
      isUsableAppCapabilityEntry(row("probe", "探针", runtime)),
      true,
      `runtime=${runtime} 是非编辑类内核，必须能长出按键`,
    );
  }
});

test("选中态只是一个 query，且往返不吃掉别的参数", () => {
  assert.equal(APP_CAPABILITY_QUERY_KEY, "cap");
  const withCap = appCapabilitySearch("?tab=library&item=42", "ledger");
  assert.equal(appCapabilityFamilyFromSearch(withCap), "ledger");
  const params = new URLSearchParams(withCap.slice(1));
  assert.equal(params.get("tab"), "library");
  assert.equal(params.get("item"), "42");
  const cleared = appCapabilitySearch(withCap, "");
  assert.equal(appCapabilityFamilyFromSearch(cleared), "");
  assert.equal(new URLSearchParams(cleared.slice(1)).get("tab"), "library");
  assert.equal(appCapabilitySearch("", null), "");
});

test("`?cap=` 指到本 app 没有的工具 → 解析成 null，不留一枚点不开的按钮", () => {
  const { siteKey, appId, key, rows } = sampleApp(1);
  registerAppCapabilityMap(fixture({ [key]: rows }));
  try {
    assert.equal(
      appCapabilityFromSearch(`?cap=${rows[0].id}`, siteKey, appId)?.id,
      rows[0].id,
    );
    assert.equal(appCapabilityFromSearch("?cap=not-a-plugin", siteKey, appId), null);
    assert.equal(appCapabilityFromSearch("?cap=", siteKey, appId), null);
  } finally {
    registerAppCapabilityMap(null);
  }
});

test("入口侧源码里没有任何站点／app／工具清单", () => {
  const sources = [
    "src/shell/app-capability-entry.ts",
    "src/shell/AppCapabilityBar.tsx",
    "src/shell/app-capability-context.tsx",
  ].map((path) => ({
    path,
    // 去掉注释：注释里出现「台账」这种举例不算硬编码。
    code: readFileSync(resolve(REPO_ROOT, path), "utf8")
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/^\s*\/\/.*$/gm, ""),
  }));
  // 三个内核名是分类裁定 §4.3 的闭集，也是「编辑类混进数据也长不出按键」那条闸的
  // 实现，本来就必须写在代码里；它们不是站点／app／工具清单，逐条豁免。
  const KERNELS = new Set(["geo-map", "grid", "interactive-doc"]);
  const names = new Set();
  for (const [key, rows] of Object.entries(SHIPPED.apps)) {
    const slash = key.indexOf("/");
    names.add(key.slice(0, slash));
    names.add(key.slice(slash + 1));
    for (const entry of rows) {
      names.add(entry.id);
      names.add(entry.label);
    }
  }
  for (const { path, code } of sources) {
    for (const name of names) {
      if (KERNELS.has(name)) continue;
      assert.ok(
        !code.includes(`"${name}"`),
        `${path} 里写死了 ${name} —— 清单只能来自 W10 的清册`,
      );
    }
    assert.ok(
      !code.includes("插件") || path === "src/shell/app-capability-entry.ts",
      `${path} 出现「插件」字样（红线 8）`,
    );
  }
});
