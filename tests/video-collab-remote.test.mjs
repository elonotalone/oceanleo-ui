import assert from "node:assert/strict";
import test from "node:test";
import {
  React,
  act,
  compileModule,
  dataModule,
  document,
  loadEntityCollab,
  makeWorld,
  mount,
  pointer,
  settle,
  window,
} from "./collab-media-sim.mjs";

const h = React.createElement;
const useUiStub = dataModule(`export const useUI = () => (text, vars) =>
  vars ? String(text).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars[key] ?? "")) : String(text);`);
const mediaProxyStub = dataModule(`
  export const fetchMediaBlob = async () => new Blob();
  export const importMediaAsset = async () => ({});
  export const importMediaUrl = async () => ({});
  export const isFirstPartyMediaUrl = () => false;
  export const canvasSafeUrl = (url) => url;
`);
const databaseStub = dataModule(`export const uploadFile = async () => ({ url: "" });`);
const persistenceStub = dataModule(`
  export const timelinePreviewRenditionPng = async () => null;
  export const uploadCoverPng = async () => ({ ok: false });
  export const uploadDraft = async () => { globalThis.__videoDraftUploads = (globalThis.__videoDraftUploads || 0) + 1; return { ok: false }; };
`);
const renderClientStub = dataModule(`export const renderTimeline = async () => ({ status: "failed" });`);
const previewEngineStub = dataModule(`
  class Engine {
    constructor() { this.playing = false; }
    isPlaying() { return this.playing; }
    play() { this.playing = true; }
    pause() { this.playing = false; }
  }
  // 没列出的方法（setTime / attachCanvas / dispose ……）一律空操作。
  export class TimelinePreviewEngine {
    constructor() {
      return new Proxy(new Engine(), {
        get(target, prop) {
          if (prop in target) return typeof target[prop] === "function" ? target[prop].bind(target) : target[prop];
          if (typeof prop === "string" && !prop.startsWith("on")) return () => undefined;
          return undefined;
        },
        set(target, prop, value) { target[prop] = value; return true; },
      });
    }
  }
`);

const { useEntityCollab } = await loadEntityCollab();
const timeline = await import(
  await compileModule("src/shell/video-editor/use-video-timeline.ts", {
    "../../lib/database": databaseStub,
    "../../lib/media-proxy": mediaProxyStub,
    "../../i18n/ui/useUI": useUiStub,
    "./persistence": persistenceStub,
    "./render-client": renderClientStub,
    "./preview-engine": previewEngineStub,
  })
);
const { useVideoTimeline } = timeline;
const adapter = await import("../src/shell/collab/adapters/video.ts");

const DOC = () => ({
  width: 1280,
  height: 720,
  fps: 30,
  tracks: [
    {
      id: "track_v",
      kind: "video",
      clips: [
        { id: "clip_1", start_ms: 0, duration_ms: 2000, source_url: "https://m/a.mp4", in_ms: 0, speed: 1, volume: 1 },
        { id: "clip_2", start_ms: 2000, duration_ms: 1500, source_url: "https://m/b.mp4", in_ms: 0, speed: 1, volume: 0.5 },
      ],
    },
  ],
});

const ITEM = (key) => ({
  id: `item-${key}`,
  key: `item-${key}`,
  title: "片子",
  kind: "video",
  source: "local",
  url: "",
  meta: { timeline_doc: DOC() },
});

/** 照 VideoTimelineRoute 的接法：真 useVideoTimeline + 真 useEntityCollab。 */
function makeClient(key, captured) {
  return function Client() {
    const editor = useVideoTimeline(ITEM(key));
    const editorRef = React.useRef(editor);
    editorRef.current = editor;
    const collab = useEntityCollab({
      item: { artifactId: key, title: "片子" },
      editorKind: "video",
      rootName: adapter.VIDEO_ROOT,
      toEntities: adapter.videoToEntities,
      fromEntities: (input, prev) => adapter.videoFromEntities(input, prev),
      local: editor.sourceReady ? editor.doc : null,
      applyRemote: (doc) => editorRef.current.applyRemoteDoc(doc),
      applyLocal: (doc) => editorRef.current.applyLocalDoc(doc),
      historyCoalesceMs: 0,
    });
    captured[key] = { editor, collab };
    return null;
  };
}

