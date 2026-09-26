import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { probeMediaSource } = await import(
  await compileModule("src/shell/video-editor/media-probe.ts", {
    "../../lib/media-proxy": dataModule(
      "export function canvasSafeUrl(url) { return url; }",
    ),
  }),
);

function mediaEnvironment(t) {
  const elements = [];
  const timers = new Map();
  let timerId = 0;
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = {
    createElement(kind) {
      const el = {
        kind, duration: 15.015, videoWidth: 2560, videoHeight: 1440,
        src: "", onloadedmetadata: null, onerror: null, releases: 0,
        removeAttribute(name) { if (name === "src") this.src = ""; },
        load() { this.releases += 1; },
      };
      elements.push(el);
      return el;
    },
  };
  globalThis.window = {
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  t.after(() => Object.assign(globalThis, previous));
  return { elements, timers };
}

const metadata = { ok: true, durationMs: 15015, width: 2560, height: 1440 };

test("initial source, track validation and effect replay share one in-flight media request", async t => {
  const { elements, timers } = mediaEnvironment(t);
  const calls = Array.from({ length: 3 }, () => probeMediaSource("https://media.example/revision-a", "video"));
  // Regression: the final initialization used to queue behind two redundant probes.
  assert.equal(elements.length, 1);
  assert.equal(timers.size, 1);
  assert.equal(elements[0].preload, "metadata");
  assert.equal(elements[0].crossOrigin, "anonymous");
  elements[0].onloadedmetadata();
  assert.deepEqual(await Promise.all(calls), [metadata, metadata, metadata]);
  assert.equal(elements[0].src, "");
  assert.equal(elements[0].releases, 1);
  assert.equal(timers.size, 0);
});

test("a later reopen verifies the bytes again rather than retaining successful metadata", async t => {
  const { elements } = mediaEnvironment(t);
  const first = probeMediaSource("https://media.example/reopen", "video");
  elements[0].onloadedmetadata();
  assert.deepEqual(await first, metadata);
  const reopened = probeMediaSource("https://media.example/reopen", "video");
  assert.equal(elements.length, 2);
  elements[1].duration = 9;
  elements[1].onloadedmetadata();
  assert.deepEqual(await reopened, { ...metadata, durationMs: 9000 });
});

test("different source URLs and track kinds never share a probe", async t => {
  const { elements } = mediaEnvironment(t);
  const calls = [
    probeMediaSource("https://media.example/revision-a", "video"),
    probeMediaSource("https://media.example/revision-b", "video"),
    probeMediaSource("https://media.example/revision-a", "audio"),
  ];
  assert.equal(elements.length, 3);
  for (const el of elements) el.onloadedmetadata();
  assert.deepEqual(await Promise.all(calls), [metadata, metadata, { ...metadata, width: 0, height: 0 }]);
});

test("shared timeout releases its source and a retry can succeed", async t => {
  const { elements, timers } = mediaEnvironment(t);
  const calls = [probeMediaSource("https://media.example/slow", "video"), probeMediaSource("https://media.example/slow", "video")];
  assert.equal(elements.length, 1);
  const timer = [...timers.values()][0];
  assert.equal(timer.ms, 15000);
  timer.callback();
  assert.deepEqual(await Promise.all(calls), [{ ok: false, reason: "timeout" }, { ok: false, reason: "timeout" }]);
  assert.equal(elements[0].src, "");
  assert.equal(elements[0].releases, 1);
  assert.equal(timers.size, 0);
  const retry = probeMediaSource("https://media.example/slow", "video");
  assert.equal(elements.length, 2);
  elements[1].onloadedmetadata();
  assert.deepEqual(await retry, metadata);
});

test("network errors and invalid tracks stay visible and do not poison later probes", async t => {
  const { elements, timers } = mediaEnvironment(t);
  const first = probeMediaSource("https://media.example/broken", "video");
  elements[0].onerror();
  assert.deepEqual(await first, { ok: false, reason: "error" });
  const retry = probeMediaSource("https://media.example/broken", "video");
  elements[1].videoWidth = 0;
  elements[1].onloadedmetadata();
  assert.deepEqual(await retry, { ok: false, reason: "no-track" });
  assert.equal(timers.size, 0);
  assert.ok(elements.every(el => el.src === "" && el.releases === 1));
});
