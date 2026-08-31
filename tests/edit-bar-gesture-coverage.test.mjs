/**
 * 编辑栏三条手势的**逐件**覆盖闸（W31）。
 *
 * 操作员原话三条：
 *   ① 双击 edit bar 任何位置都能拖拽
 *   ② 点击后缩为一个圆形，再点击展开
 *   ③ 缩小版也可以拖拽到各个位置
 *
 * `V1` 判 A 组不过的第一条罪就是：这三条只在 13 件插件里的 10 件上成立，
 * `design-canvas` / `website` / `video-canvas` 三件**一条都不成立**——
 * 不是做得不好，是那块界面上根本没有这个物件（`verdicts/V1-verdict.md` A1-缺口）。
 *
 * ── 这份闸为什么这么写 ──────────────────────────────────────────────
 *
 * 1. **逐件**，不是抽样。写法抄 `oceandino/tests/plugin-chrome-adoption.test.mjs`
 *    的「13 件逐件」：从主题表（13 件的权威清单）出发，逐件问它归哪条外壳路径，
 *    再问那条路径给不给得出这三条。只盯三件 extracted 会漏掉共享十件，
 *    只盯共享十件会漏掉出事的那三件。
 *
 * 2. **整名匹配**，不用 `includes` 也不用裸正则。`W28` 的教训：把
 *    `data-plugin-chrome-stage` 改成 `…-RENAMED`，`includes` 照样为真，
 *    选择器其实已经没了而闸报绿。属性名后面不许再跟标识符字符或连字符。
 *    最后一节有这个匹配器的自检（正反两面各一条）。
 *
 * 3. **有一段是真渲染**。`V4` 判出的「引擎活着但屏幕上进不去」是本波头号形态，
 *    只查源码文本抓不到它。所以三件 extracted 走的那条新路径在 jsdom 里
 *    真的双击一次、真的点一次收起、真的拖一次圆——判据是「用户做得到吗」。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { measureOnCommittedTree } from "./helpers/clean-tree-baseline.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const SHELL = "src/shell";
const REPO = fileURLToPath(new URL("..", import.meta.url));

/**
 * 冻结「13 件」这个数时所在的 commit。末尾那条基线自检会把这个 commit 的树解出来重量一遍。
 * `W31` 原先的 13 是在脏工作树上量的，干净检出只有 10 ⇒ `V1` 判红（`_COMMON.md §7b⑪`）。
 * **改上面任何一个冻结数字，都要连它一起改。**
 */
const BASELINE_COMMIT = "a4988677c825a17e499159b5d28cdceb6eabc45f";

function read(relPath) {
  return readFileSync(resolve(relPath), "utf8");
}

/** 只看会跑的代码：注释里提到某个名字不算它还在。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function code(relPath) {
  return stripComments(read(relPath));
}

/** 同一套读法，但从别的一棵树的根读起（基线自检用）。 */
function codeAt(root, relPath) {
  return stripComments(readFileSync(resolve(root, relPath), "utf8"));
}

function escapeForRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * **整名**匹配器。名字后面不许再跟标识符字符或连字符。
 *
 * `data-edit-bar-collapse` 不许匹配上 `data-edit-bar-collapse-RENAMED`，
 * 也不许匹配上 `data-edit-bar-collapsed-pill`——后者是另一个属性，
 * 一个宽松的正则会把「收起键没了」判成「还在」。
 */
function wholeName(name) {
  return new RegExp(`${escapeForRegExp(name)}(?![\\w-])`);
}

/* ===========================================================================
 * 一 · 13 件的权威清单与它们各归哪条外壳路径
 * ========================================================================= */

/** 从源码里把一张对象字面量表的顶层键读出来（不硬编码清单，表变了这里跟着变）。 */
function tableKeys(source, declaration) {
  const start = source.indexOf(declaration);
  assert.ok(start > 0, `源码里找不到 ${declaration}——表被改名或挪走了`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && (depth -= 1) === 0) {
      end = i;
      break;
    }
  }
  const body = source.slice(open + 1, end);
  const keys = [];
  for (const match of body.matchAll(/^ {2}"?([A-Za-z][\w@.-]*)"?:\s*\{/gm)) {
    keys.push(match[1]);
  }
  assert.ok(
    keys.length > 0,
    `${declaration} 里一个顶层键都没读到——正则和缩进对不上（这是工具错，不是事实）`,
  );
  return { keys, body };
}