async function twoClients() {
  const world = makeWorld();
  const captured = {};
  const mountedA = await mount(h(makeClient("A", captured)));
  await settle();
  await world.sync();
  const mountedB = await mount(h(makeClient("B", captured)));
  await settle();
  await world.sync();
  await world.sync();
  return {
    world,
    captured,
    async close() {
      await mountedA.unmount();
      await mountedB.unmount();
    },
  };
}

const clip = (doc, id) => doc.tracks.flatMap((track) => track.clips).find((c) => c.id === id);

test("视频：B 的改动不打断 A —— 撤销栈、选中、播放头不变，也没有未保存标记", async () => {
  const { world, captured, close } = await twoClients();
  try {
    await act(async () => {
      captured.A.editor.selectClip("clip_1");
      captured.A.editor.seek(1500);
    });
    await act(async () => captured.A.editor.patchClip("clip_1", { volume: 0.3 }));
    await settle();
    await world.sync();
    // A 自己的那一步已经落成「已保存」之前的状态；记下基准
    const before = {
      depth: captured.A.collab.history.undoDepth,
      selected: captured.A.editor.selectedClipId,
      playhead: captured.A.editor.playheadMs,
      revision: captured.A.editor.editRevision,
      uploads: globalThis.__videoDraftUploads || 0,
    };
    assert.equal(before.depth, 1);
    assert.equal(before.selected, "clip_1");
    assert.equal(before.playhead, 1500);

    await act(async () => captured.B.editor.patchClip("clip_2", { volume: 0.9 }));
    await settle();
    await world.sync();

    assert.equal(clip(captured.A.editor.doc, "clip_2").volume, 0.9, "B 改的音量到了 A");
    assert.equal(captured.A.collab.history.undoDepth, before.depth, "A 的撤销栈长度不变");
    assert.equal(captured.A.editor.selectedClipId, before.selected, "选中不变");
    assert.equal(captured.A.editor.playheadMs, before.playhead, "播放头不变");
    assert.equal(captured.A.editor.editRevision, before.revision, "改动版本号不变 → 自动保存不会被触发");
    assert.equal(globalThis.__videoDraftUploads || 0, before.uploads, "没有发生任何保存调用");
    assert.equal(captured.A.editor.notice, "", "没有「已恢复上次未同步的本地草稿」之类的提示");
    assert.equal(captured.A.editor.canUndo, true, "A 自己的撤销仍可用");
  } finally {
    await close();
  }
});

test("视频：只收到对方改动的一端不会被标成未保存", async () => {
  const { world, captured, close } = await twoClients();
  try {
    const before = captured.B.editor.editRevision;
    await act(async () => captured.A.editor.patchClip("clip_1", { volume: 0.2 }));
    await settle();
    await world.sync();
    assert.equal(clip(captured.B.editor.doc, "clip_1").volume, 0.2);
    assert.equal(captured.B.editor.dirty, false);
    assert.equal(captured.B.editor.editRevision, before);
    assert.equal(captured.B.collab.history.undoDepth, 0);
    assert.equal(captured.B.collab.history.canUndo, false);
  } finally {
    await close();
  }
});

test("视频：A 撤销自己的那一步，B 的改动保留", async () => {
  const { world, captured, close } = await twoClients();
  try {
    await act(async () => captured.A.editor.patchClip("clip_1", { volume: 0.3 }));
    await settle();
    await world.sync();
    await act(async () => captured.B.editor.patchClip("clip_2", { volume: 0.9 }));
    await settle();
    await world.sync();

    await act(async () => captured.A.collab.history.undo());
    await settle();
    await world.sync();

    assert.equal(clip(captured.A.editor.doc, "clip_1").volume, 1, "A 的音量改动被撤销");
    assert.equal(clip(captured.A.editor.doc, "clip_2").volume, 0.9, "B 的改动还在 A 这边");
    assert.equal(clip(captured.B.editor.doc, "clip_1").volume, 1);
    assert.equal(clip(captured.B.editor.doc, "clip_2").volume, 0.9, "B 自己这边也没被撤掉");
    assert.equal(captured.A.editor.dirty, true, "撤销是 A 自己的改动：要保存");
  } finally {
    await close();
  }
});

