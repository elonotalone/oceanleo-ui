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
  animationSpeed: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
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
    zoom: orbit ? clamp(Number(orbit[3]), 25, 300) : 105,
    autoRotate: record.auto_rotate === true,
    exposure: numeric("exposure", 1, 0, 2),
    shadowIntensity: numeric("shadow_intensity", 1, 0, 2),
    shadowSoftness: numeric("shadow_softness", 1, 0, 1),
    background: /^#[0-9a-f]{6}$/i.test(color) ? color : "#f5f5f4",
    animation:
      typeof record.animation === "string"
        ? record.animation.slice(0, 200)
        : "",
    animationSpeed: numeric("animation_speed", 1, 0.1, 4),
  };
}