const themeTable = code(`${SHELL}/plugin-theme.tsx`);
const registry = code(`${SHELL}/workbench-capability-registry.ts`);

/**
 * 权威清单取自**适配器表**，不是主题表。
 *
 * `W31` 原先取的是 `PLUGIN_THEME_SPECS`，`V1` 复判 §5.2 判红：那张表在 HEAD 上只有
 * **10** 件，`design-canvas` / `website` / `video-canvas` 三个 id 只存在于并发同事对
 * `plugin-theme.tsx` 的**未提交**改动里 ⇒ 「13 件」这个数标定在一棵 git 里并不存在的树上，
 * 干净检出上这道闸必红，`逐件 ×13` 也缩成 `逐件 ×10`（`_COMMON.md §7b⑪`）。
 *
 * 适配器表才是这道闸真正要问的东西：**这一件归哪条外壳路径**（`toolbarOwnership`）。
 * 它在干净 HEAD 上已经是 13 件且三件 extracted 的 ownership 已是 `native`。
 * 主题表管的是插件内主题配色，与手势可达性无关——接错表，不是产品缺口。
 */
const { body: registryBody, keys: adapters } = tableKeys(
  registry,
  "const EDITOR_ADAPTER_RUNTIME",
);
/** 适配器键可能带版本后缀（`chart-editor@1`），插件 id 取 `@` 之前那一段。 */
const PLUGIN_IDS = adapters.map((adapter) => adapter.split("@")[0]);
const THEME_SPEC_IDS = tableKeys(themeTable, "export const PLUGIN_THEME_SPECS").keys;
const OWNERSHIP = new Map();
for (const adapter of adapters) {
  const entry = registryBody.match(
    new RegExp(
      `^ {2}"?${adapter.replace(/[@.]/g, "\\$&")}"?:\\s*\\{([\\s\\S]*?)^ {2}\\},`,
      "m",
    ),
  );
  assert.ok(entry, `适配器 ${adapter} 的条目读不出来`);
  const tier = entry[1].match(/toolbarOwnership:\s*"(\w+)"/)?.[1];
  assert.ok(tier, `适配器 ${adapter} 没写 toolbarOwnership`);
  OWNERSHIP.set(adapter.split("@")[0], tier);
}

/**
 * 主题表**尚未**登记、但适配器表已经有的插件 id（`BASELINE_COMMIT` 干净检出实测）。
 *
 * 这三件是并发同事正在往 `plugin-theme.tsx` 里补的（`git diff` 里 +63 行，本波在途）。
 * 按 `_COMMON.md §8`「红在别人在途的文件里，标『在途』，不记人头」，这里显式登记而不判红。
 *
 * ⚠️ 这是**清单，不是豁免**：下面那条「死条目也红」会在同事提交之后当场红，
 * 逼着把这里清空。形状抄 `motion-token-adoption` 的判据 2b——
 * 留着不清的清单会把下一次真回归静静放过去。
 */
const THEME_SPEC_PENDING = Object.freeze(["design-canvas", "video-canvas", "website"]);

/** 两张表的路径，`git archive` 只解这两个文件，不解整棵树。 */
const TABLE_PATHS = [
  `${SHELL}/plugin-theme.tsx`,
  `${SHELL}/workbench-capability-registry.ts`,
];

test("清单本身：13 件，10 件走共享外壳、3 件走 chrome", () => {
  assert.equal(
    PLUGIN_IDS.length,
    13,
    `插件数从 13 变成了 ${PLUGIN_IDS.length}。新插件也要能拖、能收成圆、能拖圆；` +
      "改这个数字之前先确认新那件落在下面两条路径的哪一条",
  );
  assert.equal(
    new Set(PLUGIN_IDS).size,
    PLUGIN_IDS.length,
    `适配器表里有同一个插件的两条记录：${PLUGIN_IDS.join(", ")}。` +
      "版本后缀被剥掉之后撞了名，逐件断言会有一件跑两遍、另一件不跑",
  );
  const native = PLUGIN_IDS.filter((id) => OWNERSHIP.get(id) === "native");
  assert.deepEqual(
    native.sort(),
    ["design-canvas", "video-canvas", "website"],
    "走 chrome 的必须正好是三件 extracted 插件",
  );
  assert.equal(
    PLUGIN_IDS.filter((id) => OWNERSHIP.get(id) === "shared").length,
    10,
    "走共享外壳的必须是那十件",
  );
});

