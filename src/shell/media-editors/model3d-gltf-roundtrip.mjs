/**
 * glTF 往返：走 three.js 自带的 GLTFLoader + GLTFExporter
 * （与 three.js editor 的 File → Import/Export GLB 同一对 API）。
 *
 * 不许另写场景图。比对是逐项的：丢了什么要点名，不许静默丢。
 */
import "./model3d-gltf-node-shim.mjs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { exportModel3DGlb, parseModel3DGlb } from "./model3d-gltf.mjs";

const loader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export function inspectGltfDocument(doc) {
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const meshes = Array.isArray(doc?.meshes) ? doc.meshes : [];
  const materials = Array.isArray(doc?.materials) ? doc.materials : [];
  return {
    assetVersion: String(doc?.asset?.version || ""),
    generator: String(doc?.asset?.generator || ""),
    sceneCount: Array.isArray(doc?.scenes) ? doc.scenes.length : 0,
    nodeNames: nodes.map((node) => String(node?.name || "")),
    translations: nodes.map((node) =>
      Array.isArray(node?.translation) ? node.translation.map(Number) : [0, 0, 0],
    ),
    meshNames: meshes.map((mesh) => String(mesh?.name || "")),
    materialNames: materials.map((material) => String(material?.name || "")),
    baseColorFactors: materials.map((material) => {
      const factor = material?.pbrMetallicRoughness?.baseColorFactor;
      return Array.isArray(factor) ? factor.map(Number) : [1, 1, 1, 1];
    }),
    primitiveCount: meshes.reduce(
      (sum, mesh) =>
        sum + (Array.isArray(mesh?.primitives) ? mesh.primitives.length : 0),
      0,
    ),
    extrasPresent: Boolean(
      doc?.extras || nodes.some((node) => node?.extras) || materials.some((m) => m?.extras),
    ),
  };
}

export function parseGlbJsonDocument(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== "glTF") {
    throw new Error("往返结果不是 GLB（缺 glTF magic）");
  }
  const jsonLength = view.getUint32(12, true);
  const json = new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength));
  return JSON.parse(json);
}

function nearlyEqual(left, right, epsilon = 1e-4) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (Math.abs(Number(left[i]) - Number(right[i])) > epsilon) return false;
  }
  return true;
}

/**
 * 逐项比对。返回 kept / dropped（含原因）。dropped 为空才算完整保住。
 */
export function diffGltfInspect(before, after) {
  const kept = [];
  const dropped = [];
  const note = (ok, feature, detail) => {
    if (ok) kept.push(feature);
    else dropped.push({ feature, reason: detail });
  };
  note(
    before.assetVersion === after.assetVersion,
    "asset.version",
    `进去 ${before.assetVersion}，出来 ${after.assetVersion}`,
  );
  note(
    before.sceneCount === after.sceneCount && before.sceneCount >= 1,
    "scenes.length",
    `进去 ${before.sceneCount}，出来 ${after.sceneCount}`,
  );
  note(
    JSON.stringify(before.nodeNames) === JSON.stringify(after.nodeNames),
    "nodes[].name",
    `进去 ${JSON.stringify(before.nodeNames)}，出来 ${JSON.stringify(after.nodeNames)}`,
  );
  const translationOk =
    before.translations.length === after.translations.length &&
    before.translations.every((vector, index) =>
      nearlyEqual(vector, after.translations[index]),
    );
  note(
    translationOk,
    "nodes[].translation",
    `进去 ${JSON.stringify(before.translations)}，出来 ${JSON.stringify(after.translations)}`,
  );
  note(
    JSON.stringify(before.meshNames) === JSON.stringify(after.meshNames),
    "meshes[].name",
    `进去 ${JSON.stringify(before.meshNames)}，出来 ${JSON.stringify(after.meshNames)}`,
  );
  note(
    before.primitiveCount === after.primitiveCount && before.primitiveCount >= 1,
    "meshes[].primitives.length",
    `进去 ${before.primitiveCount}，出来 ${after.primitiveCount}`,
  );
  note(
    JSON.stringify(before.materialNames) === JSON.stringify(after.materialNames),
    "materials[].name",
    `进去 ${JSON.stringify(before.materialNames)}，出来 ${JSON.stringify(after.materialNames)}`,
  );
  const colorOk =
    before.baseColorFactors.length === after.baseColorFactors.length &&
    before.baseColorFactors.every((factor, index) =>
      nearlyEqual(factor, after.baseColorFactors[index]),
    );
  note(
    colorOk,
    "materials[].pbrMetallicRoughness.baseColorFactor",
    `进去 ${JSON.stringify(before.baseColorFactors)}，出来 ${JSON.stringify(after.baseColorFactors)}`,
  );
  if (before.extrasPresent && !after.extrasPresent) {
    dropped.push({
      feature: "extras",
      reason: "进去带 extras，GLTFExporter 出来没有。点名丢弃，不是静默抹掉。",
    });
  } else if (before.extrasPresent) {
    kept.push("extras");
  }
  if (
    before.generator &&
    after.generator &&
    before.generator !== after.generator
  ) {
    dropped.push({
      feature: "asset.generator",
      reason: `进去是「${before.generator}」，出来被写成「${after.generator}」。元数据，不是几何。`,
    });
  }
  return { kept, dropped, complete: dropped.length === 0 };
}

export function roundtripFixtureGltf() {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bin = new Uint8Array(44);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), 36);
  let binary = "";
  for (let i = 0; i < bin.length; i += 1) binary += String.fromCharCode(bin[i]);
  const uri = `data:application/octet-stream;base64,${btoa(binary)}`;
  return {
    asset: { version: "2.0", generator: "oceanleo-w11-fixture" },
    extras: { oceanleoRoundtrip: true },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: "RoundtripBox",
        mesh: 0,
        translation: [1, 2, 3],
        extras: { keep: "name-and-translation" },
      },
    ],
    meshes: [
      {
        name: "BoxMesh",
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: "RedMat",
        pbrMetallicRoughness: {
          baseColorFactor: [1, 0, 0, 1],
          metallicFactor: 0,
          roughnessFactor: 0.5,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        max: [1, 1, 0],
        min: [0, 0, 0],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [{ byteLength: 44, uri }],
  };
}

export async function parseGltfJsonDocument(doc) {
  const text = JSON.stringify(doc);
  return loader().parseAsync(text, "");
}

/**
 * 进去一份 glTF JSON，经 Loader.parse → Exporter.parseAsync(binary)
 * → 再 Loader.parse。这就是 three.js editor 菜单里 Import GLTF / Export GLB。
 */
export async function roundtripGltfThroughThree(doc) {
  const inbound = inspectGltfDocument(doc);
  const loaded = await parseGltfJsonDocument(doc);
  const animations = loaded.animations || [];
  const glb = await exportModel3DGlb(loaded.scene, animations);
  if (!(glb instanceof ArrayBuffer) || glb.byteLength === 0) {
    throw new Error("GLTFExporter 没有产出 GLB 字节——进去了但没出来");
  }
  const exportedDoc = parseGlbJsonDocument(glb);
  const outbound = inspectGltfDocument(exportedDoc);
  const reparsed = await parseModel3DGlb(glb);
  if (!reparsed?.scene) {
    throw new Error("导出来的 GLB 用同一份 GLTFLoader 打不开");
  }
  return {
    inbound,
    outbound,
    diff: diffGltfInspect(inbound, outbound),
    glbBytes: glb.byteLength,
    reparsedChildCount: reparsed.scene.children.length,
  };
}
