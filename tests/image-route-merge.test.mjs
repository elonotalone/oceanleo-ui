// ============================================================================
// 图片·设计合并编辑器的路由接线（W04 判据 1 / 4 / 5 / 7）
// ----------------------------------------------------------------------------
// 这份判据是**源码级**的：路由是 React 组件，而 §2 第 5 条禁止用浏览器/截图做
// 验收，本仓也没有渲染 `ImageRoute` 的既有装置。所以这里用 TypeScript AST 判
// 「接线在不在、接对没接对」，而每个被接的模块**各自有行为级判据**
// （`design-mode.test.mjs` / `image-ai-commands.test.mjs`）。
//
// 查证范围（§7 要求写明）：只读 `src/shell/advanced-routes/ImageRoute.tsx` 与
// `src/shell/advanced-editor-adapter.ts` 两个文件，范围之外未查证。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROUTE = new URL("../src/shell/advanced-routes/ImageRoute.tsx", import.meta.url);
const ADAPTER = new URL("../src/shell/advanced-editor-adapter.ts", import.meta.url);

const route = readFileSync(ROUTE, "utf8");
const adapter = readFileSync(ADAPTER, "utf8");

test("the scan itself finds something known to be there", () => {
  // §6：判「不存在」之前先证明搜法有效。
  assert.match(route, /useFabricImageEditor/, "路由里必然有编辑器 hook；搜不到说明读错文件了");
  assert.ok(route.length > 5000, `路由只读到 ${route.length} 字节，可疑`);
});

test("专业模式经 W01 的 mode 适配器暴露，不是自造开关", () => {
  assert.match(adapter, /mode\?:\s*AdvancedEditorModeAdapter/, "适配器契约里应有 mode 字段");
  assert.match(
    route,
    /mode:\s*bindImageModeAdapter\(pluginMode,\s*setEditorMode\)/,
    "路由必须把 setEditorMode 交给 bindImageModeAdapter；缺 setMode，「专业编辑」页切不过去",
  );
  assert.equal(
    /setMode:\s*undefined/.test(route),
    false,
    "adapter.mode.setMode 写成 undefined，「专业编辑」页切不过去",
  );
  // §10 第 5 条：不得各自发明开关。
  assert.equal(
    /togglePro|proSwitch/.test(route),
    false,
    "专业模式只能走 W01 契约的 set-mode / mode 适配器，不许自造开关",
  );
});

test("打开编辑器：用记住的档位初始化，不是一律普通模式", () => {
  assert.match(
    route,
    /rememberedImagePluginMode\(\)/,
    "初始档位必须读 currentPluginMode(\"image\")。写死 false / normal，用户上次选的专业模式就丢了",
  );
  assert.equal(
    /useState<EditorMode>\(\s*"normal"\s*\)|useState\(false\)/.test(route),
    false,
    "初始档位写死普通模式，W01 第 11 例要的「记住的档位」就只是 localStorage 里的一个值",
  );
});

test("专业页与编辑页共用同一份 Fabric 稿，舞台上没有 iframe", () => {
  assert.match(route, /setEditorMode = useCallback\(\(mode: EditorMode\)/);
  assert.match(route, /setPluginModeState\(applyImageL0Mode\(mode\)\.mode\)/);
  assert.match(route, /data-editor-mode=\{pluginMode\}/);
  assert.match(route, /<FabricImageStage /);
  assert.equal(/<iframe/i.test(route), false);
});

test("画布内结构/皮肤入口已从 ImageRoute 卸下，不占 L0", () => {
  assert.doesNotMatch(route, /<ImageCanvasViewSwitch/);
  assert.doesNotMatch(route, /applyCanvasViewClick\(/);
  assert.match(route, /data-canvas-view-switch=\{imageRouteChrome\.canvasViewSwitch \? "on" : "off"\}/);
  assert.equal(
    /adapter\.mode[\s\S]{0,80}photo|setMode:[\s\S]{0,40}design/.test(route),
    false,
    "结构/皮肤不得写进 adapter.mode",
  );
});

test("retired AI capabilities are not wired into ImageRoute", () => {
  assert.match(
    route,
    /createImageCommandSurface\(\{\s*editor,\s*deliver\s*\}\)/,
  );
  assert.doesNotMatch(route, /const runAi = useMemo<AiCommandRunner>/);
  assert.doesNotMatch(route, /removeBgExecutor/);
  assert.doesNotMatch(route, /\/v1\/images\/remove-bg/);
  assert.doesNotMatch(route, /setPendingAiRequest/);
  assert.doesNotMatch(route, /FabricImageAiPanel/);
  assert.equal(
    /startImageAiCommand|executeImageAiCommand/.test(route),
    false,
    "路由里直接起 provider job 会与面板各跑一次，等于一次动作双重计费",
  );
});

test("两种模式共用一份文档：L0 不占 photo/design 那条轴", () => {
  // photo/design 的主闸在 design-mode.test.mjs。L0 槽是 W01 的 normal|pro。
  assert.match(route, /applyImageL0Mode/);
  assert.equal(
    /FabricEditorMode/.test(route),
    false,
    "把 photo|design 塞进 adapter.mode，「专业编辑」页就会切错轴",
  );
});

test("第二行不覆盖专业页标签、不报 aux；抠图不在 adapter.actions 里", () => {
  assert.equal(/proLabel/.test(route), false);
  assert.doesNotMatch(route, /aux:\s*\[/);
  assert.doesNotMatch(route, /id:\s*"image-cutout"/);
  assert.doesNotMatch(route, /抠图（背景变透明）/);
});

test("ImageRoute chrome contract disables 结构/皮肤 and the AI drawer", () => {
  assert.match(route, /imageRouteChrome/);
  assert.doesNotMatch(route, /designMode\.mode/);
});
