export interface Model3DMaterialOverride {
  index: number;
  name: string;
  color: string;
  metallic: number;
  roughness: number;
}

export interface Model3DAnnotation {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  nodePath: string;
}

export interface Model3DSavedView {
  azimuth: number;
  elevation: number;
  zoom: number;
  autoRotate: boolean;
  exposure: number;
  shadowIntensity: number;
  shadowSoftness: number;
  background: string;
  animation: string;
  animationPlaying: boolean;
  animationSpeed: number;
  animationTime: number;
  environmentUrl: string;
  environmentIntensity: number;
  shadowEnabled: boolean;
  materialOverrides: Model3DMaterialOverride[];
  annotations: Model3DAnnotation[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function modelColor(value: unknown): string {
  const color = String(value || "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff";
}

export function normalizeModel3DMaterialOverrides(
  value: unknown,
): Model3DMaterialOverride[] {
  if (!Array.isArray(value)) return [];
  const usedIndexes = new Set<number>();
  return value.slice(0, 64).flatMap((entry, fallbackIndex) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const index = Number(source.index ?? fallbackIndex);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index > 255 ||
      usedIndexes.has(index)
    ) {
      return [];
    }
    usedIndexes.add(index);
    return [{
      index,
      name: String(source.name || `材质 ${index + 1}`).slice(0, 160),
      color: modelColor(source.color),
      metallic: clamp(finiteNumber(source.metallic, 1), 0, 1),
      roughness: clamp(finiteNumber(source.roughness, 1), 0, 1),
    }];
  });
}

export function normalizeModel3DAnnotations(
  value: unknown,
): Model3DAnnotation[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  return value.slice(0, 32).flatMap((entry, fallbackIndex) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    let id = String(source.id || `annotation-${fallbackIndex + 1}`)
      .replace(/[^a-z0-9_.:-]/gi, "-")
      .slice(0, 80);
    const label = String(source.label || "").trim().slice(0, 240);
    if (!id || !label) return [];
    if (usedIds.has(id)) {
      const base = id.slice(0, 70);
      let suffix = fallbackIndex + 1;
      while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
      id = `${base}-${suffix}`;
    }
    usedIds.add(id);
    return [{
      id,
      label,
      x: clamp(finiteNumber(source.x, 0), -100_000, 100_000),
      y: clamp(finiteNumber(source.y, 0), -100_000, 100_000),
      z: clamp(finiteNumber(source.z, 0), -100_000, 100_000),
      normalX: clamp(finiteNumber(source.normalX, 0), -1, 1),
      normalY: clamp(finiteNumber(source.normalY, 1), -1, 1),
      normalZ: clamp(finiteNumber(source.normalZ, 0), -1, 1),
      nodePath: String(source.nodePath || "").slice(0, 1_000),
    }];
  });
}

export function normalizeModel3DEnvironmentUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim().slice(0, 2_000) : "";
  return /^(?:https?:|\/)/i.test(url) ? url : "";
}

export function normalizeSavedModelView(value: unknown): Model3DSavedView {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const orbit = String(record.camera_orbit || "").match(
    /^(-?\d+(?:\.\d+)?)deg\s+(-?\d+(?:\.\d+)?)deg\s+(\d+(?:\.\d+)?)%$/,
  );
  const numeric = (key: string, fallback: number, min: number, max: number) => {
    const parsed = Number(record[key]);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
  };
  const color = String(record.background || "");
  return {
    azimuth: orbit ? clamp(Number(orbit[1]), -180, 180) : 0,
    elevation: orbit ? clamp(Number(orbit[2]), 0, 180) : 75,
    zoom: orbit ? clamp(Number(orbit[3]), 20, 500) : 110,
    autoRotate: record.auto_rotate === true,
    exposure: numeric("exposure", 1, 0.1, 4),
    shadowIntensity: numeric("shadow_intensity", 1, 0, 2),
    shadowSoftness: numeric("shadow_softness", 1, 0, 1),
    background: /^#[0-9a-f]{6}$/i.test(color) ? color : "#f5f5f4",
    animation:
      typeof record.animation === "string"
        ? record.animation.slice(0, 200)
        : "",
    animationPlaying: record.animation_playing === true,
    animationSpeed: numeric("animation_speed", 1, 0.1, 4),
    animationTime: numeric("animation_time", 0, 0, 86_400),
    environmentUrl: normalizeModel3DEnvironmentUrl(record.environment_url),
    environmentIntensity: numeric("environment_intensity", 1, 0, 5),
    shadowEnabled: record.shadow_enabled !== false,
    materialOverrides: normalizeModel3DMaterialOverrides(
      record.material_overrides,
    ),
    annotations: normalizeModel3DAnnotations(record.annotations),
  };
}
