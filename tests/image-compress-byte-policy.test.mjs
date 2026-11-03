import assert from "node:assert/strict";
import test from "node:test";
import { compressImageFile } from "../src/lib/upload/image-compress.ts";
import { rememberImagePreparation, originalForPreparedFile, copyImagePreparation } from "../src/lib/upload/image-preparation.ts";

const MiB = 1024 * 1024;
const photo = (bytes = 4 * MiB, type = "image/jpeg") => new File([new Uint8Array(bytes)], "phone.jpg", { type });
async function canvas({ width = 4032, height = 3024, bytes = MiB } = {}, run) {
  const previousBitmap = globalThis.createImageBitmap, previousCanvas = globalThis.OffscreenCanvas;
  const calls = [];
  let closed = 0;
  globalThis.createImageBitmap = async () => ({ width, height, close() { closed++; } });
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { drawImage() {} }; }
    async convertToBlob(options) {
      calls.push({ width: this.width, height: this.height, ...options });
      return new Blob([new Uint8Array(bytes)], { type: options.type });
    }
  };
  try { await run(calls, () => closed); }
  finally {
    if (previousBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = previousBitmap;
    if (previousCanvas === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = previousCanvas;
  }
}

test("an ordinary large phone JPEG gets one q0.92 encode without resizing and retains the exact original", () => canvas({}, async (calls, closed) => {
  const original = photo();
  const result = await compressImageFile(original, { byteAwareJpeg: true });
  assert.equal(result.compressed, true);
  assert.equal(result.original, original);
  assert.equal(result.upload.size, MiB);
  assert.deepEqual(calls, [{ width: 4032, height: 3024, type: "image/jpeg", quality: 0.92 }]);
  assert.equal(closed(), 1);
  rememberImagePreparation(result);
  assert.equal(originalForPreparedFile(result.upload), original);
  assert.equal(originalForPreparedFile(original), undefined, "the chosen original never offers another original replacement");
}));

test("a host without the original choice keeps the existing within-edge behavior", () => canvas({}, async (calls) => {
  const original = photo();
  const result = await compressImageFile(original);
  assert.equal(result.upload, original);
  assert.equal(result.skippedReason, "within-max-edge");
  assert.deepEqual(calls, []);
}));

for (const [name, input, output] of [["ratio below20%", 4 * MiB, 3.3 * MiB], ["saves less than256KiB", MiB, 0.79 * MiB], ["larger result", 4 * MiB, 5 * MiB]]) {
  test(`byte optimization refuses ${name}`, () => canvas({ bytes: Math.floor(output) }, async () => {
    const original = photo(input);
    const result = await compressImageFile(original, { byteAwareJpeg: true });
    assert.equal(result.upload, original);
    assert.equal(result.compressed, false);
  }));
}

for (const type of ["image/png", "image/webp", "image/gif", "image/svg+xml", "image/heic", "application/pdf"]) {
  test(`the new byte policy leaves ordinary ${type} unchanged`, () => canvas({}, async (calls) => {
    const original = photo(4 * MiB, type);
    const result = await compressImageFile(original, { byteAwareJpeg: true });
    assert.equal(result.upload, original);
    assert.equal(result.compressed, false);
    assert.deepEqual(calls, []);
  }));
}

test("existing oversized image behavior is retained for non-opt-in hosts", () => canvas({ width: 6000, height: 4000 }, async (calls) => {
  await compressImageFile(photo());
  assert.deepEqual(calls, [{ width: 4096, height: 2731, type: "image/jpeg", quality: 0.82 }]);
}));

test("opting in keeps oversized JPEGs at legacy q0.82 and retains the legacy savings rule", () => canvas({ width: 6000, height: 4000, bytes: Math.floor(3.9 * MiB) }, async (calls) => {
  const result = await compressImageFile(photo(), { byteAwareJpeg: true });
  assert.deepEqual(calls, [{ width: 4096, height: 2731, type: "image/jpeg", quality: 0.82 }]);
  assert.equal(result.compressed, true, "the same-size20% gate must not change the existing resized-image path");
  assert.equal(result.uploadBytes, Math.floor(3.9 * MiB));
}));

test("native filename clones retain an optimized image's original; clones of an original do not", () => {
  const original = new File(["exact original bytes"], "phone.jpg", { type: "image/jpeg" });
  const upload = new File(["small"], "phone.jpg", { type: original.type });
  rememberImagePreparation({ original, upload, compressed: true, originalBytes: original.size, uploadBytes: upload.size, skippedReason: null });
  const clone = new File([upload], "phone-2.jpg", { type: upload.type });
  copyImagePreparation(upload, clone);
  assert.equal(originalForPreparedFile(clone), original);
  const originalClone = new File([original], "phone-2.jpg", { type: original.type });
  copyImagePreparation(original, originalClone);
  assert.equal(originalForPreparedFile(originalClone), undefined);
});
