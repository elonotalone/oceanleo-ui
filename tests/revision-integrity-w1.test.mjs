import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const {
  advancedCommittedRevisionItem,
  advancedItemFromSession,
  advancedSavedItem,
  advancedSessionAppId,
  advancedSessionSnapshot,
  commitAdvancedSavedRevision,
  inlineEditorItemsFromSession,
  savedEditorRevisionTransition,
  withInlineEditorHistoryHead,
} = await import("../src/shell/advanced-session.ts");

function rendition(purpose, revisionId, overrides = {}) {
  return {
    purpose,
    revisionId,
    url: `https://files.test/document-${revisionId}-${purpose}`,
    mediaType:
      purpose === "editor_manifest"
        ? "application/json"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    format: purpose === "editor_manifest" ? "tiptap-json@1" : "docx",
    expiresAt: null,
    rendererVersion: null,
    width: null,
    height: null,
    durationMs: null,
    digest: `${revisionId}-${purpose}-digest`,
    ...overrides,
  };
}

function durableDocument({
  artifactId = "artifact-document",
  revisionId = "revision-1",
  previousRevisionId = "",
  integrityOk = true,
  title = "Proposal",
} = {}) {
  const artifact = {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType: "document",
    roles: ["library"],
    owner: {
      principalId: "owner-1",
      visibility: "private",
      originSiteKey: "word",
      originAppId: "word",
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: true,
      canFork: true,
      canInsert: true,
      canReplace: true,
      canFavorite: true,
      canBind: true,
      canExportSource: true,
    },
    editability: "native",
    editorCapability: "richdoc-editor",
    sourceFormat: "docx",
    title,
    favorite: false,
    renditions: {
      source: rendition("source", revisionId),
      full: rendition("full", revisionId),
      editor_manifest: rendition("editor_manifest", revisionId),
    },
    scene: null,
    provenance: {
      id: `provenance-${revisionId}`,
      sourceKind: "owned",
      licenseCode: "owned",
      licenseUrl: "",
      attribution: "",
    },
    bindings: [],
    integrity: integrityOk
      ? { ok: true, code: "ok", reason: "" }
      : {
          ok: false,
          code: "invalid-projection",
          reason: "test invalid integrity",
        },
    createdAt: "2026-07-23T00:00:00.000Z",
  };
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title,
    kind: "document",
    siteId: "word",
    url: artifact.renditions.source.url,
    previewUrl: artifact.renditions.full.url,
    thumbUrl: artifact.renditions.full.url,
    favorite: false,
    createdAt: artifact.createdAt,
    meta: {
      format: "docx",
      advanced_editor_route: "richdoc",
      ...(previousRevisionId
        ? { previous_revision_id: previousRevisionId }
        : {}),
    },
    artifactId,
    revisionId,
    artifactType: "document",
    artifact,
  };
}

test("open, rename and autosave working-head callbacks remain same-revision noops", () => {
  const source = durableDocument();
  assert.deepEqual(savedEditorRevisionTransition(source, source), {
    ok: true,
    durableCommit: false,
    code: "metadata-only",
    reason: "",
  });

  const renamed = { ...source, title: "Renamed proposal" };
  assert.equal(savedEditorRevisionTransition(source, renamed).ok, true);
  assert.equal(
    savedEditorRevisionTransition(source, renamed).durableCommit,
    false,
  );

  const workingHead = advancedSavedItem(source, {
    url: "https://files.test/document-working-head.docx",
    versionId: "creation-working-head",
    meta: {
      editor_project_url: "https://files.test/document-working-head.json",
      editor_project_schema: "tiptap-json@1",
    },
  });
  assert.equal(workingHead.revisionId, source.revisionId);
  assert.equal(workingHead.meta.previous_revision_id, undefined);
  assert.equal(savedEditorRevisionTransition(source, workingHead).ok, true);
  assert.equal(
    savedEditorRevisionTransition(source, workingHead).durableCommit,
    false,
  );

  const committedSource = durableDocument({
    revisionId: "revision-2",
    previousRevisionId: "revision-1",
  });
  const renamedCommittedSource = {
    ...committedSource,
    title: "Renamed committed proposal",
  };
  assert.equal(
    savedEditorRevisionTransition(
      committedSource,
      renamedCommittedSource,
    ).code,
    "metadata-only",
  );
});

