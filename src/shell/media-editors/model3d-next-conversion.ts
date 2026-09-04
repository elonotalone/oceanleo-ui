/**
 * 存量 3D 工程在新核下的处置：只读打开 + 一键转换（合同 R7 / 判据 3）。
 *
 * 转换不改 glTF 字节——旧档本来就是 GLB/glTF。它只换工程 schema，并
 * **点名**哪些旧核侧车带不过去。没有任何一条边能从「打开」直接走到「已改写」。
 */
import {
  LEGACY_MODEL3D_PROJECT_SCHEMA,
  MODEL3D_PROJECT_SCHEMA,
} from "./model3d-project";
import { DEFAULT_MODEL3D_VIEW } from "./model3d-workbench-defaults";
import type { Model3DViewProject } from "./model3d-project";

/** 新核工程档。与旧 schema 不同，才能一眼看出转过没转过。 */
export const MODEL3D_NEXT_PROJECT_SCHEMA = "oceanleo.model3d.gltf.v1";

export const MODEL3D_LEGACY_READONLY_NOTICE =
  "这份 3D 工程是用旧编辑器存的，现在是只读打开的。点「转换为新 3D 工程」之后才会改动它。";

export type Model3DConversionState =
  | "readonly"
  | "converting"
  | "converted"
  | "failed";

export type Model3DConversionEvent =
  | { type: "request" }
  | { type: "resolve" }
  | { type: "reject" }
  | { type: "retry" };

export function nextModel3DConversionState(
  state: Model3DConversionState,
  event: Model3DConversionEvent,
): Model3DConversionState {
  switch (state) {
    case "readonly":
      return event.type === "request" ? "converting" : "readonly";
    case "converting":
      if (event.type === "resolve") return "converted";
      if (event.type === "reject") return "failed";
      return "converting";
    case "failed":
      return event.type === "retry" ? "converting" : "failed";
    case "converted":
      return "converted";
    default:
      return state;
  }
}

export type Model3DProjectKind = "legacy" | "next" | "source-only" | "unknown";

