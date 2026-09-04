/**
 * 存量音频工程在新核下的处置：只读打开 + 一键转换（合同 R7 / 判据 4）。
 *
 * 转换不改 wav/mp3 字节。它只换工程 schema，并点名哪些旧核操作带不过去。
 * 没有任何一条边能从「打开」直接走到「已改写」。
 */
import {
  AUDIO_PROJECT_SCHEMA_ID,
  AUDIO_PROJECT_SCHEMA_LEGACY_ID,
} from "./audio-project-carrier";

/** 新核工程档。与旧 schema 不同，才能一眼看出转过没转过。 */
export const AUDIO_NEXT_PROJECT_SCHEMA = "oceanleo.audio.playlist.v1";

export const AUDIO_LEGACY_READONLY_NOTICE =
  "这份音频工程是用旧编辑器存的，现在是只读打开的。点「转换为新音频工程」之后才会改动它。";

export type AudioConversionState =
  | "readonly"
  | "converting"
  | "converted"
  | "failed";

export type AudioConversionEvent =
  | { type: "request" }
  | { type: "resolve" }
  | { type: "reject" }
  | { type: "retry" };

export function nextAudioConversionState(
  state: AudioConversionState,
  event: AudioConversionEvent,
): AudioConversionState {
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

export type AudioProjectKind = "legacy" | "next" | "source-only" | "unknown";

export interface AudioInspectResult {
  kind: AudioProjectKind;
  schema: string;
  hasSource: boolean;
  differences: { feature: string; reason: string }[];
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function schemaOf(root: Record<string, unknown>): string {
  return String(
    root.schema ||
      root.project_schema ||
      root.projectSchema ||
      "",
  ).trim();
}

export function inspectAudioProject(raw: unknown): AudioInspectResult {
  const root = recordOf(raw);
  if (!root) {
    return {
      kind: "unknown",
      schema: "",
      hasSource: false,
      differences: [
        { feature: "工程档", reason: "不是一份 JSON 对象，打不开。" },
      ],
    };
  }
  const schema = schemaOf(root);
  const nested = recordOf(root.data) || recordOf(root.project);
  const sourceUrl = String(
    root.sourceUrl || nested?.sourceUrl || root.url || "",
  ).trim();
  const operations = Array.isArray(root.operations)
    ? root.operations
    : Array.isArray(nested?.operations)
      ? nested.operations
      : [];
  const hasSource = Boolean(sourceUrl) || operations.length > 0;
  if (schema === AUDIO_NEXT_PROJECT_SCHEMA) {
    return { kind: "next", schema, hasSource, differences: [] };
  }
  if (
    schema === AUDIO_PROJECT_SCHEMA_ID ||
    schema === AUDIO_PROJECT_SCHEMA_LEGACY_ID ||
    schema === "oceanleo.audio.v1"
  ) {
    return {
      kind: "legacy",
      schema,
      hasSource,
      differences: differencesFromLegacy(operations),
    };
  }
  if (!schema && hasSource) {
    return {
      kind: "source-only",
      schema: "",
      hasSource: true,
      differences: [],
    };
  }
  return {
    kind: "unknown",
    schema,
    hasSource,
    differences: [
      { feature: "schema", reason: schema ? `未识别 ${schema}` : "缺 schema" },
    ],
  };
}

function differencesFromLegacy(
  operations: unknown[],
): { feature: string; reason: string }[] {
  const dropped: { feature: string; reason: string }[] = [];
  if (operations.length > 0) {
    dropped.push({
      feature: "wavesurfer 操作日志",
      reason: `${operations.length} 条旧核操作不会静默重放到多轨时间线；转换后从当前混音头开始。`,
    });
  }
  const types = new Set(
    operations
      .map((entry) =>
        entry && typeof entry === "object"
          ? String((entry as { type?: string }).type || "")
          : "",
      )
      .filter(Boolean),
  );
  if (types.has("effects")) {
    dropped.push({
      feature: "EQ / 变速",
      reason: "waveform-playlist 没有这条事件；转换后请在专业模式 AudioMass 里重做。",
    });
  }
  return dropped;
}

export function planAudioLegacyConversion(raw: unknown): {
  ok: boolean;
  reason: string;
  summary: string;
  dropped: { feature: string; reason: string }[];
  nextSchema: string;
} {
  const looked = inspectAudioProject(raw);
  if (looked.kind === "next") {
    return {
      ok: true,
      reason: "",
      summary: "已经是新核工程。",
      dropped: [],
      nextSchema: AUDIO_NEXT_PROJECT_SCHEMA,
    };
  }
  if (looked.kind === "unknown" && !looked.hasSource) {
    return {
      ok: false,
      reason: looked.differences[0]?.reason || "打不开这份工程。",
      summary: "",
      dropped: looked.differences,
      nextSchema: AUDIO_NEXT_PROJECT_SCHEMA,
    };
  }
  if (!looked.hasSource && looked.kind === "legacy") {
    return {
      ok: false,
      reason: "旧工程没有可转换的音频源。",
      summary: "",
      dropped: looked.differences,
      nextSchema: AUDIO_NEXT_PROJECT_SCHEMA,
    };
  }
  return {
    ok: true,
    reason: "",
    summary: "已转为多轨工程。旧操作日志不会重放。",
    dropped: looked.differences,
    nextSchema: AUDIO_NEXT_PROJECT_SCHEMA,
  };
}
