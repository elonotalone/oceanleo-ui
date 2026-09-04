/**
 * W11 判据 2：glTF 往返必须真的进去再出来。
 * 走 three.js 自带 GLTFLoader + GLTFExporter（与 editor File→GLB 同一对 API）。
 * 不许只 parse 就报绿。丢的属性要点名。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  diffGltfInspect,
  inspectGltfDocument,
  parseGlbJsonDocument,
  roundtripFixtureGltf,
  roundtripGltfThroughThree,
} from "../src/shell/media-editors/model3d-gltf-roundtrip.mjs";

test("gltf roundtrip produces a real GLB and keeps name, translation, color", async () => {
  const fixture = roundtripFixtureGltf();
  const result = await roundtripGltfThroughThree(fixture);
  assert.equal(result.glbBytes > 0, true, "GLTFExporter 必须产出非空 GLB");
  assert.equal(
    result.reparsedChildCount >= 1,
    true,
    "导出来的 GLB 必须还能被同一份 Loader 打开",
  );
  const { kept, dropped } = result.diff;
  assert.equal(
    kept.includes("materials[].pbrMetallicRoughness.baseColorFactor"),
    true,
    `kept=${kept.join(",")}`,
  );
  assert.equal(result.outbound.nodeNames.includes("RoundtripBox"), true);
  assert.equal(
    result.outbound.translations.some(
      (vector) =>
        Array.isArray(vector) &&
        Math.abs(vector[0] - 1) < 1e-4 &&
        Math.abs(vector[1] - 2) < 1e-4 &&
        Math.abs(vector[2] - 3) < 1e-4,
    ),
    true,
    `translations=${JSON.stringify(result.outbound.translations)}`,
  );
  const nameDrop = dropped.find((entry) => entry.feature === "nodes[].name");
  assert.ok(
    nameDrop,
    "Exporter 会多包一层无名根节点，必须点名，不许当没变",
  );
  assert.match(nameDrop.reason, /RoundtripBox/);
  const meshDrop = dropped.find((entry) => entry.feature === "meshes[].name");
  assert.ok(meshDrop, "meshes[].name 从 BoxMesh 变成空串必须点名");
  const generatorDrop = dropped.find((entry) => entry.feature === "asset.generator");
  assert.ok(generatorDrop, "generator 被 Exporter 改写必须点名");
  assert.match(generatorDrop.reason, /THREE\.GLTFExporter/);
});

test("a buffer without GLB magic is not a successful export", () => {
  assert.throws(
    () => parseGlbJsonDocument(new ArrayBuffer(32)),
    /不是 GLB/,
  );
});

test("dropped extras stay named when the exporter strips them", () => {
  const before = inspectGltfDocument({
    asset: { version: "2.0", generator: "in" },
    extras: { keep: true },
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "A", translation: [0, 0, 0], extras: { k: 1 } }],
    meshes: [{ name: "M", primitives: [{}] }],
    materials: [
      {
        name: "Red",
        pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] },
      },
    ],
  });
  const after = inspectGltfDocument({
    asset: { version: "2.0", generator: "THREE.GLTFExporter" },
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "A", translation: [0, 0, 0] }],
    meshes: [{ name: "M", primitives: [{}] }],
    materials: [
      {
        name: "Red",
        pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] },
      },
    ],
  });
  const diff = diffGltfInspect(before, after);
  assert.equal(
    diff.dropped.some((entry) => entry.feature === "extras"),
    true,
  );
  assert.equal(
    diff.dropped.some((entry) => entry.feature === "asset.generator"),
    true,
  );
  assert.equal(diff.kept.includes("nodes[].name"), true);
});
