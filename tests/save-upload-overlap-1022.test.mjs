import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import test from "node:test";

import { saveFileToLibraryWithDependencies } from "../src/shell/doc-editors/doc-io.ts";

if (!globalThis.File) globalThis.File = NodeFile;

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const roleOf = (options) =>
  /:project:/.test(options.idempotencyKey)
    ? "project"
    : /:preview:/.test(options.idempotencyKey)
      ? "preview"
      : "delivery";

/** uploadFile whose calls resolve only when the test releases them. */
function harness() {
  const calls = [];
  const pending = {};
  const published = [];
  const dependencies = {
    now: () => new Date("2026-10-22T00:00:00Z"),
    uploadFile: (file, options) => {
      const role = roleOf(options);
      calls.push({ role, key: options.idempotencyKey });
      return new Promise((resolve) => {
        pending[role] = (outcome) => resolve(outcome);
      });
    },
    saveCreations: async () => {
      throw new Error("must not create");
    },
    createArtifactRevision: async (root, commit) => {
      published.push(commit);
      return { ok: false, error: "stop here" };
    },
  };
  return { calls, pending, published, dependencies };
}

const okUpload = (role) => ({
  ok: true,
  data: { file: { url: `https://cdn.test/${role}`, meta: {} } },
});

function input(overrides = {}) {
  return {
    item: {
      key: "artifact:g:r1",
      source: "artifact",
      id: "g",
      artifactId: "g",
      revisionId: "r1",
      artifactType: "grid",
      title: "Sheet",
      kind: "sheet",
      siteId: "excel",
      url: "https://cdn.test/original.xlsx",
      favorite: false,
      meta: { artifact_id: "g", revision_id: "r1", artifact_type: "grid" },
    },
    siteId: "excel",
    fallbackSite: "excel",
    createFile: async () =>
      new File([new Uint8Array([1, 2, 3])], "Sheet.xlsx", { type: XLSX }),
    createPreview: async () => new Blob(["png"], { type: "image/png" }),
    sourceFormat: "xlsx",
    sourceMediaType: XLSX,
    title: "Sheet",
    mediaType: "sheet",
    kind: "sheet",
    idempotencyKey: "grid:overlap",
    meta: {},
    project: { schema: "oceanleo.grid.v1", data: { sheets: [] } },
    editorManifest: { id: "grid-editor", format: "oceanleo.grid.v1" },
    artifactRevision: { artifactType: "grid" },
    ...overrides,
  };
}

async function until(predicate) {
  for (let i = 0; i < 200 && !predicate(); i += 1) await tick();
  assert.ok(predicate(), "condition never reached");
}

test("project, delivery and cover uploads are in flight together, in call order", async () => {
  const h = harness();
  const run = saveFileToLibraryWithDependencies(input(), h.dependencies);
  await until(() => h.calls.length === 3);
  assert.deepEqual(
    h.calls.map((call) => call.role),
    ["project", "delivery", "preview"],
  );
  for (const call of h.calls) {
    assert.match(call.key, /^grid:overlap:(project|delivery|preview):[0-9a-f]{24}$/);
  }
  assert.equal(h.published.length, 0);
  // Release in reverse order; nothing published until all three settled.
  h.pending.preview(okUpload("preview"));
  h.pending.delivery(okUpload("delivery"));
  await tick();
  assert.equal(h.published.length, 0);
  h.pending.project(okUpload("project"));
  const result = await run;
  assert.equal(h.published.length, 1);
  assert.equal(result.ok, false); // fake publish refuses; we only test the uploads
  assert.equal(result.failedStep, "revision-publish");
});