test("视频：对方已经删掉的片段，我的撤销不会把它救回来", async () => {
  const { world, captured, close } = await twoClients();
  try {
    await act(async () => captured.A.editor.patchClip("clip_2", { volume: 0.1 }));
    await settle();
    await world.sync();
    await act(async () => {
      captured.B.editor.deleteClip("clip_2");
    });
    await settle();
    await world.sync();
    assert.equal(clip(captured.A.editor.doc, "clip_2"), undefined);
    await act(async () => captured.A.collab.history.undo());
    await settle();
    await world.sync();
    assert.equal(clip(captured.A.editor.doc, "clip_2"), undefined, "对方删掉的片段仍然是删掉的");
    assert.match(captured.A.collab.history.notice, /对方已经改过/);
  } finally {
    await close();
  }
});

// ------------------------------------------------------------------ 只读

test("视频（只读）：能拖播放头、播放、缩放时间线；改内容的入口都不可用", async () => {
  const calls = [];
  const spy = (name) => (...args) => calls.push([name, ...args]);
  const doc = DOC();
  const state = new Proxy(
    {
      doc,
      durationMs: 3500,
      playheadMs: 0,
      playing: false,
      pxPerSecond: 60,
      snapEnabled: true,
      selectedClipId: "",
      selected: null,
      canUndo: false,
      canRedo: false,
      loadingSource: false,
      previewReady: true,
      error: "",
      notice: "",
      canvasRef: () => undefined,
      exporting: false,
      addingMedia: false,
      savingDraft: false,
      capturingCover: false,
      draftSavedUrl: "",
      coverUrl: "",
      sourceReady: true,
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return typeof prop === "string" ? spy(prop) : undefined;
      },
    },
  );
  const stageModule = await import(
    await compileModule("src/shell/video-editor/VideoTimelineStage.tsx", { "../../i18n/ui/useUI": useUiStub })
  );
  const controlsModule = await import(
    await compileModule("src/shell/video-editor/VideoTimelineControls.tsx", { "../../i18n/ui/useUI": useUiStub })
  );
  const stage = await mount(h(stageModule.VideoTimelineStage, { state, readOnly: true }));
  const controls = await mount(h(controlsModule.VideoTimelineControls, { state, readOnly: true }));
  try {
    // 控制栏：整块是置灰的 fieldset，里面的按钮、输入都被禁用
    const fieldset = controls.container.querySelector("fieldset");
    assert.ok(fieldset?.disabled, "素材 / 分割 / 加轨等改内容入口整块禁用");
    assert.equal(fieldset.getAttribute("data-collab-readonly"), "true");
    // 舞台：播放、逐帧、缩放按钮没被禁用
    const buttons = [...stage.container.querySelectorAll("button")];
    const byText = (text) => buttons.find((b) => b.textContent?.includes(text) || b.title === text || b.getAttribute("aria-label") === text);
    for (const label of ["播放", "上一帧", "下一帧", "放大时间线", "缩小时间线"]) {
      const button = byText(label);
      assert.ok(button, `${label} 按钮存在`);
      assert.equal(button.disabled, false, `${label} 在只读时仍可用`);
    }
    await act(async () => byText("播放").click());
    await act(async () => byText("下一帧").click());
    assert.ok(calls.some((call) => call[0] === "togglePlay"), "点播放会调用 togglePlay");
    assert.ok(calls.some((call) => call[0] === "stepFrame"), "逐帧可用");

    // 键盘：空格播放可用；Delete / S / Ctrl+Z 在只读时不改内容
    const root = stage.container.firstElementChild;
    const press = async (key, extra = {}) =>
      act(async () => {
        root.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
      });
    calls.length = 0;
    await press(" ");
    await press("ArrowRight");
    assert.ok(calls.some((call) => call[0] === "togglePlay"));
    assert.ok(calls.some((call) => call[0] === "stepFrame"));
    calls.length = 0;
    await press("Delete");
    await press("Backspace");
    await press("s");
    await press("z", { ctrlKey: true });
    assert.deepEqual(calls, [], "只读时删除 / 分割 / 撤销快捷键不触发任何改动");

    // 时间线：拖标尺能动播放头；点片段只选中，不开始移动 / 裁剪
    const content = stage.container.querySelector("[data-video-timeline-content]");
    assert.ok(content, "时间线内容存在");
    assert.equal(content.getAttribute("data-collab-readonly"), "true");
    const ruler = content.querySelector("[data-ruler]");
    calls.length = 0;
    await pointer(ruler, "pointerdown", { clientX: 60, pointerId: 3 });
    await pointer(ruler, "pointermove", { clientX: 120, pointerId: 3 });
    await pointer(ruler, "pointerup", { clientX: 120, pointerId: 3 });
    const seeks = calls.filter((call) => call[0] === "seek").map((call) => call[1]);
    assert.ok(seeks.length >= 2 && seeks.at(-1) > seeks[0], `拖播放头会连续 seek：${seeks.join(",")}`);

    const clipBlock = [...content.querySelectorAll("div")].find(
      (node) => node.className.includes("cursor-default") && node.className.includes("absolute top-1"),
    );
    assert.ok(clipBlock, "片段块在只读时是默认光标，不是抓手");
    calls.length = 0;
    await pointer(clipBlock, "pointerdown", { clientX: 30, pointerId: 4 });
    await pointer(clipBlock, "pointermove", { clientX: 200, pointerId: 4 });
    await pointer(clipBlock, "pointerup", { clientX: 200, pointerId: 4 });
    const mutating = calls.filter((call) => ["beginGesture", "moveClip", "trimClip", "endGesture"].includes(call[0]));
    assert.deepEqual(mutating, [], "只读时拖片段不会移动 / 裁剪");
    assert.ok(calls.some((call) => call[0] === "selectClip"), "点片段仍能选中查看");
    assert.equal(content.querySelectorAll(".cursor-ew-resize").length, 0, "只读时不画裁剪手柄");
  } finally {
    await stage.unmount();
    await controls.unmount();
  }
});

