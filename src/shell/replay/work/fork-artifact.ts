// 工作回放「从这一步接手」：把还原出的作品 JSON 存成查看者自己库里的新作品（work-chat 契约 §7.4，F04）。
//
// 走的是编辑器自己存工程的那条现有链：`doc-io.ts` 的 `saveFileToLibrary`（工程 JSON 上传 +
// 我的库登记，没有既有 artifact 身份时就是「新建」）；这里不新写任何入库逻辑，也不碰 `forkArtifact`
// （那个是复制「已有作品」用的）。
//
// 哪些编辑器族能接手：只有「工程 JSON 本身就是合法 source」的两族——video（`oceanleo.timeline.v1`）
// 和 audio（`oceanleo.audio-project.v1`），它们本来就是 projectOnly 保存。其余各族（富文本 / 表格 / 演示 /
// 图片 / 矢量 / 图表 / 游戏 / 3D / PDF / 工作流）的新建必须带真实交付文件（docx、xlsx、pptx、png、glb…）
// 和封面位图，那是各编辑器自己的导出器才造得出来的，回放里还原出的 JSON 造不出来——这些族不显示接手按钮。
import type { UITranslate } from "../../../i18n/ui/useUI";
import type { ImEditorKind } from "../../../lib/im/types";

export interface ForkArtifactInput {
  editorKind: ImEditorKind;
  title: string;
  json: unknown;
}

export type ForkArtifactResult = { ok: true; openPath?: string | null } | { ok: false; error: string };

/** `saveFileToLibrary` 里本模块用到的那一小块（测试里替换）。 */
export interface ForkSaveInput {
  item: Record<string, unknown>;
  siteId: string;
  fallbackSite: string;
  title: string;
  mediaType: string;
  kind: string;
  idempotencyKey: string;
  meta: Record<string, unknown>;
  project: { schema: string; data: unknown };
  editorManifest: { id: string; format: string };
  artifactRevision?: { artifactType: string; editor: string; provenance?: Record<string, unknown> };
}

export interface ForkSaveResult {
  ok: boolean;
  error?: string;
  artifactId?: string;
}

export interface ForkArtifactDeps {
  save: (input: ForkSaveInput) => Promise<ForkSaveResult>;
  tt?: UITranslate;
  siteId?: string;
  /** 幂等键里的随机段；测试里固定。 */
  nonce?: () => string;
}

interface ForkSpec {
  schema: string;
  mediaType: string;
  kind: string;
  manifestId: string;
  artifactType: string;
  /** 工程内容的最低可用检查；不过就如实说还原不出来。 */
  valid: (json: unknown) => boolean;
  meta: (json: Record<string, unknown>) => Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 与 `video-editor/timeline-carrier.ts`、`media-editors/audio-project-carrier.ts` 里的常量同值；
// 这里不 import 它们，免得回放播放层把两个编辑器的依赖拖进首屏（测试里逐字核对同值）。
export const FORK_TIMELINE_SCHEMA = "oceanleo.timeline.v1";
export const FORK_AUDIO_SCHEMA = "oceanleo.audio-project.v1";

const SPECS: Partial<Record<ImEditorKind, ForkSpec>> = {
  video: {
    schema: FORK_TIMELINE_SCHEMA,
    mediaType: "video",
    kind: "video",
    manifestId: "video-timeline",
    artifactType: "video",
    valid: (json) => isRecord(json) && Array.isArray(json.tracks),
    meta: (json) => ({
      timeline_doc: json,
      is_draft: true,
      editor_capability: "video-timeline",
      preview_resolution_contract: `${FORK_TIMELINE_SCHEMA}#3.3`,
      preview_width: json.width,
      preview_height: json.height,
    }),
  },
  audio: {
    schema: FORK_AUDIO_SCHEMA,
    mediaType: "audio",
    kind: "audio",
    manifestId: "audio-editor",
    artifactType: "audio",
    valid: (json) => isRecord(json) && typeof json.sourceUrl === "string" && Array.isArray(json.operations),
    meta: (json) => ({
      editor: "audio-v3",
      editor_capability: "audio-editor",
      audio_source_url: json.sourceUrl,
      audio_operation_count: Array.isArray(json.operations) ? json.operations.length : 0,
    }),
  },
};

/** 这一族能不能「从这一步接手」。播放器据此决定按钮显不显示。 */
export function canForkKind(kind: ImEditorKind | null | undefined): boolean {
  return Boolean(kind && SPECS[kind]);
}

export const FORKABLE_EDITOR_KINDS: readonly ImEditorKind[] = Object.keys(SPECS) as ImEditorKind[];

const plainTranslate: UITranslate = (zh, vars) =>
  vars ? zh.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match)) : zh;

