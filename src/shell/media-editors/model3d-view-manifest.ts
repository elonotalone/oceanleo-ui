/**
 * `oceanleo.model-view@1` — the view manifest that ships alongside a glTF 2.0
 * `source`. Field names, ranges and defaults are normative in
 * `docs/specs/oceanleo-material-and-game-v1/L1-carriers/model-3d.md` §2.1–§2.3,
 * §3.1 and §4; this module is the single place they are encoded.
 */

import {
  MODEL3D_DEFAULT_CAMERA,
  MODEL3D_DEFAULT_LIGHTING,
  MODEL3D_FRAMING,
  MODEL3D_STAGE_TOKENS,
} from "./model3d-framing.mjs";

export const MODEL3D_VIEW_MANIFEST_SCHEMA = "oceanleo.model-view@1";

/** §2.1–§2.3 的取值只在 `model3d-framing.mjs` 落一份,这里只做再导出。 */
export {
  MODEL3D_DEFAULT_CAMERA,
  MODEL3D_DEFAULT_LIGHTING,
  MODEL3D_FRAMING,
  MODEL3D_STAGE_TOKENS,
};

/** §4 数值常量表. Only the machine-checkable rows are encoded. */
export const MODEL3D_CONSTANTS = {
  C1_ASSET_VERSION: "2.0",
  C2_SCENE_COUNT_MIN: 1,
  C2_SCENE_COUNT_MAX: 16,
  C3_NODE_COUNT_MIN: 2,
  C4_NODE_COUNT_MAX: 5_000,
  C5_MESH_COUNT_MIN: 1,
  C5_MESH_COUNT_MAX: 2_000,
  C6_MATERIAL_COUNT_MIN: 1,
  C6_MATERIAL_COUNT_MAX: 200,
  C7_TEXTURE_COUNT_MIN: 1,
  C8_TEXTURE_COUNT_MAX: 100,
  C9_DEPENDENCY_COUNT_MIN: 1,
  C9_DEPENDENCY_COUNT_MAX: 512,
  C10_TRIANGLE_COUNT_MIN: 500,
  C11_TRIANGLE_COUNT_MAX_PROP: 150_000,
  C12_TRIANGLE_COUNT_MAX_SCENE: 1_500_000,
  C13_DRAW_CALL_MAX: 200,
  C14_TEXTURE_MEMORY_MAX_BYTES: 268_435_456,
  C15_TEXTURE_EDGE_MAX_PX: 4_096,
  C16_TEXTURE_EDGE_MIN_PX: 64,
  C24_SOURCE_BYTES_MIN: 20_480,
  C25_SOURCE_BYTES_MAX: 52_428_800,
  C28_SANDBOX_BUNDLE_MAX_BYTES: 2_097_152,
  C29_SANDBOX_ASSET_MAX_BYTES: 524_288,
  C33_COVER_MIN_EDGE_PX: 128,
  C34_FRAME_COLOR_COUNT_MIN: 32,
  C35_PREVIEW_RENDER_MAX_MS: 15_000,
  C36_ANIMATION_COUNT_MAX: 64,
  C37_SKIN_COUNT_MAX: 32,
  C38_FAMILY_JACCARD_MAX: 0.85,
  C39_TWIN_JACCARD: 0.99,
} as const;

/** §8.1 字节下限. */
export const MODEL3D_BYTE_FLOORS = {
  sourceBytes: 20_480,
  sourceBytesMax: 52_428_800,
  closureBytes: 16_384,
  textureBytes: 4_096,
} as const;

/** §2.4 无障碍与 §8.2 文本下限. */
export const MODEL3D_TEXT_FLOORS = {
  titleMinLength: 8,
  titleMaxLength: 300,
  descriptionMinLength: 8,
  descriptionMaxLength: 1_000,
} as const;

/** §3.1 `environment.hdriLicenseCode` / §5.5 许可锁. */
export const MODEL3D_HDRI_LICENSE_CODES = ["CC0", "PDM"] as const;
export const MODEL3D_ENVIRONMENT_BACKGROUNDS = [
  "gradient",
  "hdri",
  "solid",
] as const;

export type Model3DHdriLicenseCode =
  (typeof MODEL3D_HDRI_LICENSE_CODES)[number];