test("earlier failing step wins even when a later one fails first", async () => {
  const h = harness();
  const run = saveFileToLibraryWithDependencies(input(), h.dependencies);
  await until(() => h.calls.length === 3);
  h.pending.preview({ ok: false, error: "preview down" });
  h.pending.delivery({ ok: false, error: "delivery down" });
  await tick();
  h.pending.project({ ok: false, error: "project down" });
  const result = await run;
  assert.equal(result.ok, false);
  assert.equal(result.failedStep, "project-upload");
  assert.match(result.error, /project down/);
  assert.equal(h.published.length, 0);
});

test("delivery failure beats a cover failure; project success does not mask it", async () => {
  const h = harness();
  const run = saveFileToLibraryWithDependencies(input(), h.dependencies);
  await until(() => h.calls.length === 3);
  h.pending.preview({ ok: false, error: "preview down" });
  h.pending.project(okUpload("project"));
  await tick();
  h.pending.delivery({ ok: false, error: "delivery down" });
  const result = await run;
  assert.equal(result.failedStep, "delivery-upload");
  assert.equal(result.preparedProject?.url, "https://cdn.test/project");
  assert.equal(h.published.length, 0);
});

test("cover upload failure alone is reported and nothing is published", async () => {
  const h = harness();
  const run = saveFileToLibraryWithDependencies(input(), h.dependencies);
  await until(() => h.calls.length === 3);
  h.pending.project(okUpload("project"));
  h.pending.delivery(okUpload("delivery"));
  h.pending.preview({ ok: false, error: "preview down" });
  const result = await run;
  assert.equal(result.failedStep, "preview-upload");
  assert.equal(h.published.length, 0);
});

test("delivery build failure is overridden by an earlier project upload failure", async () => {
  const h = harness();
  const run = saveFileToLibraryWithDependencies(
    input({
      createFile: async () => {
        throw new Error("build boom");
      },
    }),
    h.dependencies,
  );
  await until(() => h.calls.length === 1);
  await tick();
  assert.deepEqual(h.calls.map((call) => call.role), ["project"]);
  h.pending.project({ ok: false, error: "project down" });
  const failed = await run;
  assert.equal(failed.failedStep, "project-upload");

  const h2 = harness();
  const run2 = saveFileToLibraryWithDependencies(
    input({
      createFile: async () => {
        throw new Error("build boom");
      },
    }),
    h2.dependencies,
  );
  await until(() => h2.calls.length === 1);
  h2.pending.project(okUpload("project"));
  const second = await run2;
  assert.equal(second.failedStep, "delivery-build");
  assert.deepEqual(h2.calls.map((call) => call.role), ["project"]);
});

test("cover render failure stays a warning; prepared receipts skip their uploads", async () => {
  const h = harness();
  const run = saveFileToLibraryWithDependencies(
    input({
      createPreview: async () => {
        throw new Error("no canvas");
      },
    }),
    h.dependencies,
  );
  await until(() => h.calls.length === 2);
  h.pending.project(okUpload("project"));
  h.pending.delivery(okUpload("delivery"));
  const result = await run;
  assert.deepEqual(h.calls.map((call) => call.role), ["project", "delivery"]);
  assert.match(result.previewWarning, /no canvas|封面|preview/i);
  // No upload step failed: the flow reaches the (fake, refusing) publish.
  assert.equal(result.failedStep, "revision-publish");

  const h2 = harness();
  const first = saveFileToLibraryWithDependencies(input(), h2.dependencies);
  await until(() => h2.calls.length === 3);
  h2.pending.project(okUpload("project"));
  h2.pending.delivery(okUpload("delivery"));
  h2.pending.preview(okUpload("preview"));
  const receipts = await first;
  assert.ok(receipts.preparedProject && receipts.preparedDelivery && receipts.preparedPreview);
  const h3 = harness();
  await saveFileToLibraryWithDependencies(
    input({
      preparedProject: receipts.preparedProject,
      preparedDelivery: receipts.preparedDelivery,
      preparedPreview: receipts.preparedPreview,
    }),
    h3.dependencies,
  );
  assert.equal(h3.calls.length, 0);
  assert.equal(h3.published.length, 1);
});
