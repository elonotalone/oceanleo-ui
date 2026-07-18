export const MODEL3D_OPERATION_SCHEMA = "oceanleo.model3d-operations@1";
export const MODEL3D_CHECKPOINT_OPERATION_LIMIT = 64;
export const MODEL3D_CHECKPOINT_BYTE_LIMIT = 256 * 1024;
export const MODEL3D_JOURNAL_HARD_LIMIT = 256;

const KINDS = new Set([
  "transform",
  "material",
  "texture",
  "camera",
  "light",
  "presence",
  "visibility",
]);
const TEXTURE_SLOTS = new Set([
  "baseColor",
  "normal",
  "metallicRoughness",
  "emissive",
  "occlusion",
]);
const finite = (value, fallback = 0, minimum = -100_000, maximum = 100_000) => {
  const numeric = Number(value);
  return Math.min(
    maximum,
    Math.max(minimum, Number.isFinite(numeric) ? numeric : fallback),
  );
};
const text = (value, maximum = 240) => String(value || "").slice(0, maximum);
const color = (value, fallback = "#ffffff") => {
  const candidate = String(value || "");
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : fallback;
};
const vector = (value, fallback) =>
  Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((entry, index) => finite(entry, fallback[index]))
    : [...fallback];
const transform = (value) => ({
  position: vector(value?.position, [0, 0, 0]),
  rotation: vector(value?.rotation, [0, 0, 0]),
  scale: vector(value?.scale, [1, 1, 1]).map((entry) =>
    finite(entry, 1, -10_000, 10_000)),
});
const camera = (value) => ({
  fov: finite(value?.fov, 45, 1, 179),
  zoom: finite(value?.zoom, 1, 0.01, 100),
  near: finite(value?.near, 0.1, 0.0001, 1_000),
  far: finite(value?.far, 1_000, 0.001, 1_000_000),
});
const light = (value) => ({
  color: color(value?.color),
  intensity: finite(value?.intensity, 1, 0, 100_000),
  distance: finite(value?.distance, 0, 0, 1_000_000),
  decay: finite(value?.decay, 2, 0, 10),
  angle: finite(value?.angle, 45, 1, 89),
  penumbra: finite(value?.penumbra, 0, 0, 1),
});

function normalizeObjectSpec(value) {
  if (!value || typeof value !== "object") return undefined;
  const kind = ["camera", "directional", "point", "spot"].includes(value.kind)
    ? value.kind
    : "";
  if (!kind) return undefined;
  return {
    kind,
    name: text(value.name, 200),
    transform: transform(value.transform),
    ...(kind === "camera" ? { camera: camera(value.camera) } : {}),
    ...(kind !== "camera" ? { light: light(value.light) } : {}),
  };
}

export function normalizeModel3DOperation(value) {
  if (!value || typeof value !== "object" || !KINDS.has(value.kind)) {
    return null;
  }
  const id = text(value.id, 120);
  const target = text(value.target, 240);
  if (!id || !target) return null;
  const base = { id, kind: value.kind, target };
  switch (value.kind) {
    case "transform":
      return { ...base, value: transform(value.value) };
    case "material":
      return {
        ...base,
        materialIndex: Math.round(finite(value.materialIndex, 0, 0, 255)),
        value: {
          color: color(value.value?.color),
          metalness: finite(value.value?.metalness, 1, 0, 1),
          roughness: finite(value.value?.roughness, 1, 0, 1),
        },
      };
    case "texture": {
      if (!TEXTURE_SLOTS.has(value.slot)) return null;
      const textureValue =
        value.value === null || value.value === "checkpoint"
          ? value.value
          : /^(?:https?:|\/)/i.test(String(value.value || ""))
            ? text(value.value, 2_000)
            : null;
      return {
        ...base,
        materialIndex: Math.round(finite(value.materialIndex, 0, 0, 255)),
        slot: value.slot,
        value: textureValue,
        requiresCheckpoint: value.requiresCheckpoint === true,
      };
    }
    case "camera":
      return { ...base, value: camera(value.value) };
    case "light":
      return { ...base, value: light(value.value) };
    case "presence":
      return {
        ...base,
        parent: text(value.parent, 240) || "root",
        index: Math.round(finite(value.index, 0, 0, 100_000)),
        present: value.present !== false,
        ...(normalizeObjectSpec(value.object)
          ? { object: normalizeObjectSpec(value.object) }
          : {}),
      };
    case "visibility":
      return { ...base, visible: value.visible !== false };
    default:
      return null;
  }
}

export function normalizeModel3DOperationJournal(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(-MODEL3D_JOURNAL_HARD_LIMIT).flatMap((entry) => {
    const operation = normalizeModel3DOperation(entry);
    if (!operation || seen.has(operation.id)) return [];
    seen.add(operation.id);
    return [operation];
  });
}

export function model3DJournalByteLength(value) {
  const json = JSON.stringify(value);
  return typeof TextEncoder === "function"
    ? new TextEncoder().encode(json).byteLength
    : json.length;
}

export function model3DCheckpointReason(
  journal,
  { force = false } = {},
) {
  if (force) return "forced";
  if (journal.some((operation) => operation.requiresCheckpoint === true)) {
    return "binary-dependency";
  }
  if (journal.length >= MODEL3D_CHECKPOINT_OPERATION_LIMIT) {
    return "operation-limit";
  }
  if (model3DJournalByteLength(journal) >= MODEL3D_CHECKPOINT_BYTE_LIMIT) {
    return "byte-limit";
  }
  return "";
}

export function shouldCheckpointModel3DJournal(journal, options) {
  return Boolean(model3DCheckpointReason(journal, options));
}

export function createModel3DSavePlan(journal, options) {
  const operations = normalizeModel3DOperationJournal(journal);
  const checkpointReason = model3DCheckpointReason(operations, options);
  return {
    checkpointReason,
    shouldExportGlb: Boolean(checkpointReason),
    coveredOperationIds: checkpointReason
      ? operations.map((operation) => operation.id)
      : [],
    persistedOperations: checkpointReason ? [] : operations,
  };
}
