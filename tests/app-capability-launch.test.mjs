// ============================================================================
// 入口 → 承载:点开一枚按键,承载层真的收到一次启动 —— 缝本身的那份测试
// ----------------------------------------------------------------------------
// 这份文件存在的理由是一次真实的漏判。「空手点开一件工具」被拆给两位 owner:
//   · 入口侧(`AppCapabilityBar` / `app-capability-context`)把「点了哪一枚」写进
//     context 与 URL 的 `?cap=`;
//   · 承载侧(`ResultCanvas`)监听 `oceanleo:advanced-feature-launch` 总线。
// 两边各自的测试都绿:入口侧测到按钮长出来为止,承载侧从总线之后开始测。
// **中间那根线全仓不存在**,于是按钮点下去什么都不会发生,而两份测试都不会报警。
//
// 所以本文件只测一件事,并且刻意从缝的**两侧之外**测:选中态一变,总线上有没有
// 真的出现一份合法信封。用真 Provider 形状、真派发函数、真 window 事件,不手搓信封
// —— 手搓信封测的是承载侧,正是上次漏掉的那一半。
//
// 2026-08-05 换了口径。旧信封带的是 `featureId`:入口侧手上只有映射行的
// `artifactType`,经 `blankDraftFeatureIdForContentType` 换算成**五个通用起手件 id
// 之一**,于是两千多枚按键在运行时只对应 5 份空白模板 —— 点地图、点台账、点换算器
// 打开的都是同一份「输入 A / 输入 B」,就是操作员说的「显示的极其简陋」。
// 现在信封带的是**这枚按键自己的身份**(`pluginId`,清册行的 `id`),载体反推那条路
// 整条不存在。下面最后两条就钉这件事:载体类型换不出按键,身份不成形就不投。
// 「五类载体的空白起手件」本身仍然成立(编辑类的兜底件),它归
// `tests/blank-draft-starter.test.mjs` 用真字节锁着,不在本文件里重复一遍。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://study.oceanleo.com/workspace/review-outline",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const { createRoot } = await import("react-dom/client");
// 真模块,不是替身。这一跳刻意不住在 `app-capability-context.tsx` 里,原因见该模块注释:
// `.tsx` 在本仓测试装载器下转译不了,住在那里就等于这道缝又一次没人测。
const { useAdvancedFeatureLaunchBridge } = await import(
  "../src/shell/app-capability-launch.ts"
);
const {
  ADVANCED_FEATURE_LAUNCH_EVENT,
  advancedFeatureLaunchForCapability,
  normalizeAdvancedFeatureLaunch,
} = await import("../src/shell/advanced-feature-launch.ts");

/** 清册行的形状:`{id,label,runtime,doc}`,四个字段,没有载体类型。 */
function entry(id, label, runtime = "interactive-doc") {
  return {
    id,
    label,
    runtime,
    doc: `docs/specs/oceanleo-plugins-v1/plugins/${id}.md`,
  };
}

/** 三个非编辑类运行时内核(分类裁定 §4.3)。逐个都要能启动,不许只通一个。 */
const RUNTIMES = ["geo-map", "grid", "interactive-doc"];

/**
 * `AppCapabilityEntryProvider` 实际投给桥接的载荷,与
 * `src/shell/app-capability-context.tsx` 里那一段逐字同形。Provider 本体是 `.tsx`,
 * 在本仓测试装载器下 import 不了,所以只复刻这一段,桥接本身是真模块。
 */
function Harness({ entries, family }) {
  const selected = entries.find((row) => row.id === family) ?? null;
  useAdvancedFeatureLaunchBridge(
    selected
      ? {
          siteKey: "study",
          appId: "review-outline",
          family: selected.id,
          pluginId: selected.id,
          runtime: selected.runtime,
          label: selected.label,
        }
      : null,
  );
  return null;
}

/** 挂一次,收集这期间总线上出现的全部信封。 */
async function mountAndCollect({ entries, family, then }) {
  const received = [];
  const listen = (event) => received.push(event.detail);
  window.addEventListener(ADVANCED_FEATURE_LAUNCH_EVENT, listen);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let current = family;
  const render = async () => {
    await act(async () => {
      root.render(React.createElement(Harness, { entries, family: current }));
    });
  };
  await render();
  if (then) {
    for (const next of then) {
      current = next;
      await render();
    }
  }
  await act(async () => root.unmount());
  container.remove();
  window.removeEventListener(ADVANCED_FEATURE_LAUNCH_EVENT, listen);
  return received;
}

