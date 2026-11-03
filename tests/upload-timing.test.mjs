import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/w1-jsdom-window.mjs";
import {
  UPLOAD_TIMING_EVENT, latestUploadTiming, recordClientUploadTiming,
  recordCompressionTiming, recordServerUploadTiming,
} from "../src/lib/upload/timing.ts";

test("timing events contain byte counts and allowlisted durations without file identity", () => {
  const file = new File(["private data"], "secret-personal-name.jpg", { type: "image/jpeg" });
  const compressed = new File(["small"], file.name, { type: file.type });
  const events = [];
  const listener = (event) => events.push(event.detail);
  window.addEventListener(UPLOAD_TIMING_EVENT, listener);
  try {
    recordCompressionTiming(file, compressed, 12);
    recordClientUploadTiming(compressed, "client_key", 2);
    recordClientUploadTiming(compressed, "client_request", 54);
    recordServerUploadTiming(compressed, {
      body_read: 1, private_write: 20, "private_commit.queue_wait": 3, total: 35,
      private_sweep: -1, private_register: Infinity, private_finalize: "5",
      url: "https://private-storage.test/object", filename: file.name, token: "secret",
    });
    const timing = latestUploadTiming(file);
    assert.equal(timing, latestUploadTiming(compressed));
    assert.deepEqual(timing, {
      input_bytes: file.size, upload_bytes: compressed.size,
      client_ms: { client_compress: 12, client_key: 2, client_request: 54 },
      server_ms: { body_read: 1, "private_commit.queue_wait": 3, private_write: 20, total: 35 },
    });
    assert.equal(events.at(-1), timing);
    const serialized = JSON.stringify(events);
    for (const privateValue of [file.name, "private-storage", "private data", '"token"', '"url"', '"filename"']) {
      assert.equal(serialized.includes(privateValue), false, privateValue);
    }
    assert.equal(Object.isFrozen(timing), true);
    assert.equal(Object.isFrozen(timing.client_ms), true);
  } finally { window.removeEventListener(UPLOAD_TIMING_EVENT, listener); }
});

test("invalid or unrelated timing responses do not create a measurement", () => {
  const file = new File(["x"], "image.png");
  recordClientUploadTiming(file, "client_request", NaN);
  recordClientUploadTiming(file, "client_response", -1);
  for (const value of [null, [], "12", { unknown: 1 }, { total: NaN }]) recordServerUploadTiming(file, value);
  assert.equal(latestUploadTiming(file), undefined);
});
