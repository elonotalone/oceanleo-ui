// W04 (editor overhaul 10-23): every save becomes a new revision.
// 1. advancedSavedItem moves revisionId/artifact forward (own-head ledger or explicit item).
// 2. doc-io retries a 409 once from this tab's own head, never from someone else's.
// 3. typed saves stage intermediates privately (no Library root per save) and fall back on old gateways.
// 4. artifactRevision.metadata reaches the commit, bounded.
import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import test from "node:test";

import { saveFileToLibraryWithDependencies } from "../src/shell/doc-editors/doc-io.ts";
import {
  noteOwnCommittedHead,
  ownHeadAfter,
  resetOwnCommittedHeadsForTests,
} from "../src/shell/doc-editors/editor-own-heads.ts";
import { advancedSavedItem } from "../src/shell/advanced-session.ts";

if (!globalThis.File) globalThis.File = NodeFile;

const PDF = "application/pdf";

function projection(artifactId, revisionId, renditions = {}) {
  return {
    artifactId,
    revisionId,
    artifactType: "pdf",
    sourceFormat: "pdf",
    editability: "editable",
    editorCapability: "pdf-editor",
    integrity: { ok: true },
    access: { canRead: true, canEdit: true, canFork: false },
    renditions,
  };
}

function durable(revisionId, extra = {}) {
  return {
    key: `artifact:a:${revisionId}`,
    source: "artifact",
    id: "a",
    artifactId: "a",
    revisionId,
    artifactType: "pdf",
    artifact: projection("a", revisionId),
    title: "[W04] sample.pdf",
    kind: "pdf",
    siteId: "oceanleo",
    url: "https://cdn.test/a.pdf",
    favorite: false,
    meta: { artifact_id: "a", revision_id: revisionId, artifact_type: "pdf" },
    ...extra,
  };
}

/** Gateway double: CAS on `head`, echoes a fully pinned projection. */
function gateway({ head = "r1", stage } = {}) {
  const state = { head, commits: [], uploads: [], staged: [], counter: 1 };
  const dependencies = {
    now: () => new Date("2026-10-23T00:00:00Z"),
    uploadFile: async (file, options) => {
      state.uploads.push(options.idempotencyKey);
      return { ok: true, data: { file: { url: `https://cdn.test/${state.uploads.length}.pdf`, meta: {} } } };
    },
    saveCreations: async () => {
      throw new Error("typed saves must not register creations");
    },
    createArtifactRevision: async (artifactId, commit) => {
      state.commits.push(commit);
      if (commit.expectedRevisionId !== state.head) {
        return { ok: false, error: "保存冲突", code: "revision-conflict", status: 409 };
      }
      state.counter += 1;
      const revisionId = `r${state.counter}`;
      state.head = revisionId;
      const pinned = (digest, mediaType) => ({ revisionId, digest, mediaType, url: `https://api.test/${revisionId}/${digest.slice(0, 6)}` });
      const renditions = { source: pinned(commit.source.digest, PDF) };
      for (const rendition of commit.renditions) renditions[rendition.purpose] = pinned(rendition.digest, PDF);
      const artifact = projection(artifactId, revisionId, renditions);
      return { ok: true, data: { ...durable(revisionId), artifact, meta: { previous_revision_id: commit.expectedRevisionId } } };
    },
    ...(stage ? { stageArtifactBlob: stage(state) } : {}),
  };
  return { state, dependencies };
}

function pdfSave(item, overrides = {}) {
  return {
    item,
    siteId: "oceanleo",
    fallbackSite: "oceanleo",
    file: new File([new Uint8Array([37, 80, 68, 70, Math.random() * 255])], "[W04] sample-编辑版.pdf", { type: PDF }),
    sourceFormat: "pdf",
    sourceMediaType: PDF,
    title: "[W04] sample-编辑版",
    mediaType: "doc",
    kind: "pdf",
    idempotencyKey: `pdf:a:${Math.random()}`,
    meta: {},
    deliveryProjectSchema: "pdf-binary@1",
    artifactRevision: { artifactType: "pdf", editor: "pdf-native-v1" },
    ...overrides,
  };
}

