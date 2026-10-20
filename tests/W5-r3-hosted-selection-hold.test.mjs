/**
 * W5-r3: toolbar hold must reach the hosted send path with the original
 * selection after iframe blur, then reject a delayed command after release.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  applySelectionInteractionHold,
  selectionDuringInteraction,
} from "../src/shell/edit-bar-hosted-selection-hold.ts";
import {
  hostedSelectionForToolbar,
  sendRichDocHostedSelectionCommand,
} from "../src/shell/doc-editors/rich-doc-hosted-embed.ts";
import { EDITOR_PROTOCOL } from "../src/shell/editor-protocol.ts";
import { TRUSTED_EMBED_EDITOR_BASES } from "../src/shell/editor-sandbox-origin.ts";
import {
  normalizeSelectionCommand,
  selectionRequestId,
} from "../src/shell/selection-context.ts";
import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";

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

const HOST = "https://website.oceanleo.com/workspace/w5-r3";
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
const toolbarStubs = {
  "./AdvancedEditorIcon": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function AdvancedEditorIcon({name}) { return jsx("span", {"data-icon": name}); }`,
  ),
  "../i18n/ui/useUI": dataModule("export function useUI() { return (s) => s; }"),
  "./plugin-theme": dataModule(
    'export function pluginWorkbenchStyle() { return {}; } export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; } export function usePluginThemePortal() { return null; } export function PluginThemeScope({children}) { return children; }',
  ),
  "./SelectionAnimationGallery": dataModule(
    "export function SelectionAnimationGallery() { return null; }",
  ),
  "../ui/Button": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function Button({children, ...props}) { return jsx("button", props, children); }`,
  ),
};
const load = async (path, stubs = toolbarStubs) =>
  import(await compileModule(path, stubs));

const { SelectionToolbar } = await load("src/shell/SelectionToolbar.tsx");
const { RichDocHostedContextToolbar } = await load(
  "src/shell/doc-editors/RichDocHostedContextToolbar.tsx",
);
const { createRoot } = await import("react-dom/client");

const rangeSelection = {
  version: 1,
  kind: "text",
  id: "text:hero",
  revision: 4,
  epoch: 2,
  label: "标题",
  controls: [
    { id: "bold", kind: "toggle", label: "粗体", icon: "bold", value: false },
  ],
};

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

test("W5-r3-gate held transient null keeps the gesture; genuine clear cancels", () => {
  const gate = new SelectionCommandGate();
  const start = normalizeSelectionCommand({
    requestId: selectionRequestId(),
    selectionId: rangeSelection.id,
    controlId: "font-size",
    value: 18,
    selectionRevision: 4,
    selectionEpoch: 2,
    phase: "start",
    transactionId: "txn-hold-1",
  });
  assert.equal(gate.accept(start, rangeSelection), true);
  gate.holdInteraction(rangeSelection);
  assert.equal(gate.reconcile(null).length, 0);
  assert.equal(
    gate.accept(
      normalizeSelectionCommand({
        requestId: selectionRequestId(),
        selectionId: rangeSelection.id,
        controlId: "font-size",
        value: 20,
        selectionRevision: 4,
        selectionEpoch: 2,
        phase: "update",
        transactionId: "txn-hold-1",
      }),
      null,
    ),
    true,
  );
  gate.releaseInteraction();
  assert.equal(gate.reconcile(null).length, 1);
});

test("W5-r3-richdoc hold keeps the selected range, not the caret fallback", async () => {
  const gate = new SelectionCommandGate();
  const sent = [];
  const heldRef = { current: null };
  const liveRef = { current: rangeSelection };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function Host() {
    const [context, setContext] = React.useState(rangeSelection);
    return React.createElement(RichDocHostedContextToolbar, {
      context: hostedSelectionForToolbar(
        selectionDuringInteraction(context, heldRef.current),
        4,
      ),
      onSelectionInteractionChange: (held) => {
        heldRef.current = held;
        applySelectionInteractionHold(gate, held);
        setContext(liveRef.current);
      },
      onCommand: (command) => {
        const target = selectionDuringInteraction(
          liveRef.current,
          heldRef.current,
        );
        sent.push(
          sendRichDocHostedSelectionCommand({
            command,
            selection: hostedSelectionForToolbar(target, target?.revision ?? 4),
            ready: true,
            readOnly: false,
            origin: "user",
            gate,
            send: (message) => {
              sent.push(message);
              return true;
            },
          }),
        );
      },
    });
  }

  await act(async () => root.render(React.createElement(Host)));
  try {
    const bold = container.querySelector(
      '[data-selection-control-id="bold"] button',
    );
    assert.ok(bold);
    await act(async () => firePointer(bold, "pointerdown"));
    liveRef.current = null;
    await act(async () => {
      applySelectionInteractionHold(gate, heldRef.current);
    });
    assert.equal(heldRef.current?.id, "text:hero");
    assert.notEqual(heldRef.current?.id, "richdoc-caret");
    await act(async () => bold.click());
    const envelope = sent.find((entry) => entry?.type === "selection-command");
    assert.ok(envelope);
    assert.equal(envelope.origin, "user");
    assert.equal(envelope.command.selectionId, "text:hero");
    assert.equal(envelope.command.selectionRevision, 4);
    applySelectionInteractionHold(gate, null);
    const delayed = sendRichDocHostedSelectionCommand({
      command: normalizeSelectionCommand({
        requestId: selectionRequestId(),
        selectionId: "text:hero",
        controlId: "italic",
        value: true,
        selectionRevision: 4,
        selectionEpoch: 2,
      }),
      selection: null,
      ready: true,
      readOnly: false,
      origin: "user",
      gate,
      send: () => true,
    });
    assert.equal(delayed.ok, false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("W5-r3-embed hold reaches sendToEditor with user origin, then rejects after release", async () => {
  const editorBase = TRUSTED_EMBED_EDITOR_BASES.find((base) =>
    base.includes("/embed/site-editor"),
  );
  assert.ok(editorBase, "website embed base must exist for this family");

  const paneStubs = {
    ...toolbarStubs,
    "../i18n/ui/useUI": toolbarStubs["../i18n/ui/useUI"],
    "../lib/database": dataModule(
      "export async function saveCreations() { return { items: [] }; }",
    ),
    "./artifact-client": dataModule(
      "export async function getArtifactItem() { return null; }",
    ),
    "../lib/media-proxy": dataModule(
      "export function isFirstPartyMediaUrl() { return false; } export async function importMediaUrl() { return { ok: false }; }",
    ),
    "./advanced-session": dataModule(
      "export function advancedSavedItem(item) { return item; }",
    ),
    "./design-composite-commit": dataModule(`
      export class DesignCompositeCommitError extends Error {}
      export function isEmbeddedTypedCommitType() { return false; }
      export async function persistDesignCompositeCommit() { return {}; }
      export async function persistEmbeddedTypedCommit() { return {}; }
    `),
  };

  const { EmbedEditorPane } = await load("src/shell/workbench-embed.tsx", paneStubs);
  const outgoing = [];
  const interactionRef = { current: null };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const item = {
    key: "artifact:w5-r3:1",
    source: "artifact",
    id: "w5-r3",
    title: "W5-r3",
    kind: "website",
    siteId: "website",
    favorite: false,
    url: "https://website.oceanleo.com/embed/site-editor",
    meta: {},
  };

  const results = [];
  const api = { setCommand: null };
  function Host() {
    const [command, setCommand] = React.useState(null);
    api.setCommand = setCommand;
    const [context, setContext] = React.useState(rangeSelection);
    const [held, setHeld] = React.useState(null);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(EmbedEditorPane, {
        item,
        editorBase,
        mediaType: "website",
        selectionCommand: command,
        selectionInteractionRef: interactionRef,
        onSelectionChange: setContext,
        onSelectionResult: (result) => results.push(result),
      }),
      React.createElement(SelectionToolbar, {
        context: selectionDuringInteraction(context, held),
        onCommand: setCommand,
        onSelectionInteractionChange: (next) => {
          setHeld(next);
          interactionRef.current?.(next);
        },
      }),
    );
  }

  await act(async () => root.render(React.createElement(Host)));
  try {
    const iframe = container.querySelector("iframe");
    assert.ok(iframe, "embed pane must render a trusted iframe");
    const src = new URL(iframe.src, HOST);
    const instanceId = src.searchParams.get("instance");
    assert.ok(instanceId);
    const editorOrigin = src.origin;
    const frameWindow = iframe.contentWindow;
    assert.ok(frameWindow);
    const originalPost = frameWindow.postMessage.bind(frameWindow);
    frameWindow.postMessage = (data, origin) => {
      outgoing.push({ data, origin });
      return originalPost(data, origin);
    };

    await act(async () => {
      iframe.dispatchEvent(new window.Event("load"));
    });
    await act(async () => {
      window.dispatchEvent(
        new window.MessageEvent("message", {
          data: {
            protocol: EDITOR_PROTOCOL,
            type: "ready",
            instanceId,
          },
          origin: editorOrigin,
          source: frameWindow,
        }),
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new window.MessageEvent("message", {
          data: {
            protocol: EDITOR_PROTOCOL,
            type: "selection-changed",
            instanceId,
            selection: rangeSelection,
          },
          origin: editorOrigin,
          source: frameWindow,
        }),
      );
    });

    const bold = container.querySelector(
      '[data-selection-control-id="bold"] button',
    );
    assert.ok(bold, "shared toolbar must show the live selection");
    await act(async () => firePointer(bold, "pointerdown"));
    await act(async () => {
      window.dispatchEvent(
        new window.MessageEvent("message", {
          data: {
            protocol: EDITOR_PROTOCOL,
            type: "selection-changed",
            instanceId,
            selection: null,
          },
          origin: editorOrigin,
          source: frameWindow,
        }),
      );
    });
    outgoing.length = 0;
    await act(async () => bold.click());
    const sent = outgoing.find(
      (entry) => entry.data?.type === "selection-command",
    );
    assert.ok(sent, "held command must reach sendToEditor");
    assert.equal(sent.data.origin, "user");
    assert.equal(sent.data.command.selectionId, "text:hero");
    assert.equal(sent.data.command.selectionRevision, 4);
    assert.equal(sent.data.protocol, EDITOR_PROTOCOL);
    assert.equal(sent.origin, editorOrigin);

    await act(async () => {
      window.dispatchEvent(new window.Event("pointerup", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    outgoing.length = 0;
    results.length = 0;
    await act(async () => {
      api.setCommand({
        requestId: selectionRequestId(),
        selectionId: "text:hero",
        controlId: "bold",
        value: true,
        selectionRevision: 4,
        selectionEpoch: 2,
      });
    });
    const after = outgoing.filter(
      (entry) =>
        entry.data?.type === "selection-command" &&
        entry.data.origin === "user",
    );
    assert.equal(after.length, 0, "release must reject a delayed matching command");
    assert.equal(results.at(-1)?.ok, false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("W5-r3 unmount and a new document clear the hold", () => {
  const gate = new SelectionCommandGate();
  applySelectionInteractionHold(gate, rangeSelection);
  assert.equal(
    gate.accept(
      normalizeSelectionCommand({
        requestId: selectionRequestId(),
        selectionId: "text:hero",
        controlId: "bold",
        value: true,
        selectionRevision: 4,
        selectionEpoch: 2,
      }),
      null,
    ),
    true,
  );
  applySelectionInteractionHold(gate, null);
  assert.equal(
    gate.accept(
      normalizeSelectionCommand({
        requestId: selectionRequestId(),
        selectionId: "text:hero",
        controlId: "italic",
        value: true,
        selectionRevision: 4,
        selectionEpoch: 2,
      }),
      null,
    ),
    false,
  );
  applySelectionInteractionHold(gate, rangeSelection);
  gate.reconcile({
    ...rangeSelection,
    id: "text:other-doc",
    revision: 1,
    epoch: 9,
  });
  assert.equal(gate.holding(), false);
  assert.equal(
    gate.accept(
      normalizeSelectionCommand({
        requestId: selectionRequestId(),
        selectionId: "text:hero",
        controlId: "bold",
        value: true,
        selectionRevision: 4,
        selectionEpoch: 2,
      }),
      {
        ...rangeSelection,
        id: "text:other-doc",
        revision: 1,
        epoch: 9,
      },
    ),
    false,
  );
});
