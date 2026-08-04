// ============================================================================
// 入口 → 承载:点开一枚功能按钮,承载层真的收到一次启动 —— H 波补的那根线
// ----------------------------------------------------------------------------
// 这份文件存在的理由是一次真实的漏判。H 波把「空手点开一个功能」拆给两位 owner:
//   · 入口侧(`AppCapabilityBar` / `app-capability-context`)把「点了哪一枚」写进
//     context 与 URL 的 `?cap=`;
//   · 承载侧(`ResultCanvas`)监听 `oceanleo:advanced-feature-launch` 总线。
// 两边各自的测试都绿:入口侧测到按钮长出来为止,承载侧从总线之后开始测。
// **中间那根线全仓不存在**,于是按钮点下去什么都不会发生,而两份测试都不会报警。
//
// 所以本文件只测一件事,并且刻意从缝的**两侧之外**测:选中态一变,总线上有没有
// 真的出现一份合法信封。用真 Provider、真派发函数、真 window 事件,不手搓信封 ——
// 手搓信封测的是承载侧,正是上次漏掉的那一半。
//
// 另外两条防回归:
//   · 换算表必须与起手件表同源(五类改名不会只改一边);
//   · 换不出 featureId 的类型**必须静默不派发**,不许猜一个回退编辑器。
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
const {
  BLANK_DRAFT_FEATURE_IDS,
  blankDraftFeatureIdForContentType,
  blankDraftLibraryItem,
} = await import("../src/shell/blank-draft-items.ts");

/** 五类可空手起手的载体,与起手件表同源;新增一类这里会自己跟着变。 */
const LAUNCHABLE = BLANK_DRAFT_FEATURE_IDS.map((featureId) => {
  const item = blankDraftLibraryItem(featureId, { nonce: "probe" });
  assert.ok(item, `${featureId} 造不出起手件`);
  return { featureId, artifactType: String(item.meta.content_type) };
});

function entry(artifactType, family, label) {
  return {
    family,
    label,
    editorCapability: `${family}-editor`,
    artifactType,
  };
}

/**
 * 按 `AppCapabilityEntryProvider` 今天的算法把选中态解析成 active,再喂给真桥接。
 * 这一行(`entries.find(...) ?? null`)与 Provider 内逐字同形;Provider 本体是 `.tsx`,
 * 在本仓测试装载器下 import 不了,所以只复刻这一行,桥接本身是真模块。
 */
function Harness({ entries, family }) {
  const selected = entries.find((row) => row.family === family) ?? null;
  useAdvancedFeatureLaunchBridge(
    selected ? { ...selected, siteKey: "study", appId: "review-outline" } : null,
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

test("选中一枚可空手起手的功能,总线上真的出现一份合法信封", async () => {
  for (const { featureId, artifactType } of LAUNCHABLE) {
    const rows = [entry(artifactType, "probe-family", "探针族")];
    const received = await mountAndCollect({
      entries: rows,
      family: "",
      then: ["probe-family"],
    });
    assert.equal(
      received.length,
      1,
      `${artifactType}:选中后总线上应恰好出现 1 份信封,实得 ${received.length} 份`,
    );
    const launch = normalizeAdvancedFeatureLaunch(received[0].launch);
    assert.ok(launch, `${artifactType}:信封没通过承载侧的规范化`);
    assert.equal(launch.featureId, featureId);
    assert.equal(launch.title, "探针族", "起手件标题应取按钮文案(L3 族中文名)");
    assert.ok(received[0].nonce, "缺 nonce,承载层无法按 key 重挂干净实例");
  }
});

test("带 ?cap= 的深链在挂载那一刻就启动,不必亲手点一次", async () => {
  const { featureId, artifactType } = LAUNCHABLE[0];
  const received = await mountAndCollect({
    entries: [entry(artifactType, "deep-link-family", "深链族")],
    family: "deep-link-family",
  });
  assert.equal(received.length, 1, "深链载入应启动一次");
  assert.equal(
    normalizeAdvancedFeatureLaunch(received[0].launch)?.featureId,
    featureId,
  );
});

test("同一枚功能不因重渲染而重复启动;关掉再点开算新的一次", async () => {
  const { artifactType } = LAUNCHABLE[0];
  const rows = [entry(artifactType, "once-family", "一次族")];
  const repeated = await mountAndCollect({
    entries: rows,
    family: "",
    then: ["once-family", "once-family", "once-family"],
  });
  assert.equal(repeated.length, 1, "选中态没变就不该再启动一次");

  const reopened = await mountAndCollect({
    entries: rows,
    family: "",
    then: ["once-family", "", "once-family"],
  });
  assert.equal(reopened.length, 2, "关掉再点开应当是新的一次启动");
  assert.notEqual(
    reopened[0].nonce,
    reopened[1].nonce,
    "两次启动的 nonce 必须不同,否则右栏不会重挂干净实例",
  );
});

test("不能空手起手的类型:静默不派发,不许猜一个回退编辑器", async () => {
  const launchable = new Set(LAUNCHABLE.map((row) => row.artifactType));
  for (const artifactType of ["video", "audio", "model_3d", "website", ""]) {
    assert.ok(!launchable.has(artifactType), `${artifactType} 不该在可起手集内`);
    const received = await mountAndCollect({
      entries: [entry(artifactType, "no-draft-family", "无起手族")],
      family: "no-draft-family",
    });
    assert.equal(
      received.length,
      0,
      `${artifactType || "(空)"}:没有起手件却派发了启动`,
    );
  }
});

test("换算表与起手件表同源:五类逐类对得上,未知类型返回 null", () => {
  for (const { featureId, artifactType } of LAUNCHABLE) {
    assert.equal(blankDraftFeatureIdForContentType(artifactType), featureId);
  }
  for (const unknown of ["", null, undefined, "grid_editing", "video"]) {
    assert.equal(blankDraftFeatureIdForContentType(unknown), null);
  }
  assert.equal(
    advancedFeatureLaunchForCapability({ artifactType: "video" }, "n"),
    null,
  );
  assert.equal(advancedFeatureLaunchForCapability(null, "n"), null);
});
