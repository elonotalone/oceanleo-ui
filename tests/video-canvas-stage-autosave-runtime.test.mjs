import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { AdvancedPersistenceController } from "../src/shell/advanced-persistence-controller.ts";
import { WorkspaceSessionContext } from "../src/shell/workspace-session-context.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://video.oceanleo.com/",
});
const { window } = dom;
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
  CustomEvent: window.CustomEvent,
  localStorage: window.localStorage,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactNs = await import("react");
const React = reactNs.createElement ? reactNs : reactNs.default;
const { act } = reactNs.act ? reactNs : React;
const { createRoot } = await import("react-dom/client");

const shellStub = dataModule(`
  export function AdvancedWorkbenchShell({adapter}) {
    globalThis.__videoCanvasStageAdapter = adapter;
    return adapter.stage;
  }
`);
const frameStub = dataModule(`
  export function embedEditorBase(){ return "https://video-frame.test"; }
  export function EmbedEditorPane(props){ globalThis.__videoCanvasFrameProps = props; return null; }
`);
const collabStub = dataModule(`
  export function useEntityCollab(){
    return {readOnly:false, saveGate:true, room:null, collab:null, markSaved(){}};
  }
  export function useLockedEditCollab(){
    return {readOnly:false, mayWrite:true, collab:null, markSaved(){}};
  }
`);
const uiStub = dataModule("export function useUI(){ return (message) => message; }");
const mediaStub = dataModule("export async function fetchMediaBlob(){ throw new Error('unexpected remote graph read'); }");
const dynamicStub = dataModule("export default function dynamic(){ return function DynamicPlaceholder(){ return null; }; }");
const failurePanelStub = dataModule("export function EditorSourceFailurePanel(){ return null; }");
const useImStub = dataModule("export function useImEnabled(){ return false; }");
const preferLocalStub = dataModule("export function usePreferLocalRemoteEditor(){ return false; }");
const dependencyStub = dataModule("export async function prepareVideoCanvasDependencyGrants(){ return []; }");
const stubs = {
  "../AdvancedWorkbenchShell": shellStub,
  "../workbench-embed": frameStub,
  "../collab/adapters/use-entity-collab": collabStub,
  "../../i18n/ui/useUI": uiStub,
  "../../lib/media-proxy": mediaStub,
  "../../lib/im/client": useImStub,
  "../use-prefer-local-editors": preferLocalStub,
  "../doc-editors/EditorSourceFailurePanel": failurePanelStub,
  "./video-canvas-dependencies": dependencyStub,
  "next/dynamic": dynamicStub,
};

const { VideoCanvasStage } = await import(
  await compileModule("src/shell/workflow-carrier/VideoCanvasStage.tsx", stubs)
);

const ROOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INITIAL_REVISION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NEXT_REVISION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FINAL_REVISION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function libraryItem(revisionId = INITIAL_REVISION) {
  return {
    key: `artifact:${ROOT_ID}:${revisionId}`,
    id: ROOT_ID,
    artifactId: ROOT_ID,
    revisionId,
    artifactType: "workflow",
    kind: "workflow",
    title: "Runtime workflow",
    meta: {
      graph: {
        nodes: [{ id: "source", kind: "video", label: "Source", x: 0, y: 0, ports: {} }],
        edges: [],
      },
    },
    artifact: {
      artifactId: ROOT_ID,
      revisionId,
      artifactType: "workflow",
      access: { canEdit: true },
    },
  };
}

function committedItem(revisionId, previousRevisionId = INITIAL_REVISION) {
  return {
    artifactId: ROOT_ID,
    revisionId,
    artifactType: "workflow",
    meta: { previous_revision_id: previousRevisionId },
    artifact: {
      artifactId: ROOT_ID,
      revisionId,
      artifactType: "workflow",
      editorCapability: "video-canvas",
      sourceFormat: "oceanleo.video.project.v2",
      integrity: { ok: true },
      renditions: {
        source: { purpose: "source", revisionId },
        preview: { purpose: "preview", revisionId, digest: `sha256:${"d".repeat(64)}` },
      },
    },
  };
}

const settle = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };

class FakeClock {
  now = 0;
  nextId = 1;
  timers = new Map();
  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + delay, callback });
    return id;
  };
  clearTimeout = (id) => this.timers.delete(id);
  async advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.now = due[1].at;
      due[1].callback();
      await settle();
    }
    this.now = end;
    await settle();
  }
}

function frameProps() {
  assert.ok(globalThis.__videoCanvasFrameProps, "native frame boundary should be mounted");
  return globalThis.__videoCanvasFrameProps;
}

function stageAdapter() {
  assert.ok(globalThis.__videoCanvasStageAdapter, "real Stage adapter should be captured");
  return globalThis.__videoCanvasStageAdapter;
}

async function waitFor(predicate, message, timeout = 2_500) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = predicate();
    if (value) return value;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.fail(message);
}