export interface Model3DInspectResult {
  kind: Model3DProjectKind;
  schema: string;
  hasSource: boolean;
  differences: { feature: string; reason: string }[];
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function inspectModel3DProject(raw: unknown): Model3DInspectResult {
  const root = recordOf(raw);
  if (!root) {
    return {
      kind: "unknown",
      schema: "",
      hasSource: false,
      differences: [
        {
          feature: "工程档",
          reason: "不是一份 JSON 对象，打不开。",
        },
      ],
    };
  }
  const schema = String(root.schema || root.projectSchema || "").trim();
  const data = recordOf(root.data) || root;
  const provenance = recordOf(data.provenance);
  const sourceUrl = String(
    provenance?.sourceUrl || data.checkpointUrl || data.sourceUrl || "",
  ).trim();
  const hasSource = sourceUrl.length > 0;
  if (schema === MODEL3D_NEXT_PROJECT_SCHEMA) {
    return { kind: "next", schema, hasSource, differences: [] };
  }
  if (
    schema === MODEL3D_PROJECT_SCHEMA ||
    schema === LEGACY_MODEL3D_PROJECT_SCHEMA
  ) {
    const operations = Array.isArray(data.operations) ? data.operations : [];
    const differences: { feature: string; reason: string }[] = [
      {
        feature: "schema",
        reason: `旧核 ${schema} → 新核 ${MODEL3D_NEXT_PROJECT_SCHEMA}，要你点一下才会改。`,
      },
    ];
    if (operations.length > 0) {
      differences.push({
        feature: "operation journal",
        reason: `旧核有 ${operations.length} 条场景操作日记。新核普通模式是 model-viewer，回放不了这些操作；转换时点名丢弃，不静默抹掉。`,
      });
    }
    differences.push({
      feature: "专业场景图",
      reason:
        "位置/旋转/缩放的 gizmo 编辑改走专业模式（three.js editor iframe），普通模式只保留查看与材质/相机。",
    });
    return { kind: "legacy", schema, hasSource, differences };
  }
  if (hasSource) {
    return {
      kind: "source-only",
      schema: schema || "(无 schema)",
      hasSource: true,
      differences: [],
    };
  }
  return {
    kind: "unknown",
    schema,
    hasSource: false,
    differences: [
      {
        feature: "模型源",
        reason: "工程档里没有可打开的 GLB/glTF 地址。",
      },
    ],
  };
}

export type Model3DLegacyConversion =
  | {
      ok: true;
      schema: typeof MODEL3D_NEXT_PROJECT_SCHEMA;
      data: {
        sourceFormat: string;
        provenance: Record<string, unknown>;
        view: Omit<Model3DViewProject, "sourceUrl">;
        director: unknown;
      };
      dropped: { feature: string; reason: string }[];
      summary: string;
    }
  | { ok: false; reason: string };

export function planModel3DLegacyConversion(
  raw: unknown,
): Model3DLegacyConversion {
  const looked = inspectModel3DProject(raw);
  if (looked.kind === "next") {
    return { ok: false, reason: "已经是新核工程，不用再转一次。" };
  }
  if (!looked.hasSource) {
    return {
      ok: false,
      reason: "没有可带走的 GLB/glTF 源地址，转换会丢掉模型本身。",
    };
  }
  const root = recordOf(raw) || {};
  const data = recordOf(root.data) || root;
  const provenance = recordOf(data.provenance) || {
    sourceUrl: String(data.checkpointUrl || data.sourceUrl || ""),
  };
  const viewRecord = recordOf(data.view) || {};
  const dropped = looked.differences.filter(
    (entry) => entry.feature === "operation journal" || entry.feature === "专业场景图",
  );
  const view: Omit<Model3DViewProject, "sourceUrl"> = {
    azimuth: Number(viewRecord.azimuth ?? DEFAULT_MODEL3D_VIEW.azimuth),
    elevation: Number(viewRecord.elevation ?? DEFAULT_MODEL3D_VIEW.elevation),
    zoom: Number(viewRecord.zoom ?? DEFAULT_MODEL3D_VIEW.zoom),
    autoRotate: viewRecord.autoRotate === true,
    exposure: Number(viewRecord.exposure ?? DEFAULT_MODEL3D_VIEW.exposure),
    shadowIntensity: Number(
      viewRecord.shadowIntensity ?? DEFAULT_MODEL3D_VIEW.shadowIntensity,
    ),
    shadowSoftness: Number(
      viewRecord.shadowSoftness ?? DEFAULT_MODEL3D_VIEW.shadowSoftness,
    ),
    shadowEnabled: viewRecord.shadowEnabled !== false,
    background: String(
      viewRecord.background || DEFAULT_MODEL3D_VIEW.background,
    ),
    animationName: String(viewRecord.animationName || ""),
    animationPlaying: viewRecord.animationPlaying === true,
    animationSpeed: Number(viewRecord.animationSpeed ?? 1),
    animationTime: Number(viewRecord.animationTime ?? 0),
    environmentUrl: String(viewRecord.environmentUrl || ""),
    environmentIntensity: Number(viewRecord.environmentIntensity ?? 1),
    materialOverrides: Array.isArray(viewRecord.materialOverrides)
      ? viewRecord.materialOverrides
      : [],
    annotations: Array.isArray(viewRecord.annotations)
      ? viewRecord.annotations
      : [],
    director: (viewRecord.director || data.director ||
      DEFAULT_MODEL3D_VIEW.director) as Model3DViewProject["director"],
  };
  return {
    ok: true,
    schema: MODEL3D_NEXT_PROJECT_SCHEMA,
    data: {
      sourceFormat: String(data.sourceFormat || provenance.format || "glb"),
      provenance,
      view,
      director: view.director,
    },
    dropped,
    summary:
      dropped.length === 0
        ? "模型源与相机/曝光/背景原样带走。"
        : `模型源原样带走。点名丢弃：${dropped.map((entry) => entry.feature).join("、")}。`,
  };
}
