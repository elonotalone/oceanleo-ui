import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useEffect, useMemo, useState } from "react";

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
  url: "https://image.oceanleo.com/workspace/poster",
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
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
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
window.HTMLElement.prototype.scrollTo = function scrollTo() {};

const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

async function createMounted(Component, props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(target) {
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
  }
`);
const iconsStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  function Icon({ name, className }) {
    return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
  }
  export function IconLibrary(props) { return Icon({ name: "library", ...props }); }
  export function IconSparkles(props) { return Icon({ name: "agent", ...props }); }
  export function IconWorkspace(props) { return Icon({ name: "ops", ...props }); }
`);
const workspaceActionsStubUrl = dataModule(`
  export const WORKSPACE_ACTION_EVENT = "oceanleo:test-workspace-action";
  export function dispatchWorkspaceAction() {}
  export function normalizeWorkspaceAction() { return null; }
`);
const editBarDockHostStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function EditBarDockHost({ hostRef, presentation }) {
    return jsx("div", {
      ref: hostRef,
      hidden: !presentation,
      "data-workspace-edit-bar-dock": true
    });
  }
`);

const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "./icons": iconsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./EditBarDockHost": editBarDockHostStubUrl,
});
const {
  SplitWorkspace,
  useLeftPaneSlot,
  useWorkspacePane,
} = await import(splitUrl);

test("3/7 PaneHeader keeps app identity before controls and pane actions", async () => {
  function SlotControls() {
    const slot = useLeftPaneSlot();
    useEffect(() => {
      const controls = React.createElement(
        "div",
        { "data-test-toolbar-controls": true, className: "flex shrink-0" },
        React.createElement("button", { type: "button" }, "controls"),
      );
      slot?.setLeftLabel("toolbar-controls", controls);
      return () => slot?.setLeftLabel("toolbar-controls", null);
    }, [slot]);
    return React.createElement("div", { "data-left-body": true });
  }

  const identity = React.createElement(
    "div",
    {
      "data-test-app-identity": true,
      className: "flex min-w-0 flex-1 overflow-hidden",
    },
    React.createElement("button", {
      type: "button",
      "aria-label": "返回 App 目录",
    }),
    React.createElement(
      "span",
      { className: "min-w-0 flex-1 truncate" },
      "🪧 一个非常长但必须截断的海报生成 App 标题",
    ),
  );
  const mounted = await createMounted(SplitWorkspace, {
    left: React.createElement(SlotControls),
    right: React.createElement("div", { "data-right-body": true }),
    leftLabel: identity,
    rightLabel: "结果",
    defaultRatio: 3 / 7,
    headerHeight: 0,
  });
  try {
    const root = mounted.container.querySelector("[data-workspace-split]");
    const leftPane = root.querySelector('[data-workspace-pane="left"]');
    const rightPane = root.querySelector('[data-workspace-pane="main"]');
    const header = leftPane.querySelector("[data-pane-header]");
    const toolbar = header.querySelector("[data-workbench-toolbar]");
    const identityRegion = toolbar.querySelector(
      "[data-workbench-toolbar-identity]",
    );
    const controlsRegion = toolbar.querySelector(
      "[data-workbench-toolbar-controls]",
    );

    assert.ok(toolbar.compareDocumentPosition(identityRegion) & Node.DOCUMENT_POSITION_CONTAINED_BY);
    assert.ok(
      identityRegion.compareDocumentPosition(controlsRegion) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
    assert.match(toolbar.className, /\bflex-nowrap\b/);
    assert.match(toolbar.className, /\boverflow-hidden\b/);
    assert.match(identityRegion.className, /\bmin-w-0\b/);
    assert.match(identityRegion.className, /\bflex-1\b/);
    assert.match(controlsRegion.className, /\bshrink-0\b/);
    assert.match(header.className, /\bflex-nowrap\b/);
    assert.match(header.className, /\boverflow-hidden\b/);
    assert.ok(Math.abs(Number.parseFloat(leftPane.style.flexBasis) - (300 / 7)) < 0.001);
    assert.equal(
      leftPane.querySelectorAll('button[aria-label="这一栏切大屏"]').length,
      1,
    );
    assert.equal(
      rightPane.querySelectorAll('button[aria-label="这一栏切大屏"]').length,
      1,
    );
  } finally {
    await mounted.unmount();
  }
});

const identityProviderStubUrl = dataModule(`
  export function GuideProvider({ children }) { return children; }
  export function OperatorRemarkProvider({ children }) { return children; }