export type Model3DEnvironmentBackground =
  (typeof MODEL3D_ENVIRONMENT_BACKGROUNDS)[number];

export interface Model3DViewManifestCamera {
  fovDeg: number;
  nearPlane: number;
  farPlane: number;
  pitchDeg: number;
  yawDeg: number;
  distanceFactor: number;
}

export interface Model3DViewManifestLighting {
  keyIntensity: number;
  fillIntensity: number;
  ambientIntensity: number;
  keyAzimuthDeg?: number;
  keyElevationDeg?: number;
  shadows?: boolean;
}

export interface Model3DViewManifestEnvironment {
  hdriAssetId?: string;
  hdriLicenseCode?: Model3DHdriLicenseCode;
  intensity?: number;
  background?: Model3DEnvironmentBackground;
}

export interface Model3DViewManifestBudget {
  triangleCount: number;
  drawCallCount: number;
  textureMemoryBytes: number;
  sourceBytes: number;
  maxTextureEdgePx?: number;
}

export interface Model3DViewManifestGraph {
  sceneCount: number;
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  dependencyCount: number;
  animationCount?: number;
  skinCount?: number;
}

export interface Model3DAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
}

export interface Model3DViewManifest {
  schema: typeof MODEL3D_VIEW_MANIFEST_SCHEMA;
  version: 1;
  title: string;
  description: string;
  camera: Model3DViewManifestCamera;
  lighting: Model3DViewManifestLighting;
  environment?: Model3DViewManifestEnvironment;
  budget: Model3DViewManifestBudget;
  graph: Model3DViewManifestGraph;
  attribution: { entries: Model3DAttributionEntry[] };
}

export interface Model3DViewManifestError {
  code: string;
  path: string;
  message: string;
}

export type Model3DViewManifestValidation =
  | { ok: true; manifest: Model3DViewManifest }
  | { ok: false; errors: Model3DViewManifestError[] };

/**
 * §3.1 逐字 JSON Schema (Draft 2020-12). Kept as data so the contract test can
 * diff it against the spec instead of trusting the validator implementation.
 */