/** 从一棵树的根上把两张表都读出来。工作树、任意 commit 的树，用的是同一段代码。 */
function readTables(root) {
  const adapterKeys = tableKeys(
    codeAt(root, `${SHELL}/workbench-capability-registry.ts`),
    "const EDITOR_ADAPTER_RUNTIME",
  ).keys;
  return {
    pluginIds: adapterKeys.map((a) => a.split("@")[0]),
    themeIds: tableKeys(
      codeAt(root, `${SHELL}/plugin-theme.tsx`),
      "export const PLUGIN_THEME_SPECS",
    ).keys,
  };
}

test("两表对齐：主题表不许出现适配器表没有的插件，缺的那几件必须显式登记", () => {
  // ⚠️ 这一条判的是 **HEAD 上已入库的两张表**，不是工作树。
  // 两张表当下都躺着并发同事的未提交改动；照工作树判，等于把别人的半成品当成已入库
  // ——那正是 `V1` 判 `W31` 红的那个病（`_COMMON.md §7b⑪`）。
  // 反过来，判 HEAD 意味着同事**一提交**，下面「死条目也红」就当场逼人来清清单。
  const head = measureOnCommittedTree({ repo: REPO, commit: "HEAD", pathspecs: TABLE_PATHS, measure: readTables });
  assert.ok(head.ok, `读不到 HEAD 上的两张表 ⇒ 这条对齐判据等于没跑。${head.reason}`);
  const { pluginIds, themeIds } = head.value;

  // 方向一（硬红）：主题表里冒出来一个适配器表没有的 id，说明它问不出归哪条外壳路径
  // ⇒ 那件的用户双击不会有任何反应，而没有任何闸会响。这是真缺口，不是在途。
  const adapterIds = new Set(pluginIds);
  const orphan = themeIds.filter((id) => !adapterIds.has(id));
  assert.deepEqual(
    orphan,
    [],
    `主题表里这几件在适配器表上没有对应条目：${orphan.join(", ")}。` +
      "它们归哪条外壳路径问不出来，三条手势一条都无从保证",
  );

  // 方向二：适配器表有、主题表还没有的，必须**逐个**写进 PENDING；
  // 反过来，PENDING 里已经补上的是死条目，也红。
  // 死条目留着不清，会让下一次真的缺失被静静放过（形状同 W30 判据 2b）。
  const missing = pluginIds.filter((id) => !themeIds.includes(id)).sort();
  assert.deepEqual(
    missing,
    [...THEME_SPEC_PENDING].sort(),
    `HEAD 上主题表缺的是「${missing.join(", ") || "无"}」，` +
      `THEME_SPEC_PENDING 写的是「${[...THEME_SPEC_PENDING].join(", ")}」，对不上。\n` +
      "· 缺的比清单多 ⇒ 有新插件没登记，两表对齐进度必须是显式的；\n" +
      "· 清单比缺的多 ⇒ 主题表已经补齐了，把清单里那几件删掉。",
  );
});

/* ===========================================================================
 * 二 · 手势引擎只有一份，且它确实实现了三条诉求
 *
 * 两条外壳路径最后都收敛到同一个 `useEditBarDockController`。先把引擎钉住，
 * 下面 13 条逐件断言才有东西可指——否则「接上了」接的是个空壳。
 * ========================================================================= */

const controllerSource = code(`${SHELL}/edit-bar-dock-controller.tsx`);
const controlsSource = code(`${SHELL}/EditBarDockControls.tsx`);
const floatingSource = code(`${SHELL}/FloatingContextToolbar.tsx`);

