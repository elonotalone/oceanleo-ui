// 主题查表是装修，不是地基。
//
// 2026-08-31 现场：设计画布在陈列馆里白屏，控制台只有一句
// `Cannot read properties of undefined (reading 'accent')`——
// `PLUGIN_THEME_SPECS[pluginId]` 下标没命中，一个取色动作把整页掀了，
// 而报错文本里没有任何字眼能让人联想到「主题」。
//
// 这份测试锁两件事：13 个 pluginId 一个都不能漏登记；万一还是漏了，
// 也只能长得普通一点，绝不许抛。

import assert from "node:assert/strict";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

const {
  PLUGIN_THEME_SPECS,
  currentPluginTheme,
  pluginThemeIdForAdapter,
  pluginWorkbenchStyle,
} = await import(await compileModule("src/shell/plugin-theme.tsx"));

// 11 件插件全在这里（图表已删，设计画布并入图片）。少一个就意味着那件插件的顶栏、编辑栏与左侧面板
// 会退到默认配色，跟其余各件不是一套——统一外壳的前提当场破掉。
const EXPECTED_PLUGIN_IDS = [
  "richdoc",
  "grid",
  "deck",
  "image",
  "pdf",
  "audio",
  "video-timeline",
  "threed",
  "game",
  "website",
  "video-canvas",
];

test("11 件插件的主题档一个都不许漏登记", () => {
  assert.deepEqual(
    Object.keys(PLUGIN_THEME_SPECS).sort(),
    [...EXPECTED_PLUGIN_IDS].sort(),
  );
  for (const id of EXPECTED_PLUGIN_IDS) {
    const spec = PLUGIN_THEME_SPECS[id];
    assert.ok(spec, `${id} 没有主题档`);
    // D7（2026-10-23）：没有本命默认了，明暗只跟站点走。
    assert.equal("defaultTheme" in spec, false, `${id} 还挂着本命默认`);
    // 两档都要有 accent：只给一档的话，用户切过去就没有身份色。
    assert.match(spec.accent.light, /^#[0-9a-f]{6}$/i, `${id} 缺 light accent`);
    assert.match(spec.accent.dark, /^#[0-9a-f]{6}$/i, `${id} 缺 dark accent`);
  }
});

test("认不出的 pluginId 退到默认配色，绝不抛", () => {
  // 这条正是白屏那次的最小复现：下标不命中。
  assert.doesNotThrow(() => currentPluginTheme("no-such-plugin"));
  const mode = currentPluginTheme("no-such-plugin");
  assert.ok(mode === "light" || mode === "dark");
  // 退化档必须仍能产出完整的 token，否则页面是渲染出来了、通篇没有颜色。
  const style = pluginWorkbenchStyle(mode, "#4f46e5");
  assert.equal(style["--awb-accent"], "#4f46e5");
  assert.ok(style["--awb-text"], "退化档也要有前景色");
});

test("adapter id 归一化只认登记过的，其余走站点主题别名", () => {
  // 图表编辑器已删除：不再登记；设计画布并入图片，旧 adapter id 读时别名到 image。
  assert.equal(pluginThemeIdForAdapter("chart-editor@1"), null);
  assert.equal(pluginThemeIdForAdapter("design-canvas"), "image");
  assert.equal(pluginThemeIdForAdapter("image@1"), "image");
  assert.equal(pluginThemeIdForAdapter("website"), "website");
  assert.equal(pluginThemeIdForAdapter("video-canvas"), "video-canvas");
  // 没登记的返回 null（而不是瞎猜一个），调用方据此走原站点别名。
  assert.equal(pluginThemeIdForAdapter("office-legacy"), null);
  assert.equal(pluginThemeIdForAdapter(""), null);
  // 原型链上的名字不算登记：hasOwnProperty 而不是 in。
  assert.equal(pluginThemeIdForAdapter("toString"), null);
  assert.equal(pluginThemeIdForAdapter("constructor"), null);
});