async function mountStage() {
  globalThis.__videoCanvasStageAdapter = null;
  globalThis.__videoCanvasFrameProps = null;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(
      WorkspaceSessionContext.Provider,
      { value: { activeFileScopeId: "video-stage-autosave" } },
      React.createElement(VideoCanvasStage, {
        item: libraryItem(),
        taskId: "task-video",
        siteId: "video",
        onClose() {},
      }),
    ));
  });
  await waitFor(
    () => stageAdapter().persistence && frameProps().onDirtyChange,
    "Stage persistence and frame bridge did not mount",
  );
  return {
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
      await settle();
      globalThis.__videoCanvasStageAdapter = null;
      globalThis.__videoCanvasFrameProps = null;
    },
  };
}

function controllerForStage(clock) {
  const flushes = [];
  const controller = new AdvancedPersistenceController({
    debounceMs: 500,
    maxRetries: 0,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    flushRevision: async (revision) => {
      flushes.push(revision);
      return stageAdapter().persistence.flush();
    },
    recordSavedItem: async () => true,
  });
  return { controller, flushes };
}

async function observeCurrentEdit(controller, dirty, revision) {
  const persistence = stageAdapter().persistence;
  controller.observe({
    revision,
    dirty,
    userEdited: dirty,
    itemKey: "video-stage-autosave-item",
  });
  await settle();
  assert.equal(persistence.autoSave, true);
}

test("real VideoCanvasStage participates in shared debounce, serializes edits, retries and waits for a new Library head", async () => {
  const mounted = await mountStage();
  const clock = new FakeClock();
  const { controller, flushes } = controllerForStage(clock);
  try {
    assert.equal(stageAdapter().persistence.requiresMountedFlush, true, "hosted canvas must stay mounted until leave flush settles");
    assert.equal(stageAdapter().persistence.dirty, false, "opening/hydrating the source is not a person edit");
    controller.observe({ revision: 0, dirty: false, userEdited: false, itemKey: "video-stage-autosave-item" });
    await act(async () => frameProps().onDirtyChange(true, 1));
    await waitFor(() => stageAdapter().persistence.dirty, "Stage did not expose the embedded dirty revision");
    await observeCurrentEdit(controller, true, 1);

    await act(async () => clock.advance(499));
    assert.deepEqual(flushes, [], "the shared debounce should not flush before its quiet window");
    await act(async () => clock.advance(1));
    await waitFor(() => frameProps().saveRequestId, "shared persistence did not request a host save");
    const firstSaveId = frameProps().saveRequestId;
    assert.equal(controller.snapshot().state, "saving", "dirty stays saving until a durable receipt arrives");
    assert.deepEqual(flushes, [1]);

    await act(async () => frameProps().onDirtyChange(true, 2));
    await waitFor(() => stageAdapter().persistence.editRevision === 2, "Stage did not observe the in-flight edit");
    await observeCurrentEdit(controller, true, 2);
    await act(async () => frameProps().onSaveResult({ ok: true, saveId: firstSaveId, item: committedItem(NEXT_REVISION, INITIAL_REVISION) }));
    await waitFor(() => frameProps().saveRequestId && frameProps().saveRequestId !== firstSaveId, "latest edit was not serialized after the first receipt");
    const secondSaveId = frameProps().saveRequestId;
    assert.equal(stageAdapter().persistence.dirty, true, "a receipt for an older edit cannot clear newer work");

    await act(async () => frameProps().onSaveResult({ ok: false, saveId: secondSaveId }));
    await controller.whenIdle();
    assert.equal(controller.snapshot().state, "error");
    assert.equal(stageAdapter().persistence.dirty, true, "failed host result keeps the canvas dirty");

    let retry;
    await act(async () => {
      retry = controller.retry();
      await settle();
    });
    await waitFor(() => frameProps().saveRequestId, "manual retry did not issue a new correlated save request");
    const retrySaveId = frameProps().saveRequestId;
    assert.notEqual(retrySaveId, secondSaveId);
    await act(async () => frameProps().onSaveResult({ ok: true, saveId: retrySaveId, item: committedItem(FINAL_REVISION, NEXT_REVISION) }));
    assert.equal((await retry).ok, true);
    await controller.whenIdle();
    assert.equal(stageAdapter().persistence.dirty, false);
    assert.equal(controller.hasUnconfirmedWork(), false);
    assert.deepEqual(flushes, [1, 2, 2]);

    await act(async () => frameProps().onDirtyChange(true, 3));
    await observeCurrentEdit(controller, true, 3);
    await act(async () => clock.advance(500));
    await waitFor(() => frameProps().saveRequestId, "new edit did not request a third save");
    const thirdSaveId = frameProps().saveRequestId;
    await act(async () => frameProps().onSaveResult({
      ok: true,
      saveId: thirdSaveId,
      item: committedItem(NEXT_REVISION, FINAL_REVISION),
    }));
    await controller.whenIdle();
    assert.equal(controller.snapshot().state, "error", "a correlated but previously-seen head cannot regress the saved pin");
    assert.equal(stageAdapter().persistence.dirty, true, "a known old revision cannot clear a newer edit");
    assert.deepEqual(flushes, [1, 2, 2, 3]);
  } finally {
    controller.dispose();
    await mounted.cleanup();
  }
});

