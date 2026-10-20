/**
 * W6-r3: hosted deck human format comes from the shared toolbar consumer.
 * Agent/forged origin:user cannot take the human path (fails against 466ab3bf).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  applySelectionInteractionHold,
  selectionDuringInteraction,
} from "../src/shell/edit-bar-hosted-selection-hold.ts";
import { EDITOR_PROTOCOL } from "../src/shell/editor-protocol.ts";
import {
  normalizeSelectionCommand,
  selectionRequestId,
} from "../src/shell/selection-context.ts";
import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";
import {
  DECK_HOSTED_SELECT_OBJECT_HINT,
  buildDeckHostedCommandSurface,
  deckHostedItemReadOnly,
  hostedDeckFormatFillCommand,
  hostedDeckHostEditBarActive,
  hostedDeckSelectionCommandEnvelope,
  hostedDeckSelectionForToolbar,
  planDeckHostedAgentSelectionCommand,
  sendDeckHostedAgentSelectionCommand,
  sendDeckHostedHumanSelectionCommand,
} from "../src/shell/advanced-routes/deck-hosted-selection-command.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];

const HOST = "https://ppt.oceanleo.com/workspace/w6-r3";
const EMBED = "https://slides.oceanleo.app";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST,
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLIFrameElement: window.HTMLIFrameElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  MessageEvent: window.MessageEvent,
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
class ResizeObserverProbe {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = window.ResizeObserver = ResizeObserverProbe;

class TestPointerEvent extends window.MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
window.PointerEvent = TestPointerEvent;
globalThis.PointerEvent = TestPointerEvent;

const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const reactUrl = pathToFileURL(require.resolve("react")).href;
const toolbarStubs = {
  "./AdvancedEditorIcon": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function AdvancedEditorIcon({name}) { return jsx("span", {"data-icon": name}); }`,
  ),
  "../AdvancedEditorIcon": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function AdvancedEditorIcon({name}) { return jsx("span", {"data-icon": name}); }`,
  ),
  "../i18n/ui/useUI": dataModule("export function useUI() { return (s) => s; }"),
  "../../i18n/ui/useUI": dataModule("export function useUI() { return (s) => s; }"),
  "./plugin-theme": dataModule(
    'export function pluginWorkbenchStyle() { return {}; } export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; } export function usePluginThemePortal() { return null; } export function PluginThemeScope({children}) { return children; }',
  ),
  "../plugin-theme": dataModule(
    'export function pluginWorkbenchStyle() { return {}; } export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; } export function usePluginThemePortal() { return null; } export function PluginThemeScope({children}) { return children; }',
  ),
  "./SelectionAnimationGallery": dataModule(
    "export function SelectionAnimationGallery() { return null; }",
  ),
  "../SelectionAnimationGallery": dataModule(
    "export function SelectionAnimationGallery() { return null; }",
  ),
  "../ui/Button": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function Button({children, ...props}) { return jsx("button", props, children); }`,
  ),
};
const load = async (path, stubs = toolbarStubs) =>
  import(await compileModule(path, stubs));

const { DeckHostedContextToolbar } = await load(
  "src/shell/advanced-routes/DeckHostedContextToolbar.tsx",
);
const { createRoot } = await import("react-dom/client");

const shapeSelection = {
  version: 1,
  kind: "deck-shape",
  id: "shape-hero",
  revision: 4,
  epoch: 2,
  label: "矩形",
  controls: [
    {
      id: "shape-fill",
      kind: "color",
      label: "填充色",
      icon: "color",
      value: "#ffffff",
      slot: "compact",
      placement: "primary",
    },
  ],
};

const routeSource = readFileSync(
  "src/shell/advanced-routes/DeckHostedRoute.tsx",
  "utf8",
);
const plannerSource = readFileSync(
  "src/shell/advanced-routes/deck-hosted-selection-command.ts",
  "utf8",
);

function firePointer(target, type) {
  const event = new TestPointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
  });
  target.dispatchEvent(event);
  return event;
}

test("W6-r3 human planner still requires a stamp; unknown PPTist ids and slide-1 are gone", () => {
  assert.doesNotMatch(plannerSource, /slide-1/);
  assert.doesNotMatch(plannerSource, /\|\|\s*["']user["']/);
  assert.doesNotMatch(plannerSource, /hostedDeckHumanOrigin\(params/);
  assert.match(routeSource, /renderContextToolbar/);
  assert.match(routeSource, /DeckHostedContextToolbar/);
  assert.match(routeSource, /origin:\s*["']user["']/);
  assert.equal(
    hostedDeckHostEditBarActive({
      mode: "pro",
      ready: true,
      hasSource: true,
      readOnly: false,
    }),
    false,
  );
  assert.equal(
    deckHostedItemReadOnly({
      artifact: { editability: "view_only", access: { canEdit: false } },
    }),
    true,
  );
  assert.equal(
    deckHostedItemReadOnly({
      artifact: { access: { canEdit: false } },
    }),
    true,
  );
  assert.equal(hostedDeckSelectionForToolbar(null), null);
  assert.equal(
    hostedDeckSelectionForToolbar({
      ...shapeSelection,
      kind: "deck-slide",
      id: "slide-real",
    }),
    null,
  );

  const unknown = hostedDeckSelectionCommandEnvelope({
    command: normalizeSelectionCommand({
      requestId: selectionRequestId(),
      selectionId: "shape-hero",
      controlId: "fill",
      value: "#ff00aa",
    }),
    origin: "user",
    ready: true,
    readOnly: false,
    liveSelectionId: "shape-hero",
  });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /没有这条指令/);
});

test("W6-r3 forged origin:user on the agent surface cannot bypass review (red on 466ab3bf)", () => {
  const sent = [];
  const surface = buildDeckHostedCommandSurface({
    ready: true,
    readOnly: false,
    hasSource: true,
    liveSelectionId: "shape-hero",
    liveSelectionRevision: 4,
    sendAgent: (envelope) => {
      sent.push(envelope);
      return true;
    },
  });
  const forged = surface.run("deck.format-fill", {
    color: "#ff00aa",
    origin: "user",
  });
  assert.equal(forged.ok, true);
  assert.equal(forged.applied, false);
  assert.equal(forged.reviewed, true);
  assert.match(forged.message, /审阅/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "selection-command");
  assert.equal("origin" in sent[0], false);
  assert.equal(sent[0].command.controlId, "shape-fill");
  assert.equal(sent[0].command.selectionId, "shape-hero");

  const empty = buildDeckHostedCommandSurface({
    ready: true,
    readOnly: false,
    hasSource: true,
    liveSelectionId: null,
    sendAgent: () => true,
  });
  const hint = empty.run("deck.format-fill", { color: "#ff00aa", origin: "user" });
  assert.equal(hint.ok, false);
  assert.equal(hint.message, DECK_HOSTED_SELECT_OBJECT_HINT);

  const agent = planDeckHostedAgentSelectionCommand({
    command: hostedDeckFormatFillCommand({
      selectionId: "shape-hero",
      color: "#112233",
    }),
    ready: true,
    readOnly: false,
    liveSelectionId: "shape-hero",
  });
  assert.equal(agent.ok, true);
  assert.equal("origin" in agent.envelope, false);
});

test("W6-r3 mounted DeckHostedContextToolbar: select → fill → human envelope id/revision", async () => {
  const outgoing = [];
  const gate = new SelectionCommandGate();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const api = { held: null, live: shapeSelection };

  function Host() {
    const [live, setLive] = React.useState(shapeSelection);
    const [held, setHeld] = React.useState(null);
    api.setLive = setLive;
    api.held = held;
    api.live = live;
    const context = hostedDeckSelectionForToolbar(
      selectionDuringInteraction(live, held),
    );
    return React.createElement(DeckHostedContextToolbar, {
      context,
      onSelectionInteractionChange: (next) => {
        setHeld(next);
        applySelectionInteractionHold(gate, next);
      },
      onCommand: (command) => {
        const target = hostedDeckSelectionForToolbar(
          selectionDuringInteraction(api.live, api.held),
        );
        const result = sendDeckHostedHumanSelectionCommand({
          command,
          selection: target,
          ready: true,
          readOnly: false,
          origin: "user",
          gate,
          send: (message) => {
            outgoing.push(message);
            return true;
          },
        });
        api.last = result;
      },
    });
  }

  await act(async () => root.render(React.createElement(Host)));
  try {
    assert.equal(container.querySelector("[data-deck-hosted-hint]"), null);
    const fill = container.querySelector(
      '[data-selection-control-id="shape-fill"] input[type="color"]',
    );
    assert.ok(fill, "shared toolbar must render the PPTist fill control");
    const toolbar = container.querySelector('[data-selection-kind="deck-shape"]');
    assert.ok(toolbar);
    const setNativeValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    await act(async () => firePointer(toolbar, "pointerdown"));
    await act(async () => firePointer(fill, "pointerdown"));
    await act(async () => {
      api.setLive(null);
    });
    assert.ok(
      fill.isConnected,
      "held toolbar must keep the fill control through selection blur",
    );
    outgoing.length = 0;
    await act(async () => {
      setNativeValue.call(fill, "#ff00aa");
      fill.dispatchEvent(
        new window.Event("input", { bubbles: true, cancelable: true }),
      );
    });
    const sent = outgoing.find((entry) => entry.type === "selection-command");
    assert.ok(sent, "toolbar fill must produce a host envelope");
    assert.equal(sent.origin, "user");
    assert.equal(sent.command.controlId, "shape-fill");
    assert.equal(sent.command.selectionId, "shape-hero");
    assert.equal(sent.command.selectionRevision, 4);
    assert.equal(api.last?.applied, true);
    assert.equal(api.last?.reviewed, false);

    await act(async () => {
      window.dispatchEvent(new window.Event("pointerup", { bubbles: true }));
    });
    applySelectionInteractionHold(gate, null);
    outgoing.length = 0;
    const delayed = sendDeckHostedHumanSelectionCommand({
      command: normalizeSelectionCommand({
        requestId: selectionRequestId(),
        selectionId: "shape-hero",
        controlId: "shape-fill",
        value: "#00ffaa",
        selectionRevision: 4,
      }),
      selection: null,
      ready: true,
      readOnly: false,
      origin: "user",
      gate,
      send: (message) => {
        outgoing.push(message);
        return true;
      },
    });
    assert.equal(delayed.ok, false);
    assert.equal(outgoing.length, 0);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("W6-r3 toolbar without an object shows a select-object hint, not slide-1", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(DeckHostedContextToolbar, {
        context: null,
        onCommand() {},
      }),
    ),
  );
  try {
    const hint = container.querySelector('[data-deck-hosted-hint="select-object"]');
    assert.ok(hint);
    assert.match(hint.textContent, /请先选中对象/);
    assert.equal(container.querySelector("[data-selection-control-id]"), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

function sendFrameMessage(frame, data) {
  const event = new Event("message");
  Object.defineProperties(event, {
    origin: { value: EMBED },
    source: { value: frame.contentWindow },
    data: { value: data },
  });
  window.dispatchEvent(event);
}

const ITEM = {
  id: "deck-w6-r3",
  key: "deck-w6-r3",
  title: "托管幻灯工具栏",
  revisionId: "rev-4",
  source: "artifact",
  kind: "ppt",
  siteId: "ppt",
  favorite: false,
  meta: {},
};
const HANDOFF = {
  kind: "inline",
  revision: "rev-4",
  json: {
    format: "pptist",
    slides: [{ id: "s1", elements: [{ id: "shape-hero", type: "shape", fill: "#ffffff" }] }],
  },
};

test("W6-r3 mounted DeckHostedRoute: toolbar fill stamps user; agent run does not", async () => {
const routeUrl = await compileModule("src/shell/advanced-routes/DeckHostedRoute.tsx", {
  "./deck-hosted-save": dataModule(
    `export async function saveHostedDeck() { throw new Error("unexpected durable save"); }`,
  ),
  "./mode-switch-gate": dataModule(`
    export function useModeSwitchFailure() { return () => {}; }
    export function useModeSwitchHandoff() { return globalThis.__w6Handoff || null; }
    export function useModeSwitchReady() {}
  `),
  "./editor-handoff": dataModule(`
    export const ENTER_PRO_NOT_READY = "还没准备好";
    export function handoffItemKey(item) { return String(item.key || item.id || ""); }
    export function useEditorHandoffSource() { return globalThis.__w6Resolved; }
    export async function materializeHandoffJson(source) {
      return { ok: true, json: source.json || { format: "pptist", slides: [{ id: "s1", elements: [] }] } };
    }
    export function hostedSaveTimeoutMs() { return 1000; }
    export function libraryItemFromProSave(item) { return item; }
    export function reportProSaved() {}
    export function bindProFaceHandoff() { return () => {}; }
  `),
  "../AdvancedWorkbenchShell": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function AdvancedWorkbenchShell({ adapter }) {
      const toolbar = adapter.renderContextToolbar
        ? adapter.renderContextToolbar({ openDrawer() {}, closeDrawer() {} })
        : adapter.contextToolbar;
      return React.createElement(
        "div",
        { "data-workbench": "deck" },
        toolbar,
        adapter.stage,
      );
    }
  `),
  "../advanced-recovery-store": dataModule(`export function advancedRecoveryKey() { return "recovery"; }`),
  "../advanced-draft-deck": dataModule(`export const DECK_DRAFT_SCHEMA = "oceanleo.deck-working-document.v1";`),
  "../doc-editors/deck-pptist-carrier": dataModule(`
    export const PPTIST_CARRIER_FORMAT = "pptist";
    export function deckDocumentToPptist(value) { return value; }
    export function pptistToDeckDocument(value) { return value; }
  `),
  "../doc-editors/deck-schema": dataModule(`export function normalizeDeckDocument(value) { return value; }`),
  "../doc-editors/pptx-deck-import": dataModule(`export async function importPptxDeck() { return {}; }`),
  "../editor-protocol": dataModule(`
    export const EDITOR_PROTOCOL = "oceanleo.editor.v1";
    export function isValidEditorTargetOrigin() { return true; }
    export function asHostToEditorMessage(value) { return value; }
    export function buildEditorEmbedUrl(base, options) {
      const url = new URL(base);
      url.searchParams.set("instance", options.instanceId);
      return url.toString();
    }
    export function acceptEditorFrameMessage(event, gate) {
      if (event.origin !== gate.expectedOrigin || event.source !== gate.frameWindow) return null;
      return event.data && event.data.instanceId === gate.instanceId ? event.data : null;
    }
  `),
  "../editor-sandbox-origin": dataModule(`
    export function isTrustedEmbedEditorBase(value) {
      return Boolean(value) && value === (globalThis.__w6EmbedBase || ${JSON.stringify(EMBED)});
    }
    export function embedEditorFrameSandbox() { return "allow-scripts"; }
  `),
  "../hosted-editor/index": dataModule(`
    export const DEFAULT_EDITOR_MODE = "normal";
    export function validReviewProposal() { return true; }
    export function validAgentChips() { return []; }
    export function buildHideChromeMessage(instanceId, value) { return { type: "hide-chrome", instanceId, ...value }; }
    export function buildSetModeMessage(instanceId, mode) { return { type: "set-mode", instanceId, mode }; }
    export function buildReviewDecisionMessage(instanceId, proposalId, decision) {
      return { type: "review-decision", instanceId, proposalId, decision };
    }
  `),
  "../hosted-editor-origins": dataModule(`
    export function hostedEditorOrigin() { return globalThis.__w6EmbedBase || ${JSON.stringify(EMBED)}; }
    export function isHostedEditorOrigin(origin) { return origin === hostedEditorOrigin(); }
  `),
  "../hosted-local-origin": dataModule(`
    export function clientHostedEmbedContext() { return { platform: "web" }; }
    export function hostedEmbedBaseForPlatform(_, fallback) { return fallback || globalThis.__w6EmbedBase || ${JSON.stringify(EMBED)}; }
    export function hostedKernelChromeHidden(mode, platform) {
      return mode === "normal" && (!platform || platform === "web");
    }
  `),
  "../../client-ui/host-context": dataModule(`export function useOptionalClientHost() { return null; }`),
  "../plugin-command": dataModule(`
    export function usePluginCommandSurface(surface) { globalThis.__w6DeckSurface = surface; }
  `),
  "../workbench-routes": dataModule(`export function editorToolLabel() { return "幻灯片"; }`),
  "../AdvancedEditorIcon": toolbarStubs["../AdvancedEditorIcon"],
  "../plugin-theme": toolbarStubs["../plugin-theme"],
  "../../i18n/ui/useUI": toolbarStubs["../i18n/ui/useUI"],
  "../SelectionAnimationGallery": toolbarStubs["../SelectionAnimationGallery"],
  "../ui/Button": toolbarStubs["../ui/Button"],
});
const { DeckHostedRoute } = await import(routeUrl);
  globalThis.__w6EmbedBase = EMBED;
  globalThis.__w6Handoff = HANDOFF;
  globalThis.__w6Resolved = { status: "ready", source: HANDOFF };
  globalThis.__w6DeckSurface = null;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(DeckHostedRoute, { item: ITEM, onClose() {} }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  try {
    const iframe = container.querySelector("iframe");
    assert.ok(iframe, "hosted deck must mount the PPTist iframe");
    const instanceId = new URL(iframe.src, HOST).searchParams.get("instance");
    assert.ok(instanceId);
    const outgoing = [];
    const frameWindow = iframe.contentWindow;
    const originalPost = frameWindow.postMessage.bind(frameWindow);
    frameWindow.postMessage = (data, origin) => {
      outgoing.push({ data, origin });
      return originalPost(data, origin);
    };
    await act(async () => {
      iframe.dispatchEvent(new window.Event("load"));
    });
    await act(async () => {
      sendFrameMessage(iframe, {
        protocol: EDITOR_PROTOCOL,
        type: "ready",
        instanceId,
      });
    });
    const restore = outgoing.find((entry) => entry.data?.type === "recovery-restore");
    assert.ok(restore, "open must send recovery-restore");
    await act(async () => {
      sendFrameMessage(iframe, {
        protocol: EDITOR_PROTOCOL,
        type: "recovery-result",
        instanceId,
        recoveryId: restore.data.recoveryId,
        ok: true,
      });
    });
    await act(async () => {
      sendFrameMessage(iframe, {
        protocol: EDITOR_PROTOCOL,
        type: "selection-changed",
        instanceId,
        selection: shapeSelection,
      });
    });
    const fill = container.querySelector(
      '[data-selection-control-id="shape-fill"] input[type="color"]',
    );
    assert.ok(fill, "normal hosted mode must render the shared fill control");
    outgoing.length = 0;
    const toolbar = container.querySelector('[data-selection-kind="deck-shape"]');
    const setNativeValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    await act(async () => firePointer(toolbar, "pointerdown"));
    await act(async () => firePointer(fill, "pointerdown"));
    await act(async () => {
      sendFrameMessage(iframe, {
        protocol: EDITOR_PROTOCOL,
        type: "selection-changed",
        instanceId,
        selection: null,
      });
    });
    await act(async () => {
      setNativeValue.call(fill, "#ff00aa");
      fill.dispatchEvent(
        new window.Event("input", { bubbles: true, cancelable: true }),
      );
    });
    const human = outgoing.find((entry) => entry.data?.type === "selection-command");
    assert.ok(human, "toolbar click must post selection-command");
    assert.equal(human.data.origin, "user");
    assert.equal(human.data.command.selectionId, "shape-hero");
    assert.equal(human.data.command.selectionRevision, 4);
    assert.equal(human.data.command.controlId, "shape-fill");
    assert.equal(human.origin, EMBED);

    outgoing.length = 0;
    await act(async () => {
      sendFrameMessage(iframe, {
        protocol: EDITOR_PROTOCOL,
        type: "selection-changed",
        instanceId,
        selection: shapeSelection,
      });
    });
    const surface = globalThis.__w6DeckSurface;
    assert.ok(surface, "agent surface must register");
    const parked = surface.run("deck.format-fill", {
      color: "#00aaff",
      origin: "user",
    });
    assert.equal(parked.ok, true);
    assert.equal(parked.applied, false);
    assert.equal(parked.reviewed, true);
    const agent = outgoing.filter((entry) => entry.data?.type === "selection-command");
    assert.equal(agent.length, 1);
    assert.equal("origin" in agent[0].data, false);

    const denied = sendDeckHostedAgentSelectionCommand({
      command: hostedDeckFormatFillCommand({
        selectionId: "shape-hero",
        color: "#000000",
      }),
      ready: true,
      readOnly: true,
      liveSelectionId: "shape-hero",
      send: () => true,
    });
    assert.equal(denied.ok, false);
    assert.match(denied.message, /只读/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