test("选中一枚按键,总线上真的出现一份带这枚按键身份的合法信封", async () => {
  for (const runtime of RUNTIMES) {
    const rows = [entry("probe-plugin", "探针", runtime)];
    const received = await mountAndCollect({
      entries: rows,
      family: "",
      then: ["probe-plugin"],
    });
    assert.equal(
      received.length,
      1,
      `${runtime}:选中后总线上应恰好出现 1 份信封,实得 ${received.length} 份`,
    );
    const launch = normalizeAdvancedFeatureLaunch(received[0].launch);
    assert.ok(launch, `${runtime}:信封没通过承载侧的规范化`);
    assert.equal(
      launch.pluginId,
      "probe-plugin",
      "信封带的必须是这枚按键自己的身份",
    );
    assert.equal(launch.title, "探针", "实例标题应取按钮文案(工具中文名)");
    assert.ok(received[0].nonce, "缺 nonce,承载层无法按 key 重挂干净实例");
  }
});

test("信封里没有载体类型,也没有通用起手件 id —— 那条反推路已经不存在", async () => {
  const received = await mountAndCollect({
    entries: [entry("ledger", "台账", "grid")],
    family: "ledger",
  });
  assert.equal(received.length, 1);
  const keys = Object.keys(received[0].launch).sort();
  assert.deepEqual(
    keys,
    ["pluginId", "title", "version"],
    "信封只许带身份、文案与版本;多一个 featureId / artifactType 就等于把" +
      "「两千多枚按键共用 5 份通用模板」那条路又接回来了",
  );
});

test("带 ?cap= 的深链在挂载那一刻就启动,不必亲手点一次", async () => {
  const received = await mountAndCollect({
    entries: [entry("deep-link-plugin", "深链工具")],
    family: "deep-link-plugin",
  });
  assert.equal(received.length, 1, "深链载入应启动一次");
  assert.equal(
    normalizeAdvancedFeatureLaunch(received[0].launch)?.pluginId,
    "deep-link-plugin",
  );
});

test("同一枚按键不因重渲染而重复启动;关掉再点开算新的一次", async () => {
  const rows = [entry("once-plugin", "一次工具")];
  const repeated = await mountAndCollect({
    entries: rows,
    family: "",
    then: ["once-plugin", "once-plugin", "once-plugin"],
  });
  assert.equal(repeated.length, 1, "选中态没变就不该再启动一次");

  const reopened = await mountAndCollect({
    entries: rows,
    family: "",
    then: ["once-plugin", "", "once-plugin"],
  });
  assert.equal(reopened.length, 2, "关掉再点开应当是新的一次启动");
  assert.notEqual(
    reopened[0].nonce,
    reopened[1].nonce,
    "两次启动的 nonce 必须不同,否则右栏不会重挂干净实例",
  );
});

test("换一枚按键就是新的一次启动,身份跟着换", async () => {
  const rows = [entry("first-plugin", "甲工具"), entry("second-plugin", "乙工具")];
  const received = await mountAndCollect({
    entries: rows,
    family: "",
    then: ["first-plugin", "second-plugin"],
  });
  assert.deepEqual(
    received.map((item) => normalizeAdvancedFeatureLaunch(item.launch).pluginId),
    ["first-plugin", "second-plugin"],
  );
});

test("身份不成形:静默不派发,不许猜一个回退编辑器", async () => {
  for (const id of ["", "   "]) {
    const received = await mountAndCollect({
      entries: [entry(id, "无身份工具")],
      family: id,
    });
    assert.equal(
      received.length,
      0,
      `id=${JSON.stringify(id)}:没有身份却派发了启动`,
    );
  }
  assert.equal(advancedFeatureLaunchForCapability(null, "n"), null);
  assert.equal(advancedFeatureLaunchForCapability({ label: "只有文案" }, "n"), null);
});

test("载体类型换不出按键 —— 入口侧再也不能从 artifact_type 反推出一次启动", () => {
  // 这是本波堵的那条路:旧入口手上只有映射行的 `artifactType`,派发函数拿它反查
  // 五个通用起手件 id。现在只认身份,给什么载体类型都换不出信封。
  for (const artifactType of [
    "interactive_doc",
    "geo_map",
    "grid",
    "chart",
    "pdf",
    "video",
    "",
  ]) {
    assert.equal(
      advancedFeatureLaunchForCapability({ artifactType, label: "台账" }, "n"),
      null,
      `${artifactType || "(空)"}:载体类型不许换出一次启动`,
    );
  }
  // 承载侧的规范化也不许收下一份只带 featureId 的旧信封。
  assert.equal(
    normalizeAdvancedFeatureLaunch({
      version: 1,
      featureId: "interactive_doc_editing",
    }),
    null,
  );
});