`);
const studioStubUrl = dataModule(`
  import { jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function Studio({ ops, canvas, opsLabel, headerHeight }) {
    return jsxs("section", {
      "data-studio": "true",
      "data-header-height": String(headerHeight),
      children: [
        jsxs("header", { "data-left-pane-header": "true", children: [opsLabel] }),
        jsxs("main", { children: [ops, canvas] })
      ]
    });
  }
`);
const directoryStubUrl = dataModule(`
  export function AppDirectory() { return null; }
`);
const homeCardsStubUrl = dataModule(`
  export function promptCardsForSite() { return []; }
`);
const hydrationStubUrl = dataModule(`
  export function useWorkspaceRuntimeHydration() { return null; }
`);
// 功能按键条（H 波）不是本文件的被测对象：这里判的是左侧 PaneHeader 里的 app 身份。
// 给一份「这个 app 没有功能按钮」的替身，等价于按键条出现之前的形状，四条断言的
// 前提（`data-header-height` 为 0）因此原样成立。
const capabilityEntryStubUrl = dataModule(`
  export function appCapabilityEntries() { return []; }
`);
const capabilityBarStubUrl = dataModule(`
  export const APP_CAPABILITY_BAR_HEIGHT = 40;
  export function AppCapabilityBar() { return null; }
`);
const capabilityContextStubUrl = dataModule(`
  export function AppCapabilityEntryProvider({ children }) { return children; }
`);
const operatorUrl = await compileModule("src/shell/OperatorConsole.tsx", {
  "./Studio": studioStubUrl,
  "./AppDirectory": directoryStubUrl,
  "./guide-context": identityProviderStubUrl,
  "./home-cards": homeCardsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./OperatorRemark": identityProviderStubUrl,
  "./workspace-runtime-hydration": hydrationStubUrl,
  "./app-capability-entry": capabilityEntryStubUrl,
  "./AppCapabilityBar": capabilityBarStubUrl,
  "./app-capability-context": capabilityContextStubUrl,
  "../lib/app-icon-image": dataModule(
    `export function appIconThumbSrc(){ return ""; }`,
  ),
});
const { OperatorConsole } = await import(operatorUrl);

test("OperatorConsole renders back, icon and title inside the left PaneHeader only", async () => {
  const changes = [];
  const mounted = await createMounted(OperatorConsole, {
    functions: [
      {
        id: "poster",
        label: "海报生成",
        icon: "🪧",
        agentId: "image.poster",
        ops: React.createElement("div", { "data-ops": true }),
        canvas: React.createElement("div", { "data-canvas": true }),
      },
    ],
    value: "poster",
    onChange: (id) => changes.push(id),
    directory: true,
    defaultRatio: 3 / 7,
  });
  try {
    const studio = mounted.container.querySelector("[data-studio]");
    const paneHeader = studio.querySelector("[data-left-pane-header]");
    const identity = paneHeader.querySelector("[data-workbench-app-identity]");
    const back = identity.querySelector('button[aria-label="返回 App 目录"]');
    const icon = identity.querySelector("[data-workbench-app-icon]");
    const title = identity.querySelector("[data-workbench-app-title]");

    assert.ok(back);
    assert.equal(back.textContent, "");
    assert.equal(icon.textContent, "🪧");
    assert.equal(title.textContent, "海报生成");
    assert.match(title.className, /\btruncate\b/);
    assert.equal(identity.textContent, "🪧海报生成");
    assert.equal(studio.dataset.headerHeight, "0");
    assert.equal(mounted.container.textContent.includes("✦ agent"), false);
    assert.equal(
      mounted.container.querySelectorAll("[data-workbench-app-identity]").length,
      1,
    );
    await click(back);
    assert.deepEqual(changes, [""]);
  } finally {
    await mounted.unmount();
  }
});

const workspaceSessionStubUrl = dataModule(`
  export function useOptionalWorkspaceSession() {
    return globalThis.__workbenchToolbarWorkspace || null;
  }
`);
// 桩必须导全 `RestartDraftButton.tsx:16` 那一行 import 的每一个名字。少一个不是少一条
// 断言：模块解析在测试结束之后才炸，走 uncaughtException，整份文件被记成一条红，
// 而上面两条其实是绿的（`_COMMON.md` §7b⑩）。`3f90bd2` 已经因为同一族缺陷把这份
// 测试从 4 条断言吃到 2 条一次了；`ba484b4` 把 import 从 `historySessionHref` 换成
// `workspaceAppHref`（重开后回 app 的 live 工作台，不再凭空建 /history/<id>）又吃了
// 一次——X4-b 对齐。桩的形状照真函数：`/workspace/<appId>`。
const routerStubUrl = dataModule(`
  export function useRouter() {
    return { replace(value) { globalThis.__workbenchToolbarRoute = value; } };
  }
  export function usePathname() {
    return globalThis.__workbenchToolbarPathname || "";
  }
`);
const routeStubUrl = dataModule(`
  export function workspaceAppHref(appId, _route, _pathname) {
    return appId ? "/workspace/" + encodeURIComponent(appId) : "/workspace";
  }
`);
const restartUrl = await compileModule("src/shell/RestartDraftButton.tsx", {
  "next/navigation": routerStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./WorkspaceSession": workspaceSessionStubUrl,
  "./workspace-route": routeStubUrl,
});
const paneSlotStubUrl = dataModule(`
  export function useLeftPaneSlot() {
    return globalThis.__workbenchToolbarSlot || null;
  }
  export function useRegisterConsoleAgentFocus() {}
  export function useConsoleAgentFocus() {
    return null;
  }
`);
const guideStubUrl = dataModule(`
  export function useRegisterOpsFiller() {}
  export function useGuideWorkflows() {
    return globalThis.__workbenchGuideWorkflows || null;
  }
  export function FillNonceProvider({ children }) { return children; }
`);
const attachmentsStubUrl = dataModule(`
  export function useAttachments() {
    return {
      attachments: [],
      composerAttachments: [],
      uploading: false,
      ready() { return []; },
      clear() {},
      restoreReady() {},
      handleAttachFiles() {},
      removeAttachment() {}
    };
  }
`);
const agentStubUrl = dataModule(`
  export async function createTask() { return { ok: false }; }
  export async function branchTask() { return { ok: false }; }
  export async function followUp() { return { ok: true }; }
  export async function getTask() { return { ok: false }; }
  export async function stopTask() { return { ok: true }; }
  // 编辑器指令执行完把结果回报给会话（真实定义在 src/lib/agent.ts）。
  // 这份假模块要跟着真模块的导出走，否则整份测试在加载期就抛。
  export async function reportEditorCommandResult() { return { ok: true }; }
`);
const snapshotStubUrl = dataModule(`
  export function mergeWorkspaceSessionSnapshot(runtime) { return runtime || {}; }
  export function splitWorkspaceSessionSnapshot(snapshot) {
    return { runtime: snapshot || {}, ui: null };
  }
`);
const remarkStubUrl = dataModule(`
  export function OperatorRemarkField() { return null; }
  export function useOperatorRemark() {
    return { remark: "", setRemark() {} };
  }
`);
const appendRemarkStubUrl = dataModule(`
  export function appendOperatorRemark(prompt) { return prompt; }
`);
const agentProgressStubUrl = dataModule(`
  export function activeAgentProgressKey() { return null; }
  export function buildAgentRenderItems() { return []; }
  export function sameAgentMessages() { return true; }
  export function takeUnreportedAgentArtifacts() { return []; }
`);
const visualStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AgentTranscriptBubble() { return null; }
  export function AgentProgress() { return null; }
  export function LeoComposer() { return jsx("div", { "data-composer": "true" }); }
`);
const agentReviewStubUrl = dataModule(`
  export function readAgentCommandSurface() { return null; }
  export function AgentReviewDock() { return null; }
  export function assembleAgentEditorContext() { return null; }
  export function readAgentSelection() { return null; }
  export function readMentionCatalog() { return []; }
  export function refreshAgentSelectionFromDom() {}
  export function installAgentReviewGate() {}
  export function installSelectionBridge() {}
`);
const functionAgentStubs = {
  "./AgentTranscriptBubble": visualStubUrl,
  "./AgentProgress": visualStubUrl,
  "./LeoComposer": visualStubUrl,
  "./icons": iconsStubUrl,
  "./guide-context": guideStubUrl,
  "./useAttachments": attachmentsStubUrl,
  "../lib/agent": agentStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./WorkspaceSession": workspaceSessionStubUrl,
  "./RestartDraftButton": restartUrl,
  "./workspace-runtime-hydration": hydrationStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./workspace-session-snapshot": snapshotStubUrl,
  "./OperatorRemark": remarkStubUrl,
  "../lib/operator-remark": appendRemarkStubUrl,
  "../lib/agent-progress": agentProgressStubUrl,
  "./agent-review/surface": agentReviewStubUrl,
  "./agent-review/dock": agentReviewStubUrl,
  "./agent-review/selection-bridge": agentReviewStubUrl,
  "./agent-review/inbox": agentReviewStubUrl,
  "./agent-review/selection-live": agentReviewStubUrl,
  "./agent-review/install": agentReviewStubUrl,
};
const functionAgentUrl = await compileModule(
  "src/shell/FunctionAgentChat.tsx",
  {
    ...functionAgentStubs,
    "./SplitWorkspace": paneSlotStubUrl,
  },
);
const { FunctionAgentChat } = await import(functionAgentUrl);

