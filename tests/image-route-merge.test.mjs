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

test("ImageRoute 单一模式：没有 mode 适配器、没有专业页、没有记住的档位", () => {
  assert.equal(/bindImageModeAdapter|rememberedImagePluginMode|applyImageL0Mode|setPluginModeState|pluginMode/.test(route), false);
  assert.equal(/mode:\s*bind/.test(route), false);
  assert.equal(/bindProFaceHandoff|bindNormalFaceHandoff|togglePro|proSwitch/.test(route), false);
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
  assert.match(route, /createImageCommandSurface\(\{[^}]*editor,[^}]*deliver/);
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

test("photo/design 那条轴不进 ImageRoute 的 adapter", () => {
  assert.equal(/FabricEditorMode/.test(route), false);
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

test("ImageRoute persists recoverable Fabric edits through the server draft receipt tier", () => {
  assert.match(route, /draftSchema:\s*IMAGE_EDIT_DRAFT_SCHEMA/);
  assert.match(route, /captureRevision:\s*editor\.captureRecoveryRevision/);
  assert.match(route, /restore:\s*editor\.restoreRecovery/);
  assert.match(route, /ready:\s*imageAdmitted\.ok\s*&&\s*editor\.sourceReady/);
  const editor = readFileSync(
    new URL("../src/shell/image-editor/use-fabric-image-editor.ts", import.meta.url),
    "utf8",
  );
  const persistence = readFileSync(
    new URL("../src/shell/image-editor/editor-persistence.ts", import.meta.url),
    "utf8",
  );
  assert.match(editor, /captureRecoveryRevision = useCallback/);
  assert.match(editor, /restoreRecovery = useCallback/);
  assert.match(editor, /parseFabricImageProject\(payload\)/);
  assert.match(editor, /controller\.loadSnapshot\(project\.snapshot\)/);
  assert.match(persistence, /IMAGE_EDIT_DRAFT_SCHEMA\s*=\s*"oceanleo\.fabric-image\.edit\.v1"/);
});
