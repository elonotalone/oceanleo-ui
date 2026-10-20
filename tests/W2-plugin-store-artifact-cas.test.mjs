import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const {
  PluginStoreError,
  blobDocument,
  createArtifactRevisionStore,
  withRecovery,
} = await import(
  await compileModule("src/shell/plugin-store/index.ts", {
    "../../advanced-recovery-store": dataModule(`
      const state = { records: new Map() };
      globalThis.__w2PluginStoreRecovery = state;
      export async function writeAdvancedRecovery(record) {
        state.records.set(record.key, { ...record });
      }
      export async function readAdvancedRecovery(key) {
        return state.records.get(key) ?? null;
      }
      export async function deleteAdvancedRecovery(key) {
        state.records.delete(key);
      }
    `),
  })
);

const recoveryDouble = globalThis.__w2PluginStoreRecovery;

test.beforeEach(() => {
  recoveryDouble.records.clear();
});

function hostFixture(overrides = {}) {
  const state = {
    revisionId: "r1",
    content: "原始正文",
    created: [],
  };
  const host = {
    async getItem(_artifactId, revisionId = state.revisionId) {
      return {
        ok: true,
        data: {
          artifactId: "artifact-1",
          revisionId,
          artifactType: "document",
          artifact: {
            access: { canEdit: true, canRead: true },
            integrity: { ok: true },
            sourceFormat: "md",
            renditions: {
              source: {
                url: "https://signed.test/source.md",
                digest: "sha256:" + "a".repeat(64),
                mediaType: "text/markdown",
              },
            },
          },
        },
      };
    },
    async createRevision(_artifactId, commit) {
      state.created.push(commit);
      state.revisionId = "r2";
      return {
        ok: true,
        data: {
          artifactId: "artifact-1",
          revisionId: "r2",
          artifactType: "document",
          artifact: { integrity: { ok: true }, access: { canEdit: true } },
        },
      };
    },
    async readSource() {
      return { content: state.content, mediaType: "text/markdown" };
    },
    async writeSource({ content }) {
      state.content = content;
      return {
        url: "https://signed.test/next.md",
        digest: "sha256:" + "b".repeat(64),
      };
    },
    ...overrides,
  };
  return { host, state };
}

test("W2: artifact CAS write pins a new revisionId", async () => {
  const { host, state } = hostFixture();
  const store = createArtifactRevisionStore({
    artifactId: "artifact-1",
    revisionId: "r1",
    artifactType: "document",
    sourceFormat: "md",
    host,
  });
  const receipt = await store.write(blobDocument("新正文"), {
    reason: "manual-save",
    expectedRevision: "r1",
  });
  assert.equal(receipt.revisionId, "r2");
  assert.equal(state.created[0].expectedRevisionId, "r1");
  assert.notEqual(state.created[0].expectedRevisionId, receipt.revisionId);
});

test("W2: 409 maps to conflict, integrity-failed maps to failed not conflict", async () => {
  const conflictHost = hostFixture({
    async createRevision() {
      return {
        ok: false,
        status: 409,
        code: "revision-conflict",
        error: "这份素材刚被改过，请刷新后再保存。",
      };
    },
  }).host;
  const conflictStore = createArtifactRevisionStore({
    artifactId: "artifact-1",
    revisionId: "r1",
    artifactType: "document",
    sourceFormat: "md",
    host: conflictHost,
  });
  await assert.rejects(
    () =>
      conflictStore.write(blobDocument("新正文"), {
        reason: "manual-save",
        expectedRevision: "r1",
      }),
    (error) => {
      assert.equal(error.disposition, "conflict");
      return true;
    },
  );

  const integrityHost = hostFixture({
    async createRevision() {
      return {
        ok: false,
        status: 422,
        code: "integrity-failed",
        error: "保存被拒绝：上传文件的校验和与声明不一致，请重新保存。",
      };
    },
  }).host;
  const integrityStore = createArtifactRevisionStore({
    artifactId: "artifact-1",
    revisionId: "r1",
    artifactType: "document",
    sourceFormat: "md",
    host: integrityHost,
  });
  await assert.rejects(
    () =>
      integrityStore.write(blobDocument("新正文"), {
        reason: "manual-save",
        expectedRevision: "r1",
      }),
    (error) => {
      assert.equal(error.disposition, "failed");
      assert.notEqual(error.disposition, "conflict");
      return true;
    },
  );
});

test("W2: recovery keeps the draft when integrity-failed throws", async () => {
  const { host } = hostFixture({
    async createRevision() {
      return {
        ok: false,
        status: 422,
        code: "integrity-failed",
        error: "保存被拒绝（integrity-failed）。请稍后重试。",
      };
    },
  });
  const store = withRecovery(
    createArtifactRevisionStore({
      artifactId: "artifact-1",
      revisionId: "r1",
      artifactType: "document",
      sourceFormat: "md",
      host,
    }),
    { editorId: "richdoc", recoveryKey: "w2-artifact-1" },
  );
  const doc = blobDocument("还没落盘的修改");
  await assert.rejects(
    () => store.write(doc, { reason: "autosave", expectedRevision: "r1" }),
    (error) => error instanceof PluginStoreError && error.disposition === "failed",
  );
  const recovered = await store.readRecoveredDraft();
  assert.ok(recovered);
  assert.equal(recovered.doc.content, "还没落盘的修改");
});
