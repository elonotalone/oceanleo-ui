import assert from "node:assert/strict";
import test from "node:test";

import { normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import {
  performWorkbenchMaterial,
  registerWorkbenchMaterialAdapter,
  workbenchMaterialActionAvailability,
} from "../src/shell/workbench-material-registry.ts";

function sourceItem() {
  const artifact = normalizeArtifactProjection({
    schema: "oceanleo.artifact.v1",
    artifact_id: "source-artifact",
    revision_id: "source-r4",
    artifact_type: "single_file_image",
    title: "Source",
    owner: { principal_id: "user-1", visibility: "private" },
    permissions: {
      read: true,
      preview: true,
      edit: true,
      fork: false,
      insert: true,
      replace: true,
      favorite: false,
      bind: false,
      export_source: true,
    },
    editability: "bounded",
    editor_capability: "image-editor",
    source_format: "png",
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: "source-r4",
        url: "https://signed.test/preview.png",
      },
      full: {
        purpose: "full",
        revision_id: "source-r4",
        url: "https://signed.test/full.png",
      },
      source: {
        purpose: "source",
        revision_id: "source-r4",
        url: "https://signed.test/source.png",
        digest: "sha256:source",
      },
    },
    provenance: {
      id: "prov-source",
      source_kind: "owned",
      license_code: "owned",
    },
  });
  assert.ok(artifact);
  return artifactProjectionToLibraryItem(artifact);
}

test("Insert creates a new target object through one editor history command", async () => {
  const scope = "image::poster";
  const received = [];
  const unregister = registerWorkbenchMaterialAdapter(scope, {
    id: "test-image@1",
    actions: ["insert"],
    command: {
      version: 1,
      history: "editor-command",
      createCommand: (_action, item) => ({
        schema: "oceanleo.editor-command.v1",
        commandId: "insert-command-1",
        historyGroupId: "history-1",
        action: "insert",
        source: {
          artifactId: item.artifactId,
          revisionId: item.revisionId,
          artifactType: item.artifactType,
          sourceFormat: item.artifact.sourceFormat,
        },
        target: {
          documentId: "poster-doc",
        },
        strategy: { mode: "insert-new-object" },
        expectedRevision: { targetRevisionId: "poster-r8" },
        cas: { expectedRevisionId: "poster-r8" },
      }),
      execute: (command, item, placement) => {
        received.push({
          action: command.action,
          item,
          command,
          placement,
        });
      },
    },
    accepts: () => true,
    mutate: () => {
      throw new Error("Insert bypassed command executor");
    },
  });
  const item = sourceItem();
  assert.equal(
    workbenchMaterialActionAvailability(scope, "insert", item).available,
    true,
  );
  await performWorkbenchMaterial(scope, "insert", item);
  assert.equal(received.length, 1);
  assert.equal(received[0].command.strategy.mode, "insert-new-object");
  assert.equal(received[0].command.source.revisionId, "source-r4");
  assert.equal(received[0].command.expectedRevision.targetRevisionId, "poster-r8");
  assert.equal(received[0].command.cas.expectedRevisionId, "poster-r8");
  assert.notEqual(received[0].item, item);
  unregister();
});

test("Replace requires target revision and preserves slot plus geometry", async () => {
  const scope = "deck::hero";
  let command;
  const unregister = registerWorkbenchMaterialAdapter(scope, {
    id: "test-deck@1",
    actions: ["replace"],
    command: {
      version: 1,
      history: "editor-command",
      createCommand: (_action, item) => ({
        schema: "oceanleo.editor-command.v1",
        commandId: "replace-command-1",
        historyGroupId: "history-2",
        action: "replace",
        source: {
          artifactId: item.artifactId,
          revisionId: item.revisionId,
          artifactType: item.artifactType,
          sourceFormat: item.artifact.sourceFormat,
        },
        target: {
          documentId: "deck-doc",
          targetId: "image-slot-7",
          slotId: "hero",
          geometry: { x: 10, y: 20, width: 300, height: 180 },
        },
        strategy: {
          mode: "replace-slot",
          preserve: ["slot", "geometry"],
        },
        expectedRevision: { targetRevisionId: "deck-r11" },
        cas: { expectedRevisionId: "deck-r11" },
      }),
      execute: (value) => {
        command = value;
      },
    },
    accepts: () => true,
    mutate: () => {
      throw new Error("Replace bypassed command executor");
    },
  });
  await performWorkbenchMaterial(scope, "replace", sourceItem());
  assert.equal(command.target.targetId, "image-slot-7");
  assert.deepEqual(command.strategy.preserve, ["slot", "geometry"]);
  assert.equal(command.expectedRevision.targetRevisionId, "deck-r11");
  assert.equal(command.cas.expectedRevisionId, "deck-r11");
  unregister();
});

test("declared Insert without command/history evidence is disabled honestly", () => {
  const scope = "document::draft";
  const unregister = registerWorkbenchMaterialAdapter(scope, {
    id: "legacy-adapter",
    actions: ["insert"],
    accepts: () => true,
    mutate: () => undefined,
  });
  const evidence = workbenchMaterialActionAvailability(
    scope,
    "insert",
    sourceItem(),
  );
  assert.equal(evidence.visible, true);
  assert.equal(evidence.available, false);
  assert.match(evidence.reason, /command\/history/);
  unregister();
});
