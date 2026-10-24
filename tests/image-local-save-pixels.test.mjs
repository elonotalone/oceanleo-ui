import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_SAVE_MAX_PIXELS,
  LocalSavePixelError,
  collectPixelSources,
  embedPixelSources,
} from "../src/shell/image-editor/local-save-pixels.ts";
import { createLocalSaveRunner } from "../src/shell/image-editor/local-save.ts";

// REAL: collect/embed/runner are the production modules. MOCK: live Fabric objects are plain
// stand-ins (Fabric needs a canvas) and the PNG encoder is injected; the real canvas encoder and the
// real Fabric snapshot are exercised by the built-editor Chromium test in oceanleo-app.

const el = (w = 10, h = 10) => ({ naturalWidth: w, naturalHeight: h });
const live = (extra = {}) => ({ ...extra });
const png = (tag) => async () => `data:image/png;base64,${tag}`;

test("embeds every URL-backed image: top level, filtered+cropped, nested in a group, duplicated layer", async () => {
  const original = el(40, 30);
  const shared = el(20, 20);
  const grouped = el(8, 8);
  const liveObjects = [
    live({ type: "Rect" }),
    live({ type: "Image", _originalElement: original }),
    live({ type: "Image", _originalElement: shared }),
    live({ type: "Image", _originalElement: shared }), // duplicated layer, same loaded picture
    live({ type: "Group", getObjects: () => [live({ type: "Textbox" }), live({ type: "Image", _originalElement: grouped })] }),
    live({ type: "Image", _originalElement: el(1, 1), oceanleoRole: "crop" }), // crop helper: not in the snapshot
  ];
  const entries = [
    { type: "Rect" },
    { type: "Image", src: "https://x/old-signed", cropX: 4, cropY: 6, width: 30, height: 20, filters: [{ type: "Brightness", brightness: 0.2 }], angle: 12 },
    { type: "Image", src: "blob:dead" },
    { type: "Image", src: "https://x/old-signed-2" },
    { type: "Group", objects: [{ type: "Textbox", text: "hi" }, { type: "Image", src: "https://x/nested" }] },
  ];
  const sources = collectPixelSources(liveObjects, entries);
  assert.equal(sources.length, 4);
  const encoded = [];
  await embedPixelSources(sources, {
    encode: async (element) => {
      encoded.push(element);
      return `data:image/png;base64,E${encoded.length}`;
    },
  });
  assert.equal(entries[1].src, "data:image/png;base64,E1");
  assert.equal(entries[2].src, "data:image/png;base64,E2");
  assert.equal(entries[3].src, "data:image/png;base64,E2", "same loaded picture is encoded once");
  assert.equal(entries[4].objects[1].src, "data:image/png;base64,E3");
  assert.equal(encoded.length, 3);
  // crop / size / transform / filters / text are untouched
  assert.deepEqual(
    { cropX: entries[1].cropX, cropY: entries[1].cropY, width: entries[1].width, height: entries[1].height, angle: entries[1].angle, filters: entries[1].filters },
    { cropX: 4, cropY: 6, width: 30, height: 20, angle: 12, filters: [{ type: "Brightness", brightness: 0.2 }] },
  );
  assert.equal(entries[4].objects[0].text, "hi");
});

test("an image that already carries its pixels is not encoded again", async () => {
  const entries = [{ type: "Image", src: "data:image/png;base64,KEEP" }];
  const sources = collectPixelSources([live({ type: "Image" })], entries);
  assert.equal(sources.length, 0);
  assert.equal(entries[0].src, "data:image/png;base64,KEEP");
});

test("live objects that do not line up with the snapshot fail closed", () => {
  assert.throws(() => collectPixelSources([live({ type: "Rect" })], [{ type: "Rect" }, { type: "Image", src: "https://x" }]), LocalSavePixelError);
  assert.throws(
    () => collectPixelSources([live({ type: "Group" })], [{ type: "Group", objects: [{ type: "Image", src: "https://x" }] }]),
    LocalSavePixelError,
    "a group entry without a live group",
  );
  assert.throws(() => collectPixelSources([live({ type: "Image" })], [{ type: "Image", src: "https://x" }]), LocalSavePixelError, "image without original pixels");
});