test("advancedSavedItem moves the CAS base to the revision this tab committed", async () => {
  resetOwnCommittedHeadsForTests();
  const { dependencies } = gateway();
  const opened = durable("r1");
  const saved = await saveFileToLibraryWithDependencies(pdfSave(opened), dependencies);
  assert.equal(saved.ok, true);
  assert.equal(saved.revisionId, "r2");
  // Routes only pass url + versionId (PdfRoute, DeckRoute, RichDocRoute, …).
  const next = advancedSavedItem(opened, { url: saved.url, versionId: saved.versionId, meta: { editor: "pdf-native-v1" } });
  assert.equal(next.revisionId, "r2");
  assert.equal(next.artifact.revisionId, "r2");
  assert.equal(next.meta.revision_id, "r2");
  assert.equal(next.meta.previous_revision_id, "r1");
  // Second save from the receipt goes straight through: one commit, no 409.
  const second = await saveFileToLibraryWithDependencies(pdfSave(next), dependencies);
  assert.equal(second.ok, true);
  assert.equal(second.previousRevisionId, "r2");
  assert.equal(second.revisionId, "r3");
});

test("an explicit committed item wins; a foreign or stale item is ignored", () => {
  resetOwnCommittedHeadsForTests();
  const opened = durable("r1");
  const committed = { ...durable("r5"), artifact: projection("a", "r5") };
  assert.equal(advancedSavedItem(opened, { url: "u", versionId: "r5", item: committed }).revisionId, "r5");
  const foreign = { ...committed, artifactId: "other", artifact: projection("other", "r5") };
  assert.equal(advancedSavedItem(opened, { url: "u", versionId: "r5", item: foreign }).revisionId, "r1");
  assert.equal(advancedSavedItem(opened, { url: "u", versionId: "r9" }).revisionId, "r1");
});

test("a stale own base gets one retry from this tab's head (routes that never advance still save)", async () => {
  resetOwnCommittedHeadsForTests();
  const { state, dependencies } = gateway();
  const opened = durable("r1");
  for (let index = 0; index < 3; index += 1) {
    // The pre-fix route behaviour: always save from the opened item.
    const saved = await saveFileToLibraryWithDependencies(pdfSave(opened), dependencies);
    assert.equal(saved.ok, true, saved.error);
  }
  assert.equal(state.head, "r4");
  assert.deepEqual(
    state.commits.map((commit) => commit.expectedRevisionId),
    ["r1", "r1", "r2", "r1", "r3"],
  );
});

test("someone else's newer revision is still reported as a conflict", async () => {
  resetOwnCommittedHeadsForTests();
  const { state, dependencies } = gateway();
  const first = await saveFileToLibraryWithDependencies(pdfSave(durable("r1")), dependencies);
  assert.equal(first.revisionId, "r2");
  state.head = "theirs"; // another tab/person committed after us
  const opened = durable("r2");
  const saved = await saveFileToLibraryWithDependencies(pdfSave(opened), dependencies);
  assert.equal(saved.ok, false);
  assert.equal(saved.failedStep, "revision-publish");
  assert.equal(state.commits.at(-1).expectedRevisionId, "r2");
  assert.equal(ownHeadAfter("a", "theirs"), null);
});

test("own-head ledger: lineage restarts when a commit is based on a foreign revision", () => {
  resetOwnCommittedHeadsForTests();
  noteOwnCommittedHead("a", "r1", "r2");
  noteOwnCommittedHead("a", "r2", "r3");
  assert.equal(ownHeadAfter("a", "r1").revisionId, "r3");
  assert.equal(ownHeadAfter("a", "r3"), null);
  noteOwnCommittedHead("a", "x9", "x10");
  assert.equal(ownHeadAfter("a", "r1"), null);
  assert.equal(ownHeadAfter("a", "x9").revisionId, "x10");
});

