// 一个 Univer 实例、两种 chrome：`GridUniverStage.tsx` 的运行期判据
// （plugin-ui-overhaul U3，2026-09-07，core-swap:delete grid 之后表格只剩这一条路）。
//
// 用户看到的四件事，各对一条闸：
//   1. 页面行「普通 / Univer」点一下，ribbon / 公式栏当场出现或收起，**表格内容不闪、
//      不重载**——切模式只切显示，不 dispose、不 createUniver。
//   2. 关掉文档才 dispose，而且推到下一个宏任务：不再有
//      `Attempted to synchronously unmount a root while React was already rendering`。
//   3. 页面行切换与 chrome 落 DOM 在同一帧：`useLayoutEffect`，不是 `useEffect`。
//   4. 首帧就没有 ribbon：普通档在 Univer 画出来之前 chrome 就是 off。
//
// 为什么读源码 + 真调纯函数、不挂真 Univer：Univer 的 UI 层在 jsdom 里起不来
// （canvas / ResizeObserver），「真的画出来」归 V1 浏览器验收。这里用 TypeScript AST
// 定位到具体那几个 effect，判它们的依赖数组与函数体——比正则可靠，改名就红。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

import {
  GRID_UNIVER_CHROME_ATTRS,
  GRID_UNIVER_INSTANCE_ID,
  applyGridUniverChromeDom,
  applyGridUniverChromeToApi,
  applyGridUniverMode,
} from "../src/shell/doc-editors/grid-univer/stage-plan.ts";
import { gridUniverChrome } from "../src/shell/doc-editors/grid-univer/chrome.ts";
import {
  DEFAULT_PLUGIN_MODE,
  currentPluginMode,
  resetPluginModeCache,
  setPluginMode,
  subscribePluginMode,
} from "../src/shell/plugin-chrome/plugin-mode-store.ts";

const STAGE_PATH = "src/shell/doc-editors/GridUniverStage.tsx";
const stageText = readFileSync(new URL(`../${STAGE_PATH}`, import.meta.url), "utf8");
const stageFile = ts.createSourceFile(
  STAGE_PATH,
  stageText,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);

