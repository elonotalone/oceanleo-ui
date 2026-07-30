/**
 * §2.1 默认镜头与打光 / §2.2 背景与地面 / §2.3 画布与取景 的**唯一取值来源**。
 *
 * 写成 `.mjs` 是为了让 `model3d-runtime.mjs` 能直接消费同一份常量,避免视觉靶在
 * TS 与运行时之间出现第二份抄写。`model3d-view-manifest.ts` 从这里再导出。
 */

/** §2.1 (C17–C22)。 */
export const MODEL3D_DEFAULT_CAMERA = Object.freeze({
  fovDeg: 45,
  nearPlane: 0.1,
  farPlane: 1_000,
  pitchDeg: 20,
  yawDeg: 35,
  distanceFactor: 2.4,
});

/** §2.1 三点光 (C23) 与主光方位。 */
export const MODEL3D_DEFAULT_LIGHTING = Object.freeze({
  keyIntensity: 3.0,
  fillIntensity: 1.2,
  ambientIntensity: 0.6,
  keyAzimuthDeg: 45,
  keyElevationDeg: 55,
  shadows: true,
});

/** §2.2 背景与地面 token 表。 */
export const MODEL3D_STAGE_TOKENS = Object.freeze({
  "stage.bg.top": "#2A2F36",
  "stage.bg.bottom": "#14171B",
  "stage.ground": "#0F1215",
  "stage.accent": "#1F6FEB",
  "stage.grid": "#3A4149",
});

/** §2.3 画布与取景 (C30–C32)。 */
export const MODEL3D_FRAMING = Object.freeze({
  previewWidthPx: 1_200,
  previewHeightPx: 900,
  thumbnailEdgePx: 512,
  modelHeightRatio: 0.72,
  minimumMarginPercent: 8,
});

const DEG = Math.PI / 180;

/**
 * §2.1 相机距离 = `distanceFactor` × 包围盒对角线,并按 §3.1 的 1.2 – 6 域夹取。
 * 退化包围盒(对角线 0)在 §6 F5 里是 `invalid`,这里返回 0 让调用方拦下,
 * 而不是把距离算成 0 或 Infinity。
 */
export function model3DCameraDistanceFor(diagonal, distanceFactor = MODEL3D_DEFAULT_CAMERA.distanceFactor) {
  const requested = Number(distanceFactor);
  const factor = Math.min(
    6,
    Math.max(
      1.2,
      Number.isFinite(requested)
        ? requested
        : MODEL3D_DEFAULT_CAMERA.distanceFactor,
    ),
  );
  const span = Number(diagonal);
  return Number.isFinite(span) && span > 0 ? span * factor : 0;
}

/**
 * §2.1 默认俯仰 20°(自水平面向下)与方位 35°(自 −Z 轴顺时针)换算成相机位置。
 * 返回场景单位下相对 `target` 的偏移量。
 */
export function model3DCameraOffset({
  diagonal,
  pitchDeg = MODEL3D_DEFAULT_CAMERA.pitchDeg,
  yawDeg = MODEL3D_DEFAULT_CAMERA.yawDeg,
  distanceFactor = MODEL3D_DEFAULT_CAMERA.distanceFactor,
} = {}) {
  const distance = model3DCameraDistanceFor(diagonal, distanceFactor);
  const pitch = Number(pitchDeg) * DEG;
  const yaw = Number(yawDeg) * DEG;
  const horizontal = Math.cos(pitch) * distance;
  return {
    distance,
    x: horizontal * Math.sin(yaw),
    y: Math.sin(pitch) * distance,
    z: -horizontal * Math.cos(yaw),
  };
}

/** §2.1 主光方位角 45° / 仰角 55° 换算成方向光位置(单位化后乘距离)。 */
export function model3DKeyLightOffset(distance, {
  azimuthDeg = MODEL3D_DEFAULT_LIGHTING.keyAzimuthDeg,
  elevationDeg = MODEL3D_DEFAULT_LIGHTING.keyElevationDeg,
} = {}) {
  const azimuth = Number(azimuthDeg) * DEG;
  const elevation = Number(elevationDeg) * DEG;
  const span = Number(distance) > 0 ? Number(distance) : 1;
  const horizontal = Math.cos(elevation) * span;
  return {
    x: horizontal * Math.sin(azimuth),
    y: Math.sin(elevation) * span,
    z: horizontal * Math.cos(azimuth),
  };
}

/**
 * §2.3 取景核对:给定相机距离、FOV 与模型高度,算出模型实际占画面高度比与
 * 上下留白百分比。校验侧用它判 C32 (0.72) 与「四边留白 ≥ 8%」。
 */
export function model3DFramingCoverage({
  distance,
  fovDeg = MODEL3D_DEFAULT_CAMERA.fovDeg,
  modelHeight,
}) {
  const span = Number(distance);
  const height = Number(modelHeight);
  const fov = Number(fovDeg);
  if (!(span > 0) || !(height > 0) || !(fov > 0)) {
    return { heightRatio: 0, marginPercent: 0, visibleHeight: 0 };
  }
  const visibleHeight = 2 * span * Math.tan((fov / 2) * DEG);
  const heightRatio = height / visibleHeight;
  return {
    visibleHeight,
    heightRatio,
    marginPercent: Math.max(0, (1 - heightRatio) / 2) * 100,
  };
}

/** §2.3 预览与缩略图画布。 */
export function model3DPreviewCanvas() {
  return {
    widthPx: MODEL3D_FRAMING.previewWidthPx,
    heightPx: MODEL3D_FRAMING.previewHeightPx,
  };
}

export function model3DThumbnailCanvas() {
  return {
    widthPx: MODEL3D_FRAMING.thumbnailEdgePx,
    heightPx: MODEL3D_FRAMING.thumbnailEdgePx,
  };
}

/** §2.2 渐变背景的 CSS 表达,供 Stage 的画布底衬使用。 */
export function model3DStageBackgroundCss() {
  return (
    `linear-gradient(180deg, ${MODEL3D_STAGE_TOKENS["stage.bg.top"]} 0%,` +
    ` ${MODEL3D_STAGE_TOKENS["stage.bg.bottom"]} 100%)`
  );
}
