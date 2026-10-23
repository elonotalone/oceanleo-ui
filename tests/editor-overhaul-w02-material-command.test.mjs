// 2026-10-23 editor overhaul W02 (D2) — 素材库「点一下 = 插入」: the shared gate demands an
// editor command/history contract; `withEditorHistoryCommand` lets an editor wire its own mutate
// to it in one line, and the panel explains refusals in plain words.
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import {
  performWorkbenchMaterial,
  registerWorkbenchMaterialAdapter,
  workbenchMaterialActionAvailability,
} from "../src/shell/workbench-material-registry.ts";
import {
  SELECT_TARGET_FIRST,
  withEditorHistoryCommand,
} from "../src/shell/workbench-material-command.ts";

function sourceItem() {
  const artifact = normalizeArtifactProjection({
    schema: "oceanleo.artifact.v1",
    artifact_id: "logo-artifact",
    revision_id: "logo-r2",
    artifact_type: "single_file_image",
    title: "Logo",
    owner: { principal_id: "user-1", visibility: "private" },
    access: {
      can_read: true, can_preview: true, can_edit: true, can_fork: false, can_insert: true,
      can_replace: true, can_favorite: false, can_bind: false, can_export_source: true,
    },
    editability: "bounded",
    editor_capability: "image-editor",
    source_format: "png",
    renditions: {
      preview: { purpose: "preview", revision_id: "logo-r2", url: "https://signed.test/p.png" },
      full: { purpose: "full", revision_id: "logo-r2", url: "https://signed.test/f.png" },
      source: { purpose: "source", revision_id: "logo-r2", url: "https://signed.test/s.png", digest: "sha256:x" },
    },
    provenance: { id: "prov-logo", source_kind: "owned", license_code: "owned" },
  });
  assert.ok(artifact);
  return artifactProjectionToLibraryItem(artifact);
}

function editorAdapter(calls) {
  return {
    id: "w02-test-editor@1",
    actions: ["insert", "replace"],
    accepts: () => true,
    mutate: (action, item, placement, command) => { calls.push({ action, item, placement, command }); },
  };
}

test("a mutate-only adapter stays honestly unavailable (the gate is not loosened)", () => {
  const unregister = registerWorkbenchMaterialAdapter("w02::legacy", editorAdapter([]));
  try {
    const evidence = workbenchMaterialActionAvailability("w02::legacy", "insert", sourceItem());
    assert.equal(evidence.available, false);
    assert.match(evidence.reason, /command\/history/);
  } finally { unregister(); }
});

test("withEditorHistoryCommand: one line turns the editor's mutate into a valid history command", async () => {
  const calls = [];
  const adapter = withEditorHistoryCommand(editorAdapter(calls), {
    documentId: "poster-root", targetRevisionId: "poster-r7",
    replaceTarget: () => ({ targetId: "img-3", slotId: "img-3", geometry: { x: 10, y: 20, width: 300, height: 200 } }),
  });
  const unregister = registerWorkbenchMaterialAdapter("w02::poster", adapter);
  try {
    const item = sourceItem();
    assert.equal(workbenchMaterialActionAvailability("w02::poster", "insert", item).available, true);
    await performWorkbenchMaterial("w02::poster", "insert", item, { source: "click" });
    assert.equal(calls.length, 1);
    const { command } = calls[0];
    assert.equal(calls[0].action, "insert");
    assert.equal(command.strategy.mode, "insert-new-object");
    assert.equal(command.source.artifactId, "logo-artifact");
    assert.equal(command.source.revisionId, "logo-r2", "provenance: the editor learns the source revision");
    assert.equal(command.target.documentId, "poster-root");
    assert.equal(command.expectedRevision.targetRevisionId, "poster-r7");
    assert.equal(command.cas.expectedRevisionId, "poster-r7");
    assert.notEqual(calls[0].item, item, "editor receives a detached clone");
    await performWorkbenchMaterial("w02::poster", "replace", item, { source: "click" });
    assert.equal(calls[1].action, "replace");
    assert.deepEqual(calls[1].command.strategy.preserve, ["slot", "geometry"]);
    assert.equal(calls[1].command.target.targetId, "img-3");
    assert.notEqual(calls[0].command.commandId, calls[1].command.commandId);
  } finally { unregister(); }
});

test("replace with nothing selected says what to do; an unsaved target registers no contract", () => {
  const calls = [];
  const unregister = registerWorkbenchMaterialAdapter("w02::noselect", withEditorHistoryCommand(editorAdapter(calls), {
    documentId: "doc", targetRevisionId: "doc-r1", replaceTarget: () => null,
  }));
  try {
    assert.throws(() => performWorkbenchMaterial("w02::noselect", "replace", sourceItem()), new RegExp(SELECT_TARGET_FIRST));
    assert.equal(calls.length, 0, "nothing is mutated");
  } finally { unregister(); }
  const unsaved = withEditorHistoryCommand(editorAdapter([]), { documentId: "doc", targetRevisionId: "" });
  assert.equal(unsaved.command, undefined, "no base revision yet: no fake contract");
});
