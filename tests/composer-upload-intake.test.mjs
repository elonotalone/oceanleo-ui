import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { latestUploadTiming } from "../src/lib/upload/timing.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { useAttachmentIntake } = await import(await compileModule("src/lib/upload/use-attachment-intake.ts", {
  "./image-compress": dataModule(`
    export async function compressImageFiles(files, options) {
      const outcomes = [];
      for (const file of files) outcomes.push(await globalThis.__w3Prepare(file, options));
      return outcomes;
    }
  `),
}));

function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const photo = (name) => new File([new Uint8Array(4 * 1024 * 1024)], name, { type: "image/jpeg" });
const outcome = (original, upload = original) => ({ original, upload });
async function mounted(onFiles, options) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let api;
  function Probe() { api = useAttachmentIntake(onFiles, options); return null; }
  await act(async () => root.render(React.createElement(Probe)));
  return { get api() { return api; }, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}
test.afterEach(() => { delete globalThis.__w3Prepare; });

test("a ready image starts uploading before the next image finishes preparation", async () => {
  const first = photo("first.jpg"), second = photo("second.jpg");
  const compressed = new File(["compressed"], "first.jpg", { type: first.type });
  const firstGate = gate(), secondGate = gate();
  const prepared = [], delivered = [];
  globalThis.__w3Prepare = async (file) => {
    prepared.push(file);
    await (file === first ? firstGate.promise : secondGate.promise);
    return outcome(file, file === first ? compressed : file);
  };
  const view = await mounted((files) => delivered.push(files), { deliverAsReady: true });
  try {
    await act(async () => view.api.emit([first, second]));
    assert.deepEqual(view.api.pending, [first, second]);
    assert.deepEqual(prepared, [first], "only one image is decoded at a time");
    await act(async () => firstGate.resolve());
    assert.deepEqual(delivered, [[compressed]], "the first file does not wait for the whole batch");
    assert.deepEqual(prepared, [first, second]);
    assert.deepEqual(view.api.pending, [second]);
    assert.equal(view.api.compressing, true);
    const timing = latestUploadTiming(first);
    assert.equal(timing, latestUploadTiming(compressed));
    assert.equal(timing.input_bytes, first.size);
    assert.equal(timing.upload_bytes, compressed.size);
    assert.ok(timing.client_ms.client_compress >= 0);
    await act(async () => secondGate.resolve());
    assert.deepEqual(delivered, [[compressed], [second]]);
    assert.equal(view.api.compressing, false);
  } finally { await view.unmount(); }
});

test("stream handoff does not await a host's whole network promise", async () => {
  const files = [photo("first.jpg"), photo("second.jpg")], network = gate(), accepted = [];
  globalThis.__w3Prepare = async (file) => outcome(file);
  let view;
  view = await mounted((batch) => {
    accepted.push(batch);
    return network.promise;
  }, { deliverAsReady: true });
  try {
    await act(async () => view.api.emit(files));
    assert.deepEqual(accepted, [[files[0]], [files[1]]]);
    assert.deepEqual(view.api.pending, [], "handoff does not wait for either whole upload promise");
    assert.equal(view.api.compressing, false);
  } finally { network.resolve(); await view.unmount(); }
});

test("overlapping picks stay pending and removing an active or queued file prevents its upload", async () => {
  const first = photo("first.jpg"), second = photo("second.jpg"), third = photo("third.jpg");
  const firstGate = gate(), secondGate = gate();
  const prepared = [], delivered = [];
  globalThis.__w3Prepare = async (file) => {
    prepared.push(file);
    await (file === first ? firstGate.promise : secondGate.promise);
    return outcome(file);
  };
  const view = await mounted((files) => delivered.push(files));
  try {
    await act(async () => view.api.emit([first]));
    await act(async () => view.api.emit([second, third]));
    assert.deepEqual(view.api.pending, [first, second, third]);
    await act(async () => { view.api.removePending(first); view.api.removePending(third); });
    assert.deepEqual(view.api.pending, [second]);
    await act(async () => firstGate.resolve());
    assert.deepEqual(delivered, [], "removed compression result must never reach the upload owner");
    assert.equal(view.api.compressing, true, "the second pick still blocks Send");
    assert.deepEqual(prepared, [first, second]);
    await act(async () => view.api.removePending(second));
    assert.equal(view.api.compressing, false);
    await act(async () => secondGate.resolve());
    assert.deepEqual(delivered, []);
    assert.deepEqual(prepared, [first, second], "the cancelled queued file is never decoded");
  } finally { await view.unmount(); }
});