const stagedOk = (state) => async (artifactId, file) => {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hex = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
  state.staged.push(file.name);
  return { ok: true, data: { blobId: `project-assets:u/2ffeef37-102a-431b-b2c2-51c5675dba79/editor-staging/2026-10-23/${state.staged.length}.pdf`, digest: hex } };
};

test("typed saves stage their bytes privately: no legacy upload, commit carries blobId", async () => {
  resetOwnCommittedHeadsForTests();
  const { state, dependencies } = gateway({ stage: stagedOk });
  const saved = await saveFileToLibraryWithDependencies(pdfSave(durable("r1")), dependencies);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(state.uploads.length, 0, "no /v1/database/upload → no hidden editorInternal root");
  assert.equal(state.staged.length, 1);
  const commit = state.commits[0];
  assert.match(commit.source.blobId, /^project-assets:u\/.+\/editor-staging\//);
  assert.equal(commit.source.url, undefined);
  assert.ok(commit.renditions.every((rendition) => rendition.blobId && !rendition.url));
  assert.ok(saved.url.startsWith("https://api.test/"), "receipt url comes from the server rendition");
});

test("an older gateway without the staging route falls back to the legacy upload", async () => {
  resetOwnCommittedHeadsForTests();
  const { state, dependencies } = gateway({
    stage: () => async () => ({ ok: false, status: 404, error: "Not Found" }),
  });
  const saved = await saveFileToLibraryWithDependencies(pdfSave(durable("r1")), dependencies);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(state.uploads.length, 1);
  assert.ok(state.commits[0].source.url);
});

test("a staging outage is a save failure, not a silent public upload", async () => {
  resetOwnCommittedHeadsForTests();
  const { state, dependencies } = gateway({
    stage: () => async () => ({ ok: false, status: 0, error: "网络连接中断" }),
  });
  const saved = await saveFileToLibraryWithDependencies(pdfSave(durable("r1")), dependencies);
  assert.equal(saved.ok, false);
  assert.equal(saved.failedStep, "delivery-upload");
  assert.equal(state.uploads.length, 0);
  assert.equal(state.commits.length, 0);
});

test("artifactRevision.metadata reaches the commit with only well-formed keys", async () => {
  resetOwnCommittedHeadsForTests();
  const { state, dependencies } = gateway();
  await saveFileToLibraryWithDependencies(
    pdfSave(durable("r1"), {
      artifactRevision: {
        artifactType: "pdf",
        metadata: { text_excerpt: "第一行\n第二行", "Bad Key": 1, editor_note: undefined },
      },
    }),
    dependencies,
  );
  assert.deepEqual(state.commits[0].metadata, { text_excerpt: "第一行\n第二行" });
});

test("a failed save attempt is shown as 保存失败, never as saving forever or saved", async () => {
  const { advancedAutoSaveDisplayState, advancedFlushFailureVisible } = await import(
    "../src/shell/advanced-autosave-display.ts"
  );
  const failed = { ok: false, error: "保存失败：「上传交付文件」这一步没有完成 —— 网络不通", status: 0 };
  assert.equal(advancedFlushFailureVisible(failed), true);
  assert.equal(advancedFlushFailureVisible({ ok: false }), true, "a bare refusal is still a failure");
  assert.equal(advancedFlushFailureVisible({ ok: true }), false);
  // Controller still retrying in the background → top bar says error, with retry.
  assert.equal(advancedAutoSaveDisplayState({ state: "saving", failedAttempt: true, restorationPaused: false }), "error");
  // Only the server-confirmed transition clears it.
  assert.equal(advancedAutoSaveDisplayState({ state: "saved", failedAttempt: true, restorationPaused: false }), "saved");
  assert.equal(advancedAutoSaveDisplayState({ state: "saving", failedAttempt: false, restorationPaused: false }), "saving");
  assert.equal(advancedAutoSaveDisplayState({ state: "saved", failedAttempt: false, restorationError: "草稿读取失败", restorationPaused: false }), "error");
});

test("website closure files staged by the editor ride along with the commit", async () => {
  resetOwnCommittedHeadsForTests();
  const { state, dependencies } = gateway();
  const sourceDependencies = [{ path: "images/new.webp", blobId: "project-assets:u/x/editor-staging/2026-10-23/a.webp", digest: "a".repeat(64), mediaType: "image/webp" }];
  await saveFileToLibraryWithDependencies(
    pdfSave(durable("r1"), { artifactRevision: { artifactType: "pdf", sourceDependencies } }),
    dependencies,
  );
  assert.deepEqual(state.commits[0].sourceDependencies, sourceDependencies);
});

test("restored local work is saved, not shown as 已保存 (draft-tier and plain editors)", async () => {
  const { advancedRecoveredLocalWork } = await import("../src/shell/advanced-autosave-display.ts");
  const base = { dirty: true, revision: 7, draftTier: true };
  // Draft-tier editor restored its IndexedDB copy: only the restore time is known.
  assert.equal(advancedRecoveredLocalWork({ ...base, draftRestoredAt: 1000 }), true);
  // A restored server draft is durable but not yet a version: publishing it is owed (W08-to-W04 #1).
  assert.equal(advancedRecoveredLocalWork({ ...base, draftRestoredAt: 1000, serverRestoredRevision: 7 }), true);
  assert.equal(advancedRecoveredLocalWork({ ...base, draftRestoredAt: 1000, serverRestoredRevision: 6 }), false);
  // Nothing restored, or the document is clean: nothing to do.
  assert.equal(advancedRecoveredLocalWork({ ...base }), false);
  assert.equal(advancedRecoveredLocalWork({ ...base, dirty: false, draftRestoredAt: 1000 }), false);
  // Plain (non-draft) editors keep the exact-revision local promotion rule.
  const plain = { dirty: true, revision: 3, draftTier: false };
  assert.equal(advancedRecoveredLocalWork({ ...plain, localPromotion: { revision: 3 } }), true);
  assert.equal(advancedRecoveredLocalWork({ ...plain, localPromotion: { revision: 2 } }), false);
  assert.equal(advancedRecoveredLocalWork({ ...plain, draftRestoredAt: 1000 }), false);
  // The autosave hook feeds the draft-tier restore receipt into the rule.
  const { readFileSync } = await import("node:fs");
  const hook = readFileSync(new URL("../src/shell/use-advanced-autosave.ts", import.meta.url), "utf8");
  assert.match(hook, /recoveredLocalDraft = advancedRecoveredLocalWork\(\{[\s\S]*?draftRestoredAt: recovery\?\.draftSchema \? advancedDraftRestoredAt\(/);
});

test("a local copy older than the opened revision is stale, not new work; draft failures are visible", async () => {
  const { advancedRecoveredLocalWork, visibleDraftAttempt } = await import("../src/shell/advanced-autosave-display.ts");
  const base = { dirty: true, revision: 7, draftTier: true, draftRestoredAt: 1000 };
  assert.equal(advancedRecoveredLocalWork({ ...base, baseSavedAt: 2000 }), false, "saved after the last local edit");
  assert.equal(advancedRecoveredLocalWork({ ...base, baseSavedAt: 500 }), true, "edited after the opened revision");
  assert.equal(advancedRecoveredLocalWork({ ...base, baseSavedAt: Number.NaN }), true, "unknown base time keeps the edit");
  // W09-to-W04 #3: a failing draft upload says why (retries continue), offline names the network.
  const failures = [];
  await assert.rejects(visibleDraftAttempt(async () => { throw new Error("存储服务没有确认草稿地址"); }, (e) => failures.push(e), () => false));
  assert.deepEqual(failures, ["存储服务没有确认草稿地址"]);
  assert.equal(await visibleDraftAttempt(async () => false, (e) => failures.push(e), () => true), false);
  assert.match(failures[1], /网络/);
  assert.equal(await visibleDraftAttempt(async () => false, (e) => failures.push(e), () => false), false);
  assert.equal(await visibleDraftAttempt(async () => true, (e) => failures.push(e), () => true), true);
  assert.equal(failures.length, 2, "a moved-on revision online and a success are not failures");
});
