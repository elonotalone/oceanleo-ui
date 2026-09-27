import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { planArtifactSaveRenditions } from "../src/shell/doc-editors/artifact-save-contract.ts";
import { emptyOpenVideoProject, OPENVIDEO_PROJECT_SCHEMA } from "../src/shell/video-editor/designcombo/schema.ts";

const mediaStub = dataModule(`
  export async function fetchMediaBlob(...args) { return globalThis.__e4.fetch(...args); }
`);
const { createVideoDesigncomboPreview } = await import(await compileModule(
  "src/shell/video-editor/designcombo-save-preview.ts",
  { "../../lib/media-proxy": mediaStub },
));

// Canvas operations are deterministic substitutes: these tests do not launch a browser.
function canvas(width = 0, height = 0, label = "") {
  const result = { width, height, label, operations: [] };
  result.getContext = () => ({
    fillRect: (...args) => result.operations.push(["fill", ...args]),
    drawImage: (source, ...args) => result.operations.push(["image", source.label, ...args]),
    fillText: (...args) => result.operations.push(["text", ...args]),
  });
  result.toBlob = (callback, type) => callback(new Blob([
    JSON.stringify({ width: result.width, height: result.height, label, operations: result.operations }),
  ], { type }));
  return result;
}

function setGlobal(t, name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  });
}

function environment(t) {
  const state = { requests: [], canvases: [], saved: [], statuses: [] };
  state.fetch = async (url) => { state.requests.push(url); return new Blob([url]); };
  setGlobal(t, "__e4", state);
  setGlobal(t, "document", {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const created = canvas();
      state.canvases.push(created);
      return created;
    },
  });
  setGlobal(t, "createImageBitmap", async (blob) => ({
    width: 640, height: 360, label: await blob.text(),
    close() { state.closed = (state.closed || 0) + 1; },
  }));
  return state;
}

const item = () => ({
  key: "e4-video", id: "e4-video", title: "测试视频", kind: "video", source: "creation",
  url: "https://example.test/video.mp4", siteId: "video", favorite: false, meta: {},
});
const project = () => emptyOpenVideoProject();
const preparedManifest = { url: "https://example.test/project.json", digest: "ab".repeat(32) };

async function planInput(input) {
  const preview = await input.createPreview?.();
  return planArtifactSaveRenditions(input.artifactRevision.artifactType, {
    editorManifest: preparedManifest,
    previewBitmap: preview?.size ? {
      url: "https://example.test/preview.png",
      digest: createHash("sha256").update(new Uint8Array(await preview.arrayBuffer())).digest("hex"),
    } : null,
  });
}

test("old project-only video input is rejected by the actual save contract", async () => {
  const plan = await planInput({ artifactRevision: { artifactType: "video" } });
  assert.equal(plan.ok, false);
  assert.match(plan.error, /preview 或 full 至少有一项/);
});

test("current frame wins and is frozen before the later save callback", async (t) => {
  const state = environment(t);
  let captures = 0;
  const input = {
    project: project(), item: { ...item(), previewUrl: "existing-cover" }, title: "标题",
    frameReady: true,
    engine: { captureRenditionCanvas(purpose) {
      assert.equal(purpose, "preview");
      captures++;
      return canvas(1920, 1080, "current-frame");
    } },
  };
  const createPreview = createVideoDesigncomboPreview(input);
  assert.equal(captures, 1);
  input.engine.captureRenditionCanvas = () => { throw new Error("changed after upload started"); };
  const blob = await createPreview();
  assert.equal(blob.type, "image/png");
  assert.equal((await blob.text()).includes("current-frame"), true);
  assert.equal(state.requests.length, 0);
  assert.equal(state.canvases.length, 0);
});

test("capture error falls back to an existing cover, sized to the project", async (t) => {
  const state = environment(t);
  const blob = await createVideoDesigncomboPreview({
    project: project(), item: { ...item(), previewUrl: "existing-cover" }, title: "标题",
    frameReady: true, engine: { captureRenditionCanvas() { throw new Error("SecurityError"); } },
  })();
  const encoded = JSON.parse(await blob.text());
  assert.deepEqual(state.requests, ["existing-cover"]);
  assert.deepEqual([encoded.width, encoded.height], [1920, 1080]);
  assert.deepEqual(encoded.operations[1], ["image", "existing-cover", 0, 0, 1920, 1080]);
  assert.equal(state.closed, 1);
});

