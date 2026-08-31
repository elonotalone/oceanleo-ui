// W22：PluginChromeFrame 内建 AI 抽屉 —— 包内回归
//
// 改造前 oceandino/tests/plugin-chrome-adoption.test.mjs 只查外壳与主题，
// 查不到 AI 键这一层，缺陷一路滑到浏览器才被看见。这里钉住：
//   - edit bar 右段恒有 data-edit-bar-agent
//   - 点击开/关左侧 agent 面板
//   - 插件传入的同 id 面板被过滤，内建注册点唯一
//   - 抽屉打开时 stage 仍可交互
//   - 摘掉关键实现时必须红（源码 Canary + 行为断言）

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function source(relPath) {
  return readFileSync(resolve(relPath), "utf8");
}

/** `src/shell` 下所有 `.ts`/`.tsx`，仓内相对路径。 */
function shellSources() {
  return readdirSync(resolve("src/shell"), { recursive: true })
    .map((entry) => String(entry).split("\\").join("/"))
    .filter((rel) => /\.tsx?$/.test(rel))
    .map((rel) => `src/shell/${rel}`);
}

/**
 * 「抽屉开着（含 agent 正在生成）右侧照样收键鼠」这条承诺的运行期判据。
 *
 * 只查源码文本挡不住真正会发生的那种退化：往 stage 里塞一个
 * `absolute inset-0` 的遮罩、或给某个祖先加 `inert`，源码正则都可能绕过去。
 * 所以这里从 stage 一路走到 frame 根，逐个祖先查三样东西，
 * 再核 stage 的子节点**只有插件传进来的那一个**（frame 不许注入兄弟遮罩）。
 */