void document;

test("视频（只读）：片段浮条的每个改动控件置灰并提示「你只能查看」，命令不生效", async () => {
  const calls = [];
  const toolbar = await import(
    await compileModule("src/shell/video-editor/VideoTimelineContextToolbar.tsx", {
      "../../i18n/ui/useUI": useUiStub,
      "../SelectionToolbar": dataModule(`
        export function SelectionToolbar({ context, onCommand }) {
          globalThis.__videoSelection = { context, onCommand };
          return null;
        }
      `),
    })
  );
  const doc = DOC();
  const located = { clip: doc.tracks[0].clips[0], track: doc.tracks[0] };
  const state = new Proxy(
    { selected: located },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return typeof prop === "string" ? (...args) => calls.push([prop, ...args]) : undefined;
      },
    },
  );
  const readOnly = await mount(h(toolbar.VideoTimelineContextToolbar, { state, readOnly: true }));
  try {
    const { context, onCommand } = globalThis.__videoSelection;
    assert.ok(context.controls.length >= 8, "素材片段的控件都在");
    assert.ok(context.controls.every((control) => control.disabled === true), "每个控件都置灰");
    assert.ok(context.controls.every((control) => control.unavailableReason === "你只能查看"));
    for (const control of context.controls) onCommand({ selectionId: context.id, controlId: control.id, value: 1 });
    assert.deepEqual(calls, [], "只读时命令不触发任何改动");
  } finally {
    await readOnly.unmount();
  }
  const editable = await mount(h(toolbar.VideoTimelineContextToolbar, { state, readOnly: false }));
  try {
    const { context, onCommand } = globalThis.__videoSelection;
    assert.ok(context.controls.every((control) => control.disabled !== true), "非只读时控件可用");
    onCommand({ selectionId: context.id, controlId: "delete" });
    assert.ok(calls.some((call) => call[0] === "deleteSelectedClip"));
  } finally {
    await editable.unmount();
  }
});