test("an unready stage skips capture and uses the thumbnail", async (t) => {
  const state = environment(t);
  await createVideoDesigncomboPreview({
    project: project(), item: { ...item(), thumbUrl: "thumbnail" }, title: "标题", frameReady: false,
    engine: { captureRenditionCanvas() { assert.fail("unready stage must not be captured"); } },
  })();
  assert.deepEqual(state.requests, ["thumbnail"]);
});

test("unreadable frame and failed cover URL continue through the remaining metadata covers", async (t) => {
  const state = environment(t);
  const tainted = canvas(1920, 1080);
  tainted.toBlob = () => { throw new Error("SecurityError"); };
  state.fetch = async (url) => {
    state.requests.push(url);
    if (url === "broken") throw new Error("expired");
    return new Blob([url]);
  };
  const blob = await createVideoDesigncomboPreview({
    project: project(), item: { ...item(), previewUrl: "broken", thumbUrl: "broken", meta: { cover_url: "meta-cover" } },
    title: "标题", frameReady: true, engine: { captureRenditionCanvas: () => tainted },
  })();
  assert.deepEqual(state.requests, ["broken", "meta-cover"]);
  assert.match(await blob.text(), /meta-cover/);
});

test("without a current frame or existing covers a title card matches the project", async (t) => {
  const state = environment(t);
  const snapshot = project();
  snapshot.settings.width = 1080;
  snapshot.settings.height = 1920;
  const blob = await createVideoDesigncomboPreview({
    project: snapshot, item: item(), title: "竖屏视频", engine: null, frameReady: false,
  })();
  const encoded = JSON.parse(await blob.text());
  assert.deepEqual([encoded.width, encoded.height], [1080, 1920]);
  assert.equal(encoded.operations.some(([op, text]) => op === "text" && text === "竖屏视频"), true);
  assert.equal(state.requests.length, 0);
});

test("failed image decoding or empty PNG encoding also reaches a clean title card", async (t) => {
  const state = environment(t);
  setGlobal(t, "createImageBitmap", async () => { throw new Error("not an image"); });
  const blank = canvas(1920, 1080);
  blank.toBlob = (done) => done(null);
  const blob = await createVideoDesigncomboPreview({
    project: project(), item: { ...item(), previewUrl: "project-json" }, title: "备用标题",
    engine: { captureRenditionCanvas: () => blank }, frameReady: true,
  })();
  assert.match(await blob.text(), /备用标题/);
  assert.equal(state.canvases.length, 1);
});

test("all three tiers honor declared preview dimensions", async (t) => {
  environment(t);
  for (const tier of ["frame", "cover", "title"]) {
    const inputItem = { ...item(), meta: { preview_width: "1280", preview_height: 720 } };
    if (tier === "cover") inputItem.previewUrl = "cover";
    const blob = await createVideoDesigncomboPreview({
      project: project(), item: inputItem, title: "标题", frameReady: tier === "frame",
      engine: { captureRenditionCanvas: () => canvas(1920, 1080, "frame") },
    })();
    const encoded = JSON.parse(await blob.text());
    assert.deepEqual([encoded.width, encoded.height], [1280, 720], tier);
  }
});

test("only failure of all tiers rejects with a readable message", async (t) => {
  environment(t);
  setGlobal(t, "document", { createElement() { throw new Error("internal-canvas-stage"); } });
  await assert.rejects(createVideoDesigncomboPreview({
    project: project(), item: item(), title: "标题", engine: null, frameReady: false,
  })(), { message: "无法生成视频封面，草稿尚未保存。请稍后重试。" });
});

