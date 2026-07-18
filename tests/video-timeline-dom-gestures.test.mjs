import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import {
  beginTimelineGesture,
  cancelTimelineGesture,
  commitTimelineGesture,
  createTimelineGestureHistory,
  updateTimelineGesture,
} from "../src/shell/video-editor/timeline-gesture-history.ts";

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

function exposeDomGlobals() {
  for (const [name, value] of Object.entries({
    window,
    document,
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
}

class TestPointerEvent extends window.MouseEvent {
  constructor(type, init = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
    Object.defineProperties(this, {
      pointerId: { value: init.pointerId ?? 1 },
      pointerType: { value: init.pointerType ?? "mouse" },
      isPrimary: { value: init.isPrimary ?? true },
    });
  }
}

function installPointerCapture() {
  const captures = new WeakMap();
  window.PointerEvent = TestPointerEvent;
  globalThis.PointerEvent = TestPointerEvent;

  window.Element.prototype.setPointerCapture = function setPointerCapture(
    pointerId,
  ) {
    const ids = captures.get(this) || new Set();
    ids.add(pointerId);
    captures.set(this, ids);
  };
  window.Element.prototype.hasPointerCapture = function hasPointerCapture(
    pointerId,
  ) {
    return captures.get(this)?.has(pointerId) ?? false;
  };
  window.Element.prototype.releasePointerCapture = function releasePointerCapture(
    pointerId,
  ) {
    const ids = captures.get(this);
    if (!ids?.delete(pointerId)) return;
    this.dispatchEvent(
      new TestPointerEvent("lostpointercapture", { pointerId }),
    );
  };
}

async function loadTimelineArea() {
  const sourcePath = resolve(
    "src/shell/video-editor/TimelineArea.tsx",
  );
  const timelineModelUrl = pathToFileURL(
    resolve("src/shell/video-editor/timeline-model.ts"),
  ).href;
  const reactUrl = pathToFileURL(require.resolve("react")).href;
  const jsxRuntimeUrl = pathToFileURL(
    require.resolve("react/jsx-runtime"),
  ).href;
  const uiStubUrl = `data:text/javascript,${encodeURIComponent(
    "export function useUI() { return (value) => value; }",
  )}`;
  const source = (await readFile(sourcePath, "utf8"))
    .replace('from "react";', `from ${JSON.stringify(reactUrl)};`)
    .replace(
      'from "../../i18n/ui/useUI";',
      `from ${JSON.stringify(uiStubUrl)};`,
    )
    .replace(
      'from "./timeline-model";',
      `from ${JSON.stringify(timelineModelUrl)};`,
    );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText.replace(
    'from "react/jsx-runtime";',
    `from ${JSON.stringify(jsxRuntimeUrl)};`,
  );

  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

function timelineDocument(startMs = 1000) {
  return {
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [
      {
        id: "video-track",
        kind: "video",
        clips: [
          {
            id: "clip-1",
            start_ms: startMs,
            duration_ms: 2000,
          },
        ],
      },
    ],
  };
}

function createStateHarness() {
  const base = timelineDocument();
  let history = createTimelineGestureHistory(base);
  const calls = {
    begin: 0,
    commit: 0,
    cancel: 0,
    autosave: 0,
  };
  const state = {
    doc: base,
    durationMs: 3000,
    playheadMs: 0,
    pxPerSecond: 100,
    snapEnabled: false,
    selectedClipId: "clip-1",
    setPxPerSecond() {},
    selectClip() {},
    removeTrack() {},
    seek() {},
    beginGesture() {
      calls.begin += 1;
      history = beginTimelineGesture(history);
    },
    endGesture() {
      calls.commit += 1;
      const revision = history.revision;
      history = commitTimelineGesture(history);
      if (history.revision !== revision) calls.autosave += 1;
    },
    cancelGesture() {
      calls.cancel += 1;
      history = cancelTimelineGesture(history);
    },
    moveClip(clipId, _trackId, startMs) {
      history = updateTimelineGesture(history, (current) => ({
        ...current,
        tracks: current.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, start_ms: startMs } : clip,
          ),
        })),
      }));
    },
    trimClip() {},
  };

  return {
    state,
    calls,
    snapshot() {
      return {
        startMs: history.document.tracks[0].clips[0].start_ms,
        dirty: history.dirty,
        revision: history.revision,
        undo: history.undo.length,
        redo: history.redo.length,
        baseActive: history.base !== null,
        autosave: calls.autosave,
      };
    },
  };
}