/**
 * 新作品的打开地址：整站都有的「我的库」页（`/library`，新作品按时间排在最前）。
 * 不用 `?item=<id>&mode=preview` 深链：那条只有站内 `/workspace/<app>` 的目录控制台认，
 * `/library` 页里的 `ArtifactLibrary` 不解析它（F04 读码核对），带上它是一条假承诺。
 */
export const REPLAY_FORK_OPEN_PATH = "/library";

/** 只放行站内相对路径（不许 `//` 开头、不许协议）；播放器渲染链接前再查一次。 */
export function safeOpenPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const value = path.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}

function defaultNonce(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    // 回落到时间戳
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function defaultSave(input: ForkSaveInput): Promise<ForkSaveResult> {
  // 用到时才加载：保存链很重，只在真的点了「接手」时才付这份体积。
  const { saveFileToLibrary } = await import("../../doc-editors/doc-io");
  const result = await saveFileToLibrary(input as unknown as Parameters<typeof saveFileToLibrary>[0]);
  return {
    ok: result.ok,
    error: result.error,
    artifactId: result.artifactId,
  };
}

/**
 * 把回放里还原出的这一步存成查看者自己的新作品。
 * 成功返回 `openPath`（库里预览/编辑它的地址）；失败返回一句人话，原样给用户看。
 */
export async function createReplayArtifact(
  input: ForkArtifactInput,
  deps: Partial<ForkArtifactDeps> = {},
): Promise<ForkArtifactResult> {
  const tt = deps.tt ?? plainTranslate;
  const spec = SPECS[input.editorKind];
  if (!spec) return { ok: false, error: tt("这种作品暂时还不能从回放接手。") };
  if (!spec.valid(input.json)) return { ok: false, error: tt("这一步还原不出来，换一步再试。") };
  const json = input.json as Record<string, unknown>;
  const title = String(input.title || "").trim().slice(0, 120) || tt("工作回放");
  const siteId = deps.siteId || "oceanleo";
  const save = deps.save ?? defaultSave;
  const nonce = (deps.nonce ?? defaultNonce)();
  let result: ForkSaveResult;
  try {
    result = await save({
      // 没有既有 artifact 身份的占位条目：保存链据此走「新建」，不是改某个已有作品。
      item: { key: `replay-fork:${nonce}`, source: "creation", id: "", title, kind: spec.kind, siteId, favorite: false, meta: {} },
      siteId,
      fallbackSite: siteId,
      title,
      mediaType: spec.mediaType,
      kind: spec.kind,
      idempotencyKey: `replay-fork:${input.editorKind}:${nonce}`,
      meta: { editor: spec.manifestId, ...spec.meta(json), source_kind: "work_replay_fork" },
      project: { schema: spec.schema, data: json },
      editorManifest: { id: spec.manifestId, format: spec.schema },
    });
  } catch {
    return { ok: false, error: tt("接手没有成功，请再试一次。") };
  }
  if (!result.ok) {
    const reason = typeof result.error === "string" ? result.error.trim() : "";
    return { ok: false, error: reason || tt("没有保存成功，请再试一次。") };
  }
  return { ok: true, openPath: REPLAY_FORK_OPEN_PATH };
}
