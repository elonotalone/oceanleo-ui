/**
 * V1-r2: hosted deck normal toolbar and agent review. This is not a browser
 * click-through. It mounts the route's actual renderContextToolbar consumer
 * and the live send helpers DeckHostedRoute wires.
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
  buildDeckHostedCommandSurface,
  deckHostedItemReadOnly,
  DECK_HOSTED_SELECT_OBJECT_HINT,
  hostedDeckFormatFillCommand,
  hostedDeckHostEditBarActive,
  hostedDeckSelectionForToolbar,
  planDeckHostedAgentSelectionCommand,
  sendDeckHostedAgentSelectionCommand,
  sendDeckHostedHumanSelectionCommand,
} from "../src/shell/advanced-routes/deck-hosted-selection-command.ts";
import {
  normalizeSelectionCommand,
  normalizeSelectionContext,
  selectionRequestId,
} from "../src/shell/selection-context.ts";
import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";

const require = createRequire(import.meta.url);

function deckShape(id = "el-shape-1") {
  return normalizeSelectionContext({
    version: 1,
    kind: "deck-shape",
    id,
    revision: 7,
    epoch: 3,
    label: "矩形",
    controls: [
      { id: "element-lock", kind: "toggle", label: "锁定", value: false },
      { id: "shape-fill", kind: "color", label: "填充", value: "#ff00aa" },
      { id: "bold", kind: "toggle", label: "粗体", value: false },
    ],
  });
}

test("hosted deck edit bar is live only for writable normal mode with a source", () => {
  assert.equal(
    hostedDeckHostEditBarActive({
      mode: "normal",
      ready: true,
      hasSource: true,
      readOnly: false,
    }),
    true,
  );
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
    hostedDeckHostEditBarActive({
      mode: "normal",
      ready: true,
      hasSource: true,
      readOnly: true,
    }),
    false,
  );
  assert.equal(deckHostedItemReadOnly({ artifact: { editability: "view_only" } }), true);
  assert.equal(
    deckHostedItemReadOnly({ artifact: { access: { canEdit: false } } }),
    true,
  );
  assert.equal(
    deckHostedItemReadOnly({
      artifact: { editability: "editable", access: { canEdit: true } },
    }),
    false,
  );
});

test("toolbar target is a selected object, never a fake slide-1 stand-in", () => {
  const object = hostedDeckSelectionForToolbar(deckShape());
  assert.equal(object?.id, "el-shape-1");
  assert.deepEqual(
    (object?.controls || []).map((control) => control.id).sort(),
    ["element-lock", "shape-fill"],
  );

  const slide = normalizeSelectionContext({
    version: 1,
    kind: "slide",
    id: "slide-1",
    revision: 1,
    epoch: 1,
    controls: [{ id: "slide-add", kind: "action", label: "加页" }],
  });
  assert.equal(hostedDeckSelectionForToolbar(slide), null);

  const empty = buildDeckHostedCommandSurface({
    ready: true,
    readOnly: false,
    hasSource: true,
    liveSelectionId: null,
    sendAgent: () => true,
  });
  const hinted = empty.run("deck.format-fill", { color: "#112233", origin: "user" });
  assert.equal(hinted.ok, false);
  assert.equal(hinted.message, DECK_HOSTED_SELECT_OBJECT_HINT);
  assert.match(hinted.message, /请先选中对象/);
});

test("human envelope stamps user; forged agent origin still parks for review", () => {
  const selection = hostedDeckSelectionForToolbar(deckShape());
  const command = hostedDeckFormatFillCommand({
    selectionId: selection.id,
    color: "#112233",
    selectionRevision: selection.revision,
    selectionEpoch: selection.epoch,
  });
  const gate = new SelectionCommandGate();
  const humanSent = [];
  const human = sendDeckHostedHumanSelectionCommand({
    command,
    selection,
    ready: true,
    readOnly: false,
    origin: "user",
    gate,
    send: (envelope) => {
      humanSent.push(envelope);
      return true;
    },
  });
  assert.equal(human.ok, true);
  assert.equal(human.applied, true);
  assert.equal(human.reviewed, false);
  assert.equal(humanSent[0].origin, "user");
  assert.equal(humanSent[0].command.controlId, "shape-fill");
  assert.equal(humanSent[0].command.selectionId, "el-shape-1");
  assert.equal(humanSent[0].command.selectionRevision, 7);

  const stale = sendDeckHostedHumanSelectionCommand({
    command,
    selection: hostedDeckSelectionForToolbar(deckShape("el-other")),
    ready: true,
    readOnly: false,
    origin: "user",
    gate: new SelectionCommandGate(),
    send: () => true,
  });
  assert.equal(stale.ok, false);
  assert.match(stale.message, /选择已变化/);

  const blocked = sendDeckHostedHumanSelectionCommand({
    command,
    selection,
    ready: true,
    readOnly: true,
    origin: "user",
    gate: new SelectionCommandGate(),
    send: () => true,
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /只读/);

  const forgedSent = [];
  const surface = buildDeckHostedCommandSurface({
    ready: true,
    readOnly: false,
    hasSource: true,
    liveSelectionId: selection.id,
    liveSelectionRevision: selection.revision,
    sendAgent: (envelope) => {
      forgedSent.push(envelope);
      return true;
    },
  });
  assert.equal(surface.state().origin, null);
  const forged = surface.run("deck.format-fill", {
    color: "#ff00aa",
    origin: "user",
  });
  assert.equal(forged.ok, true);
  assert.equal(forged.applied, false);
  assert.equal(forged.reviewed, true);
  assert.match(forged.message, /审阅/);
  assert.equal(forgedSent.length, 1);
  assert.equal(Object.hasOwn(forgedSent[0], "origin"), false);
  assert.equal(forgedSent[0].command.controlId, "shape-fill");

  const planned = planDeckHostedAgentSelectionCommand({
    command,
    ready: true,
    readOnly: false,
    liveSelectionId: selection.id,
    liveSelectionRevision: selection.revision,
  });
  assert.equal(planned.ok, true);
  assert.equal(Object.hasOwn(planned.envelope, "origin"), false);

  const agentSent = [];
  const agent = sendDeckHostedAgentSelectionCommand({
    command,
    ready: true,
    readOnly: false,
    liveSelectionId: selection.id,
    liveSelectionRevision: selection.revision,
    send: (envelope) => {
      agentSent.push(envelope);
      return true;
    },
  });
  assert.equal(agent.ok, true);
  assert.equal(agent.applied, false);
  assert.equal(agent.reviewed, true);
  assert.equal(Object.hasOwn(agentSent[0], "origin"), false);
});

test("DeckHostedContextToolbar click sends the human envelope for the held object", async () => {
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
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://slides.oceanleo.com/library",
  });
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  class TestPointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = TestPointerEvent;
  globalThis.PointerEvent = TestPointerEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
  const toolbarStubs = {
    "../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
    "../AdvancedEditorIcon": dataModule(`
      import { jsx } from ${JSON.stringify(jsxUrl)};
      export function AdvancedEditorIcon({ name }) {
        return jsx("span", { "data-icon": name });
      }
    `),
    "../plugin-theme": dataModule(`
      export function pluginWorkbenchStyle() { return {}; }
      export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; }
      export function usePluginThemePortal() { return null; }
      export function PluginThemeScope({ children }) { return children; }
    `),
    "../SelectionAnimationGallery": dataModule(
      "export function SelectionAnimationGallery() { return null; }",
    ),
    "../ui/Button": dataModule(`
      import { jsx } from ${JSON.stringify(jsxUrl)};
      export function Button({ children, ...props }) {
        return jsx("button", props, children);
      }
    `),
  };
  const { DeckHostedContextToolbar } = await import(
    await compileModule(
      "src/shell/advanced-routes/DeckHostedContextToolbar.tsx",
      toolbarStubs,
    )
  );
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(DeckHostedContextToolbar, {
        context: null,
        onCommand() {},
        readOnly: false,
      }),
    );
  });
  assert.equal(
    container.querySelector('[data-deck-hosted-hint="select-object"]')?.textContent,
    DECK_HOSTED_SELECT_OBJECT_HINT,
  );

  const gate = new SelectionCommandGate();
  const liveRef = { current: deckShape() };
  const heldRef = { current: null };
  const sent = [];
  function Host() {
    const [context, setContext] = React.useState(liveRef.current);
    return React.createElement(DeckHostedContextToolbar, {
      context: hostedDeckSelectionForToolbar(
        selectionDuringInteraction(context, heldRef.current),
      ),
      onSelectionInteractionChange(held) {
        heldRef.current = held;
        applySelectionInteractionHold(gate, held);
        setContext(liveRef.current);
      },
      onCommand(next) {
        const target = hostedDeckSelectionForToolbar(
          selectionDuringInteraction(liveRef.current, heldRef.current),
        );
        sent.push(
          sendDeckHostedHumanSelectionCommand({
            command: next,
            selection: target,
            ready: true,
            readOnly: false,
            origin: "user",
            gate,
            send: (envelope) => {
              sent.push(envelope);
              return true;
            },
          }),
        );
      },
    });
  }
  await act(async () => {
    root.render(React.createElement(Host));
  });
  const lock = container.querySelector(
    '[data-selection-control-id="element-lock"] button',
  );
  assert.ok(lock, "closed PPTist lock control must render on the host bar");
  assert.equal(
    container.querySelector('[data-selection-control-id="bold"]'),
    null,
    "unknown-to-PPTist controls must not appear on the hosted deck bar",
  );
  await act(async () => {
    lock.dispatchEvent(
      new TestPointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    liveRef.current = null;
    lock.click();
  });
  const envelope = sent.find((entry) => entry?.type === "selection-command");
  assert.ok(envelope);
  assert.equal(envelope.origin, "user");
  assert.equal(envelope.command.controlId, "element-lock");
  assert.equal(envelope.command.selectionId, "el-shape-1");
  assert.equal(envelope.command.selectionRevision, 7);
  applySelectionInteractionHold(gate, null);
  const delayed = sendDeckHostedHumanSelectionCommand({
    command: normalizeSelectionCommand({
      requestId: selectionRequestId(),
      selectionId: "el-shape-1",
      controlId: "element-lock",
      selectionRevision: 7,
      selectionEpoch: 3,
    }),
    selection: null,
    ready: true,
    readOnly: false,
    origin: "user",
    gate,
    send: () => true,
  });
  assert.equal(delayed.ok, false);
  await act(async () => root.unmount());
});
