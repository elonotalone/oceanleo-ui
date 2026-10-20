import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { resetBackgroundSaverForTests } from "../src/shell/advanced-background-saver.ts";
import { useAdvancedAutoSave } from "../src/shell/use-advanced-autosave.ts";
import {
  recordUserMutation,
  resetUserEditSession,
} from "../src/shell/user-edit-session.ts";

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
  url: "https://image.oceanleo.com/advanced/image_editing",
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE_SETTLE_MS = 2_000;

function Probe({ bed, input }) {
  bed.hook = useAdvancedAutoSave({
    key: bed.itemKey,
    dirty: input.dirty,
    revision: input.revision,
    flush: bed.flush,
    session: bed.session,
  });
  return null;
}

function createBed(itemKey) {
  const bed = {
    itemKey,
    flushCalls: [],
    hook: null,
    session: {
      sessionId: "session-w2",
      taskId: null,
      snapshot: () => ({}),
      ensure: async () => null,
      navigate: () => {},
      startNew: async () => null,
      renameTitle: async () => true,
      recordSavedItem: async () => true,
      registerFlush: () => {},
    },
  };
  bed.flush = async () => {
    bed.flushCalls.push(Date.now());
    return { ok: true, item: { key: itemKey, id: "image-1" } };
  };
  return bed;
}

test("load dirty+revision without a user mutation does not autosave", async () => {
  resetUserEditSession();
  resetBackgroundSaverForTests();
  const bed = createBed("artifact:image-load");
  const tree = await mount(
    React.createElement(Probe, {
      bed,
      input: { dirty: true, revision: 1 },
    }),
  );
  await act(async () => {
    await sleep(DEBOUNCE_SETTLE_MS);
  });
  assert.equal(bed.flushCalls.length, 0);
  await tree.unmount();
  resetBackgroundSaverForTests();
  resetUserEditSession();
});

test("the shared session userEdited flag lets the hook schedule after a person edits", async () => {
  resetUserEditSession();
  resetBackgroundSaverForTests();
  const itemKey = "artifact:image-edit";
  const bed = createBed(itemKey);
  const tree = await mount(
    React.createElement(Probe, {
      bed,
      input: { dirty: true, revision: 1 },
    }),
  );
  await act(async () => {
    await sleep(DEBOUNCE_SETTLE_MS);
  });
  assert.equal(bed.flushCalls.length, 0);
  await act(async () => {
    recordUserMutation(itemKey);
  });
  await act(async () => {
    await sleep(DEBOUNCE_SETTLE_MS);
  });
  assert.equal(bed.flushCalls.length, 1);
  await tree.unmount();
  resetBackgroundSaverForTests();
  resetUserEditSession();
});
