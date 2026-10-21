import type { PluginAgentContext } from "../plugin-command/types";
import { boundedAgentContent } from "../plugin-command/bounded-agent-content";

function sceneJson(bytes: ArrayBuffer, format: "glb" | "gltf") {
  let json: Uint8Array;
  let jsonEnd = bytes.byteLength;
  if (format === "gltf") json = new Uint8Array(bytes);
  else {
    if (bytes.byteLength < 20) throw new Error("invalid GLB");
    const header = new DataView(bytes);
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
        header.getUint32(8, true) !== bytes.byteLength || header.getUint32(16, true) !== 0x4e4f534a) {
      throw new Error("invalid GLB");
    }
    const length = header.getUint32(12, true);
    jsonEnd = 20 + length;
    if (length > 8_000_000 || jsonEnd > bytes.byteLength) throw new Error("invalid GLB JSON");
    json = new Uint8Array(bytes, 20, length);
  }
  if (json.byteLength > 8_000_000) throw new Error("scene too large");
  const document = JSON.parse(new TextDecoder().decode(json).replace(/\u0000+$/g, ""));
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("invalid scene");
  return { document, jsonEnd };
}

/** Change the loaded native glTF material, preserving all other JSON and binary chunks. */
export function recolorModel3DMaterial(
  bytes: ArrayBuffer, format: "glb" | "gltf", materialIndex: number, color: string,
): { ok: true; bytes: ArrayBuffer } | { ok: false; reason: string } {
  if (!/^#[0-9a-f]{6}$/i.test(color) || !Number.isInteger(materialIndex) || materialIndex < 0) {
    return { ok: false, reason: "必须提供真实材质索引和 #RRGGBB 颜色。" };
  }
  try {
    const { document, jsonEnd } = sceneJson(bytes, format);
    const material = Array.isArray(document.materials) ? document.materials[materialIndex] : null;
    if (!material || typeof material !== "object" || Array.isArray(material)) {
      return { ok: false, reason: "当前模型中不存在指定的材质。" };
    }
    const pbr = material.pbrMetallicRoughness || {};
    if (typeof pbr !== "object" || Array.isArray(pbr)) {
      return { ok: false, reason: "当前材质结构无效，模型保持原样。" };
    }
    const oldAlpha = Array.isArray(pbr.baseColorFactor) ? pbr.baseColorFactor[3] : 1;
    material.pbrMetallicRoughness = { ...pbr, baseColorFactor: [
      parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255, typeof oldAlpha === "number" ? oldAlpha : 1,
    ] };
    const encoded = new TextEncoder().encode(JSON.stringify(document));
    if (format === "gltf") return { ok: true, bytes: encoded.buffer };
    const paddedLength = Math.ceil(encoded.byteLength / 4) * 4;
    const output = new Uint8Array(20 + paddedLength + bytes.byteLength - jsonEnd);
    output.set(new Uint8Array(bytes, 0, 20));
    output.fill(32, 20, 20 + paddedLength);
    output.set(encoded, 20);
    output.set(new Uint8Array(bytes, jsonEnd), 20 + paddedLength);
    const header = new DataView(output.buffer);
    header.setUint32(8, output.byteLength, true);
    header.setUint32(12, paddedLength, true);
    return { ok: true, bytes: output.buffer };
  } catch {
    return { ok: false, reason: "当前模型源无法安全改写；模型保持原样。" };
  }
}

/** Read the JSON scene already loaded by the native editor, never a filename guess. */
export function model3dAgentSource(
  bytes: ArrayBuffer | null,
  format: "glb" | "gltf",
  view: unknown,
): PluginAgentContext {
  if (!bytes) return { ready: false, reason: "当前模型源字节尚未就绪。" };
  try {
    const { document: source } = sceneJson(bytes, format);
    return boundedAgentContent({
      view, nodes: source.nodes, materials: source.materials,
      scenes: source.scenes, meshes: source.meshes, animations: source.animations,
    }, "这是当前模型源的场景结构、材质与视图，不包含完整顶点字节或渲染画面；不得猜测未提供的几何细节。");
  } catch {
    return { ready: false, reason: "当前模型源无法安全解析成场景上下文；不会用文件名冒充模型内容。" };
  }
}