/** 找到 `GridUniverStage` 组件函数体里，形如 `hookName(() => {…}, [deps])` 的调用。 */
function hookCalls(hookName) {
  const found = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === hookName &&
      node.arguments.length === 2 &&
      ts.isArrayLiteralExpression(node.arguments[1])
    ) {
      found.push({
        body: node.arguments[0].getText(),
        deps: node.arguments[1].elements.map((element) => element.getText()),
        node,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(stageFile);
  return found;
}

/** 去掉注释后的文本：判「函数体里有没有某个调用」不能被注释里的字骗过。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const mountEffect = hookCalls("useEffect").find((call) =>
  call.body.includes("createUniver("),
);
const chromeLayoutEffect = hookCalls("useLayoutEffect").find((call) =>
  stripComments(call.body).includes("applyChrome(mode)"),
);

test("挂载 effect 只按 snapshotReady 起跑：切 mode 不重建实例", () => {
  assert.ok(mountEffect, "找不到 createUniver 所在的 useEffect");
  assert.deepEqual(
    mountEffect.deps,
    ["snapshotReady"],
    "挂载 effect 的依赖数组里只能有 snapshotReady；进了 mode 就等于切模式重建",
  );
  assert.ok(
    !mountEffect.deps.includes("mode") && !mountEffect.deps.includes("pro"),
    "mode 不许进挂载 effect 的依赖数组",
  );
});

test("模式 → chrome 走 useLayoutEffect，同一帧落 DOM，函数体里没有 dispose / createUniver", () => {
  assert.ok(chromeLayoutEffect, "找不到 applyChrome(mode) 所在的 useLayoutEffect");
  assert.deepEqual(
    [...chromeLayoutEffect.deps].sort(),
    ["applyChrome", "mode"],
    "chrome effect 只依赖 applyChrome 与 mode",
  );
  const body = stripComments(chromeLayoutEffect.body);
  assert.doesNotMatch(body, /dispose\(/, "切模式不许 dispose");
  assert.doesNotMatch(body, /createUniver\(/, "切模式不许重建实例");
  assert.doesNotMatch(body, /setSnapshotReady\(/, "切模式不许把加载态打回去");
  // 反向：不许有 useEffect 版本的 applyChrome(mode)——那会晚一帧，页面行点下去先看到旧 chrome。
  const effectVersions = hookCalls("useEffect").filter((call) =>
    stripComments(call.body).includes("applyChrome(mode)"),
  );
  assert.equal(
    effectVersions.length,
    0,
    "applyChrome(mode) 必须在 useLayoutEffect 里，不能在 useEffect 里",
  );
});

test("模式来自 usePluginMode(\"grid\") 的 L0 store，不再有本地 useState<EditorMode>", () => {
  const code = stripComments(stageText);
  assert.match(code, /usePluginMode\("grid"\)/);
  assert.doesNotMatch(
    code,
    /useState<EditorMode>\(/,
    "模式不能是舞台私有状态：页面行改的是 store，舞台要读同一份",
  );
});

test("dispose 只在卸载 cleanup 里，且推到 setTimeout(…, 0) 的宏任务", () => {
  assert.ok(mountEffect);
  const body = stripComments(mountEffect.body);
  // 整个文件里 `.dispose()` 只允许出现在 parkForDispose 的 setTimeout 回调里。
  const code = stripComments(stageText);
  const disposeSites = [...code.matchAll(/\.dispose\(\)/g)].map((m) => m.index);
  assert.equal(disposeSites.length, 1, "整份舞台只允许一处 .dispose()");
  const parkStart = code.indexOf("function parkForDispose()");
  assert.ok(parkStart > 0, "缺少 parkForDispose");
  assert.ok(disposeSites[0] > parkStart, ".dispose() 必须在 parkForDispose 里");
  const parkBody = code.slice(parkStart, disposeSites[0]);
  assert.match(parkBody, /setTimeout\(\(\) => \{/, "dispose 要包在 setTimeout 里");
  assert.doesNotMatch(parkBody, /queueMicrotask/, "微任务不能保证落在 React 提交之外");
  assert.match(
    code.slice(disposeSites[0], disposeSites[0] + 80),
    /\}, 0\)/,
    "setTimeout 的延时是 0：只求换一个宏任务，不求等",
  );
  // 卸载 cleanup 返回的是 parkForDispose，两条路径（新建 / 收回停车的）都返回它。
  assert.equal(
    (body.match(/return parkForDispose;/g) || []).length,
    2,
    "挂载 effect 的两条路径都要以 parkForDispose 作 cleanup",
  );
  // 同步置空句柄：卸载后任何路径都拿不到活实例。
  assert.match(parkBody, /handleRef\.current = null;/);
});

test("StrictMode 双跑：同一次提交里卸了又挂，收回停车的实例而不再造", () => {
  assert.ok(mountEffect);
  const body = stripComments(mountEffect.body);
  const parkedBranch = body.match(
    /const parked = parkedRef\.current;\s*if \(parked\) \{([\s\S]*?)\n\s*\}/,
  );
  assert.ok(parkedBranch, "缺少 parkedRef 收回分支");
  assert.match(parkedBranch[1], /clearTimeout\(parked\.timer\)/);
  assert.match(parkedBranch[1], /handleRef\.current = parked\.handle/);
  assert.match(
    parkedBranch[1],
    /applyChrome\(modeRef\.current\)/,
    "收回后要按当前档位重放 chrome",
  );
  assert.match(parkedBranch[1], /return parkForDispose;/);
  // 收回分支在 createUniver 之前。
  assert.ok(
    body.indexOf("const parked = parkedRef.current;") < body.indexOf("createUniver("),
  );
});

test("首帧无 ribbon：句柄一到手就按当前档位 applyChrome，早于 setEditable 与 return", () => {
  assert.ok(mountEffect);
  const body = stripComments(mountEffect.body);
  const handleSet = body.indexOf("handleRef.current = { univer: created.univer, api };");
  const firstChrome = body.indexOf("applyChrome(modeRef.current);", handleSet);
  const editable = body.indexOf("setEditable", handleSet);
  assert.ok(handleSet > 0, "找不到句柄赋值");
  assert.ok(firstChrome > handleSet, "拿到句柄后要立刻 applyChrome");
  assert.ok(
    editable === -1 || firstChrome < editable,
    "首帧 chrome 要在 setEditable 之前落下",
  );
  // 容器一开始就带 mode 属性，CSS 可以在 Univer 画出来之前就按档位收 chrome。
  assert.match(stageText, /\{\.\.\.\{ \[GRID_UNIVER_MODE_ATTR\]: mode \}\}/);
  // 默认档是普通档，普通档的 chrome 就是 ribbon / 公式栏 / 标题栏三关。
  assert.equal(DEFAULT_PLUGIN_MODE, "normal");
  const chrome = gridUniverChrome(DEFAULT_PLUGIN_MODE);
  assert.equal(chrome.toolbar, false);
  assert.equal(chrome.formulaBar, false);
  assert.equal(chrome.header, false);
});

/* ------------------- 真调纯函数：切模式那一下到底动了什么 ------------------- */

function fakeRoot() {
  const attrs = new Map();
  const nodes = {
    '[data-u-comp="headerbar"]': [{ style: { display: "" } }],
    '[data-u-comp="ribbon-toolbar"]': [{ style: { display: "" } }],
    '[data-u-comp="formula-bar"]': [{ style: { display: "" } }],
  };
  return {
    attrs,
    nodes,
    setAttribute(name, value) {
      attrs.set(name, value);
    },
    querySelectorAll(selector) {
      return nodes[selector] || [];
    },
  };
}

function fakeApi() {
  const calls = [];
  return {
    calls,
    setUIVisible(part, visible) {
      calls.push([part, visible]);
    },
    dispose() {
      throw new Error("切模式不许碰 dispose");
    },
  };
}

/** 舞台里 `applyChrome` 那三步，按同样次序真跑一遍。 */
function runApplyChrome(root, api, mode) {
  const applied = applyGridUniverMode(GRID_UNIVER_INSTANCE_ID, mode);
  applyGridUniverChromeDom(root, applied.chrome);
  applyGridUniverChromeToApi(api, applied.chrome);
  return applied;
}

test("普通 → 专业 → 普通：同一 root、同一 api，只翻 data 属性与 display，dispose 一次都没碰", () => {
  const root = fakeRoot();
  const api = fakeApi();

  runApplyChrome(root, api, "normal");
  assert.equal(root.attrs.get(GRID_UNIVER_CHROME_ATTRS.toolbar), "off");
  assert.equal(root.attrs.get(GRID_UNIVER_CHROME_ATTRS.formulaBar), "off");
  assert.equal(root.nodes['[data-u-comp="ribbon-toolbar"]'][0].style.display, "none");

  const pro = runApplyChrome(root, api, "pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.message.type, "set-mode", "专业模式经 buildSetModeMessage 校验");
  assert.equal(root.attrs.get(GRID_UNIVER_CHROME_ATTRS.toolbar), "on");
  assert.equal(root.attrs.get(GRID_UNIVER_CHROME_ATTRS.formulaBar), "on");
  assert.equal(root.nodes['[data-u-comp="ribbon-toolbar"]'][0].style.display, "");
  assert.equal(root.nodes['[data-u-comp="formula-bar"]'][0].style.display, "");

  runApplyChrome(root, api, "normal");
  assert.equal(root.attrs.get(GRID_UNIVER_CHROME_ATTRS.toolbar), "off");
  assert.equal(root.nodes['[data-u-comp="ribbon-toolbar"]'][0].style.display, "none");
  // 页脚与右键菜单两档都开：藏深功能不等于删能力。
  assert.equal(root.attrs.get(GRID_UNIVER_CHROME_ATTRS.footer), "on");
  assert.equal(root.attrs.get(GRID_UNIVER_CHROME_ATTRS.contextMenu), "on");
  assert.ok(api.calls.length > 0, "api.setUIVisible 真被调用");
});

/* ----------------- L0 store：页面行点下去，舞台同步读到新档 ------------------ */

test("setPluginMode 同步改 store 并通知订阅者：页面行 → 舞台 useLayoutEffect 之间没有异步缝", () => {
  resetPluginModeCache();
  try {
    assert.equal(currentPluginMode("grid"), DEFAULT_PLUGIN_MODE);
    const seen = [];
    const unsubscribe = subscribePluginMode("grid", () => {
      seen.push(currentPluginMode("grid"));
    });
    setPluginMode("grid", "pro");
    assert.deepEqual(seen, ["pro"], "通知在 setPluginMode 返回前同步送达");
    assert.equal(currentPluginMode("grid"), "pro");
    setPluginMode("grid", "normal");
    assert.deepEqual(seen, ["pro", "normal"]);
    unsubscribe();
    setPluginMode("grid", "pro");
    assert.deepEqual(seen, ["pro", "normal"], "退订后不再收到");
  } finally {
    resetPluginModeCache();
  }
});
