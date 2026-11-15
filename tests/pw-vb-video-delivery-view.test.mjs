import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { createVideoProject } from "../src/shell/video-canvas/engine/project-model.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previous = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previous) require.cache[canvasEntry] = previous; else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent })) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__vbOpened = [];
const { createRoot } = await import("react-dom/client");
const { CanvasProductView } = await import(await compileModule("src/shell/video-canvas/engine/CanvasProductViews.tsx", {
  "../../../i18n": dataModule("export function useUI(){return value=>value;}"),
  "./canvas-delivery-client": dataModule("export function openCanvasLibraryItem(item){globalThis.__vbOpened.push(item)}"),
}));

function fixture(approved = true) {
  const project = createVideoProject("Film");
  const head = project.versions[project.headVersionId];
  head.scenes = [{ sceneId: "s", title: "Scene", shotIds: ["shot"] }];
  head.shots = [{ shotId: "shot", sceneId: "s", title: "Shot", intendedDurationSeconds: 3, storyboardId: "sb", takeIds: ["take"], approvedTakeId: "take" }];
  head.takes = [{ takeId: "take", shotId: "shot", assetId: "video", status: approved ? "approved" : "candidate" }];
  project.assets.video = { assetId: "video", kind: "video", immutable: true, origin: "provider", title: "Shot", url: "https://cdn.example.test/shot.mp4", durationSeconds: 3, createdAt: "2026-11-15T00:00:00Z" };
  return project;
}

async function mount(project, extra = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const calls = [];
  const dispatch = async (command, args) => { calls.push([command, args]); return { status: "succeeded" }; };
  const props = { view: "timeline", project, comparison: null, dispatch, cancelActiveCommand: () => true, ...extra };
  await act(async () => root.render(React.createElement(CanvasProductView, props)));
  return { host, root, calls, props, async close(){await act(async()=>root.unmount());host.remove();} };
}

test("the canvas displays the real composed tracks, export settings, handover and restart limitation", async () => {
  const view = await mount(fixture());
  try {
    assert.match(view.host.textContent, /视频轨/);
    assert.match(view.host.textContent, /未完成的渲染会取消并退款/);
    assert.match(view.host.textContent, /在时间线里精修/);
    const render = view.host.querySelector('[data-command-id="canvas.timeline.final-render"]');
    assert.equal(render.disabled, false);
    await act(async () => render.click());
    assert.equal(view.calls[0][0], "canvas.timeline.final-render");
    assert.equal(view.host.querySelectorAll('input[type="number"]').length, 3);
  } finally { await view.close(); }
});

test("unapproved shots cannot render or hand over and the page explains the next step", async () => {
  const view = await mount(fixture(false));
  try {
    assert.equal(view.host.querySelector('[data-command-id="canvas.timeline.final-render"]').disabled, true);
    assert.equal(view.host.querySelector('[data-command-id="canvas.timeline.handoff"]').disabled, true);
    assert.match(view.host.textContent, /先在分镜中批准视频候选/);
  } finally { await view.close(); }
});

test("handover saves the canvas link before opening the ordinary timeline editor item", async () => {
  const project = fixture();
  const item = { artifactId: "timeline", revisionId: "r1", projectVersionId: project.headVersionId };
  const calls = [];
  let view;
  const dispatch = async (command) => {
    calls.push(command);
    if (command === "canvas.timeline.handoff") {
      project.timelineHandoff = item;
      view.root.render(React.createElement(CanvasProductView, { ...view.props, project: { ...project } }));
    }
    return { status: "succeeded" };
  };
  view = await mount(project, { dispatch });
  try {
    await act(async () => view.host.querySelector('[data-command-id="canvas.timeline.handoff"]').click());
    assert.deepEqual(calls, ["canvas.timeline.handoff", "canvas.project.save"]);
    assert.deepEqual(globalThis.__vbOpened.at(-1), item);
    assert.match(view.host.textContent, /打开时间线工程/);
  } finally { await view.close(); }
});