export const MODEL3D_VIEW_MANIFEST_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oceanleo.com/schemas/oceanleo.model-view@1.json",
  title: "oceanleo.model-view@1",
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "version",
    "title",
    "description",
    "camera",
    "lighting",
    "budget",
    "graph",
    "attribution",
  ],
  properties: {
    schema: { const: "oceanleo.model-view@1" },
    version: { type: "integer", const: 1 },
    title: { type: "string", minLength: 8, maxLength: 300 },
    description: { type: "string", minLength: 8, maxLength: 1000 },
    camera: {
      type: "object",
      additionalProperties: false,
      required: [
        "fovDeg",
        "nearPlane",
        "farPlane",
        "pitchDeg",
        "yawDeg",
        "distanceFactor",
      ],
      properties: {
        fovDeg: { type: "number", minimum: 20, maximum: 90 },
        nearPlane: { type: "number", exclusiveMinimum: 0, maximum: 10 },
        farPlane: { type: "number", minimum: 10, maximum: 100000 },
        pitchDeg: { type: "number", minimum: -89, maximum: 89 },
        yawDeg: { type: "number", minimum: 0, exclusiveMaximum: 360 },
        distanceFactor: { type: "number", minimum: 1.2, maximum: 6 },
      },
    },
    lighting: {
      type: "object",
      additionalProperties: false,
      required: ["keyIntensity", "fillIntensity", "ambientIntensity"],
      properties: {
        keyIntensity: { type: "number", minimum: 0, maximum: 20 },
        fillIntensity: { type: "number", minimum: 0, maximum: 20 },
        ambientIntensity: { type: "number", minimum: 0, maximum: 10 },
        keyAzimuthDeg: { type: "number", minimum: 0, exclusiveMaximum: 360 },
        keyElevationDeg: { type: "number", minimum: 0, maximum: 90 },
        shadows: { type: "boolean", default: true },
      },
    },
    environment: {
      type: "object",
      additionalProperties: false,
      properties: {
        hdriAssetId: { type: "string", maxLength: 64 },
        hdriLicenseCode: { enum: ["CC0", "PDM"] },
        intensity: { type: "number", minimum: 0, maximum: 5 },
        background: {
          enum: ["gradient", "hdri", "solid"],
          default: "gradient",
        },
      },
    },
    budget: {
      type: "object",
      additionalProperties: false,
      required: [
        "triangleCount",
        "drawCallCount",
        "textureMemoryBytes",
        "sourceBytes",
      ],
      properties: {
        triangleCount: { type: "integer", minimum: 500, maximum: 1500000 },
        drawCallCount: { type: "integer", minimum: 1, maximum: 200 },
        textureMemoryBytes: {
          type: "integer",
          minimum: 0,
          maximum: 268435456,
        },
        sourceBytes: { type: "integer", minimum: 20480, maximum: 52428800 },
        maxTextureEdgePx: { type: "integer", minimum: 64, maximum: 4096 },
      },
    },
    graph: {
      type: "object",
      additionalProperties: false,
      required: [
        "sceneCount",
        "nodeCount",
        "meshCount",
        "materialCount",
        "textureCount",
        "dependencyCount",
      ],
      properties: {
        sceneCount: { type: "integer", minimum: 1, maximum: 16 },
        nodeCount: { type: "integer", minimum: 2, maximum: 5000 },
        meshCount: { type: "integer", minimum: 1, maximum: 2000 },
        materialCount: { type: "integer", minimum: 1, maximum: 200 },
        textureCount: { type: "integer", minimum: 1, maximum: 100 },
        dependencyCount: { type: "integer", minimum: 1, maximum: 512 },
        animationCount: { type: "integer", minimum: 0, maximum: 64 },
        skinCount: { type: "integer", minimum: 0, maximum: 32 },
      },
    },
    attribution: {
      type: "object",
      additionalProperties: false,
      required: ["entries"],
      properties: {
        entries: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "licenseCode", "licenseUrl"],
            properties: {
              text: { type: "string", minLength: 2, maxLength: 200 },
              licenseCode: { type: "string", minLength: 2, maxLength: 60 },
              licenseUrl: {
                type: "string",
                format: "uri",
                pattern: "^https://",
              },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * `graph` 的六个计数键，与 `reviewed_material_catalog.py:2655-2673`
 * `_validate_gltf_source` 所校验的六项逐字同名 (§3.1 末)。
 */
export const MODEL3D_GRAPH_COUNT_KEYS = [
  "sceneCount",
  "nodeCount",
  "meshCount",
  "materialCount",
  "textureCount",
  "dependencyCount",
] as const;

export type Model3DGraphCountKey = (typeof MODEL3D_GRAPH_COUNT_KEYS)[number];

type NumericBound = {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  integer?: boolean;
};

const CAMERA_BOUNDS: Record<keyof Model3DViewManifestCamera, NumericBound> = {
  fovDeg: { minimum: 20, maximum: 90 },
  nearPlane: { exclusiveMinimum: 0, maximum: 10 },
  farPlane: { minimum: 10, maximum: 100_000 },
  pitchDeg: { minimum: -89, maximum: 89 },
  yawDeg: { minimum: 0, exclusiveMaximum: 360 },
  distanceFactor: { minimum: 1.2, maximum: 6 },
};

const LIGHTING_BOUNDS: Record<string, NumericBound> = {
  keyIntensity: { minimum: 0, maximum: 20 },
  fillIntensity: { minimum: 0, maximum: 20 },
  ambientIntensity: { minimum: 0, maximum: 10 },
  keyAzimuthDeg: { minimum: 0, exclusiveMaximum: 360 },
  keyElevationDeg: { minimum: 0, maximum: 90 },
};

const BUDGET_BOUNDS: Record<string, NumericBound> = {
  triangleCount: {
    minimum: MODEL3D_CONSTANTS.C10_TRIANGLE_COUNT_MIN,
    maximum: MODEL3D_CONSTANTS.C12_TRIANGLE_COUNT_MAX_SCENE,
    integer: true,
  },
  drawCallCount: {
    minimum: 1,
    maximum: MODEL3D_CONSTANTS.C13_DRAW_CALL_MAX,
    integer: true,
  },
  textureMemoryBytes: {
    minimum: 0,
    maximum: MODEL3D_CONSTANTS.C14_TEXTURE_MEMORY_MAX_BYTES,
    integer: true,
  },
  sourceBytes: {
    minimum: MODEL3D_CONSTANTS.C24_SOURCE_BYTES_MIN,
    maximum: MODEL3D_CONSTANTS.C25_SOURCE_BYTES_MAX,
    integer: true,
  },
  maxTextureEdgePx: {
    minimum: MODEL3D_CONSTANTS.C16_TEXTURE_EDGE_MIN_PX,
    maximum: MODEL3D_CONSTANTS.C15_TEXTURE_EDGE_MAX_PX,
    integer: true,
  },
};

const GRAPH_BOUNDS: Record<string, NumericBound> = {
  sceneCount: {
    minimum: MODEL3D_CONSTANTS.C2_SCENE_COUNT_MIN,
    maximum: MODEL3D_CONSTANTS.C2_SCENE_COUNT_MAX,
    integer: true,
  },
  nodeCount: {
    minimum: MODEL3D_CONSTANTS.C3_NODE_COUNT_MIN,
    maximum: MODEL3D_CONSTANTS.C4_NODE_COUNT_MAX,
    integer: true,
  },
  meshCount: {
    minimum: MODEL3D_CONSTANTS.C5_MESH_COUNT_MIN,
    maximum: MODEL3D_CONSTANTS.C5_MESH_COUNT_MAX,
    integer: true,
  },
  materialCount: {
    minimum: MODEL3D_CONSTANTS.C6_MATERIAL_COUNT_MIN,
    maximum: MODEL3D_CONSTANTS.C6_MATERIAL_COUNT_MAX,
    integer: true,
  },
  textureCount: {
    minimum: MODEL3D_CONSTANTS.C7_TEXTURE_COUNT_MIN,
    maximum: MODEL3D_CONSTANTS.C8_TEXTURE_COUNT_MAX,
    integer: true,
  },
  dependencyCount: {
    minimum: MODEL3D_CONSTANTS.C9_DEPENDENCY_COUNT_MIN,
    maximum: MODEL3D_CONSTANTS.C9_DEPENDENCY_COUNT_MAX,
    integer: true,
  },
  animationCount: {
    minimum: 0,
    maximum: MODEL3D_CONSTANTS.C36_ANIMATION_COUNT_MAX,
    integer: true,
  },
  skinCount: {
    minimum: 0,
    maximum: MODEL3D_CONSTANTS.C37_SKIN_COUNT_MAX,
    integer: true,
  },
};

const CAMERA_KEYS = Object.keys(CAMERA_BOUNDS) as (keyof
  Model3DViewManifestCamera)[];
const LIGHTING_REQUIRED = [
  "keyIntensity",
  "fillIntensity",
  "ambientIntensity",
] as const;
const LIGHTING_KEYS = [...LIGHTING_REQUIRED, "keyAzimuthDeg", "keyElevationDeg", "shadows"];
const ENVIRONMENT_KEYS = [
  "hdriAssetId",
  "hdriLicenseCode",
  "intensity",
  "background",
];
const BUDGET_REQUIRED = [
  "triangleCount",
  "drawCallCount",
  "textureMemoryBytes",
  "sourceBytes",
] as const;
const BUDGET_KEYS = [...BUDGET_REQUIRED, "maxTextureEdgePx"];
const GRAPH_KEYS = [...MODEL3D_GRAPH_COUNT_KEYS, "animationCount", "skinCount"];
const MANIFEST_KEYS = [
  "schema",
  "version",
  "title",
  "description",
  "camera",
  "lighting",
  "environment",
  "budget",
  "graph",
  "attribution",
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pushNumeric(
  errors: Model3DViewManifestError[],
  path: string,
  value: unknown,
  bound: NumericBound,
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({
      code: "model-view-type",
      path,
      message: `${path} 必须是有限数值`,
    });
    return;
  }
  if (bound.integer && !Number.isInteger(value)) {
    errors.push({
      code: "model-view-type",
      path,
      message: `${path} 必须是整数`,
    });
    return;
  }
  if (bound.minimum !== undefined && value < bound.minimum) {
    errors.push({
      code: "model-view-range",
      path,
      message: `${path} 低于下限 ${bound.minimum}（实际 ${value}）`,
    });
  }
  if (bound.exclusiveMinimum !== undefined && value <= bound.exclusiveMinimum) {
    errors.push({
      code: "model-view-range",
      path,
      message: `${path} 必须大于 ${bound.exclusiveMinimum}（实际 ${value}）`,
    });
  }
  if (bound.maximum !== undefined && value > bound.maximum) {
    errors.push({
      code: "model-view-range",
      path,
      message: `${path} 超过上限 ${bound.maximum}（实际 ${value}）`,
    });
  }
  if (bound.exclusiveMaximum !== undefined && value >= bound.exclusiveMaximum) {
    errors.push({
      code: "model-view-range",
      path,
      message: `${path} 必须小于 ${bound.exclusiveMaximum}（实际 ${value}）`,
    });
  }
}

function pushUnknownKeys(
  errors: Model3DViewManifestError[],
  path: string,
  source: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(source)) {
    if (allowed.includes(key)) continue;
    errors.push({
      code: "model-view-additional-property",
      path: `${path}${key}`,
      message: `${path}${key} 不在 ${MODEL3D_VIEW_MANIFEST_SCHEMA} 允许的字段内`,
    });
  }
}

function pushText(
  errors: Model3DViewManifestError[],
  path: string,
  value: unknown,
  minLength: number,
  maxLength: number,
): void {
  if (typeof value !== "string") {
    errors.push({
      code: "model-view-type",
      path,
      message: `${path} 必须是字符串`,
    });
    return;
  }
  if (value.length < minLength) {
    errors.push({
      code: "model-view-range",
      path,
      message: `${path} 长度不足 ${minLength}（实际 ${value.length}）`,
    });
  }
  if (value.length > maxLength) {
    errors.push({
      code: "model-view-range",
      path,
      message: `${path} 长度超过 ${maxLength}（实际 ${value.length}）`,
    });
  }
}

/** §3.1 校验。失败时返回逐字段错误，不抛异常。 */
export function validateModel3DViewManifest(
  value: unknown,
): Model3DViewManifestValidation {
  const errors: Model3DViewManifestError[] = [];
  const root = record(value);
  if (!root) {
    return {
      ok: false,
      errors: [
        {
          code: "model-view-type",
          path: "/",
          message: `${MODEL3D_VIEW_MANIFEST_SCHEMA} 必须是 JSON 对象`,
        },
      ],
    };
  }
  pushUnknownKeys(errors, "/", root, MANIFEST_KEYS);
  if (root.schema !== MODEL3D_VIEW_MANIFEST_SCHEMA) {
    errors.push({
      code: "model-view-schema",
      path: "/schema",
      message: `schema 必须是 ${MODEL3D_VIEW_MANIFEST_SCHEMA}`,
    });
  }
  if (root.version !== 1) {
    errors.push({
      code: "model-view-schema",
      path: "/version",
      message: "version 必须是整数 1",
    });
  }
  pushText(
    errors,
    "/title",
    root.title,
    MODEL3D_TEXT_FLOORS.titleMinLength,
    MODEL3D_TEXT_FLOORS.titleMaxLength,
  );
  pushText(
    errors,
    "/description",
    root.description,
    MODEL3D_TEXT_FLOORS.descriptionMinLength,
    MODEL3D_TEXT_FLOORS.descriptionMaxLength,
  );

  const camera = record(root.camera);
  if (!camera) {
    errors.push({
      code: "model-view-required",
      path: "/camera",
      message: "camera 缺失",
    });
  } else {
    pushUnknownKeys(errors, "/camera/", camera, CAMERA_KEYS);
    for (const key of CAMERA_KEYS) {
      if (!(key in camera)) {
        errors.push({
          code: "model-view-required",
          path: `/camera/${key}`,
          message: `camera.${key} 缺失`,
        });
        continue;
      }
      pushNumeric(errors, `/camera/${key}`, camera[key], CAMERA_BOUNDS[key]);
    }
  }

  const lighting = record(root.lighting);
  if (!lighting) {
    errors.push({
      code: "model-view-required",
      path: "/lighting",
      message: "lighting 缺失",
    });
  } else {
    pushUnknownKeys(errors, "/lighting/", lighting, LIGHTING_KEYS);
    for (const key of LIGHTING_REQUIRED) {
      if (!(key in lighting)) {
        errors.push({
          code: "model-view-required",
          path: `/lighting/${key}`,
          message: `lighting.${key} 缺失`,
        });
      }
    }
    for (const [key, bound] of Object.entries(LIGHTING_BOUNDS)) {
      if (!(key in lighting)) continue;
      pushNumeric(errors, `/lighting/${key}`, lighting[key], bound);
    }
    if ("shadows" in lighting && typeof lighting.shadows !== "boolean") {
      errors.push({
        code: "model-view-type",
        path: "/lighting/shadows",
        message: "lighting.shadows 必须是布尔值",
      });
    }
  }

  if (root.environment !== undefined) {
    const environment = record(root.environment);
    if (!environment) {
      errors.push({
        code: "model-view-type",
        path: "/environment",
        message: "environment 必须是 JSON 对象",
      });
    } else {
      pushUnknownKeys(errors, "/environment/", environment, ENVIRONMENT_KEYS);
      if (environment.hdriAssetId !== undefined) {
        pushText(errors, "/environment/hdriAssetId", environment.hdriAssetId, 0, 64);
      }
      if (
        environment.hdriLicenseCode !== undefined &&
        !MODEL3D_HDRI_LICENSE_CODES.includes(
          environment.hdriLicenseCode as Model3DHdriLicenseCode,
        )
      ) {
        errors.push({
          code: "model-3d-license-contagion",
          path: "/environment/hdriLicenseCode",
          message:
            `HDRI 许可只允许 ${MODEL3D_HDRI_LICENSE_CODES.join(" / ")}（§5.5）`,
        });
      }
      if (environment.intensity !== undefined) {
        pushNumeric(errors, "/environment/intensity", environment.intensity, {
          minimum: 0,
          maximum: 5,
        });
      }
      if (
        environment.background !== undefined &&
        !MODEL3D_ENVIRONMENT_BACKGROUNDS.includes(
          environment.background as Model3DEnvironmentBackground,
        )
      ) {
        errors.push({
          code: "model-view-enum",
          path: "/environment/background",
          message:
            `background 只允许 ${MODEL3D_ENVIRONMENT_BACKGROUNDS.join(" / ")}`,
        });
      }
    }
  }

  const budget = record(root.budget);
  if (!budget) {
    errors.push({
      code: "model-view-required",
      path: "/budget",
      message: "budget 缺失",
    });
  } else {
    pushUnknownKeys(errors, "/budget/", budget, BUDGET_KEYS);
    for (const key of BUDGET_REQUIRED) {
      if (!(key in budget)) {
        errors.push({
          code: "model-view-required",
          path: `/budget/${key}`,
          message: `budget.${key} 缺失`,
        });
      }
    }
    for (const [key, bound] of Object.entries(BUDGET_BOUNDS)) {
      if (!(key in budget)) continue;
      pushNumeric(errors, `/budget/${key}`, budget[key], bound);
    }
  }

  const graph = record(root.graph);
  if (!graph) {
    errors.push({
      code: "model-view-required",
      path: "/graph",
      message: "graph 缺失",
    });
  } else {
    pushUnknownKeys(errors, "/graph/", graph, GRAPH_KEYS);
    for (const key of MODEL3D_GRAPH_COUNT_KEYS) {
      if (!(key in graph)) {
        errors.push({
          code: "model-view-required",
          path: `/graph/${key}`,
          message: `graph.${key} 缺失`,
        });
      }
    }
    for (const [key, bound] of Object.entries(GRAPH_BOUNDS)) {
      if (!(key in graph)) continue;
      pushNumeric(errors, `/graph/${key}`, graph[key], bound);
    }
  }

  const attribution = record(root.attribution);
  if (!attribution) {
    errors.push({
      code: "model-view-required",
      path: "/attribution",
      message: "attribution 缺失",
    });
  } else {
    pushUnknownKeys(errors, "/attribution/", attribution, ["entries"]);
    const entries = attribution.entries;
    if (!Array.isArray(entries) || entries.length < 1) {
      errors.push({
        code: "model-view-required",
        path: "/attribution/entries",
        message: "attribution.entries 至少 1 条（§8.2）",
      });
    } else if (entries.length > 12) {
      errors.push({
        code: "model-view-range",
        path: "/attribution/entries",
        message: `attribution.entries 最多 12 条（实际 ${entries.length}）`,
      });
    } else {
      for (const [index, raw] of entries.entries()) {
        const entry = record(raw);
        const path = `/attribution/entries/${index}`;
        if (!entry) {
          errors.push({
            code: "model-view-type",
            path,
            message: `${path} 必须是 JSON 对象`,
          });
          continue;
        }
        pushUnknownKeys(errors, `${path}/`, entry, [
          "text",
          "licenseCode",
          "licenseUrl",
        ]);
        pushText(errors, `${path}/text`, entry.text, 2, 200);
        pushText(errors, `${path}/licenseCode`, entry.licenseCode, 2, 60);
        pushText(errors, `${path}/licenseUrl`, entry.licenseUrl, 8, 2_048);
        if (
          typeof entry.licenseUrl === "string" &&
          !/^https:\/\//.test(entry.licenseUrl)
        ) {
          errors.push({
            code: "model-view-pattern",
            path: `${path}/licenseUrl`,
            message: "licenseUrl 必须匹配 ^https://",
          });
        }
      }
    }
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, manifest: value as Model3DViewManifest };
}

function orderedNumbers<T extends Record<string, unknown>>(
  source: T,
  keys: readonly string[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] === undefined) continue;
    output[key] = source[key];
  }
  return output;
}