test("leaving with a hosted save in flight cancels the waiter without claiming persistence", async () => {
  const mounted = await mountStage();
  const clock = new FakeClock();
  const { controller, flushes } = controllerForStage(clock);
  assert.equal(stageAdapter().persistence.requiresMountedFlush, true);
  controller.observe({ revision: 0, dirty: false, userEdited: false, itemKey: "video-stage-autosave-item" });
  await act(async () => frameProps().onDirtyChange(true, 1));
  await waitFor(() => stageAdapter().persistence.dirty, "Stage did not expose dirty state before leave");
  await observeCurrentEdit(controller, true, 1);
  await act(async () => clock.advance(500));
  await waitFor(() => frameProps().saveRequestId, "host save was not requested before leave");

  await mounted.cleanup();
  await controller.whenIdle();
  assert.deepEqual(flushes, [1]);
  assert.equal(controller.snapshot().state, "error");
  assert.equal(controller.hasUnconfirmedWork(), true, "leave cancellation is not a durable acknowledgement");
  controller.dispose();
});

test("a late correlated durable receipt after timeout updates the current head but unknown save IDs do not", async () => {
  const mounted = await mountStage();
  const originalSetTimeout = window.setTimeout.bind(window);
  let timedOutCallback;
  window.setTimeout = (callback, delay, ...args) => {
    if (delay === 45_000) {
      timedOutCallback = callback;
      return 999_999;
    }
    return originalSetTimeout(callback, delay, ...args);
  };
  const clock = new FakeClock();
  const { controller } = controllerForStage(clock);
  try {
    controller.observe({ revision: 0, dirty: false, userEdited: false, itemKey: "video-stage-autosave-item" });
    await act(async () => frameProps().onDirtyChange(true, 1));
    await waitFor(() => stageAdapter().persistence.dirty, "Stage did not expose dirty state before timeout");
    await observeCurrentEdit(controller, true, 1);
    await act(async () => clock.advance(500));
    await waitFor(() => frameProps().saveRequestId, "host save was not requested");
    const lateSaveId = frameProps().saveRequestId;
    assert.equal(typeof timedOutCallback, "function", "host timeout should be captured without waiting 45 seconds");

    await act(async () => timedOutCallback());
    await controller.whenIdle();
    assert.equal(controller.snapshot().state, "error", "timeout is not a save acknowledgement");
    assert.equal(stageAdapter().persistence.dirty, true);

    await act(async () => frameProps().onSaveResult({
      ok: true,
      saveId: "unrecognized-save-id",
      item: committedItem(NEXT_REVISION, INITIAL_REVISION),
    }));
    assert.equal(stageAdapter().persistence.dirty, true, "an uncorrelated item cannot clear dirty state");

    await act(async () => frameProps().onSaveResult({
      ok: true,
      saveId: lateSaveId,
      item: committedItem(NEXT_REVISION, INITIAL_REVISION),
    }));
    assert.equal(stageAdapter().persistence.dirty, false, "the exact timed-out save can acknowledge the unchanged edit");
    const cleanFlush = await stageAdapter().persistence.flush();
    assert.equal(cleanFlush.ok, true);
    assert.equal(cleanFlush.item.revisionId, NEXT_REVISION, "clean flush returns the late durable head, not the original pin");
  } finally {
    window.setTimeout = originalSetTimeout;
    controller.dispose();
    await mounted.cleanup();
  }
});

test("an authoritative core version event advances the clean pin without acknowledging an unknown flush", async () => {
  const mounted = await mountStage();
  try {
    await act(async () => frameProps().onProjectManifest?.({}));
    const captureId = await waitFor(
      () => frameProps().recoveryCaptureRequestId,
      "host did not request a recovery snapshot to establish collaboration mode",
    );
    await act(async () => frameProps().onRecoverySnapshot({
      recoveryId: captureId,
      ok: true,
      snapshot: {
        revision: 1,
        payload: {
          schema: "oceanleo.canvas.collab.v1",
          op: "state",
          loaded: true,
          nodes: [],
          edges: [],
        },
      },
    }));
    await waitFor(() => typeof frameProps().onVersionSaved === "function", "collaboration mode did not expose version-save callback");

    const initialPin = await stageAdapter().persistence.flush();
    assert.equal(initialPin.item.revisionId, INITIAL_REVISION);
    await act(async () => frameProps().onVersionSaved(committedItem(NEXT_REVISION, INITIAL_REVISION)));
    const advancedPin = await stageAdapter().persistence.flush();
    assert.equal(advancedPin.ok, true);
    assert.equal(advancedPin.item.revisionId, NEXT_REVISION, "native core commit is the latest verified durable head");

    await act(async () => frameProps().onSaveResult({
      ok: true,
      saveId: "unrecognized-save-id",
      item: committedItem(FINAL_REVISION, NEXT_REVISION),
    }));
    const unchangedPin = await stageAdapter().persistence.flush();
    assert.equal(unchangedPin.item.revisionId, NEXT_REVISION, "unknown save IDs cannot mutate the clean flush pin");
  } finally {
    await mounted.cleanup();
  }
});
