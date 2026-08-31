// ============================================================================
// @oceanleo/ui — 插件 AI 能力契约（13 件插件的单一事实源）
// ----------------------------------------------------------------------------
// 背景：改造前有六套互不知情的 AI 通道——
//   A. agent 任务：createTask/followUp/stopTask + 轮询 /v1/agent/*（AgentChat）；
//   B. plugin-command：describe/state/run，「agent 改文档」那条总线（本契约不碰它）；
//   C. 直连网关：image-editor 的 /v1/images/edit、LeoAssistant 的 /v1/assistant/transform；
//   D. host.fetchJson 逻辑 URL：设计画布的 design://ai/chat、design://ai/image-generate；
//   E. 包内自建网关：视频画布的 canvas-gateway.ts；
//   F. 注册式 runner：GameRoute 的 registerGameIterationRunner。
// 六套里只有 B 和 E 天生带 signal / onProgress，另外四套发出去就既取消不掉、也说
// 不出跑到哪一步。图片编辑器和视频画布因此各自把 relight/upscale/inpaint/grid-split
// 重写了一遍——语义几乎逐字相同，类型却对不上，谁也不能复用谁。
//
// 于是这一层按**能力**收敛，而不是按端点：调用方只说「我要 image.relight」，
// 落到哪个端点、哪个宿主通道由 transport 决定。signal 与 onProgress 第一天就写进
// 请求体里——事后再补正是上一轮走歪的直接原因，不能重演。
// ============================================================================

/**
 * 插件能向 AI 要的东西。**语义**动词，不是端点名。
 *
 * 新增一项的判据：至少两件插件要用它，且它在语义上不能由已有项组合出来。
 * 图片那五项分开列，是因为六套旧实现里它们各自都有独立的参数与产物基数
 * （upscale 只吃 scale、inpaint 必须有 mask、relight 有方向与强度）。
 */
export type AiCapability =
  | "text.generate"
  | "text.rewrite"
  | "text.translate"
  | "image.generate"
  | "image.edit"
  | "image.upscale"
  | "image.inpaint"
  | "image.relight"
  | "video.generate"
  | "code.patch";

/** 枚举顺序即上面的联合顺序；宿主要遍历能力表时用它，不要自己重抄一份。 */
export const AI_CAPABILITIES = Object.freeze([
  "text.generate",
  "text.rewrite",
  "text.translate",
  "image.generate",
  "image.edit",
  "image.upscale",
  "image.inpaint",
  "image.relight",
  "video.generate",
  "code.patch",
]) as readonly AiCapability[];

// ── 素材引用 ────────────────────────────────────────────────────────────────

/**
 * 一张图在契约里的样子。
 *
 * 网关只吃 URL 不吃字节（见 lib/image-ai-edit.ts 顶部那句），但画布手里常常只有
 * 一块刚冻结的 Blob。两种都收下，由 transport 决定要不要先上传——调用方不该为了
 * 「这条通道要 URL 还是要字节」写两份代码，那正是旧实现分叉的起点。
 */
export interface AiImageRef {
  url?: string;
  /** 未落盘的像素。transport 没有上传能力时必须诚实报 unavailable，不许静默丢弃。 */
  blob?: Blob;
  assetId?: string;
  /** 原始字节的 SHA-256，用于血缘对账（image-capability-engine 同名字段）。 */
  byteDigest?: string;
  mimeType?: string;
}

export interface AiImageOutput {
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  byteDigest?: string;
}

export interface AiVideoOutput {
  url: string;
  mimeType?: string;
  durationMs?: number;
  posterUrl?: string;
}

/** 网关 images.edit 只声明了这五种比例；不在表里的比例一律不许伪造。 */
export type AiAspectRatio = "1:1" | "2:1" | "1:2" | "16:9" | "9:16";

export type AiLightDirection =
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "ambient";

// ── 各能力的入参 / 出参 ─────────────────────────────────────────────────────

