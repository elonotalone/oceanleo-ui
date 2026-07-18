import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const loader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export async function loadModel3DUrl(url, onProgress) {
  return loader().loadAsync(url, onProgress);
}

export async function parseModel3DGlb(source, resourcePath = "") {
  let buffer;
  if (source instanceof Blob) {
    buffer = await source.arrayBuffer();
  } else if (source instanceof ArrayBuffer) {
    buffer = source;
  } else if (ArrayBuffer.isView(source)) {
    buffer = source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    );
  } else {
    throw new TypeError("GLB source must be a Blob, ArrayBuffer, or typed array");
  }
  return loader().parseAsync(buffer, resourcePath);
}

export async function exportModel3DGlb(scene, animations = []) {
  const output = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    trs: true,
    onlyVisible: false,
    animations,
    includeCustomExtensions: true,
  });
  if (!(output instanceof ArrayBuffer) || output.byteLength === 0) {
    throw new Error("GLTFExporter did not produce GLB bytes");
  }
  return output;
}

export function objectPath(object, root) {
  if (!object || !root) return "";
  if (object === root) return "root";
  const indexes = [];
  let current = object;
  while (current && current !== root) {
    const parent = current.parent;
    if (!parent) return "";
    const index = parent.children.indexOf(current);
    if (index < 0) return "";
    indexes.push(index);
    current = parent;
  }
  return current === root ? indexes.reverse().join("/") : "";
}

export function objectAtPath(root, path) {
  if (!root || path === "root") return root || null;
  const indexes = String(path)
    .split("/")
    .map((entry) => Number(entry));
  if (indexes.some((entry) => !Number.isInteger(entry) || entry < 0)) {
    return null;
  }
  let current = root;
  for (const index of indexes) {
    current = current?.children[index];
    if (!current) return null;
  }
  return current;
}

function nodeKind(node) {
  if (node.isSkinnedMesh) return "skinned-mesh";
  if (node.isMesh) return "mesh";
  if (node.isPerspectiveCamera) return "perspective-camera";
  if (node.isOrthographicCamera) return "orthographic-camera";
  if (node.isDirectionalLight) return "directional-light";
  if (node.isPointLight) return "point-light";
  if (node.isSpotLight) return "spot-light";
  if (node.isLight) return "light";
  if (node.isBone) return "bone";
  if (node.isGroup) return "group";
  return "object";
}

export function sceneTreeSnapshot(root) {
  if (!root) return [];
  const nodes = [];
  const visit = (node, parentId, depth) => {
    const path = objectPath(node, root);
    const kind = nodeKind(node);
    nodes.push({
      id: node.uuid,
      parentId,
      path,
      depth,
      name:
        node.name ||
        (node === root
          ? "Scene"
          : `${node.type || "Object"} ${nodes.length + 1}`),
      kind,
      type: node.type || "Object3D",
      visible: node.visible !== false,
      selectable: node !== root && !node.userData?.oceanleoEditorHelper,
      childCount: node.children.filter(
        (child) => !child.userData?.oceanleoEditorHelper,
      ).length,
    });
    for (const child of node.children) {
      if (child.userData?.oceanleoEditorHelper) continue;
      visit(child, node.uuid, depth + 1);
    }
  };
  visit(root, "", 0);
  return nodes;
}

export function editablePbrMaterials(object) {
  if (!object?.isMesh) return [];
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.flatMap((material, index) =>
    material?.isMeshStandardMaterial
      ? [
          {
            index,
            name: material.name || `Material ${index + 1}`,
            material,
          },
        ]
      : [],
  );
}

export function replaceMeshMaterial(object, index, material) {
  if (!object?.isMesh) return;
  if (Array.isArray(object.material)) {
    const next = [...object.material];
    next[index] = material;
    object.material = next;
  } else if (index === 0) {
    object.material = material;
  }
}

export function disposeModel3DObject(root) {
  if (!root) return;
  const textures = new Set();
  const materials = new Set();
  root.traverse((node) => {
    if (node.geometry?.dispose) node.geometry.dispose();
    const entries = Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : [];
    for (const material of entries) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

export { THREE };