test("unmount discards a late compression result", async () => {
  const pending = gate(), delivered = [];
  globalThis.__w3Prepare = async (file) => { await pending.promise; return outcome(file); };
  const view = await mounted((files) => delivered.push(files));
  await act(async () => view.api.emit([photo("late.jpg")]));
  await view.unmount();
  await act(async () => pending.resolve());
  assert.deepEqual(delivered, []);
});

test("a failed optional compression keeps the original and continues with the next file", async () => {
  const first = photo("first.jpg"), second = photo("second.jpg"), delivered = [];
  globalThis.__w3Prepare = async (file) => {
    if (file === first) throw new Error("decode failed");
    return outcome(file);
  };
  const view = await mounted((files) => delivered.push(...files));
  try {
    await act(async () => view.api.emit([first, second]));
    assert.deepEqual(delivered, [first, second]);
    assert.deepEqual(view.api.pending, []);
    assert.equal(view.api.compressing, false);
  } finally { await view.unmount(); }
});

test("a host that disables compression receives the original batch immediately", async () => {
  const files = [photo("first.jpg"), photo("second.jpg")], delivered = [];
  globalThis.__w3Prepare = () => { throw new Error("compression must not run"); };
  const view = await mounted((batch) => delivered.push(batch), { compressImages: false });
  try {
    await act(async () => view.api.emit(files));
    assert.deepEqual(delivered, [files]);
    assert.equal(view.api.compressing, false);
  } finally { await view.unmount(); }
});

test("the explicit original choice bypasses compression and delivers the exact File", async () => {
  const original = new File(["exact-original-content"], "phone.jpg", { type: "image/jpeg" });
  const delivered = [];
  globalThis.__w3Prepare = () => { throw new Error("the chosen original must never be compressed"); };
  const view = await mounted((files) => delivered.push(...files), { byteAwareJpeg: true });
  try {
    await act(async () => view.api.emitOriginal(original));
    assert.equal(delivered[0], original);
    assert.equal(await delivered[0].text(), "exact-original-content");
    assert.equal(view.api.compressing, false);
  } finally { await view.unmount(); }
});

test("batch-based input hosts still receive one batch after preparation", async () => {
  const files = [photo("first.jpg"), photo("second.jpg")], delivered = [];
  globalThis.__w3Prepare = async (file) => outcome(file);
  const view = await mounted((batch) => delivered.push(batch));
  try {
    await act(async () => view.api.emit(files));
    assert.deepEqual(delivered, [files]);
    assert.deepEqual(view.api.pending, []);
  } finally { await view.unmount(); }
});

for (const deliverAsReady of [false, true]) test(`a failed host callback clears its batch and permits another pick (stream=${deliverAsReady})`, async () => {
  const first = photo("first.jpg"), second = photo("second.jpg"), delivered = [];
  let calls = 0;
  globalThis.__w3Prepare = async (file) => outcome(file);
  const view = await mounted((files) => {
    calls++;
    if (calls === 1) throw new Error("host failed after accepting the file");
    delivered.push(...files);
  }, { deliverAsReady });
  try {
    await act(async () => view.api.emit([first]));
    assert.deepEqual(view.api.pending, []);
    assert.equal(view.api.compressing, false);
    await act(async () => view.api.emit([second]));
    assert.deepEqual(delivered, [second]);
    assert.equal(calls, 2, "the failed callback is never replayed");
    assert.deepEqual(view.api.pending, []);
  } finally { await view.unmount(); }
});