const functions = (names) => dataModule(names.map((name) => `export function ${name}() { return null; }`).join("\n"));
const { VideoDesigncomboStage } = await import(await compileModule(
  "src/shell/video-editor/VideoDesigncomboStage.tsx", {
    react: dataModule(`
      export const useCallback = (f) => f;
      export const useMemo = (f) => f();
      export const useRef = (value) => ({ current: value });
      export const useState = (value) => [typeof value === "function" ? value() : value, (v) => globalThis.__e4.statuses.push(v)];
      export const useEffect = () => {};
    `),
    "../advanced-routes/mode-switch-gate": functions(["useModeSwitchHandoff", "useModeSwitchReady"]),
    "../advanced-routes/editor-handoff": dataModule(`export const useEditorHandoffSource = () => ({ status: "ready", source: null }); export const bindProFaceHandoff = () => () => {}; export const saveBeforeLeavePro = async () => true;`),
    "../advanced-routes/w19-handoff-store": dataModule(`
      export const W19_PRO_SAVED_AS_NEW_VERSION = "";
      export const peekW19EnterHandoff = () => null;
      export const reportW19ProSaved = () => {};
      export const resolveW19Handoff = () => null;
      export const w19ItemKey = () => "e4";
      export const w19OfficeProbeItem = (item) => item;
    `),
    "../AdvancedWorkbenchShell": functions(["AdvancedWorkbenchShell"]),
    "../advanced-recovery-store": functions(["advancedRecoveryKey"]),
    "../advanced-session": dataModule(`export const advancedSavedItem = (item) => item;`),
    "../workbench-routes": functions(["editorRouteFor", "editorToolLabel"]),
    "../plugin-command": functions(["usePluginCommandSurface"]),
    "../SelectionToolbar": functions(["SelectionToolbar"]),
    "../../lib/media-proxy": mediaStub,
    "../doc-editors/doc-io": dataModule(`
      export async function saveProjectWorkingHead(input) {
        globalThis.__e4.saved.push(input);
        return { ok: true, url: "https://example.test/project.json", projectUrl: "https://example.test/project.json" };
      }
    `),
    "./preview-engine": dataModule(`export class TimelinePreviewEngine {}`),
    "./render-client": functions(["renderTimeline"]),
    "../media-editors/visual-formats": dataModule(`export const visualDownloadFormats = () => [{ label: "MP4" }];`),
    "./designcombo/timeline-host": functions(["DesigncomboTimelineHost"]),
    "./designcombo/inspector-host": functions(["DesigncomboInspectorHost"]),
  },
));

async function stageSave(state) {
  const node = VideoDesigncomboStage({ item: item(), siteId: "video", onClose() {} });
  await node.props.adapter.persistence.flush();
  assert.equal(state.saved.length, 1);
  return state.saved[0];
}

test("saveDraft passes createPreview to saveProjectWorkingHead", async (t) => {
  const state = environment(t);
  const input = await stageSave(state);
  assert.equal(typeof input.createPreview, "function");
  assert.equal(input.project.schema, OPENVIDEO_PROJECT_SCHEMA);
  assert.equal(input.editorManifest.id, "video-timeline");
  assert.deepEqual(input.meta, { editor_capability: "video-timeline", editor: "video-designcombo" });
  assert.equal(input.workingHeadUrl, item().url);
});

test("the professional stage's actual save input satisfies the video contract", async (t) => {
  const state = environment(t);
  const input = await stageSave(state);
  const plan = await planInput(input);
  assert.equal(plan.ok, true, plan.error);
  assert.deepEqual(plan.renditions.map(({ purpose }) => purpose), ["preview", "editor_manifest"]);
});

test("pro and normal video faces share oceanleo.video-timeline.edit.v1", async (t) => {
  environment(t);
  const node = VideoDesigncomboStage({ item: item(), siteId: "video", onClose() {} });
  assert.equal(node.props.adapter.persistence.recovery.draftSchema, "oceanleo.video-timeline.edit.v1");
  assert.equal(node.props.adapter.persistence.autoSave, true);
});

test("switching to normal does not write the leave-pro lock copy", async (t) => {
  const state = environment(t);
  const node = VideoDesigncomboStage({ item: item(), siteId: "video", onClose() {} });
  state.statuses.length = 0;
  await node.props.adapter.mode.setMode("normal");
  assert.equal(
    state.statuses.includes("专业编辑里的修改还没保存成功，请重试。"),
    false,
  );
});

test("professional save writes the same video item, not a second work", async (t) => {
  const state = environment(t);
  const source = { ...item(), artifactId: "vid-root", revisionId: "r0" };
  const node = VideoDesigncomboStage({ item: source, siteId: "video", onClose() {} });
  await node.props.adapter.persistence.flush();
  assert.equal(state.saved.length, 1);
  assert.equal(state.saved[0].item.artifactId, "vid-root");
  assert.equal(state.saved[0].item.id, source.id);
  assert.equal(state.saved[0].artifactRevision.artifactType, "video");
  assert.equal(state.saved[0].artifactRevision.editor, "video-timeline");
});
