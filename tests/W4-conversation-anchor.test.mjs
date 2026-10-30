/**
 * W4 — left conversation column fill / composer dock.
 *
 * Screenshot 20261020T125507Z: empty assistant intro + composer mid-column,
 * dead space below. The column must consume pane height; the transcript
 * scrolls; the composer stays last and focusable. jsdom cannot paint flex,
 * so this asserts the rendered DOM contract (order, classes, accessibility),
 * not pixel boxes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act, useEffect, useRef } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  AGENT_COMPOSER_DOCK_ATTR,
  AGENT_COMPOSER_DOCK_CLASS,
  AGENT_CONVERSATION_ATTR,
  AGENT_CONVERSATION_COLUMN_CLASS,
  AGENT_CONVERSATION_HOST_STRETCH_CLASS,
  AGENT_CONVERSATION_SCROLL_ATTR,
  AGENT_CONVERSATION_SCROLL_CLASS,
} from "../src/shell/agent-conversation-layout.ts";

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
  url: "https://oceanleo.com/library",
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
  PointerEvent: window.PointerEvent || window.MouseEvent,
  localStorage: window.localStorage,
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
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
  }
`);
const composerStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function LeoComposer() {
    return jsx("div", {
      "data-oceanleo-leo-entry-root": "",
      children: jsx("textarea", { "aria-label": "composer", rows: 1 }),
    });
  }
`);
const visualStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AgentTranscriptBubble({ message }) {
    return jsx("div", { "data-agent-bubble": message.role }, message.content || "");
  }
  export function AgentProgress() { return null; }
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
      removeAttachment() {},
    };
  }
`);
const agentStubUrl = dataModule(`
  export async function createTask() { return { ok: false }; }
  export async function branchTask() { return { ok: false }; }
  export async function followUp() { return { ok: true }; }
  export async function getTask() { return { ok: false }; }
  export async function stopTask() { return { ok: true }; }
  export async function reportEditorCommandResult() { return { ok: true }; }
`);
const paneSlotStubUrl = dataModule(`
  export function useLeftPaneSlot() { return null; }
  export function useRegisterConsoleAgentFocus() {}
  export function useConsoleAgentFocus() { return null; }
`);
const guideStubUrl = dataModule(`
  export function useRegisterOpsFiller() {}
  export function useGuideWorkflows() { return null; }
  export function FillNonceProvider({ children }) { return children; }
`);
const workspaceSessionStubUrl = dataModule(`
  export function useOptionalWorkspaceSession() { return null; }
  export function useRegisterWorkspaceSessionSchemaVersion() {}
`);
const hydrationStubUrl = dataModule(`
  export function useWorkspaceRuntimeHydration() { return null; }
`);
const remarkStubUrl = dataModule(`
  export function OperatorRemarkField() { return null; }
  export function useOperatorRemark() { return { remark: "", setRemark() {} }; }
`);
const reviewStubUrl = dataModule(`
  export function readAgentCommandSurface() { return null; }
  export function AgentReviewDock() { return null; }
  export function assembleAgentEditorContext() { return ""; }
  export function readAgentSelection() { return null; }
  export function readMentionCatalog() { return []; }
  export function refreshAgentSelectionFromDom() {}
  export function installAgentReviewGate() {}
  export function installSelectionBridge() {}
`);

const functionAgentUrl = await compileModule("src/shell/FunctionAgentChat.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./LeoComposer": composerStubUrl,
  "./AgentTranscriptBubble": visualStubUrl,
  "./AgentProgress": visualStubUrl,
  "./SplitWorkspace": paneSlotStubUrl,
  "./guide-context": guideStubUrl,
  "./useAttachments": attachmentsStubUrl,
  "../lib/agent": agentStubUrl,
  "./WorkspaceSession": workspaceSessionStubUrl,
  "./RestartDraftButton": dataModule("export function RestartDraftButton(){ return null; }"),
  "./workspace-runtime-hydration": hydrationStubUrl,
  "./workspace-actions": dataModule(`
    export const WORKSPACE_ACTION_EVENT = "oceanleo-workspace-action";
    export function dispatchWorkspaceAction() {}
    export function normalizeWorkspaceAction() { return null; }
  `),
  "./workspace-session-snapshot": dataModule(`
    export function mergeWorkspaceSessionSnapshot(runtime) { return runtime || {}; }
    export function splitWorkspaceSessionSnapshot(snapshot) {
      return { runtime: snapshot || {}, ui: null };
    }
  `),
  "./OperatorRemark": remarkStubUrl,
  "../lib/operator-remark": dataModule("export function appendOperatorRemark(prompt){ return prompt; }"),
  "../lib/agent-progress": dataModule(`
    export function activeAgentProgressKey() { return null; }
    export function liveAgentProgressKey() { return ""; }
    export function buildAgentRenderItems() { return []; }
    export function sameAgentMessages() { return true; }
    export function takeUnreportedAgentArtifacts() { return []; }
  `),
  "./agent-review/surface": reviewStubUrl,
  "./agent-review/dock": reviewStubUrl,
  "./agent-review/selection-bridge": reviewStubUrl,
  "./agent-review/inbox": reviewStubUrl,
  "./agent-review/selection-live": reviewStubUrl,
  "./agent-review/install": reviewStubUrl,
});
const { FunctionAgentChat } = await import(functionAgentUrl);

const pluginPanelUrl = await compileModule(
  "src/shell/plugin-chrome/PluginAgentPanel.tsx",
  {
    "../../i18n/ui/useUI": uiStubUrl,
    "../FunctionAgentChat": dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function FunctionAgentChat({ schema }) {
        return jsx("div", {
          "data-fn-agent-tab": "agent",
          "data-agent-conversation": "",
          className: ${JSON.stringify(AGENT_CONVERSATION_COLUMN_CLASS)},
          children: [
            jsx("div", {
              key: "scroll",
              "data-agent-conversation-scroll": "",
              className: ${JSON.stringify(AGENT_CONVERSATION_SCROLL_CLASS)},
              children: schema.title,
            }),
            jsx("div", {
              key: "dock",
              "data-agent-composer-dock": "",
              className: ${JSON.stringify(AGENT_COMPOSER_DOCK_CLASS)},
              children: jsx("textarea", { "aria-label": "composer" }),
            }),
          ],
        });
      }
    `),
  },
);
const { PluginAgentPanel } = await import(pluginPanelUrl);

const drawerUrl = await compileModule(
  "src/shell/plugin-chrome/agent-drawer-panel.tsx",
  {
    "./PluginAgentPanel": dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function PluginAgentPanel(props) {
        return jsx("div", { "data-plugin-agent-panel": props.editorId, "data-agent-conversation": "" });
      }
    `),
  },
);
const { createPluginAgentDrawer } = await import(drawerUrl);

const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./icons": dataModule("export function IconLibrary(){ return null; }"),
  "./EditBarDockHost": dataModule("export function EditBarDockHost(){ return null; }"),
});
const { SplitWorkspace, useWorkspacePane } = await import(splitUrl);

const schema = {
  agentId: "editor.richdoc",
  title: "AI 助手",
  fields: [],
  actions: [],
};

function hasAllClasses(el, classString) {
  const needed = classString.split(/\s+/).filter(Boolean);
  const got = new Set(String(el?.className || "").split(/\s+/));
  return needed.every((name) => got.has(name));
}

function assertComposerAccessible(column, note) {
  const dock = column.querySelector(`[${AGENT_COMPOSER_DOCK_ATTR}]`);
  const field = dock?.querySelector("textarea, input, [contenteditable='true']");
  assert.ok(dock, `${note}: composer dock present`);
  assert.ok(field, `${note}: dock has a keyboard field`);
  assert.equal(field.disabled, false, `${note}: field not disabled`);
  assert.notEqual(field.getAttribute("tabindex"), "-1", `${note}: field stays tabbable`);
  for (let node = field; node && node !== column.parentElement; node = node.parentElement) {
    assert.equal(node.hasAttribute("inert"), false, `${note}: no inert on ${node.tagName}`);
    assert.notEqual(node.getAttribute("aria-hidden"), "true", `${note}: no aria-hidden on ${node.tagName}`);
  }
}

function conversationColumn(root) {
  return Array.from(root.querySelectorAll(`[${AGENT_CONVERSATION_ATTR}]`)).find(
    (el) => el.querySelector(`:scope > [${AGENT_COMPOSER_DOCK_ATTR}]`),
  );
}

function assertConversationContract(root, note) {
  const column = conversationColumn(root);
  assert.ok(column, `${note}: conversation column`);
  assert.ok(
    hasAllClasses(column, AGENT_CONVERSATION_COLUMN_CLASS),
    `${note}: column fill classes`,
  );
  const scroll = column.querySelector(`[${AGENT_CONVERSATION_SCROLL_ATTR}]`);
  const dock = column.querySelector(`[${AGENT_COMPOSER_DOCK_ATTR}]`);
  assert.ok(scroll, `${note}: scroll region`);
  assert.ok(dock, `${note}: composer dock`);
  assert.ok(
    hasAllClasses(scroll, AGENT_CONVERSATION_SCROLL_CLASS),
    `${note}: scroll takes leftover height`,
  );
  assert.ok(
    hasAllClasses(dock, AGENT_COMPOSER_DOCK_CLASS),
    `${note}: dock is pinned, not mid-column`,
  );
  assert.equal(
    column.lastElementChild,
    dock,
    `${note}: dock is the last child so empty intro cannot push it into the gap below`,
  );
  assert.ok(
    scroll.compareDocumentPosition(dock) & window.Node.DOCUMENT_POSITION_FOLLOWING,
    `${note}: long threads scroll above the dock`,
  );
  assert.doesNotMatch(
    String(column.className),
    /\bmd:(absolute|top-|translate)/,
    `${note}: compact widths keep the same column, not a relocated dock`,
  );
  assertComposerAccessible(column, note);
}

async function mount(node) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("W4 empty assistant: conversation fills and composer docks last", async () => {
  const view = await mount(
    React.createElement(FunctionAgentChat, {
      agentId: "editor.richdoc",
      siteId: "website",
      schema,
      opsContent: null,
      showOps: false,
      defaultTab: "agent",
      enableEditorCommands: false,
    }),
  );
  try {
    assertConversationContract(view.container, "empty FunctionAgentChat");
    const text = view.container.textContent || "";
    assert.match(text, /让「AI 助手」agent 帮你做事/);
    const scroll = view.container.querySelector(
      `[${AGENT_CONVERSATION_SCROLL_ATTR}]`,
    );
    assert.ok(scroll.textContent.includes("帮你做事"), "empty copy lives in the scroller, not under the dock");
  } finally {
    await view.unmount();
  }
});

test("W4 PluginAgentPanel reuses the same fill column", async () => {
  const view = await mount(
    React.createElement(PluginAgentPanel, {
      editorId: "richdoc",
      siteId: "website",
      label: "AI 助手",
    }),
  );
  try {
    const panel = view.container.querySelector("[data-plugin-agent-panel=richdoc]");
    assert.ok(panel, "plugin panel root");
    assert.ok(
      hasAllClasses(panel, AGENT_CONVERSATION_COLUMN_CLASS),
      "panel itself is a fill column so chrome/theme wrappers can stretch it",
    );
    assertConversationContract(view.container, "PluginAgentPanel");
  } finally {
    await view.unmount();
  }
});

test("W4 drawer factory wraps the panel in the fill column", async () => {
  const panel = createPluginAgentDrawer({
    editorId: "richdoc",
    translate: (value) => value,
  });
  const view = await mount(panel.content);
  try {
    const wrap = view.container.firstElementChild;
    assert.ok(
      hasAllClasses(wrap, AGENT_CONVERSATION_COLUMN_CLASS),
      "drawer content root fills the chrome aside",
    );
    assert.ok(view.container.querySelector("[data-plugin-agent-panel=richdoc]"));
  } finally {
    await view.unmount();
  }
});

function ThemeScopedConversation() {
  return React.createElement(
    "div",
    { "data-plugin-theme-scope": "richdoc" },
    React.createElement(
      "div",
      {
        "data-plugin-agent-panel": "richdoc",
        "data-agent-conversation": "",
        className: AGENT_CONVERSATION_COLUMN_CLASS,
      },
      React.createElement(
        "div",
        {
          "data-agent-conversation-scroll": "",
          className: AGENT_CONVERSATION_SCROLL_CLASS,
        },
        Array.from({ length: 12 }, (_, i) =>
          React.createElement("p", { key: i }, `turn ${i}`),
        ),
      ),
      React.createElement(
        "div",
        {
          "data-agent-composer-dock": "",
          className: AGENT_COMPOSER_DOCK_CLASS,
        },
        React.createElement("textarea", { "aria-label": "composer" }),
      ),
    ),
  );
}

function DetailOpener() {
  const pane = useWorkspacePane();
  const opened = useRef(false);
  useEffect(() => {
    if (!pane || opened.current) return;
    opened.current = true;
    pane.showDetail({
      ownerId: "w4",
      id: "agent",
      label: "AI 助手",
      content: React.createElement(ThemeScopedConversation),
    });
  }, [pane]);
  return React.createElement("div", { "data-ops-left": "1" }, "ops");
}

test("W4 SplitWorkspace stretches the theme-scope wrapper when conversation is inside", async () => {
  const view = await mount(
    React.createElement(SplitWorkspace, {
      fillParent: true,
      left: React.createElement(DetailOpener),
      right: React.createElement("div", { "data-editor": "1" }),
      library: { open: true, label: "预览" },
    }),
  );
  try {
    const split = view.container.querySelector("[data-workspace-split]");
    assert.ok(split, "split root");
    assert.match(
      String(split.className),
      /\bflex\b/,
      "compact: root is a flex column so pane height is real",
    );
    assert.match(String(split.className), /\bflex-col\b/);
    assert.match(String(split.className), /\bmd:flex-row\b/);

    const detail = view.container.querySelector('[data-left-panel="tool-detail"]');
    assert.ok(detail, "AI 助手 is the left detail pane from the screenshot");
    const themeScope = view.container.querySelector("[data-plugin-theme-scope]");
    assert.ok(themeScope, "theme scope wrapper from the screenshot path");
    const stretchHost = themeScope.parentElement;
    assert.ok(stretchHost, "theme scope sits in the pane layer");
    assert.doesNotMatch(
      String(stretchHost.className),
      /(^|\s)hidden(\s|$)/,
      "visible detail layer, not the parked ops layer",
    );
    assert.ok(
      hasAllClasses(stretchHost, AGENT_CONVERSATION_HOST_STRETCH_CLASS),
      "detail layer stretches its first child so PluginThemeScope gets a height",
    );
    assertConversationContract(view.container, "split + theme scope");
    const scroll = view.container.querySelector(
      `[${AGENT_CONVERSATION_SCROLL_ATTR}]`,
    );
    assert.equal(scroll.querySelectorAll("p").length, 12, "long thread stays in the scroller");
  } finally {
    await view.unmount();
  }
});

test("W4 OperatorConsole / AgentConsole keep the chat in a fill slot", () => {
  const operator = readFileSync(
    new URL("../src/shell/OperatorConsole.tsx", import.meta.url),
    "utf8",
  );
  const agent = readFileSync(
    new URL("../src/shell/AgentConsole.tsx", import.meta.url),
    "utf8",
  );
  const composer = readFileSync(
    new URL("../src/shell/LeoComposer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    operator,
    /flex min-h-0 flex-1 flex-col">\{active\?\.ops\}/,
    "capability-bar path gives FunctionAgentChat a flex column",
  );
  assert.match(
    operator,
    /flex h-full min-h-0 flex-col">\{active\?\.ops\}/,
    "no-bar path is also a fill column, not a content-sized h-full wrapper",
  );
  assert.match(
    agent,
    /flex min-h-0 flex-1 flex-col">\s*<FunctionAgentChat/,
    "AgentConsole does not leave FunctionAgentChat in a block flex-1 slot",
  );
  assert.match(
    composer,
    /relative shrink-0 rounded-2xl/,
    "LeoComposer card does not grow and steal the transcript",
  );
});