test("mode widths swap with selection while Save and New stay icon-only", async () => {
  globalThis.__workbenchToolbarWorkspace = {
    mode: "live",
    siteId: "image",
    appId: "poster",
    appTitle: "海报生成",
    availability: "ready",
    readOnly: false,
    session: null,
    sessionId: null,
    taskId: null,
    restartFeedback: null,
    async saveSnapshot() {
      return { ok: true };
    },
    async restart() {
      return "archived";
    },
  };
  let resolveSave;
  globalThis.__workbenchGuideWorkflows = {
    saveWorkflow() {
      return new Promise((resolvePromise) => {
        resolveSave = resolvePromise;
      });
    },
  };

  function Harness() {
    const [toolbar, setToolbar] = useState(null);
    const slot = useMemo(
      () => ({
        setLeftLabel(_owner, node) {
          setToolbar(node);
        },
      }),
      [],
    );
    globalThis.__workbenchToolbarSlot = slot;
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("header", { "data-chat-pane-header": true }, toolbar),
      React.createElement(FunctionAgentChat, {
        agentId: "image.poster",
        siteId: "image",
        schema: {
          agentId: "image.poster",
          title: "海报生成",
          fields: [{ key: "prompt", label: "提示词" }],
        },
        opsContent: React.createElement("div", null, "ops body"),
        getOpsState: () => ({ prompt: "生成一张海报" }),
        onApplyPatch() {},
        appLabel: "海报生成",
        appIcon: "🪧",
      }),
    );
  }

  const mounted = await createMounted(Harness, {});
  try {
    const header = mounted.container.querySelector("[data-chat-pane-header]");
    let ops = header.querySelector('[data-workbench-mode="ops"]');
    let agent = header.querySelector('[data-workbench-mode="agent"]');
    let save = header.querySelector(
      '[data-workbench-action="save-inspiration"]',
    );
    const restart = header.querySelector('[data-workbench-action="new"]');

    assert.equal(ops.dataset.width, "selected");
    assert.equal(ops.textContent, "操作台");
    assert.match(ops.className, /\bpx-2\b/);
    assert.equal(agent.dataset.width, "compact");
    assert.equal(agent.textContent, "");
    assert.match(agent.className, /\bw-7\b/);
    assert.equal(save.textContent, "");
    assert.equal(restart.textContent, "");
    assert.match(save.className, /\bh-7\b/);
    assert.match(save.className, /\bw-7\b/);
    assert.match(restart.className, /\bh-7\b/);
    assert.match(restart.className, /\bw-7\b/);
    assert.equal(save.getAttribute("aria-label"), "保存此灵感");
    assert.equal(restart.getAttribute("aria-label"), "新建");
    assert.ok(save.getAttribute("title"));
    assert.ok(restart.getAttribute("title"));

    await click(agent);
    ops = header.querySelector('[data-workbench-mode="ops"]');
    agent = header.querySelector('[data-workbench-mode="agent"]');
    assert.equal(ops.dataset.width, "compact");
    assert.equal(ops.textContent, "");
    assert.match(ops.className, /\bw-7\b/);
    assert.equal(agent.dataset.width, "selected");
    assert.equal(agent.textContent, "agent");
    assert.match(agent.className, /\bpx-2\b/);

    save = header.querySelector('[data-workbench-action="save-inspiration"]');
    await click(save);
    save = header.querySelector('[data-workbench-action="save-inspiration"]');
    assert.equal(save.dataset.state, "saving");
    assert.equal(save.getAttribute("aria-busy"), "true");
    assert.equal(save.getAttribute("aria-label"), "正在保存灵感");
    assert.equal(save.textContent, "");

    await act(async () => {
      resolveSave({ id: "saved-inspiration" });
      await Promise.resolve();
    });
    save = header.querySelector('[data-workbench-action="save-inspiration"]');
    assert.equal(save.dataset.state, "saved");
    assert.equal(save.getAttribute("aria-label"), "已保存灵感");
    assert.equal(save.textContent, "");
  } finally {
    await mounted.unmount();
    delete globalThis.__workbenchToolbarSlot;
    delete globalThis.__workbenchToolbarWorkspace;
    delete globalThis.__workbenchGuideWorkflows;
  }
});

