// ============================================================================
// 图片·设计合并编辑器的路由接线（W04 判据 1 / 4 / 5 / 7）
// ----------------------------------------------------------------------------
// 这份判据是**源码级**的：路由是 React 组件，而 §2 第 5 条禁止用浏览器/截图做
// 验收，本仓也没有渲染 `ImageRoute` 的既有装置。所以这里用 TypeScript AST 判
// 「接线在不在、接对没接对」，而每个被接的模块**各自有行为级判据**
// （`design-mode.test.mjs` / `image-ai-commands.test.mjs` / `photopea-bridge.test.mjs`）。
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
    "路由必须把 setEditorMode 交给 bindImageModeAdapter；缺 setMode 开关就灰了",
  );
  assert.equal(
    /setMode:\s*undefined/.test(route),
    false,
    "adapter.mode.setMode 写成 undefined，顶栏开关置灰，用户切不了专业模式",
  );
  // §10 第 5 条：不得各自发明开关。
  assert.equal(
    /setShowPhotopea|togglePro|proSwitch/.test(route),
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

test("Photopea 只在用户切到专业模式后才可能装载（不预载广告）", () => {
  // 路由里不许出现常量 iframe src / 预热请求。
  assert.equal(
    /photopea\.com/i.test(route),
    false,
    "路由里出现 Photopea 地址就意味着它可能在挂载期被拉起；地址只应存在于惰性桥里",
  );
  assert.match(route, /setEditorMode = useCallback\(\(mode: EditorMode\)/);
  assert.match(route, /applyImageL0Mode\(mode\)\.mode/);
  assert.match(route, /data-editor-mode=\{pluginMode\}/);
});

test("AI 能力接进命令面：edit bar 与 agent 走同一条命令", () => {
  assert.match(
    route,
    /createImageCommandSurface\(\{\s*editor,\s*deliver,\s*runAi\s*\}\)/,
    "不把 runAi 交给命令面，那五条 AI 命令就不会注册（判据 4 的入口又没了）",
  );
  assert.match(route, /const runAi = useMemo<AiCommandRunner>/);
});

test("抠图按引擎的两参签名调用，且结果真的放回画布", () => {
  assert.match(
    route,
    /removeBgExecutor\("remove-bg",\s*\{\s*sourceUrl,\s*signal:/,
    "ImageDirectExecutor 是 (commandId, input) 两参；少一个参数是编译期就能抓到的错",
  );
  assert.match(
    route,
    /editor\.addImageFromUrl\(resultUrl\)/,
    "跑完不把结果放回画布，用户看到的是「成功了但什么都没变」",
  );
});

test("付费能力不会被同一个动作跑两遍", () => {
  // 三条 provider 能力交给面板执行（那里有进度/回执/用量），
  // 路由自己不得再开一条执行路径。
  assert.equal(
    /startImageAiCommand|executeImageAiCommand/.test(route),
    false,
    "路由里直接起 provider job 会与面板各跑一次，等于一次动作双重计费",
  );
  assert.match(route, /setPendingAiRequest\(request\)/);
});

test("两种模式共用一份文档：L0 不占 photo/design 那条轴", () => {
  // photo/design 的主闸在 design-mode.test.mjs。L0 槽是 W01 的 normal|pro。
  assert.match(route, /applyImageL0Mode/);
  assert.equal(
    /FabricEditorMode/.test(route),
    false,
    "把 photo|design 塞进 adapter.mode，顶栏专业模式开关就会切错轴",
  );
});

test("chips 按当前模式产出，不是写死一份", () => {
  assert.match(
    route,
    /imageDesignChipManifestEntries\(designMode\.mode\)|IMAGE_DESIGN_MANIFEST_VERSION/,
    "chips 要么按模式产出、要么至少把 manifestVersion 引进来备接",
  );
});
