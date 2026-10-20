/**
 * V1 acceptance: left AI composer sits at the bottom of a height-filled
 * column. Empty-state copy lives in the scrolling transcript, not between
 * the header and a shrink-wrapped composer.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const reactUrl = pathToFileURL(require.resolve("react")).href;

function classOf(node) {
  return String(node?.getAttribute?.("class") || node?.className || "");
}

function assertFillColumn(node, label) {
  assert.ok(node, `${label} missing`);
  const className = classOf(node);
  assert.match(className, /flex/, `${label} must be a flex column`);
  assert.match(className, /flex-col/, `${label} must be flex-col`);
  assert.match(
    className,
    /h-full|min-h-0|flex-1/,
    `${label} must fill available height (${className})`,
  );
}

async function installDom() {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://word.oceanleo.com/library",
  });
  const { window } = dom;
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
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
  window.Element.prototype.scrollTo = function scrollTo() {};
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  return window;
}

const chatStubs = {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (value, vars) => String(value).replace(/\\{(\\w+)\\}/g, (match, key) => vars && key in vars ? String(vars[key]) : match); }",
  ),
  "./LeoComposer": dataModule(`
    import { jsx } from ${JSON.stringify(jsxUrl)};
    export function LeoComposer() {
      return jsx("div", { "data-leo-composer": true }, "composer");
    }
  `),
  "./AgentProgress": dataModule(
    "export function AgentProgress(){ return null; }",
  ),
  "./RestartDraftButton": dataModule(
    "export function RestartDraftButton(){ return null; }",
  ),
  "./OperatorRemark": dataModule(`
    export function OperatorRemarkField(){ return null; }
    export function useOperatorRemark(){ return { remark: "", setRemark(){} }; }
  `),
  "./AgentTranscriptBubble": dataModule(`
    import { jsx } from ${JSON.stringify(jsxUrl)};
    export function AgentTranscriptBubble({ message }) {
      return jsx("div", { "data-agent-bubble": message.role }, message.content || "");
    }
  `),
  "./useAttachments": dataModule(`
    export function useAttachments() {
      return {
        attachments: [],
        composerAttachments: [],
        handleAttachFiles() {},
        removeAttachment() {},
        ready: () => [],
        uploading: false,
        clear() {},
      };
    }
  `),
  "./WorkspaceSession": dataModule(
    "export function useOptionalWorkspaceSession(){ return null; } export function useRegisterWorkspaceSessionSchemaVersion(){}",
  ),
  "./workspace-runtime-hydration": dataModule(
    "export function useWorkspaceRuntimeHydration(){ return null; }",
  ),
  "./SplitWorkspace": dataModule(`
    export function useLeftPaneSlot() { return null; }
    export function useRegisterConsoleAgentFocus() {}
  `),
  "./icons": dataModule(`
    export function IconSparkles() { return null; }
    export function IconWorkspace() { return null; }
  `),
  "./guide-context": dataModule(`
    export function useRegisterOpsFiller() {}
    export function useGuideWorkflows() { return null; }
    export function FillNonceProvider({ children }) { return children; }
  `),
  "../lib/fn-agent": dataModule(`
    export function buildEditorCommandContext() { return null; }
    export function createEditorCommandIntake() { return {}; }
    export function createEditorCommandSession() {
      return { notes: [], card: null };
    }
    export function takeFreshCommandMessages() { return []; }
  `),
  "../lib/agent": dataModule(`
    export async function createTask() { return { ok: false }; }
    export async function branchTask() { return { ok: false }; }
    export async function followUp() { return { ok: true }; }
    export async function getTask() { return { ok: false }; }
    export async function stopTask() { return { ok: true }; }
    export async function reportEditorCommandResult() { return { ok: true }; }
  `),
  "./workspace-actions": dataModule(`
    export function dispatchWorkspaceAction() {}
    export function normalizeWorkspaceAction() { return null; }
  `),
  "./workspace-session-snapshot": dataModule(`
    export function mergeWorkspaceSessionSnapshot(value) { return value || {}; }
    export function splitWorkspaceSessionSnapshot(value) { return value || {}; }
  `),
  "../lib/operator-remark": dataModule(
    "export function appendOperatorRemark(prompt) { return prompt; }",
  ),
  "../lib/agent-progress": dataModule(`
    export function activeAgentProgressKey() { return null; }
    export function buildAgentRenderItems() { return []; }
    export function takeUnreportedAgentArtifacts() { return []; }
    export function sameAgentMessages() { return true; }
  `),
  "./agent-review/surface": dataModule(
    "export function readAgentCommandSurface() { return null; }",
  ),
  "./agent-review/dock": dataModule(
    "export function AgentReviewDock() { return null; }",
  ),
  "./agent-review/selection-bridge": dataModule(
    "export function assembleAgentEditorContext() { return null; }",
  ),
  "./agent-review/inbox": dataModule(`
    export function readAgentSelection() { return null; }
    export function readMentionCatalog() { return []; }
  `),
  "./agent-review/selection-live": dataModule(
    "export function refreshAgentSelectionFromDom() {}",
  ),
  "./agent-review/install": dataModule(`
    export function installAgentReviewGate() {}
    export function installSelectionBridge() {}
  `),
};

test("FunctionAgentChat agent tab fills height and keeps the composer last/shrink-0", async () => {
  const window = await installDom();
  const { FunctionAgentChat } = await import(
    await compileModule("src/shell/FunctionAgentChat.tsx", chatStubs)
  );
  const { createRoot } = await import("react-dom/client");
  const host = window.document.createElement("div");
  host.style.height = "480px";
  host.className = "flex h-full min-h-0 flex-col";
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(FunctionAgentChat, {
        agentId: "word.richdoc",
        siteId: "word",
        schema: { agentId: "word.richdoc", title: "AI 助手", fields: [], actions: [] },
        opsContent: null,
        showOps: false,
        defaultTab: "agent",
        enableEditorCommands: false,
      }),
    );
  });
  const tab = host.querySelector('[data-fn-agent-tab="agent"]');
  assertFillColumn(tab, "agent tab");
  assert.match(classOf(tab), /h-full/, "agent tab must take the column height");
  assert.match(
    classOf(tab),
    /min-h-0/,
    "agent tab needs min-h-0 or the composer shrink-wraps mid-column",
  );
  const children = [...tab.children];
  const composerWrap = children.at(-1);
  assert.ok(composerWrap, "composer wrap missing");
  assert.match(classOf(composerWrap), /shrink-0/, "composer must not grow");
  assert.ok(
    composerWrap.querySelector("[data-leo-composer]"),
    "composer must be the last block in the column",
  );
  const transcript = children.find((node) =>
    /flex-1/.test(classOf(node)),
  );
  assert.ok(transcript, "transcript must flex-1 above the composer");
  assert.match(classOf(transcript), /min-h-0/);
  assert.match(classOf(transcript), /overflow-y-auto|overflow-auto/);
  assert.ok(
    transcript.contains(
      [...transcript.querySelectorAll("p, div")].find((node) =>
        /让/.test(node.textContent || ""),
      ) || transcript,
    ),
    "empty-state copy belongs inside the scrolling transcript",
  );
  await act(async () => root.unmount());
});

test("PluginAgentPanel + chrome aside form a min-h-0 flex column around the composer", async () => {
  const window = await installDom();
  const { PluginAgentPanel } = await import(
    await compileModule("src/shell/plugin-chrome/PluginAgentPanel.tsx", {
      "../../i18n/ui/useUI": dataModule(
        "export function useUI(){ return (value) => value; }",
      ),
      "../FunctionAgentChat": dataModule(`
        import { jsx, jsxs } from ${JSON.stringify(jsxUrl)};
        export function FunctionAgentChat() {
          return jsxs("div", {
            "data-fn-agent-tab": "agent",
            className: "flex h-full min-h-0 flex-col",
            children: [
              jsx("div", { className: "min-h-0 flex-1 overflow-y-auto", children: "empty" }),
              jsx("div", { className: "shrink-0", "data-leo-composer": true, children: "composer" }),
            ],
          });
        }
      `),
    })
  );
  const { PluginChromeFrame } = await import(
    await compileModule("src/shell/plugin-chrome/PluginChromeFrame.tsx", {
      "../../i18n/ui/useUI": dataModule(
        "export function useUI(){ return (value) => value; }",
      ),
      "../AdvancedEditorIcon": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function AdvancedEditorIcon({ name }) {
          return jsx("span", { "data-icon": name });
        }
      `),
      "../plugin-theme": dataModule(`
        export function usePluginTheme() { return { theme: "light", accent: "#4f46e5" }; }
        export function usePluginThemePortal() { return null; }
        export function PluginThemeToggle() { return null; }
        export function pluginWorkbenchStyle() { return {}; }
      `),
      "./agent-drawer-panel": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export const PLUGIN_AGENT_DRAWER_ID = "agent";
        export const PLUGIN_AGENT_DRAWER_LABEL = "AI 助手";
        export function createPluginAgentDrawer({ editorId }) {
          return {
            id: "agent",
            label: "AI 助手",
            icon: "agent",
            content: jsx("div", { "data-plugin-agent-panel": editorId, "data-accept-agent": true }),
          };
        }
      `),
      "./PluginAgentPanel": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function PluginAgentPanel({ editorId }) {
          return jsx("div", { "data-plugin-agent-panel": editorId });
        }
      `),
      "../SplitWorkspace": dataModule(`
        export function useConsoleAgentFocus() { return null; }
        export function useRegisterConsoleAgentFocus() {}
        export function useLeftPaneSlot() { return null; }
        export function useRightPaneSlot() { return null; }
        export function useWorkspacePane() { return null; }
      `),
      "../PluginChromeEditBarGestureLayer": dataModule(`
        export function PluginChromeEditBarGestureLayer({ children }) { return children; }
      `),
      "../FloatingContextToolbar": dataModule(`
        export function useFloatingContextToolbar() {
          return { mode: "docked", dropActive: false, leading: null, trailing: null };
        }
        export function FloatingContextToolbar() { return null; }
      `),
    })
  );

  const { createRoot } = await import("react-dom/client");
  const host = window.document.createElement("div");
  host.className = "flex h-[480px] min-h-0 flex-col";
  host.style.height = "480px";
  window.document.body.append(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      React.createElement(
        "div",
        { className: "flex h-full min-h-0 flex-col" },
        React.createElement(PluginAgentPanel, {
          editorId: "richdoc",
          siteId: "word",
          label: "AI 助手",
        }),
      ),
    );
  });
  const panel = host.querySelector("[data-plugin-agent-panel]");
  assertFillColumn(panel, "plugin agent panel");
  assert.match(classOf(panel), /h-full/);
  assert.match(classOf(panel), /min-h-0/);
  assert.ok(panel.querySelector("[data-leo-composer]"));

  await act(async () => {
    root.render(
      React.createElement(
        PluginChromeFrame,
        { pluginId: "richdoc", title: "文档", siteId: "word" },
        React.createElement("div", { "data-stage": true }),
      ),
    );
  });
  const agentButton = host.querySelector("[data-plugin-chrome-agent]");
  assert.ok(agentButton, "AI 助手 button missing");
  await act(async () => agentButton.click());
  const aside = host.querySelector("[data-plugin-chrome-panel]");
  assert.ok(aside, "agent aside missing");
  assertFillColumn(aside, "chrome aside");
  const body = aside.lastElementChild;
  assert.ok(body);
  assert.match(classOf(body), /min-h-0/);
  assert.match(classOf(body), /flex-1/);
  const asideClass = classOf(aside);
  const bodyClass = classOf(body);
  const bodyIsFlexColumn =
    /(?:^|\s)flex(?:\s|$)/.test(bodyClass) && /flex-col/.test(bodyClass);
  const asideIsFlexColumn =
    /(?:^|\s)flex(?:\s|$)/.test(asideClass) && /flex-col/.test(asideClass);
  assert.ok(
    bodyIsFlexColumn || asideIsFlexColumn,
    `agent aside must be a flex column so h-full children can fill; aside="${asideClass}" body="${bodyClass}"`,
  );
  await act(async () => root.unmount());
});