test("narrow viewport contract never wraps chrome or sacrifices essential controls", async () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 320,
  });
  const operatorSource = await readFile(
    new URL("../src/shell/OperatorConsole.tsx", import.meta.url),
    "utf8",
  );
  const splitSource = await readFile(
    new URL("../src/shell/SplitWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const chatSource = await readFile(
    new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
    "utf8",
  );

  assert.match(operatorSource, /data-workbench-app-title[\s\S]*?\btruncate\b/);
  assert.doesNotMatch(operatorSource, /\btopBar\b|TABS_BAR_HEIGHT|✦ agent|<BackButton/);
  assert.match(
    splitSource,
    /data-workbench-toolbar[\s\S]*?flex-nowrap[\s\S]*?overflow-hidden/,
  );
  assert.match(
    splitSource,
    /data-workbench-toolbar-identity[\s\S]*?min-w-0[\s\S]*?flex-1[\s\S]*?overflow-hidden/,
  );
  assert.match(
    splitSource,
    /data-workbench-toolbar-controls[\s\S]*?shrink-0[\s\S]*?flex-nowrap/,
  );
  assert.match(splitSource, /data-workspace-split[\s\S]*?md:flex/);
  assert.match(chatSource, /data-workbench-primary-controls[\s\S]*?flex-nowrap/);
  assert.match(chatSource, /data-width=\{selected \? "selected" : "compact"\}/);
  assert.match(splitSource, /setLeftLabel\(owner,/);
  assert.match(splitSource, /ConsoleAgentFocusCtx/);
  assert.match(splitSource, /focusAgent\(\)/);
  assert.match(chatSource, /useRegisterConsoleAgentFocus\(showOps,/);
});

const functionAgentOnSplitUrl = await compileModule(
  "src/shell/FunctionAgentChat.tsx",
  {
    ...functionAgentStubs,
    "./SplitWorkspace": splitUrl,
  },
);
const { FunctionAgentChat: FunctionAgentOnSplit } = await import(
  functionAgentOnSplitUrl
);

const fallbackAgentPanelStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function PluginAgentPanel({ editorId }) {
    return jsx("div", { "data-test-fallback-agent-panel": editorId });
  }
`);
const panelsUrl = await compileModule("src/shell/use-inline-advanced-panels.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./SplitWorkspace": splitUrl,
  "./plugin-chrome/PluginAgentPanel": fallbackAgentPanelStubUrl,
  "./InlineEditorMaterialPanel": dataModule(
    `export function InlineEditorMaterialPanel(){ return null; }`,
  ),
  "./plugin-theme": dataModule(`
    export function PluginThemeScope({ children }) { return children; }
  `),
  "./inline-advanced-shell-helpers": dataModule(`
    export function resolveInlineAdvancedDrawers() { return []; }
    export function resolveActiveMaterialAction() { return undefined; }
  `),
});
const { useInlineAdvancedPanels } = await import(panelsUrl);

const deckItem = {
  key: "deck-1",
  source: "creation",
  id: "deck-1",
  title: "项目方案PPT",
  kind: "deck",
  siteId: "slides",
  favorite: false,
  meta: {},
};
const deckAdapter = {
  id: "deck",
  label: "PPT 生成",
  stage: null,
};

function appIdentity() {
  return React.createElement(
    "div",
    { "data-workbench-app-identity": true },
    React.createElement(
      "span",
      { "data-workbench-app-title": true },
      "项目方案PPT",
    ),
  );
}

function consoleChat(extra = {}) {
  return React.createElement(FunctionAgentOnSplit, {
    agentId: extra.agentId || "slides.deck",
    siteId: "slides",
    schema: {
      agentId: extra.agentId || "slides.deck",
      title: "PPT 生成",
      fields: [{ key: "prompt", label: "提示词" }],
      actions: [],
    },
    opsContent:
      extra.opsContent === undefined
        ? React.createElement("div", { "data-ops-body": true }, "ops body")
        : extra.opsContent,
    showOps: extra.showOps !== false,
    defaultTab: extra.defaultTab || "ops",
  });
}

function AgentOpenTrigger() {
  const pane = useWorkspacePane();
  const { openDrawer } = useInlineAdvancedPanels({
    adapter: deckAdapter,
    item: deckItem,
    siteId: "slides",
    accent: "#4f46e5",
    ownerId: "test-inline",
    pluginThemeId: null,
    workbenchMaterials: null,
    showWorkspaceDetail: pane?.showDetail,
    clearWorkspaceDetail: pane?.clearDetail,
  });
  return React.createElement(
    "div",
    { "data-right-trigger": true },
    React.createElement(
      "button",
      {
        type: "button",
        "data-test-open-agent": true,
        onClick: () => openDrawer("agent"),
      },
      "open agent",
    ),
    pane?.detail
      ? React.createElement("div", {
          "data-test-active-detail": pane.detail.id,
        })
      : null,
  );
}

test("openDrawer(agent) focuses the existing showOps console — no B/C second tree", async () => {
  const mounted = await createMounted(SplitWorkspace, {
    left: consoleChat(),
    right: React.createElement(AgentOpenTrigger),
    leftLabel: appIdentity(),
    rightLabel: "结果",
    headerHeight: 0,
  });
  try {
    const leftPane = mounted.container.querySelector(
      '[data-workspace-pane="left"]',
    );
    const openBtn = mounted.container.querySelector("[data-test-open-agent]");
    assert.ok(leftPane.querySelector("[data-workbench-mode-switch]"));
    await click(openBtn);
    assert.equal(
      mounted.container.querySelector("[data-test-active-detail]"),
      null,
      "有 handler 时不许产生 activeDetail（B）",
    );
    assert.equal(leftPane.getAttribute("data-left-panel"), "app");
    assert.equal(
      mounted.container.querySelector("[data-test-fallback-agent-panel]"),
      null,
    );
    const modeSwitch = leftPane.querySelector("[data-workbench-mode-switch]");
    assert.ok(modeSwitch, "header 切换键必须还在（C 不许发生）");
    const agent = modeSwitch.querySelector('[data-workbench-mode="agent"]');
    assert.equal(agent.getAttribute("data-selected"), "true");
    assert.match(
      leftPane.textContent,
      /想自己精细操控/,
      "操作台提示行必须还在",
    );
  } finally {
    await mounted.unmount();
  }
});

test("drawer open/close cycle keeps [data-workbench-primary-controls] (slot owner)", async () => {
  function CycleHarness({ showSecond }) {
    return React.createElement(SplitWorkspace, {
      left: React.createElement(
        React.Fragment,
        null,
        consoleChat(),
        showSecond
          ? consoleChat({
              agentId: "slides.deck-fallback",
              showOps: false,
              defaultTab: "agent",
              opsContent: null,
            })
          : null,
      ),
      right: React.createElement("div", { "data-right-body": true }),
      leftLabel: appIdentity(),
      rightLabel: "结果",
      headerHeight: 0,
    });
  }

  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(CycleHarness, { showSecond: true }));
    });
    assert.ok(
      container.querySelector("[data-workbench-primary-controls]"),
      "第二棵 showOps=false 树不得清掉第一棵的 header 控件",
    );
    await act(async () => {
      root.render(React.createElement(CycleHarness, { showSecond: false }));
    });
    assert.ok(
      container.querySelector("[data-workbench-primary-controls]"),
      "抽屉关上一轮之后 primary-controls 必须还在",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("openDrawer(agent) without a focus handler still mounts a usable AI panel", async () => {
  const mounted = await createMounted(SplitWorkspace, {
    left: React.createElement("div", { "data-left-empty": true }),
    right: React.createElement(AgentOpenTrigger),
    leftLabel: appIdentity(),
    rightLabel: "结果",
    headerHeight: 0,
  });
  try {
    await click(mounted.container.querySelector("[data-test-open-agent]"));
    const detail = mounted.container.querySelector("[data-test-active-detail]");
    assert.ok(detail, "没有 handler 时必须仍给出 AI 面板");
    assert.equal(detail.getAttribute("data-test-active-detail"), "agent");
    const leftPane = mounted.container.querySelector(
      '[data-workspace-pane="left"]',
    );
    assert.equal(leftPane.getAttribute("data-left-panel"), "tool-detail");
    assert.ok(
      mounted.container.querySelector("[data-test-fallback-agent-panel]"),
      "兜底内容必须是 PluginAgentPanel",
    );
    assert.match(leftPane.textContent, /AI 助手/);
  } finally {
    await mounted.unmount();
  }
});
