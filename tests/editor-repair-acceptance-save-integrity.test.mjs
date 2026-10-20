/**
 * V1 acceptance: integrity-failed stays a failure. Do not convert CAS/hash
 * rejection into success, and keep the unsaved draft so a retry can resume.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  EMPTY_BLOB_SHA256,
  artifactSaveContractFor,
  artifactSaveFailureRetryable,
  planArtifactSaveRenditions,
  revisionPublishLocalRefusal,
} from "../src/shell/doc-editors/artifact-save-contract.ts";

const DIGEST = "a".repeat(64);
const HTTPS = {
  url: "https://cdn.oceanleo.com/full.bin",
  digest: DIGEST,
};

test("every save contract refuses a payload that cannot pass integrity", () => {
  const office = ["document", "grid", "deck"];
  for (const artifactType of office) {
    const missingFull = planArtifactSaveRenditions(artifactType, {
      editorManifest: HTTPS,
    });
    assert.equal(missingFull.ok, false, artifactType);
    assert.ok(missingFull.missing?.includes("full"), artifactType);
  }

  const viewOnly = revisionPublishLocalRefusal({
    artifactType: "document",
    itemArtifactType: "document",
    editability: "view_only",
    sourceUrl: "https://cdn.oceanleo.com/doc.docx",
  });
  assert.equal(viewOnly.ok, false);
  assert.match(viewOnly.error, /只读/);

  const http = revisionPublishLocalRefusal({
    artifactType: "deck",
    itemArtifactType: "deck",
    editability: "native",
    sourceUrl: "http://127.0.0.1:9/deck.pptx",
  });
  assert.equal(http.ok, false);

  const chart = artifactSaveContractFor("chart");
  assert.ok(chart);
  const chartMissing = planArtifactSaveRenditions("chart", {
    editorManifest: HTTPS,
  });
  assert.equal(chartMissing.ok, false);

  const emptyBlob = revisionPublishLocalRefusal({
    artifactType: "document",
    itemArtifactType: "document",
    editability: "native",
    sourceUrl: "https://cdn.oceanleo.com/doc.md",
    sourceDigest: EMPTY_BLOB_SHA256,
  });
  assert.equal(emptyBlob.ok, false);
  assert.equal(emptyBlob.code, "integrity-failed");
  assert.equal(
    artifactSaveFailureRetryable({ code: "integrity-failed" }),
    false,
  );
});

test("createArtifactRevision keeps integrity-failed as a hard failure", async () => {
  const previousFetch = globalThis.fetch;
  const client = await import(
    await compileModule("src/shell/artifact-client.ts", {
      "../lib/auth/client": dataModule(
        `export async function accessToken(){ return "token"; }`,
      ),
      "../lib/auth/config": dataModule(
        `export const GATEWAY_BASE = "https://api.dev.oceanleo.com";`,
      ),
    })
  );

  const commit = {
    expectedRevisionId: "rev-1",
    artifactType: "document",
    source: {
      format: "docx",
      url: "https://cdn.oceanleo.com/doc.docx",
      digest: DIGEST,
    },
    renditions: [
      {
        purpose: "full",
        url: "https://cdn.oceanleo.com/doc.docx",
        digest: DIGEST,
      },
      {
        purpose: "editor_manifest",
        url: "https://cdn.oceanleo.com/doc.json",
        digest: DIGEST,
      },
    ],
  };

  try {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    };
    const blocked = await client.createArtifactRevision("artifact-1", {
      ...commit,
      source: { ...commit.source, url: "http://127.0.0.1:9000/doc.docx" },
      renditions: commit.renditions.map((entry) => ({
        ...entry,
        url: "http://127.0.0.1:9000/doc.docx",
      })),
    });
    assert.equal(blocked.ok, false);
    assert.equal(fetchCalls, 0, "http upload URLs must not be sent");

    const composite = await client.createArtifactRevision("composite-1", {
      expectedRevisionId: "rev-1",
      artifactType: "composite_image",
      source: {
        format: "png",
        url: "https://cdn.oceanleo.com/cover.png",
        digest: DIGEST,
      },
      renditions: [
        {
          purpose: "preview",
          url: "https://cdn.oceanleo.com/cover.png",
          digest: DIGEST,
        },
      ],
    });
    assert.equal(composite.ok, false);
    assert.equal(composite.code, "integrity-failed");

    globalThis.fetch = async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        detail: {
          code: "integrity-failed",
          message: "保存被拒绝（integrity-failed）。请稍后重试。",
        },
      }),
    });
    const rejected = await client.createArtifactRevision("artifact-1", commit);
    assert.equal(rejected.ok, false, "409 integrity-failed must not become ok");
    assert.match(String(rejected.error || rejected.code || ""), /integrity-failed|完整性|拒绝/);
    assert.notEqual(rejected.retryable, true, "integrity-failed is not a success-retry loop");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a failed store write keeps the recovered draft instead of clearing it", async () => {
  const {
    PluginStoreError,
    asPluginStoreError,
    blobDocument,
    createMemoryStore,
    withRecovery,
  } = await import(
    await compileModule("src/shell/plugin-store/index.ts", {
      "../../advanced-recovery-store": dataModule(`
        const records = new Map();
        globalThis.__acceptRecovery = records;
        export async function writeAdvancedRecovery(record) {
          records.set(record.key, { ...record });
        }
        export async function readAdvancedRecovery(key) {
          return records.get(key) ?? null;
        }
        export async function deleteAdvancedRecovery(key) {
          records.delete(key);
        }
      `),
    })
  );

  const inner = createMemoryStore({
    initial: blobDocument("head", { revisionId: "rev-1" }),
  });
  inner.failNext(
    new PluginStoreError("conflict", "CAS 失败：expected rev-1", {
      expectedRevision: "rev-1",
      actualRevision: "rev-2",
    }),
  );
  const store = withRecovery(inner, {
    editorId: "richdoc",
    recoveryKey: "accept-doc",
  });
  const dirty = blobDocument("user still needs this paragraph", {
    revisionId: "rev-1",
  });
  await assert.rejects(
    () => store.write(dirty, { reason: "autosave", expectedRevision: "rev-1" }),
    (error) =>
      error instanceof PluginStoreError && error.disposition === "conflict",
  );
  const recovered = await store.readRecoveredDraft();
  assert.ok(recovered, "conflict must leave the mirrored draft");
  assert.equal(recovered.doc.content, "user still needs this paragraph");

  const conflict = asPluginStoreError(
    new PluginStoreError("conflict", "keep"),
    "failed",
  );
  assert.equal(conflict.disposition, "conflict");
});