test("area is refused before anything is encoded or allocated", async () => {
  let called = false;
  const entries = [{ type: "Image", src: "https://x" }];
  const sources = collectPixelSources([live({ type: "Image", _originalElement: el(5000, 4000) })], entries);
  assert.ok(5000 * 4000 > LOCAL_SAVE_MAX_PIXELS);
  await assert.rejects(embedPixelSources(sources, { encode: async () => { called = true; return "x"; } }), LocalSavePixelError);
  assert.equal(called, false);
  assert.equal(entries[0].src, "https://x");
});

test("over budget fails explicitly and an oversized result is not kept for the next save", async () => {
  const element = el(10, 10);
  const make = () => collectPixelSources([live({ type: "Image", _originalElement: element })], [{ type: "Image", src: "https://x" }]);
  let calls = 0;
  const big = async () => {
    calls += 1;
    return `data:image/png;base64,${"A".repeat(200)}`;
  };
  await assert.rejects(embedPixelSources(make(), { budget: 100, encode: big }), /太大/);
  await assert.rejects(embedPixelSources(make(), { budget: 100, encode: big }), /太大/);
  assert.equal(calls, 2, "the refused giant was not cached; a later save with room encodes it afresh");
  const entries = [{ type: "Image", src: "https://x" }];
  await embedPixelSources(collectPixelSources([live({ type: "Image", _originalElement: element })], entries), { budget: 1000, encode: big });
  assert.match(entries[0].src, /^data:image\/png/);
  const total = [{ type: "Image", src: "https://a" }, { type: "Image", src: "https://b" }];
  const two = collectPixelSources([live({ _originalElement: el(2, 2), type: "Image" }), live({ _originalElement: el(3, 3), type: "Image" })], total);
  await assert.rejects(embedPixelSources(two, { budget: 300, encode: big }), /太大/, "the total across layers counts");
});

test("an encoder failure (tainted canvas) is reported, not swallowed", async () => {
  const sources = collectPixelSources([live({ type: "Image", _originalElement: el() })], [{ type: "Image", src: "https://x" }]);
  await assert.rejects(embedPixelSources(sources, { encode: async () => { throw new Error("SecurityError"); } }), /跨域/);
});

function runnerWith({ capture, handler }) {
  const state = { revision: 1, dirty: true, saved: [] };
  const runner = createLocalSaveRunner({
    handler: async (request) => { state.saved.push(request); return handler ? handler(request, state) : { ok: true }; },
    admitted: () => ({ ok: true }),
    capture: () => capture(state),
    markSaved: (revision) => {
      if (state.revision !== revision) return false;
      state.dirty = false;
      return true;
    },
  });
  return { state, runner };
}

test("capture failure is an explicit failed save: nothing is sent, dirty stays", async () => {
  const { state, runner } = runnerWith({ capture: async () => { throw new LocalSavePixelError("图片太大，无法完整保存到本机；之前的保存仍然保留"); } });
  const result = await runner.run();
  assert.equal(result.ok, false);
  assert.match(result.error, /太大/);
  assert.equal(state.saved.length, 0);
  assert.equal(state.dirty, true);
});

test("an edit that lands while pixels are encoded is not cleaned by that save's ack", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { state, runner } = runnerWith({
    capture: async (s) => {
      const revision = s.revision; // snapshot + revision are read together, before the slow part
      await gate;
      return { revision, project: { rev: revision } };
    },
  });
  const running = runner.run();
  state.revision = 2; // the user edits while the picture is being encoded
  release();
  assert.deepEqual(await running, { ok: true });
  assert.equal(state.saved[0].revision, 1);
  assert.equal(state.dirty, true, "revision 2 is still unsaved");
  // the next save captures the newer revision
  const again = await runner.run();
  assert.deepEqual(again, { ok: true });
  assert.equal(state.saved.at(-1).revision, 2);
  assert.equal(state.dirty, false);
});

test("closing the editor during capture fails the save and sends nothing", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { state, runner } = runnerWith({ capture: async (s) => { await gate; return { revision: s.revision, project: {} }; } });
  const running = runner.run();
  runner.dispose();
  release();
  const result = await running;
  assert.equal(result.ok, false);
  assert.equal(state.saved.length, 0);
  assert.equal(state.dirty, true);
});
