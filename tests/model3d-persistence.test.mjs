import assert from "node:assert/strict";
import test from "node:test";
import {
  MODEL3D_CHECKPOINT_OPERATION_LIMIT,
  MODEL3D_CHECKPOINT_BYTE_LIMIT,
  createModel3DSavePlan,
  model3DCheckpointReason,
  model3DJournalByteLength,
  normalizeModel3DOperationJournal,
} from "../src/shell/media-editors/model3d-operations.mjs";
import {
  DEFAULT_MODEL3D_VIEW,
  isModel3DSourceItem,
  model3DSourceForItem,
} from "../src/shell/media-editors/model3d-workbench-defaults.ts";
import {
  isExpiredModel3DSourceUrl,
  model3DSourceIdentity,
  normalizeModel3DProjectRecovery,
} from "../src/shell/media-editors/model3d-project.ts";
function transformOperation(index, target = "base:0") {
  return {
    id: `operation-${index}`,
    kind: "transform",
    target,
    value: {
      position: [index, 0, 0],
      rotation: [0, index / 100, 0],
      scale: [1, 1, 1],
    },
  };
}

function modelItem(meta, url = "https://cdn.example/download?sig=source") {
  return {
    key: "creation:model",
    source: "creation",
    id: "model",
    title: "Signed model",
    kind: "threed",
    siteId: "threed",
    url,
    favorite: false,
    meta,
  };
}

test("signed model sources survive routing while HDRI and textures fail closed", () => {
  const signed = modelItem({ mime: "model/gltf-binary" });
  assert.equal(isModel3DSourceItem(signed), true);
  assert.equal(model3DSourceForItem(signed), signed.url);

  const hdri = modelItem({
    subtype: "hdri",
    format: "glb",
    mime: "model/gltf-binary",
  });
  assert.equal(isModel3DSourceItem(hdri), false);
  assert.equal(model3DSourceForItem(hdri), "");

  const texture = modelItem({
    subtype: "texture",
    format: "gltf",
  });
  assert.equal(isModel3DSourceItem(texture), false);
  assert.equal(model3DSourceForItem(texture), "");
});

test("3D checkpoint plus mutation journal survives project save and reopen", () => {
  const checkpointUrl = "https://cdn.example/model.glb?sig=checkpoint";
  const operation = transformOperation(1);
  const saved = JSON.parse(JSON.stringify({
    checkpointUrl,
    operations: [operation],
    view: {
      ...DEFAULT_MODEL3D_VIEW,
      sourceUrl: undefined,
      exposure: 1.4,
    },
  }));
  const reopened = normalizeModel3DProjectRecovery(
    saved,
    DEFAULT_MODEL3D_VIEW,
    "",
  );
  assert.equal(reopened?.checkpointUrl, checkpointUrl);
  assert.equal(reopened?.view.sourceUrl, checkpointUrl);
  assert.equal(reopened?.view.exposure, 1.4);
  assert.deepEqual(reopened?.operations, [operation]);
});

test("large pseudo GLB autosave checkpoints at a bounded operation cadence", () => {
  const largePseudoGlb = { byteLength: 512 * 1024 * 1024 };
  let journal = [];
  let exporterCalls = 0;
  let binaryUploadBytes = 0;
  let sidecarUploads = 0;
  const checkpointSizes = [];

  for (let index = 1; index <= 130; index += 1) {
    journal.push(transformOperation(index));
    const plan = createModel3DSavePlan(journal);
    if (plan.shouldExportGlb) {
      exporterCalls += 1;
      binaryUploadBytes += largePseudoGlb.byteLength;
      checkpointSizes.push(journal.length);
      journal = plan.persistedOperations;
    } else {
      sidecarUploads += 1;
    }
  }

  assert.equal(MODEL3D_CHECKPOINT_OPERATION_LIMIT, 64);
  assert.deepEqual(checkpointSizes, [64, 64]);
  assert.equal(exporterCalls, 2);
  assert.equal(sidecarUploads, 128);
  assert.equal(binaryUploadBytes, 1024 * 1024 * 1024);
  assert.equal(journal.length, 2);

  for (let index = 0; index < 100; index += 1) {
    assert.equal(createModel3DSavePlan(journal).shouldExportGlb, false);
  }
  assert.equal(exporterCalls, 2, "viewer-only saves must not export another GLB");
  assert.equal(
    createModel3DSavePlan(journal, { force: true }).checkpointReason,
    "forced",
  );
});

test("byte and binary dependency thresholds request checkpoints", () => {
  const largeValue = "x".repeat(MODEL3D_CHECKPOINT_BYTE_LIMIT);
  const byteHeavy = Array.from({ length: 16 }, (_, index) => ({
    id: `material-${index}`,
    kind: "material",
    target: `base:${largeValue.slice(0, 20_000)}:${index}`,
    materialIndex: 0,
    value: { color: "#123456", metalness: 0.25, roughness: 0.75 },
  }));
  assert.ok(model3DJournalByteLength(byteHeavy) > 256 * 1024);
  assert.equal(model3DCheckpointReason(byteHeavy), "byte-limit");
  assert.equal(
    model3DCheckpointReason([{
      id: "texture-1",
      kind: "texture",
      target: "base:0",
      materialIndex: 0,
      slot: "baseColor",
      value: "/texture.png",
      requiresCheckpoint: true,
    }]),
    "binary-dependency",
  );
});

