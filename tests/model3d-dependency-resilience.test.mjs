import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MODEL3D_DEPENDENCY_CONCURRENCY,
  Model3DHttpError,
  isTransientModel3DError,
  materializeModel3DGltfDependencies,
  withModel3DRetry,
} from "../src/shell/media-editors/model3d-dependency-runtime.mjs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const noSleep = async () => {};
const fakeUrlApi = () => {
  const live = new Set();
  let n = 0;
  return {
    live,
    createObjectURL() {
      n += 1;
      const url = `blob:test/${n}`;
      live.add(url);
      return url;
    },
    revokeObjectURL(url) {
      live.delete(url);
    },
  };
};

test("gateway restart (TypeError Failed to fetch) is retried with backoff, then succeeds", async () => {
  const delays = [];
  let calls = 0;
  const value = await withModel3DRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("Failed to fetch");
      return "ok";
    },
    { sleep: async (ms) => delays.push(ms) },
  );
  assert.equal(value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("410 signed-url-expired re-runs the grant immediately; 404 and abort are not retried", async () => {
  const delays = [];
  let calls = 0;
  await withModel3DRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new Model3DHttpError("expired", 410);
    },
    { sleep: async (ms) => delays.push(ms) },
  );
  assert.equal(calls, 2);
  assert.deepEqual(delays, []);

  for (const error of [
    new Model3DHttpError("missing", 404),
    new Model3DHttpError("denied", 403),
    new Error("3D dependency grant is not pinned"),
    Object.assign(new Error("aborted"), { name: "AbortError" }),
  ]) {
    let n = 0;
    await assert.rejects(
      withModel3DRetry(async () => {
        n += 1;
        throw error;
      }, { sleep: noSleep }),
      (caught) => caught === error,
    );
    assert.equal(n, 1, `${error.message} must not be retried`);
    assert.equal(isTransientModel3DError(error), false);
  }
  assert.equal(isTransientModel3DError(new Model3DHttpError("down", 503)), true);
});

test("a persistent outage gives up after the bounded attempts with the original error", async () => {
  let calls = 0;
  const failure = new TypeError("Failed to fetch");
  await assert.rejects(
    withModel3DRetry(async () => {
      calls += 1;
      throw failure;
    }, { sleep: noSleep, attempts: 4 }),
    (caught) => caught === failure,
  );
  assert.equal(calls, 4);
});

test("dependencies load with bounded concurrency, deduped, and keep document order", async () => {
  const document = {
    buffers: [{ uri: "a.bin" }],
    images: ["t1", "t2", "t3", "t4", "t5", "t1"].map((n) => ({
      uri: `textures/${n}.jpg`,
    })),
  };
  let active = 0;
  let peak = 0;
  const seen = [];
  const urlApi = fakeUrlApi();
  const result = await materializeModel3DGltfDependencies(
    document,
    async (uri) => {
      seen.push(uri);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Blob([uri]);
    },
    urlApi,
  );
  assert.equal(MODEL3D_DEPENDENCY_CONCURRENCY, 3);
  assert.equal(peak, 3);
  assert.equal(seen.length, 6, "duplicate uri fetched once");
  assert.equal(seen[0], "a.bin", "buffers are requested first");
  assert.equal(result.document.images[0].uri, result.document.images[5].uri);
  assert.ok(result.document.images.every((image) => image.uri.startsWith("blob:")));
  result.release();
  assert.equal(urlApi.live.size, 0);
});

test("first failure stops new work, surfaces the original error and releases object URLs", async () => {
  const document = {
    buffers: [{ uri: "a.bin" }],
    images: [1, 2, 3, 4, 5, 6].map((n) => ({ uri: `t${n}.jpg` })),
  };
  const urlApi = fakeUrlApi();
  const started = [];
  const boom = new Error("texture gone");
  await assert.rejects(
    materializeModel3DGltfDependencies(
      document,
      async (uri) => {
        started.push(uri);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (uri === "t1.jpg") throw boom;
        return new Blob([uri]);
      },
      urlApi,
    ),
    (caught) => caught === boom,
  );
  assert.ok(started.length < 7, "stops scheduling after the first failure");
  assert.equal(urlApi.live.size, 0, "no leaked object URLs");
});

test("model3d-files wires grant+download through the retry on source and every dependency", () => {
  const files = source("../src/shell/media-editors/model3d-files.ts");
  assert.match(files, /withModel3DRetry/);
  assert.equal(
    (files.match(/withModel3DRetry\(/g) || []).length >= 4,
    true,
    "source (typed + media) and dependency (typed + media) are all retried",
  );
  // The retried unit is grant + blob, so a 410 re-issues the signed URL.
  assert.match(
    files,
    /withModel3DRetry\(async \(\) => \{\s+const grant = await requestModelGrant\([\s\S]*?fetchGrantedModelBlob\(grant\.url/,
  );
  assert.match(files, /new Model3DHttpError\(\s*`3D 素材加载失败 HTTP/);
});
