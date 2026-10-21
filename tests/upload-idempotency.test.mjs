import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  gatewayErrorMessage,
  humanLibraryUploadError,
  isLegalUploadIdempotencyKey,
  normalizeUploadIdempotencyKey,
} from "../src/lib/upload/idempotency.ts";

test("spaces and overlong filenames are hashed into a registrar-legal key", async () => {
  assert.equal(isLegalUploadIdempotencyKey("library-upload-v1:home:a.png:1:1"), true);
  assert.equal(isLegalUploadIdempotencyKey("library-upload-v1:home:my file.png:1:1"), false);
  const spaced = await normalizeUploadIdempotencyKey([
    "library-upload-v1",
    "home",
    "my file.png",
    12,
    1,
  ]);
  assert.equal(isLegalUploadIdempotencyKey(spaced), true);
  assert.doesNotMatch(spaced, / /);
  const again = await normalizeUploadIdempotencyKey([
    "library-upload-v1",
    "home",
    "my file.png",
    12,
    1,
  ]);
  assert.equal(spaced, again);
});

test("catalog error envelope is not shown as HTTP 400", () => {
  const envelope = {
    code: "invalid-request",
    message: "invalid idempotency key",
    details: {},
    requestId: "req-library-1",
  };
  assert.equal(gatewayErrorMessage(envelope, 400), "invalid idempotency key");
  assert.equal(gatewayErrorMessage({ detail: "empty file" }, 400), "empty file");
  assert.equal(gatewayErrorMessage(null, 400), "HTTP 400");
  assert.equal(
    humanLibraryUploadError(envelope, 400),
    "文件没传上去，请稍后重试。",
  );
});

test("MyLibrary hashes the upload key and reads the catalog envelope", async () => {
  const source = await readFile(
    new URL("../src/shell/MyLibrary.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /normalizeUploadIdempotencyKey/);
  assert.match(source, /humanLibraryUploadError/);
  assert.doesNotMatch(source, /\.join\(":"\)/);
});