test("引擎：① 双击条上任意位置进入拖拽（不是只有手柄能拖）", () => {
  // 判据落在「摊到浮层根节点上」这件事上：双击判定挂在根的捕获阶段，
  // 所以条上任何一个位置（包括控件本身）双击都算。
  // 挂在某个手柄上的实现会让「任何位置」变成「那一小块」。
  assert.match(
    controllerSource,
    /onPointerDownCapture:\s*\(event/,
    "双击判定不在捕获阶段了；第二次按下会先被控件吃掉，双击拖不起来",
  );
  assert.match(
    controllerSource,
    /beginMoveMode\(event\.clientX,\s*event\.clientY\)/,
    "双击不再进入移动模式",
  );
  assert.match(
    floatingSource,
    /onPointerDownCapture=\{controller\.rootProps\.onPointerDownCapture\}/,
    "浮层根没有把双击判定摊上去——那就只有某一小块能拖了",
  );
});

test("引擎：② 收起为圆 / 再点展开，是形变不是瞬切", () => {
  assert.match(controlsSource, wholeName("data-edit-bar-collapse"), "收起键没了（改名也算没了）");
  assert.match(
    controlsSource,
    wholeName("data-edit-bar-collapsed-pill"),
    "收起后的那个圆没了（改名也算没了）",
  );
  assert.match(
    controllerSource,
    /const toggleCollapsed = useCallback/,
    "收起/展开的切换入口没了",
  );
  // 圆的直径是共享常量，不是就地写死的 48——写死会与 planMorph 的目标盒失配。
  assert.match(
    controllerSource,
    wholeName("EDIT_BAR_COLLAPSED_SIZE_PX"),
    "收起圆的尺寸不再取自共享常量",
  );
  assert.match(
    floatingSource,
    /controller\.collapsed \?/,
    "浮层不再按 collapsed 换成圆——「点击后缩为一个圆形」没有落点",
  );
});

test("引擎：③ 收起的圆自己也能拖，且拖过之后不会被当成点击展开", () => {
  assert.match(
    controllerSource,
    /onPointerDown:\s*\(event: ReactPointerEvent<HTMLButtonElement>\)/,
    "圆上没有按下即拖的入口",
  );
  assert.match(
    controllerSource,
    /if \(presentationRef\.current === "collapsed"\) \{\s*setCollapsedPosition\(next, persistChange\);/,
    "拖动落点不再按收起态写 collapsedPosition，圆会拖不动或拖完弹回去",
  );
  assert.match(
    controllerSource,
    /if \(moved\) swallowNextClick\(event\.clientX, event\.clientY\);/,
    "拖过还算点击 ⇒ 松手即展开，圆永远挪不动（这条是回归过的形态）",
  );
  assert.match(
    floatingSource,
    /\{\.\.\.controller\.collapsedProps\}/,
    "圆没有拿到手势 props",
  );
});

/* ===========================================================================
 * 三 · 13 件逐件：你这一件，三条诉求走的是哪条路，那条路在不在
 * ========================================================================= */

/** 两条外壳路径各自的「挂载点」证据。 */
const MOUNTS = {
  shared: {
    file: `${SHELL}/InlineAdvancedWorkbenchShell.tsx`,
    what: "InlineAdvancedWorkbenchShell",
    hook: /const floatingToolbar = useFloatingContextToolbar\(\{/,
    surface: /<FloatingContextToolbar\s+controller=\{floatingToolbar\}/,
  },
  native: {
    file: `${SHELL}/plugin-chrome/PluginChromeFrame.tsx`,
    what: "PluginChromeFrame",
    hook: /const editBarGestures = usePluginChromeEditBarGestures\(pluginId\)/,
    surface: /<PluginChromeEditBarGestureLayer\s+bridge=\{editBarGestures\}/,
  },
};

for (const pluginId of PLUGIN_IDS) {
  test(`逐件 · ${pluginId}：三条手势可达`, () => {
    const tier = OWNERSHIP.get(pluginId);
    assert.ok(
      tier === "shared" || tier === "native",
      `${pluginId} 的 toolbarOwnership 是 "${tier}"，两条外壳路径都不认它——` +
        "它的用户按下双击不会有任何反应，而没有任何闸会响",
    );
    const mount = MOUNTS[tier];
    const source = code(mount.file);
    assert.match(
      source,
      mount.hook,
      `${pluginId} 走 ${mount.what}，而它已经不造编辑栏控制器了 ⇒ ` +
        "双击拖拽、收起为圆、拖圆三条一起没",
    );
    assert.match(
      source,
      mount.surface,
      `${pluginId} 走 ${mount.what}，控制器造出来了却没有渲染那层手势表面 ⇒ ` +
        "引擎活着，但屏幕上进不去（本波头号缺陷形态）",
    );
  });
}

test("两条路径用的是同一个引擎，不是各写一份", () => {
  // 同一件事两套实现正是本波要消灭的漂移形状。chrome 那侧的桥必须转手
  // 共享的 useFloatingContextToolbar，而不是自己 new 一套手势数学。
  const bridge = code(`${SHELL}/plugin-chrome/use-plugin-chrome-layout.tsx`);
  assert.match(
    bridge,
    /useFloatingContextToolbar\(\{/,
    "chrome 的手势桥不再用共享控制器了",
  );
  assert.match(
    code(`${SHELL}/FloatingContextToolbar.tsx`),
    /useEditBarDockController\(\{/,
    "共享浮层不再用 useEditBarDockController",
  );
  // chrome 那侧**不**靠 contextBarLeading/Trailing——那两个槽是刻意 undefined 的
  // （W22 契约 §5/§9）。这条钉住「绕开约束」而不是「哪天有人把它填上」。
  assert.match(
    bridge,
    /contextBarLeading: undefined/,
    "有人把 contextBarLeading 填上了。填它会让槽内 SelectionToolbar 长出第二个 " +
      "AI 键、翻成 floating 胶囊、选区检查器改道左抽屉（契约 §4-3 的三条副作用），" +
      "手势一条也不会多出来",
  );
});

/* ===========================================================================
 * 四 · 真渲染：三件 extracted 插件那条新路径，用户真的做得到吗
 * ========================================================================= */

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
  url: "http://localhost/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
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

const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const iconStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedEditorIcon({ name, className }) {
    return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
  }
`);
const agentPanelStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export const PLUGIN_AGENT_DRAWER_ID = "agent";
  export function createPluginAgentDrawer({ editorId }) {
    return {
      id: "agent",
      label: "AI",
      icon: "agent",
      content: jsx("div", { "data-plugin-agent-panel": editorId }),
    };
  }
  export function PluginAgentPanel({ editorId }) {
    return jsx("div", { "data-plugin-agent-panel": editorId });
  }
`);
const pluginThemeStubUrl = dataModule(`
  export function usePluginTheme() {
    return { theme: "light", accent: "#4f46e5" };
  }
  export function PluginThemeToggle() {
    return null;
  }
  export function pluginWorkbenchStyle(_theme, accent) {
    return { "--awb-accent": accent };
  }
`);

const frameUrl = await compileModule(
  "src/shell/plugin-chrome/PluginChromeFrame.tsx",
  {
    "react-dom": reactDomUrl,
    "../../i18n/ui/useUI": uiStubUrl,
    "../AdvancedEditorIcon": iconStubUrl,
    "../plugin-theme": pluginThemeStubUrl,
    "./agent-drawer-panel": agentPanelStubUrl,
    "./PluginAgentPanel": agentPanelStubUrl,
  },
);
const { PluginChromeFrame } = await import(frameUrl);

/**
 * jsdom 不做布局，所有 rect 都是 0，位置会被夹在同一个点上——不给替身的话
 * 「拖动了没有」这件事结构上看不见。这套替身与 `edit-bar-motion.test.mjs`
 * 同源：条自己的 rect 从它的 transform 反解，所以位置有没有动才看得出来。
 */
function installRectStub() {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  const rect = (left, top, width, height) => ({
    x: left, y: top, left, top,
    right: left + width, bottom: top + height,
    width, height, toJSON() {},
  });
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(
        this.style.transform || "",
      );
      return rect(match ? Number(match[1]) : 100, match ? Number(match[2]) : 60, 300, 52);
    }
    if (this.hasAttribute("data-plugin-chrome")) return rect(0, 0, 1000, 600);
    if (this.hasAttribute("data-plugin-chrome-stage")) return rect(0, 110, 1000, 490);
    if (this.hasAttribute("data-plugin-chrome-edit-bar")) return rect(0, 56, 1000, 48);
    if (
      this.hasAttribute("data-workspace-docked-toolbar") ||
      this.hasAttribute("data-workspace-floating-toolbar")
    ) {
      return rect(0, 0, 1000, 600);
    }
    return original.call(this);
  };
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = original;
  };
}

async function mountFrame(pluginId) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(PluginChromeFrame, {
        pluginId,
        title: pluginId,
        editBar: React.createElement("div", { "data-test-edit-bar": true }, "工具条"),
        children: React.createElement("div", { "data-test-stage": true }),
      }),
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function pointer(target, type, values) {
  await act(async () => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(event, name, { configurable: true, value });
    }
    target.dispatchEvent(event);
  });
}

async function click(target) {
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function translateOf(element) {
  const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(
    element?.style.transform || "",
  );
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

/** 三件 extracted 插件走的是同一个 frame，逐件跑一遍才是「逐件可达」。 */
for (const pluginId of ["design-canvas", "website", "video-canvas"]) {
  test(`真渲染 · ${pluginId}：双击拖得动、点得出圆、圆也拖得动`, async () => {
    window.localStorage.clear();
    const restoreRect = installRectStub();
    const mounted = await mountFrame(pluginId);
    const { container } = mounted;
    const bar = () => container.querySelector("[data-workspace-edit-bar-toolbar]");
    try {
      assert.ok(
        container.querySelector("[data-plugin-chrome-edit-bar]"),
        "edit bar 行必须恒在（契约要求）",
      );
      assert.ok(bar(), "手势浮层没起来——三条诉求一条都无从谈起");
      assert.ok(
        container.querySelector("[data-edit-bar-agent]"),
        "AI 键必须还在（契约 §9：接手势不许把它弄丢）",
      );

      // ① 双击条上「任意位置」——这里刻意选插件填进来的那段内容，
      //    而不是某个专用手柄，因为诉求原话就是「任何位置」。
      const anywhere = container.querySelector("[data-test-edit-bar]");
      assert.ok(anywhere, "插件填进来的 edit bar 内容不在");
      const before = translateOf(bar());
      assert.ok(before, "浮层没有位置——paintMotion 没写 transform");

      for (const step of [0, 1]) {
        await pointer(anywhere, "pointerdown", {
          pointerId: -1, pointerType: "mouse", button: 0,
          clientX: 400, clientY: 70, timeStamp: 1000 + step,
        });
      }
      await act(async () => {
        const move = new window.Event("pointermove", { bubbles: true });
        for (const [name, value] of Object.entries({
          pointerId: -1, clientX: 520, clientY: 300, timeStamp: 1100,
        })) {
          Object.defineProperty(move, name, { configurable: true, value });
        }
        window.dispatchEvent(move);
      });
      const dragged = translateOf(bar());
      assert.ok(
        dragged && (dragged.x !== before.x || dragged.y !== before.y),
        `双击之后拖不动：${JSON.stringify(before)} → ${JSON.stringify(dragged)}。` +
          "诉求原话是「双击 edit bar 任何位置都能拖拽」",
      );
      // 落下，别把移动模式留给下一段。
      await act(async () => {
        const down = new window.Event("pointerdown", { bubbles: true });
        for (const [name, value] of Object.entries({
          pointerId: -1, clientX: 520, clientY: 300, timeStamp: 1200,
        })) {
          Object.defineProperty(down, name, { configurable: true, value });
        }
        window.dispatchEvent(down);
      });

      // ② 点击后缩为一个圆形
      const collapse = container.querySelector("[data-edit-bar-collapse]");
      assert.ok(collapse, "收起键不在——「点击后缩为一个圆形」没有入口");
      await click(collapse);
      const pill = container.querySelector("[data-edit-bar-collapsed-pill]");
      assert.ok(pill, "点了收起却没有变成圆");
      assert.equal(
        container.querySelector("[data-test-edit-bar]"),
        null,
        "收起之后展开态的内容应当让位给圆，否则「缩为一个圆形」只是多了个圆",
      );

      // ③ 缩小版也可以拖拽到各个位置
      const parked = translateOf(bar());
      await pointer(pill, "pointerdown", {
        pointerId: 3, pointerType: "mouse", button: 0,
        clientX: 200, clientY: 200, timeStamp: 2000,
      });
      for (let step = 1; step <= 3; step += 1) {
        await pointer(pill, "pointermove", {
          pointerId: 3, pointerType: "mouse",
          clientX: 200 + step * 60, clientY: 200 + step * 40,
          timeStamp: 2000 + step * 16,
        });
      }
      const draggedPill = translateOf(bar());
      assert.ok(
        draggedPill &&
          (draggedPill.x !== parked.x || draggedPill.y !== parked.y),
        `圆拖不动：${JSON.stringify(parked)} → ${JSON.stringify(draggedPill)}`,
      );
      await pointer(pill, "pointerup", {
        pointerId: 3, pointerType: "mouse",
        clientX: 380, clientY: 320, timeStamp: 2100,
      });
      assert.ok(
        container.querySelector("[data-edit-bar-collapsed-pill]"),
        "拖完圆就自己展开了——拖过不该被当成点击",
      );

      // ②后半 · 再点击展开
      await click(container.querySelector("[data-edit-bar-collapsed-pill]"));
      assert.ok(
        container.querySelector("[data-test-edit-bar]"),
        "点圆没有展开回工具条",
      );
    } finally {
      await mounted.unmount();
      restoreRect();
    }
  });
}

/* ===========================================================================
 * 五 · 匹配器自检：属性改个名，这份闸必须还抓得到
 *
 * `W28` 报的盲区：`includes` 与裸正则会把「属性改名」判成「还在」。
 * 上面每一条属性判据都走 `wholeName()`，这里正反各验一次它本身。
 * 没有这一节，上面那些绿只能证明「字符串出现过」。
 * ========================================================================= */

test("整名匹配器本身：改名必须判成没了，同前缀的别名不许误伤", () => {
  assert.match("<span data-plugin-chrome-stage />", wholeName("data-plugin-chrome-stage"));
  assert.doesNotMatch(
    "<span data-plugin-chrome-stage-RENAMED />",
    wholeName("data-plugin-chrome-stage"),
    "改名之后还判成「还在」——这正是 W28 抓到的那个盲区",
  );
  assert.doesNotMatch(
    "<button data-edit-bar-collapsed-pill />",
    wholeName("data-edit-bar-collapse"),
    "收起键没了，却被同前缀的收起圆顶了名额",
  );
  // 反过来也要成立：宽松写法确实会漏，所以这份闸不许退回去用它。
  assert.match(
    "<span data-plugin-chrome-stage-RENAMED />",
    /data-plugin-chrome-stage/,
    "裸正则在改名后照样命中——这就是不许用它的理由",
  );
});

/* ===========================================================================
 * 六 · 基线自检：上面那些冻结的数字必须是在**干净检出**上取的
 *
 * `V1` 复判抓到的两条新红同一个病根：`W30` 与 `W31` 都在并发同事的脏工作树上取了读数
 * （`_COMMON.md §7b⑪`）。纪律守不住它，所以给它一个机检形状——
 * 把 `BASELINE_COMMIT` 的树解出来重量一遍，对不上就红。
 * 脏工作树上量出来的数字过不了这一关，因为那棵树 git 里没有。
 * ========================================================================= */

test("基线自检：13 件与两表差集，都与 BASELINE_COMMIT 那棵干净树对得上", () => {
  const probe = measureOnCommittedTree({
    repo: REPO,
    commit: BASELINE_COMMIT,
    pathspecs: TABLE_PATHS,
    measure: readTables,
  });
  // 拿不到就判红，不许 skip：`_COMMON.md §7b⑩` 说的就是「没跑起来」被当成绿。
  assert.ok(probe.ok, `基线自检跑不起来 ⇒ 没人在守「基线取自干净检出」这件事。${probe.reason}`);

  const short = BASELINE_COMMIT.slice(0, 7);
  // 冻的是「13 件」这个数，所以自检也判这个数——判在**一棵 git 里真的存在的树**上。
  assert.equal(
    probe.value.pluginIds.length,
    13,
    `「13 件」这个数在 ${short} 的干净检出上量出来是 ${probe.value.pluginIds.length}` +
      `（${probe.value.pluginIds.join(", ")}）。\n` +
      "`W31` 原先的 13 取自主题表、且量在脏工作树上，干净检出只有 10 ⇒ 闸必红。\n" +
      "改冻结数字要连 BASELINE_COMMIT 一起改，两个是一组。",
  );
  assert.deepEqual(
    probe.value.pluginIds.filter((id) => !probe.value.themeIds.includes(id)).sort(),
    [...THEME_SPEC_PENDING].sort(),
    `在 ${short} 的干净检出上，两表差集与 THEME_SPEC_PENDING 对不上。\n` +
      "在途清单也必须按干净检出登记——照着脏树写，等于把同事的未提交改动当成已入库。",
  );
});