exposeDomGlobals();
installPointerCapture();
const { createRoot } = await import("react-dom/client");
const { TimelineArea } = await loadTimelineArea();

async function mountTimeline() {
  const harness = createStateHarness();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TimelineArea, { state: harness.state }));
  });
  const clip = container.querySelector(".cursor-grab");
  assert.ok(clip, "timeline clip should render");
  return {
    ...harness,
    clip,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function dispatchPointer(target, type, init = {}) {
  await act(async () => {
    target.dispatchEvent(
      new TestPointerEvent(type, {
        pointerId: 7,
        clientX: 0,
        clientY: 0,
        buttons: type === "pointerup" ? 0 : 1,
        ...init,
      }),
    );
  });
}

async function beginMovedGesture(mounted, pointerId = 7) {
  await dispatchPointer(mounted.clip, "pointerdown", {
    pointerId,
    clientX: 100,
  });
  await dispatchPointer(mounted.clip, "pointermove", {
    pointerId,
    clientX: 200,
  });
  assert.deepEqual(mounted.snapshot(), {
    startMs: 2000,
    dirty: false,
    revision: 0,
    undo: 0,
    redo: 0,
    baseActive: true,
    autosave: 0,
  });
}

function assertCancelled(mounted) {
  assert.deepEqual(mounted.snapshot(), {
    startMs: 1000,
    dirty: false,
    revision: 0,
    undo: 0,
    redo: 0,
    baseActive: false,
    autosave: 0,
  });
  assert.equal(mounted.calls.cancel, 1);
  assert.equal(mounted.calls.commit, 0);
}

test("pointercancel restores the base and late lostcapture/pointerup cannot commit", async () => {
  const mounted = await mountTimeline();
  try {
    await beginMovedGesture(mounted);
    await dispatchPointer(mounted.clip, "pointercancel");
    await act(async () => mounted.clip.releasePointerCapture(7));
    await dispatchPointer(mounted.clip, "pointerup");
    assertCancelled(mounted);
  } finally {
    await mounted.unmount();
  }
});

test("lostpointercapture restores the base and a late pointerup stays inert", async () => {
  const mounted = await mountTimeline();
  try {
    await beginMovedGesture(mounted, 11);
    await act(async () => mounted.clip.releasePointerCapture(11));
    await dispatchPointer(mounted.clip, "pointerup", { pointerId: 11 });
    assertCancelled(mounted);
  } finally {
    await mounted.unmount();
  }
});

test("unmount cancels an in-flight DOM drag without persistence side effects", async () => {
  const mounted = await mountTimeline();
  await beginMovedGesture(mounted, 13);
  await mounted.unmount();
  assertCancelled(mounted);
});

test("a successful pointerup commits exactly once despite lostcapture", async () => {
  const mounted = await mountTimeline();
  try {
    await beginMovedGesture(mounted, 17);
    await dispatchPointer(mounted.clip, "pointerup", { pointerId: 17 });
    await dispatchPointer(mounted.clip, "lostpointercapture", {
      pointerId: 17,
    });
    assert.deepEqual(mounted.snapshot(), {
      startMs: 2000,
      dirty: true,
      revision: 1,
      undo: 1,
      redo: 0,
      baseActive: false,
      autosave: 1,
    });
    assert.equal(mounted.calls.commit, 1);
    assert.equal(mounted.calls.cancel, 0);
  } finally {
    await mounted.unmount();
  }
});