export interface AiTextGenerateInput {
  prompt: string;
  /** 只给模型看的系统提示，不进用户可见对话。 */
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/** 逐字沿用 LeoAssistant 已经在用的动词 id，避免再造一套同义词。 */
export type AiRewriteAction =
  | "expand"
  | "condense"
  | "summarize"
  | "explain"
  | "polish"
  | "custom";

export interface AiTextRewriteInput {
  text: string;
  action: AiRewriteAction;
  /** `action: "custom"` 时的自由指令；其余动词可用它追加约束。 */
  instruction?: string;
}

export interface AiTextTranslateInput {
  text: string;
  /** BCP-47 或后端认的语言码（"zh" / "en" / "ja"…）。 */
  targetLang: string;
  sourceLang?: string;
}

export interface AiTextOutput {
  text: string;
  /** 命中 maxTokens 被截断了就说出来，别让调用方把半句话当成完整结果。 */
  truncated?: boolean;
  /**
   * 这段字是不是逐字流过来的。`false` = 这条通道这次没能流式，改成整段生成
   * ——界面**应当**把这件事告诉用户（等待期的体感完全不同），不要装作一样。
   */
  streamed?: boolean;
  /**
   * 流式跑到一半断了：这段是**残缺**的。
   *
   * 断线时不清空是刻意的：用户很可能已经在读了，把读到的东西抹掉比残缺更糟。
   * 代价是调用方必须自己把它标出来——所以界面**必须**显示「未完成」，
   * 也不许把它当成品直接落盘。
   */
  incomplete?: boolean;
}

export interface AiImageGenerateInput {
  prompt: string;
  ratio?: AiAspectRatio;
  count?: number;
  negativePrompt?: string;
}

export interface AiImageEditInput {
  source: AiImageRef;
  prompt: string;
  ratio?: AiAspectRatio;
  count?: number;
}

export interface AiImageUpscaleInput {
  source: AiImageRef;
  scale: 2 | 4;
  prompt?: string;
}

export interface AiImageInpaintInput {
  source: AiImageRef;
  /** 二值遮罩。没有它这条能力无从谈起，所以是必填而不是可选。 */
  mask: AiImageRef;
  prompt: string;
}

export interface AiImageRelightInput {
  source: AiImageRef;
  prompt?: string;
  direction?: AiLightDirection;
  /** 0..2，与 image-capability-engine 的 relight intensity 同一量纲。 */
  intensity?: number;
}

export interface AiImageOutputSet {
  images: readonly AiImageOutput[];
}

export interface AiVideoGenerateInput {
  prompt: string;
  /** 图生视频的首帧；不给就是纯文生视频。 */
  source?: AiImageRef;
  durationSeconds?: number;
  ratio?: AiAspectRatio;
  fps?: number;
}

export interface AiVideoOutputSet {
  videos: readonly AiVideoOutput[];
}

export interface AiCodeFile {
  path: string;
  content: string;
}

/**
 * 「让 AI 改这段可运行的产物」。字段取自 GameRoute 的 GameIterationRequest——
 * 那条通道本来就是一次 code.patch，只是当年被写成了一个只有游戏能用的注册函数。
 */
export interface AiCodePatchInput {
  instruction: string;
  artifactId?: string;
  revisionId?: string;
  /** 上一轮的运行时 API 版本，供生成端做兼容判断；首轮为空。 */
  runtimeApiVersion?: string;
  files?: readonly AiCodeFile[];
}

export interface AiCodePatchOutput {
  /** 一句人话说清这一轮改了什么，直接可以显示给用户。 */
  summary: string;
  files: readonly AiCodeFile[];
  /** 生成端只给整包产物时走它（游戏的 oceanleo.game-document.v1 信封 URL）。 */
  envelopeUrl?: string;
  runtimeApiVersion?: string;
}

/**
 * 能力 → 入参/出参 的映射表。
 *
 * 少写一项就编译不过（`AiInputFor` 会取不到键），所以这张表天然是穷尽的——
 * 不需要额外的运行时断言来守它。
 */
export interface AiCapabilityIo {
  "text.generate": { input: AiTextGenerateInput; output: AiTextOutput };
  "text.rewrite": { input: AiTextRewriteInput; output: AiTextOutput };
  "text.translate": { input: AiTextTranslateInput; output: AiTextOutput };
  "image.generate": { input: AiImageGenerateInput; output: AiImageOutputSet };
  "image.edit": { input: AiImageEditInput; output: AiImageOutputSet };
  "image.upscale": { input: AiImageUpscaleInput; output: AiImageOutputSet };
  "image.inpaint": { input: AiImageInpaintInput; output: AiImageOutputSet };
  "image.relight": { input: AiImageRelightInput; output: AiImageOutputSet };
  "video.generate": { input: AiVideoGenerateInput; output: AiVideoOutputSet };
  "code.patch": { input: AiCodePatchInput; output: AiCodePatchOutput };
}

export type AiInputFor<K extends AiCapability> = AiCapabilityIo[K]["input"];
export type AiOutputFor<K extends AiCapability> = AiCapabilityIo[K]["output"];

// ── 进度 / 回执 ─────────────────────────────────────────────────────────────

/**
 * 阶段名与 image-capability-engine 的 ImageProgressMetadata、视频画布的
 * CanvasProviderProgress 都能对上——迁移时不必再翻译一次阶段词表。
 */
export type AiProgressPhase =
  | "validating"
  | "uploading"
  | "queued"
  | "processing"
  | "streaming"
  | "finalizing"
  | "complete"
  | "cancelling";

export interface AiProgress {
  phase: AiProgressPhase;
  /** 0..1。客户端保证单调不回退，界面可以直接拿去画进度条。 */
  progress: number;
  /** 一句中文现状（「排队中」「正在上传底图」）；没有就别编。 */
  message?: string;
  /** 流式文本增量；只有 phase 为 streaming 时才有意义。 */
  delta?: string;
}

export interface AiBilling {
  charged: boolean;
  /** 不知道扣了多少就写 null，不要拿 0 冒充「免费」。 */
  amount: number | null;
  currency: string;
  estimated: boolean;
  quoteId?: string;
}

/**
 * 一次运行的回执。界面要说清「谁跑的、花了多少、出问题找哪条记录」全靠它。
 * 旧的六套里只有图片和视频给回执，另外四套跑完就什么都不留。
 */
export interface AiReceipt {
  provider: string;
  model: string;
  /** 本地生成，贯穿进度回调、取消、日志。 */
  runId: string;
  /** 上游自己的 job id；能拿到就带上，人工排查时是唯一的对账口。 */
  providerRunId?: string;
  billing: AiBilling;
  startedAt: string;
  completedAt: string;
}

// ── 请求 / 结果 ─────────────────────────────────────────────────────────────

export interface PluginAiRequest<K extends AiCapability = AiCapability> {
  capability: K;
  input: AiInputFor<K>;
  /** 幂等键；同一次用户操作重试时传同一个，避免上游重复计费。 */
  requestId?: string;
  /** 覆盖客户端默认模型；不给就用 transport 的默认。 */
  model?: string;
  /** 覆盖客户端默认 site_id（计费与配额按站分账）。 */
  siteId?: string;
  /**
   * 这两个是本契约存在的理由，不是可有可无的装饰：
   * 旧的 A/C/D/F 四套都没有它们，界面既停不下一次跑飞的生成，也说不出跑到哪了。
   */
  signal?: AbortSignal;
  onProgress?: (progress: AiProgress) => void;
}

export interface PluginAiResult<K extends AiCapability = AiCapability> {
  capability: K;
  output: AiOutputFor<K>;
  receipt: AiReceipt;
}

// ── 错误 ────────────────────────────────────────────────────────────────────

/**
 * 界面拿到错误后该怎么办，四种就够了：
 *   unavailable —— 这条通道根本没接，重试多少次都一样，要告诉用户缺什么；
 *   cancelled   —— 用户自己按的停止，不该弹错误；
 *   denied      —— 没登录 / 无权限 / 余额不足，要引导用户去解决；
 *   failed      —— 真的失败了，可以重试。
 * 旧实现把这四种全挤进一个 message 字符串，界面只能靠正则猜，猜错就把「请先登录」
 * 显示成「生成失败」。
 */
export type AiDisposition = "unavailable" | "cancelled" | "denied" | "failed";

export interface PluginAiErrorOptions {
  capability?: AiCapability;
  /** 机器可读的短码（"ai-transport-http" / "ai-source-unavailable"…）。 */
  code?: string;
  status?: number;
  retryable?: boolean;
  runId?: string;
  cause?: unknown;
}

export class PluginAiError extends Error {
  readonly disposition: AiDisposition;
  readonly code: string;
  readonly capability?: AiCapability;
  readonly status?: number;
  readonly retryable: boolean;
  readonly runId?: string;
  readonly cause?: unknown;

  constructor(
    disposition: AiDisposition,
    message: string,
    options: PluginAiErrorOptions = {},
  ) {
    super(message);
    this.name = "PluginAiError";
    this.disposition = disposition;
    this.code = options.code || `ai-${disposition}`;
    this.capability = options.capability;
    this.status = options.status;
    // unavailable / cancelled / denied 重试没有意义，默认就不给重试按钮。
    this.retryable =
      options.retryable ?? (disposition === "failed" && !options.status);
    this.runId = options.runId;
    this.cause = options.cause;
  }
}

export function isPluginAiError(value: unknown): value is PluginAiError {
  return value instanceof PluginAiError;
}

/** 这条能力现在能不能用；不能用时**必须**给出中文原因，界面要原样显示。 */
export interface AiCapabilityAvailability {
  enabled: boolean;
  reason?: string;
  estimatedCost?: AiBilling;
}