/**
 * Deterministic serialization: field order follows §3.1 `properties` order so
 * the same manifest always hashes to the same digest.
 */
export function serializeModel3DViewManifest(
  manifest: Model3DViewManifest,
): string {
  const ordered: Record<string, unknown> = {
    schema: manifest.schema,
    version: manifest.version,
    title: manifest.title,
    description: manifest.description,
    camera: orderedNumbers(
      manifest.camera as unknown as Record<string, unknown>,
      CAMERA_KEYS,
    ),
    lighting: orderedNumbers(
      manifest.lighting as unknown as Record<string, unknown>,
      LIGHTING_KEYS,
    ),
  };
  if (manifest.environment) {
    ordered.environment = orderedNumbers(
      manifest.environment as unknown as Record<string, unknown>,
      ENVIRONMENT_KEYS,
    );
  }
  ordered.budget = orderedNumbers(
    manifest.budget as unknown as Record<string, unknown>,
    BUDGET_KEYS,
  );
  ordered.graph = orderedNumbers(
    manifest.graph as unknown as Record<string, unknown>,
    GRAPH_KEYS,
  );
  ordered.attribution = {
    entries: manifest.attribution.entries.map((entry) => ({
      text: entry.text,
      licenseCode: entry.licenseCode,
      licenseUrl: entry.licenseUrl,
    })),
  };
  return JSON.stringify(ordered);
}