test("failed checkpoint retains a serializable journal for offline reopen", () => {
  const checkpointUrl = "https://asset.oceanleo.com/original-large.glb";
  const journal = Array.from(
    { length: MODEL3D_CHECKPOINT_OPERATION_LIMIT },
    (_, index) => transformOperation(index + 1),
  );
  assert.equal(model3DCheckpointReason(journal), "operation-limit");

  const plan = createModel3DSavePlan(journal);
  const coveredIds = plan.coveredOperationIds;
  const uploadSucceeded = false;
  const retained = uploadSucceeded
    ? journal.filter((operation) => !coveredIds.includes(operation.id))
    : journal;
  const serialized = JSON.parse(JSON.stringify({
    checkpointUrl,
    operations: retained,
    view: { azimuth: 35, elevation: 65, zoom: 110 },
  }));
  const recovery = {
    checkpointUrl: serialized.checkpointUrl,
    operations: normalizeModel3DOperationJournal(serialized.operations),
    view: serialized.view,
  };

  assert.equal(recovery?.checkpointUrl, checkpointUrl);
  assert.deepEqual(recovery?.operations, normalizeModel3DOperationJournal(journal));
  assert.equal(recovery?.operations.length, 64);
  assert.deepEqual(
    recovery?.operations.at(-1)?.value.position,
    [64, 0, 0],
    "replay reaches the same final transform after an offline reopen",
  );
});

test("successful checkpoint clears only its covered journal prefix", () => {
  const journal = Array.from({ length: 66 }, (_, index) =>
    transformOperation(index + 1));
  const plan = createModel3DSavePlan(journal.slice(0, 64));
  const covered = new Set(plan.coveredOperationIds);
  const remaining = journal.filter((operation) => !covered.has(operation.id));
  assert.deepEqual(
    remaining.map((operation) => operation.id),
    ["operation-65", "operation-66"],
  );
});

test("expired signed checkpoint uses refreshed source and dependency provenance", () => {
  const expired =
    "https://cdn.example/models/scene.gltf" +
    "?X-Amz-Date=20200101T000000Z&X-Amz-Expires=60&X-Amz-Signature=old";
  const refreshed =
    "https://cdn.example/models/scene.gltf" +
    "?X-Amz-Date=20300101T000000Z&X-Amz-Expires=600&X-Amz-Signature=new";
  const now = Date.UTC(2026, 6, 23);
  assert.equal(isExpiredModel3DSourceUrl(expired, now), true);
  assert.equal(
    isExpiredModel3DSourceUrl(
      "https://storage.googleapis.com/models/scene.glb" +
        "?X-Goog-Date=20200101T000000Z&X-Goog-Expires=60&X-Goog-Signature=old",
      now,
    ),
    true,
  );
  assert.equal(model3DSourceIdentity(expired), model3DSourceIdentity(refreshed));

  const recovery = normalizeModel3DProjectRecovery(
    {
      checkpointUrl: expired,
      sourceFormat: "gltf",
      provenance: {
        sourceUrl: expired,
        dependencyBaseUrl: expired,
        format: "gltf",
        identity: model3DSourceIdentity(expired),
      },
      operations: [transformOperation(1)],
      view: DEFAULT_MODEL3D_VIEW,
    },
    DEFAULT_MODEL3D_VIEW,
    refreshed,
    now,
  );
  assert.equal(recovery?.checkpointUrl, refreshed);
  assert.equal(recovery?.view.sourceUrl, refreshed);
  assert.equal(recovery?.provenance.sourceUrl, refreshed);
  assert.equal(recovery?.provenance.dependencyBaseUrl, refreshed);
  assert.equal(recovery?.provenance.format, "gltf");
});

test("3D load mutate autosave reopen preserves source provenance and journal", () => {
  const checkpointUrl = "https://cdn.example/models/scene.gltf?version=7";
  const dependencyBaseUrl =
    "https://deps.example/releases/v7/scene.gltf?token=closure";
  const loaded = normalizeModel3DProjectRecovery(
    {
      checkpointUrl,
      sourceFormat: "gltf",
      provenance: {
        sourceUrl: checkpointUrl,
        dependencyBaseUrl,
        format: "gltf",
      },
      operations: [],
      view: DEFAULT_MODEL3D_VIEW,
    },
    DEFAULT_MODEL3D_VIEW,
    checkpointUrl,
  );
  const operations = [...loaded.operations, transformOperation(7)];
  const savePlan = createModel3DSavePlan(operations);
  assert.equal(savePlan.shouldExportGlb, false);

  const reopened = normalizeModel3DProjectRecovery(
    JSON.parse(JSON.stringify({
      checkpointUrl: loaded.checkpointUrl,
      sourceFormat: loaded.provenance.format,
      provenance: loaded.provenance,
      operations: savePlan.persistedOperations,
      view: { ...loaded.view, exposure: 1.7 },
    })),
    DEFAULT_MODEL3D_VIEW,
    checkpointUrl,
  );
  assert.equal(reopened?.checkpointUrl, checkpointUrl);
  assert.equal(reopened?.provenance.format, "gltf");
  assert.equal(reopened?.provenance.dependencyBaseUrl, dependencyBaseUrl);
  assert.deepEqual(reopened?.operations, operations);
  assert.equal(reopened?.view.exposure, 1.7);
});