test("wrong root, wrong previous, same-revision commit and invalid integrity fail closed", () => {
  const source = durableDocument();

  const wrongRoot = durableDocument({
    artifactId: "artifact-other",
    revisionId: "revision-2",
    previousRevisionId: source.revisionId,
  });
  assert.equal(
    savedEditorRevisionTransition(source, wrongRoot).code,
    "wrong-artifact-root",
  );

  const wrongPrevious = durableDocument({
    revisionId: "revision-2",
    previousRevisionId: "revision-stale",
  });
  assert.equal(
    savedEditorRevisionTransition(source, wrongPrevious).code,
    "wrong-previous-revision",
  );

  const masquerading = durableDocument({
    revisionId: source.revisionId,
    previousRevisionId: source.revisionId,
  });
  assert.equal(
    savedEditorRevisionTransition(source, masquerading).code,
    "same-revision-commit",
  );

  const invalid = durableDocument({
    revisionId: "revision-2",
    previousRevisionId: source.revisionId,
    integrityOk: false,
  });
  assert.equal(
    savedEditorRevisionTransition(source, invalid).code,
    "invalid-integrity",
  );
});

test("central RichDoc publish helper pins and advances the exact source revision", async () => {
  const source = durableDocument();
  let publishedArtifactId = "";
  let publishedCommit = null;
  const committed = await commitAdvancedSavedRevision(source, {
    commit: {
      source: {
        format: "docx",
        url: "https://files.test/document-revision-2.docx",
        digest: "source-digest",
      },
      renditions: [
        {
          purpose: "full",
          url: "https://files.test/document-revision-2.docx",
          digest: "source-digest",
        },
        {
          purpose: "editor_manifest",
          url: "https://files.test/document-revision-2.json",
          digest: "manifest-digest",
        },
      ],
      provenance: { editor: "richdoc" },
    },
    publish: async (artifactId, commit) => {
      publishedArtifactId = artifactId;
      publishedCommit = commit;
      // The central helper owns previous_revision_id, even if a publisher
      // returns the canonical projection without compatibility metadata.
      return {
        ok: true,
        data: durableDocument({ revisionId: "revision-2" }),
      };
    },
    meta: {
      editor_project_url: "https://files.test/document-revision-2.json",
      editor_project_schema: "tiptap-json@1",
    },
  });

  assert.equal(publishedArtifactId, source.artifactId);
  assert.equal(publishedCommit.expectedRevisionId, source.revisionId);
  assert.equal(publishedCommit.artifactType, source.artifactType);
  assert.equal(committed.artifactId, source.artifactId);
  assert.notEqual(committed.revisionId, source.revisionId);
  assert.equal(committed.artifact.integrity.ok, true);
  assert.equal(committed.meta.previous_revision_id, source.revisionId);
  assert.equal(
    savedEditorRevisionTransition(source, committed).code,
    "revision-commit",
  );
});

test("committed revision helper rejects contradictory publisher lineage", () => {
  const source = durableDocument();
  const wrongPrevious = durableDocument({
    revisionId: "revision-2",
    previousRevisionId: "revision-stale",
  });
  assert.throws(
    () => advancedCommittedRevisionItem(source, wrongPrevious),
    /错误的 previous_revision_id/,
  );
});

test("advanced session and inline history preserve durable revision integrity", () => {
  const committed = durableDocument({
    revisionId: "revision-2",
    previousRevisionId: "revision-1",
  });
  const snapshot = advancedSessionSnapshot(
    committed,
    "richdoc",
    "task-document",
  );
  const restored = advancedItemFromSession({
    app_id: advancedSessionAppId(committed, "richdoc"),
    snapshot,
  });
  assert.ok(restored);
  assert.equal(restored.artifactId, committed.artifactId);
  assert.equal(restored.revisionId, committed.revisionId);
  assert.equal(restored.artifact.integrity.ok, true);
  assert.equal(
    restored.meta.previous_revision_id,
    committed.meta.previous_revision_id,
  );

  const inlineSnapshot = withInlineEditorHistoryHead(
    {},
    committed,
    "richdoc",
    "task-document",
  );
  const [inline] = inlineEditorItemsFromSession({
    snapshot: inlineSnapshot,
  });
  assert.ok(inline);
  assert.equal(inline.artifactId, committed.artifactId);
  assert.equal(inline.revisionId, committed.revisionId);
  assert.equal(inline.artifact.integrity.ok, true);
  assert.equal(inline.meta.previous_revision_id, "revision-1");
});

test("ResultCanvas gates only failed transitions and RichDoc uses canonical publish", () => {
  const canvas = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  const richdoc = readFileSync(
    new URL(
      "../src/shell/advanced-routes/RichDocRoute.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(canvas, /savedEditorRevisionTransition\(source, item\)/);
  assert.match(canvas, /if \(transition && !transition\.ok\)/);
  assert.match(canvas, /if \(transition\?\.durableCommit\)/);
  assert.match(
    canvas,
    /编辑器未返回同一 artifact root、以当前 pin 为 previous revision 的新完整 revision/,
  );
  assert.match(richdoc, /commitAdvancedSavedRevision\(item,/);
  assert.match(richdoc, /publish: createArtifactRevision/);
  assert.match(richdoc, /previousRevisionId: item\.revisionId/);
});
