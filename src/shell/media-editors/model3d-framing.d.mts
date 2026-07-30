export declare const MODEL3D_DEFAULT_CAMERA: {
  readonly fovDeg: number;
  readonly nearPlane: number;
  readonly farPlane: number;
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly distanceFactor: number;
};

export declare const MODEL3D_DEFAULT_LIGHTING: {
  readonly keyIntensity: number;
  readonly fillIntensity: number;
  readonly ambientIntensity: number;
  readonly keyAzimuthDeg: number;
  readonly keyElevationDeg: number;
  readonly shadows: boolean;
};

export declare const MODEL3D_STAGE_TOKENS: {
  readonly "stage.bg.top": string;
  readonly "stage.bg.bottom": string;
  readonly "stage.ground": string;
  readonly "stage.accent": string;
  readonly "stage.grid": string;
};

export declare const MODEL3D_FRAMING: {
  readonly previewWidthPx: number;
  readonly previewHeightPx: number;
  readonly thumbnailEdgePx: number;
  readonly modelHeightRatio: number;
  readonly minimumMarginPercent: number;
};

export declare function model3DCameraDistanceFor(
  diagonal: number,
  distanceFactor?: number,
): number;

export declare function model3DCameraOffset(input?: {
  diagonal?: number;
  pitchDeg?: number;
  yawDeg?: number;
  distanceFactor?: number;
}): { distance: number; x: number; y: number; z: number };

export declare function model3DKeyLightOffset(
  distance: number,
  input?: { azimuthDeg?: number; elevationDeg?: number },
): { x: number; y: number; z: number };

export declare function model3DFramingCoverage(input: {
  distance: number;
  fovDeg?: number;
  modelHeight: number;
}): { visibleHeight: number; heightRatio: number; marginPercent: number };

export declare function model3DPreviewCanvas(): {
  widthPx: number;
  heightPx: number;
};

export declare function model3DThumbnailCanvas(): {
  widthPx: number;
  heightPx: number;
};

export declare function model3DStageBackgroundCss(): string;
