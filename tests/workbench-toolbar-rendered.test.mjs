import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useEffect, useMemo, useState } from "react";
import ts from "typescript";

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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileTsxUrl(relativePath, replacements = {}) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    ...replacements,
  })) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

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

const splitUrl = await compileTsxUrl("src/shell/SplitWorkspace.tsx", {
  "./icons": iconsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./EditBarDockHost": editBarDockHostStubUrl,
});
const {
  SplitWorkspace,
  useLeftPaneSlot,
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
      slot?.setLeftLabel(controls);
      return () => slot?.setLeftLabel(null);
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
const operatorUrl = await compileTsxUrl("src/shell/OperatorConsole.tsx", {
  "./Studio": studioStubUrl,
  "./AppDirectory": directoryStubUrl,
  "./guide-context": identityProviderStubUrl,
  "./home-cards": homeCardsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./OperatorRemark": identityProviderStubUrl,
  "./workspace-runtime-hydration": hydrationStubUrl,
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
const routerStubUrl = dataModule(`
  export function useRouter() {
    return { replace(value) { globalThis.__workbenchToolbarRoute = value; } };
  }
`);
const routeStubUrl = dataModule(`
  export function historySessionHref(id) { return "/history/" + id; }
`);
const restartUrl = await compileTsxUrl("src/shell/RestartDraftButton.tsx", {
  "next/navigation": routerStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./WorkspaceSession": workspaceSessionStubUrl,
  "./workspace-route": routeStubUrl,
});
const paneSlotStubUrl = dataModule(`
  export function useLeftPaneSlot() {
    return globalThis.__workbenchToolbarSlot || null;
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
const functionAgentUrl = await compileTsxUrl(
  "src/shell/FunctionAgentChat.tsx",
  {
    "./AgentTranscriptBubble": visualStubUrl,
    "./AgentProgress": visualStubUrl,
    "./LeoComposer": visualStubUrl,
    "./SplitWorkspace": paneSlotStubUrl,
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
    const slot = useMemo(() => ({ setLeftLabel: setToolbar }), []);
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
});