function assertStageUnlocked(container, note) {
  const stage = container.querySelector("[data-plugin-chrome-stage]");
  assert.ok(stage, `${note}：stage 必须在`);
  for (let node = stage; node && node !== container; node = node.parentElement) {
    const where = `${note}：<${node.tagName.toLowerCase()}>`;
    assert.equal(node.hasAttribute("inert"), false, `${where} 不许 inert`);
    assert.notEqual(
      node.getAttribute("aria-hidden"),
      "true",
      `${where} 不许 aria-hidden`,
    );
    assert.doesNotMatch(
      String(node.className || ""),
      /pointer-events-none/,
      `${where} 不许关 pointer-events`,
    );
  }
  assert.equal(
    stage.children.length,
    1,
    `${note}：stage 里只该有插件传的那一个子节点，多出来的就是遮罩`,
  );
  return stage;
}

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
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
  export const PLUGIN_AGENT_DRAWER_LABEL = "AI 助手";
  export function createPluginAgentDrawer({ editorId }) {
    return {
      id: PLUGIN_AGENT_DRAWER_ID,
      label: PLUGIN_AGENT_DRAWER_LABEL,
      icon: "agent",
      content: jsx("div", { "data-plugin-agent-panel": editorId, "data-test-agent-stub": true }),
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

/**
 * 会「进入生成态」的 agent 面板替身。P3 承诺的后半句是「生成期间不锁编辑器」，
 * 而真实生成发生在 `FunctionAgentChat` 内部（frame 根本没有 generating 这个概念）。
 * 要钉住的正是这一点：面板自己翻状态、frame 跟着重渲染时，右侧照样能用。
 * 探针把 setter 挂在 globalThis 上，测试侧才有办法从外面把它推进生成态。
 */
const generatingAgentStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export const PLUGIN_AGENT_DRAWER_ID = "agent";
  export const PLUGIN_AGENT_DRAWER_LABEL = "AI 助手";
  function GeneratingProbe({ editorId }) {
    const [generating, setGenerating] = React.useState(false);
    React.useEffect(() => {
      globalThis.__W22_AGENT_PROBE__ = setGenerating;
      return () => {
        if (globalThis.__W22_AGENT_PROBE__ === setGenerating) {
          delete globalThis.__W22_AGENT_PROBE__;
        }
      };
    }, []);
    return React.createElement(
      "div",
      {
        "data-plugin-agent-panel": editorId,
        "data-agent-generating": generating ? "true" : "false",
      },
      generating ? "生成中" : "空闲",
    );
  }
  export function createPluginAgentDrawer({ editorId }) {
    return {
      id: PLUGIN_AGENT_DRAWER_ID,
      label: PLUGIN_AGENT_DRAWER_LABEL,
      icon: "agent",
      content: React.createElement(GeneratingProbe, { editorId }),
    };
  }
  export function PluginAgentPanel({ editorId }) {
    return React.createElement("div", { "data-plugin-agent-panel": editorId });
  }
`);

const frameStubs = {
  "../../i18n/ui/useUI": uiStubUrl,
  "../AdvancedEditorIcon": iconStubUrl,
  "../plugin-theme": pluginThemeStubUrl,
  "./agent-drawer-panel": agentPanelStubUrl,
  "./PluginAgentPanel": agentPanelStubUrl,
};
const frameUrl = await compileModule(
  "src/shell/plugin-chrome/PluginChromeFrame.tsx",
  frameStubs,
);
const { PluginChromeFrame } = await import(frameUrl);
// 同一张桩表 ⇒ 同一个编译上下文 ⇒ 与 frame 拿到的是**同一份** context 实例。
// 换一张桩表就会编出第二份，`useContext` 永远读不到 frame 提供的值。
const { useAdvancedLayout } = await import(
  await compileModule("src/shell/advanced-layout-context.tsx", frameStubs)
);
const { PluginChromeFrame: GeneratingFrame } = await import(
  await compileModule("src/shell/plugin-chrome/PluginChromeFrame.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../AdvancedEditorIcon": iconStubUrl,
    "../plugin-theme": pluginThemeStubUrl,
    "./agent-drawer-panel": generatingAgentStubUrl,
    "./PluginAgentPanel": generatingAgentStubUrl,
  }),
);
const { PLUGIN_AGENT_DRAWER_ID } = await import(
  await compileModule("src/shell/plugin-chrome/agent-drawer.ts"),
);

async function mountFrame(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(PluginChromeFrame, {
        pluginId: "design-canvas",
        title: "设计画布",
        ...props,
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

/** 同上，但换成会进入生成态的面板替身，且留一个 `render()` 用来改 props 重渲染。 */
async function mountGeneratingFrame(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (extra) => {
    await act(async () => {
      root.render(
        React.createElement(GeneratingFrame, {
          pluginId: "design-canvas",
          title: "设计画布",
          ...props,
          ...extra,
        }),
      );
    });
  };
  await render({});
  return {
    container,
    render,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("frame edit bar 右段恒渲染 data-edit-bar-agent", async () => {
  const { container, unmount } = await mountFrame({
    children: React.createElement("div", { "data-test-stage": true }),
  });
  const agentBtn = container.querySelector("[data-edit-bar-agent]");
  assert.ok(agentBtn, "AI 键必须存在");
  assert.equal(agentBtn.getAttribute("aria-pressed"), "false");
  await unmount();
});

test("点击 AI 键：左侧出现 agent 面板，再点关闭", async () => {
  const { container, unmount } = await mountFrame({
    children: React.createElement("input", {
      "data-test-stage-input": true,
      type: "text",
      defaultValue: "editable",
    }),
  });
  const agentBtn = container.querySelector("[data-edit-bar-agent]");
  await act(async () => agentBtn.click());
  assert.equal(agentBtn.getAttribute("aria-pressed"), "true");
  const panel = container.querySelector(
    `[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`,
  );
  assert.ok(panel, "左侧 agent 面板应展开");
  assert.ok(
    panel.querySelector("[data-test-agent-stub]"),
    "面板内容应来自内建工厂",
  );
  await act(async () => agentBtn.click());
  assert.equal(agentBtn.getAttribute("aria-pressed"), "false");
  assert.equal(
    container.querySelector(`[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`),
    null,
    "再点应关闭",
  );
  await unmount();
});

test("抽屉打开时 stage 仍可交互", async () => {
  const { container, unmount } = await mountFrame({
    children: React.createElement("input", {
      "data-test-stage-input": true,
      type: "text",
      defaultValue: "",
    }),
  });
  const input = container.querySelector("[data-test-stage-input]");
  const agentBtn = container.querySelector("[data-edit-bar-agent]");
  await act(async () => agentBtn.click());
  assert.ok(
    container.querySelector(`[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`),
  );
  input.value = "typed-while-agent-open";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(input.value, "typed-while-agent-open");
  assert.equal(input.disabled, false);
  assertStageUnlocked(container, "抽屉打开时");
  await unmount();
});

test("插件传入的同 id 面板被过滤，内建注册点唯一", async () => {
  const { container, unmount } = await mountFrame({
    panels: [
      {
        id: PLUGIN_AGENT_DRAWER_ID,
        label: "插件自建 agent",
        content: React.createElement("div", {
          "data-test-plugin-agent-override": true,
        }),
      },
    ],
    children: null,
  });
  await act(async () => {
    container.querySelector("[data-edit-bar-agent]").click();
  });
  const panel = container.querySelector(
    `[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`,
  );
  assert.ok(panel);
  assert.ok(
    panel.querySelector("[data-test-agent-stub]"),
    "必须是内建工厂，不是插件 override",
  );
  assert.equal(
    panel.querySelector("[data-test-plugin-agent-override]"),
    null,
  );
  await unmount();
});

test("editBar 槽内显式不提供 AdvancedLayout，避免 SelectionToolbar 双 AI 键", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(
    frameSrc,
    /AdvancedLayoutContext\.Provider value=\{null\}/,
    "editBar 槽内必须置 null layout",
  );
  assert.match(frameSrc, /data-edit-bar-agent/, "frame 自己渲染 AI 键");
});

test("plugin-chrome 内 agent 面板只经 createPluginAgentDrawer 工厂注册", () => {
  const factorySrc = source("src/shell/plugin-chrome/agent-drawer-panel.tsx");
  assert.match(factorySrc, /id: PLUGIN_AGENT_DRAWER_ID/);
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(frameSrc, /createPluginAgentDrawer\(/);
  assert.match(
    frameSrc,
    /panel\.id !== PLUGIN_AGENT_DRAWER_ID/,
    "必须过滤插件传入的同 id 面板",
  );
});

/**
 * 装在舞台里的一个 `useAdvancedLayout()` 消费方。
 * 兼容层（P1）的真正判据是「frame 里的组件能拿到 layout」，而不是源码里有那行
 * Provider——所以这里从舞台内部读它，再从舞台内部去开抽屉。
 */
function LayoutProbe() {
  const layout = useAdvancedLayout();
  return React.createElement(
    "div",
    {
      "data-test-layout": layout ? "yes" : "NO-CONTEXT",
      "data-test-drawer": layout ? layout.activeDrawerId : "",
      "data-test-host-visible": layout ? String(layout.hostPanelVisible) : "",
      "data-test-tool-active": layout ? String(layout.editorToolActive) : "",
      "data-test-context-bar": layout
        ? String(
            layout.contextBarLeading === undefined &&
              layout.contextBarTrailing === undefined,
          )
        : "",
    },
    React.createElement(
      "button",
      {
        type: "button",
        "data-test-open-drawer": true,
        onClick: () => layout?.openDrawer(PLUGIN_AGENT_DRAWER_ID),
      },
      "从舞台里开抽屉",
    ),
  );
}

test("兼容层：舞台内 useAdvancedLayout() 拿得到 layout，语义与基准一致（P1）", async () => {
  const { container, unmount } = await mountFrame({
    children: React.createElement(LayoutProbe),
  });
  const probe = container.querySelector("[data-test-layout]");
  const agentBtn = container.querySelector("[data-edit-bar-agent]");
  assert.equal(
    probe.getAttribute("data-test-layout"),
    "yes",
    "frame 必须自己提供 AdvancedLayoutContext，否则 AI 键这一层的前提就不成立",
  );
  assert.equal(probe.getAttribute("data-test-drawer"), "", "首帧左栏是收起的");
  assert.equal(probe.getAttribute("data-test-host-visible"), "false");
  assert.equal(probe.getAttribute("data-test-tool-active"), "false");
  assert.equal(
    probe.getAttribute("data-test-context-bar"),
    "true",
    "契约 §9 的缩小承诺：frame 路径没有浮动 context bar 槽",
  );

  // 从舞台里开抽屉：edit bar 的 AI 键与 layout 是同一个状态，不是两份。
  await act(async () =>
    container.querySelector("[data-test-open-drawer]").click(),
  );
  assert.equal(
    container.querySelector("[data-test-layout]").getAttribute("data-test-drawer"),
    PLUGIN_AGENT_DRAWER_ID,
  );
  assert.equal(
    agentBtn.getAttribute("aria-pressed"),
    "true",
    "aria-pressed 取值必须是 activeDrawerId === 'agent'（基准 SelectionToolbar.tsx:248）",
  );
  assert.ok(
    container.querySelector(`[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`),
  );
  const opened = container.querySelector("[data-test-layout]");
  assert.equal(opened.getAttribute("data-test-host-visible"), "true");
  assert.equal(
    opened.getAttribute("data-test-host-visible"),
    opened.getAttribute("data-test-tool-active"),
    "基准里 hostPanelVisible === editorToolActive（InlineAdvancedWorkbenchShell.tsx:205-206）",
  );

  // openDrawer 只开不切换、幂等（基准 use-inline-advanced-panels.tsx:185-207）。
  // 写成 toggle 会让任何重复 open 变成关闭，这条必须钉住。
  await act(async () =>
    container.querySelector("[data-test-open-drawer]").click(),
  );
  assert.equal(
    container.querySelector("[data-test-layout]").getAttribute("data-test-drawer"),
    PLUGIN_AGENT_DRAWER_ID,
    "openDrawer 幂等：再开一次仍是开着",
  );
  assert.equal(agentBtn.getAttribute("aria-pressed"), "true");

  // 关闭走 closeDrawer，左栏整体收起、无兜底面板（基准 :239-248）。
  await act(async () => agentBtn.click());
  assert.equal(
    container.querySelector("[data-test-layout]").getAttribute("data-test-drawer"),
    "",
  );
  assert.equal(
    container.querySelector(`[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`),
    null,
  );
  assert.equal(
    container.querySelector("aside[data-plugin-chrome-panel]"),
    null,
    "closeDrawer 后左栏不许留一个兜底面板",
  );
  await unmount();
});

test("agent 生成期间：右侧不锁、不重挂、抽屉不自己关（P3 后半句）", async () => {
  let stageClicks = 0;
  const stageChild = React.createElement(
    "div",
    { "data-test-stage": true },
    React.createElement("input", {
      "data-test-stage-input": true,
      type: "text",
      defaultValue: "",
    }),
    React.createElement(
      "button",
      {
        type: "button",
        "data-test-stage-button": true,
        onClick: () => {
          stageClicks += 1;
        },
      },
      "在舞台上点我",
    ),
  );
  const { container, render, unmount } = await mountGeneratingFrame({
    children: stageChild,
    agentTaskId: null,
  });

  const agentBtn = container.querySelector("[data-edit-bar-agent]");
  await act(async () => agentBtn.click());
  const stageBefore = assertStageUnlocked(container, "抽屉刚打开");
  const input = container.querySelector("[data-test-stage-input]");
  input.value = "改到一半";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await act(async () => container.querySelector("[data-test-stage-button]").click());
  assert.equal(stageClicks, 1, "抽屉打开时 stage 就该能点");

  // agent 开始生成。
  assert.equal(
    typeof globalThis.__W22_AGENT_PROBE__,
    "function",
    "生成探针应已挂上（否则下面几条什么都没验到）",
  );
  await act(async () => globalThis.__W22_AGENT_PROBE__(true));
  assert.equal(
    container
      .querySelector("[data-agent-generating]")
      .getAttribute("data-agent-generating"),
    "true",
    "面板应处于生成态",
  );

  // 生成中：右侧照样收键鼠，且 stage 与输入框都没被重挂——
  // 重挂等于把用户改到一半的内容丢掉，那是比「锁住」更难查的一种锁。
  assert.equal(
    assertStageUnlocked(container, "生成中"),
    stageBefore,
    "stage 不许在生成时重挂",
  );
  assert.equal(
    container.querySelector("[data-test-stage-input]"),
    input,
    "输入框不许重挂",
  );
  assert.equal(input.value, "改到一半", "用户改到一半的内容必须还在");
  assert.equal(input.disabled, false, "生成期间不许禁用右侧");
  await act(async () => container.querySelector("[data-test-stage-button]").click());
  assert.equal(stageClicks, 2, "生成期间 stage 的按钮必须照样触发");

  // 一轮会话开始会回吐 taskId，frame 于是重算 agentDrawer（useMemo 依赖 agentTaskId）。
  // 抽屉不能被这一下关掉，右侧也不能因此重挂。
  await render({ agentTaskId: "task-1" });
  assert.ok(
    container.querySelector(`[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`),
    "taskId 变化不许关抽屉",
  );
  assert.equal(agentBtn.getAttribute("aria-pressed"), "true");
  assert.equal(
    container.querySelector("[data-test-stage-input]"),
    input,
    "taskId 变化不许重挂右侧",
  );
  assert.equal(input.value, "改到一半");
  assert.equal(
    container
      .querySelector("[data-agent-generating]")
      .getAttribute("data-agent-generating"),
    "true",
    "taskId 变化不许打断正在跑的生成（面板被重挂就会掉回空闲）",
  );
  assertStageUnlocked(container, "taskId 变化后");
  await act(async () => container.querySelector("[data-test-stage-button]").click());
  assert.equal(stageClicks, 3);
  await unmount();
});

test("agent 抽屉的注册点全仓恰好两处，都在外壳侧", () => {
  const files = shellSources();
  // 正则自证（_COMMON.md §6）：先确认扫到的文件集合非空、且认得出已知那一处。
  assert.ok(files.length > 20, `src/shell 只扫到 ${files.length} 份文件，扫描本身可疑`);
  assert.ok(
    files.includes("src/shell/plugin-chrome/agent-drawer-panel.tsx"),
    "扫描漏了已知的工厂文件，判定不可信",
  );

  const registrars = files
    .filter((rel) => /id:\s*PLUGIN_AGENT_DRAWER_ID/.test(source(rel)))
    .sort();
  assert.deepEqual(
    registrars,
    [
      "src/shell/plugin-chrome/agent-drawer-panel.tsx",
      "src/shell/use-inline-advanced-panels.tsx",
    ],
    "agent 抽屉只允许两个注册点：共享插件外壳一处、frame 的工厂一处。" +
      "多出来的那一份就是任务书要消灭的第三种写法（视频画布的 CanvasAgentPanel 是第二种）。",
  );

  // 裸字面量绕道：`SiteCatalogConsole.tsx` 里的 `id: "agent"` 是目录页的 GoalApp 卡片，
  // 与抽屉无关，所以这条只在 plugin-chrome 目录内查（定义字面量的那份除外）。
  for (const rel of files.filter(
    (candidate) =>
      candidate.startsWith("src/shell/plugin-chrome/") &&
      !candidate.endsWith("agent-drawer.ts"),
  )) {
    assert.doesNotMatch(
      source(rel),
      /id:\s*["']agent["']/,
      `${rel} 不许用裸 "agent" 字面量注册面板，要从 agent-drawer.ts 取 PLUGIN_AGENT_DRAWER_ID`,
    );
  }
});

test("stage 不许加 inert 或 pointer-events-none（P3 结构性承诺）", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  const stageBlock = frameSrc.slice(
    frameSrc.indexOf("data-plugin-chrome-stage"),
    frameSrc.indexOf("</main>", frameSrc.indexOf("data-plugin-chrome-stage")),
  );
  assert.doesNotMatch(stageBlock, /\binert\b/);
  assert.doesNotMatch(stageBlock, /pointer-events-none/);
  assert.doesNotMatch(stageBlock, /aria-hidden/);
});

// ── 反面 Canary：摘掉下列任一实现，对应断言必须红 ─────────────────

test("反面 Canary：无 data-edit-bar-agent 时必须红", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(frameSrc, /data-edit-bar-agent/);
  assert.match(frameSrc, /usePluginChromeLayout/);
  assert.match(frameSrc, /AdvancedLayoutContext\.Provider value=\{layout\}/);
});

test("反面 Canary：允许插件 override agent 面板时必须红", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(frameSrc, /filter\(\(panel\) => panel\.id !== PLUGIN_AGENT_DRAWER_ID\)/);
});

test("反面 Canary：stage 加遮挡时必须红", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.doesNotMatch(
    source("src/shell/plugin-chrome/PluginChromeFrame.tsx"),
    /data-plugin-chrome-stage[\s\S]*pointer-events-none/,
  );
});