export function parseModel3DViewManifest(
  input: string | Uint8Array,
): Model3DViewManifest {
  const text =
    typeof input === "string" ? input : new TextDecoder().decode(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${MODEL3D_VIEW_MANIFEST_SCHEMA} JSON 无法解析`);
  }
  const validated = validateModel3DViewManifest(parsed);
  if (!validated.ok) {
    const detail = validated.errors
      .slice(0, 4)
      .map((entry) => `${entry.path}: ${entry.message}`)
      .join("；");
    throw new Error(`${MODEL3D_VIEW_MANIFEST_SCHEMA} 校验失败 —— ${detail}`);
  }
  return validated.manifest;
}

/**
 * Builds a manifest whose camera/lighting defaults are the §2.1 values verbatim.
 * `graph` and `budget` are caller-supplied because §6 F4 forbids hand-filled
 * counts: they MUST come from the parser (see `model3d-closure.ts`).
 */
export function createModel3DViewManifest({
  title,
  description,
  graph,
  budget,
  camera,
  lighting,
  environment,
  attribution,
}: {
  title: string;
  description: string;
  graph: Model3DViewManifestGraph;
  budget: Model3DViewManifestBudget;
  camera?: Partial<Model3DViewManifestCamera>;
  lighting?: Partial<Model3DViewManifestLighting>;
  environment?: Model3DViewManifestEnvironment;
  attribution: Model3DAttributionEntry[];
}): Model3DViewManifest {
  return {
    schema: MODEL3D_VIEW_MANIFEST_SCHEMA,
    version: 1,
    title,
    description,
    camera: { ...MODEL3D_DEFAULT_CAMERA, ...camera },
    lighting: { ...MODEL3D_DEFAULT_LIGHTING, ...lighting },
    ...(environment ? { environment } : {}),
    budget,
    graph,
    attribution: { entries: attribution },
  };
}
