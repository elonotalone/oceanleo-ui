/**
 * 游戏草稿的源码模型（纯函数，无 DOM、无网络，便于断言）。
 *
 * ## 这个文件承认的一条边界
 *
 * 可玩产物以 `oceanleo.game-document.v1` JSON 信封落库，`source` 是一份**自洽的完整
 * HTML 文档**。信封的**权威校验器在发布侧**（game 仓 `lib/ugc/bundle.ts` 的
 * `validateGameBundleV2Envelope`），本文件**不复制它**：共享包不能反向依赖站点仓
 * （`AGENTS.md`：站点依赖 `@oceanleo/ui`，绝不反过来），所以这里只做编辑面真正需要
 * 的三件事 —— 把 `source` 读出来、把改完的 `source` 写回信封形状、把体积算准。
 *
 * 「只做子集」是有意的，不是偷懒：复制一份完整校验器 = 两套口径，而歪掉的那天
 * 没人会收到通知。发布侧那一份仍然是最后一道门，编辑面这一份只负责**当场告诉用户
 * 这份草稿会不会被发布侧拒掉**，省掉一次白跑的发布。
 *
 * ## 为什么 `origin` 只透传不新增
 *
 * `GAME_REVISION_ORIGINS`（`advanced-routes/GameRoute.tsx`）是 `ai` / `remix` 两值，
 * 发布侧另有一张 `PERMANENTLY_DISABLED_BUNDLE_ORIGINS`（含 `import` / `upload` /
 * `srcdoc` / `paste`，`01-decisions.md` D8）。用户在代码编辑器里改自己那份平台生成的
 * 游戏，**不是新增一条产物来路**，所以这里原样透传原 revision 的 `origin`，
 * 一个新值都不引入。编辑动作记在 `provenance.editor` 上，与来路分开。
 */

/** 信封的 `sourceFormat` 字面量。与 `artifact-contract.ts` 同一个常量，不另抄。 */
export { GAME_DOCUMENT_SOURCE_FORMAT as GAME_DRAFT_SOURCE_FORMAT } from "../artifact-contract";

/**
 * 编辑面允许的草稿体积上限。
 *
 * **发布侧的 `MAX_BUNDLE_BYTES` 才是权威值**（game 仓 2 MiB）。这里取同一个数，
 * 并由 game 仓的测试断言两者相等 —— 反向依赖不成立，所以校验只能落在能同时看见
 * 两个包的那一侧。编辑面比发布侧**宽**的话，用户会写到超限才被拒；比它**严**的话，
 * 会拒掉本来能发布的草稿。两种都是骗人，所以必须相等而不是「差不多」。
 */
export const GAME_DRAFT_MAX_BYTES = 2 * 1024 * 1024;

/** UTF-8 字节数。`String.length` 是 UTF-16 码元数，中文注释会让它少算一半。 */
export function gameSourceByteLength(source: string): number {
  return new TextEncoder().encode(source).length;
}

export interface GameDraftEnvelope {
  source: string;
  sizeBytes: number;
  /** 原 revision 的来路，原样透传。 */
  origin: string;
  manifest?: Record<string, unknown>;
}

export type GameEnvelopeRead =
  | { ok: true; envelope: GameDraftEnvelope }
  | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 从下载回来的信封 JSON 里取出编辑面要用的四件。
 *
 * 失败时给的是**人话原因**而不是 `null`：这条路径上唯一会看到失败的人是作者，
 * 而「打不开」和「这一版是十二天前的旧载体」对他要做的下一个动作完全不同。
 */
export function readGameEnvelope(input: unknown): GameEnvelopeRead {
  if (!isPlainObject(input)) {
    return { ok: false, reason: "这一版的工程档不是 JSON 对象，打不开代码编辑面。" };
  }
  const source = input.source;
  if (typeof source !== "string" || source.trim().length === 0) {
    return { ok: false, reason: "这一版的工程档里没有游戏源码。" };
  }
  const origin = typeof input.origin === "string" ? input.origin : "";
  if (!origin) {
    return { ok: false, reason: "这一版的工程档没有记录产物来路，拒绝在其上编辑。" };
  }
  const manifest = isPlainObject(input.manifest) ? input.manifest : undefined;
  return {
    ok: true,
    envelope: {
      source,
      sizeBytes: gameSourceByteLength(source),
      origin,
      ...(manifest ? { manifest } : {}),
    },
  };
}

/**
 * 把改完的源码写回信封形状。`sizeBytes` **重算**而不是沿用旧值：
 * 发布侧有一条 `sizeBytes !== sourceBytes` 就整份拒绝的断言，沿用旧值必然被拒。
 */
export function buildGameEnvelope(input: {
  source: string;
  origin: string;
  manifest?: Record<string, unknown>;
}): Record<string, unknown> {
  const sizeBytes = gameSourceByteLength(input.source);
  return {
    sourceFormat: "oceanleo.game-document.v1",
    source: input.source,
    sizeBytes,
    origin: input.origin,
    ...(input.manifest ? { manifest: input.manifest } : {}),
  };
}

// ── 草稿自检（发布前的当场反馈，不替代发布侧那道门）─────────────────────────

export type GameDraftIssue =
  | "empty"
  | "too-large"
  | "not-a-document"
  | "no-script";

export const GAME_DRAFT_ISSUE_TEXT: Record<GameDraftIssue, string> = {
  empty: "源码是空的，没有可运行的东西。",
  "too-large": `源码超过 ${Math.round(GAME_DRAFT_MAX_BYTES / 1024)} KiB，发布侧会拒收。`,
  "not-a-document":
    "这一版载体要求一份完整 HTML 文档（至少要有 html 或 body 结构），当前源码不是。",
  "no-script": "文档里没有任何脚本，跑起来会是一张静止的页面。",
};

export interface GameDraftInspection {
  issues: GameDraftIssue[];
  sizeBytes: number;
  /** 能不能发布。`no-script` 只是提醒，不阻止发布。 */
  publishable: boolean;
}

/**
 * 草稿能不能发布。
 *
 * `no-script` 刻意**不**阻止发布：一份没有脚本的页面是合法产物（作者可能正在搭静态
 * 关卡界面），拦下来等于替作者决定他的作品该长什么样。而空文档、超限、不是完整文档
 * 三条会被发布侧硬拒，提前说清楚比让他白跑一趟好。
 */
export function inspectGameDraft(source: string): GameDraftInspection {
  const issues: GameDraftIssue[] = [];
  const trimmed = String(source ?? "").trim();
  const sizeBytes = gameSourceByteLength(source ?? "");
  if (!trimmed) {
    return { issues: ["empty"], sizeBytes, publishable: false };
  }
  if (sizeBytes > GAME_DRAFT_MAX_BYTES) issues.push("too-large");
  if (!/<html[\s>]/i.test(trimmed) && !/<body[\s>]/i.test(trimmed)) {
    issues.push("not-a-document");
  }
  if (!/<script[\s>]/i.test(trimmed)) issues.push("no-script");
  const blocking = issues.filter((issue) => issue !== "no-script");
  return { issues, sizeBytes, publishable: blocking.length === 0 };
}

// ── 可调参数（编辑栏里的参数面板要渲染滑块，所以必须读得懂声明）───────────────

/** 一项参数声明。形状逐字对齐发布侧 `GameParamDeclaration`（合同 §3.1）。 */
export interface GameParamDeclaration {
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export type GameParamDeclarations = Record<string, GameParamDeclaration>;

/** 声明项数区间，与沙箱侧同一对数字（3–6 项）。 */
export const GAME_PARAM_MIN_COUNT = 3;
export const GAME_PARAM_MAX_COUNT = 6;
const GAME_PARAM_NAME_RE = /^[a-z][a-z0-9_]{0,23}$/;
const FORBIDDEN_PARAM_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 读信封 manifest 里的参数声明。
 *
 * **整份接受或整份拒绝**，与沙箱侧同一口径：部分接受会让编辑栏画出的滑块与游戏里
 * 真正读到的键对不上，而这种错在界面上完全看不出来。拿不到就是「这一版没有可调参数」，
 * 参数面板整块不渲染，游戏照常能跑。
 */
export function readGameParamDeclarations(
  manifest: Record<string, unknown> | undefined,
): GameParamDeclarations | null {
  const raw = manifest?.paramDeclarations;
  if (!isPlainObject(raw)) return null;
  const entries = Object.entries(raw);
  if (entries.length < GAME_PARAM_MIN_COUNT || entries.length > GAME_PARAM_MAX_COUNT) {
    return null;
  }
  const params: GameParamDeclarations = {};
  for (const [name, value] of entries) {
    if (FORBIDDEN_PARAM_KEYS.has(name)) return null;
    if (!GAME_PARAM_NAME_RE.test(name)) return null;
    if (!isPlainObject(value)) return null;
    const { label, min, max, step } = value;
    const fallback = value.default;
    if (typeof label !== "string" || label.length === 0 || label.length > 24) {
      return null;
    }
    if (
      !isFiniteNumber(min) ||
      !isFiniteNumber(max) ||
      !isFiniteNumber(step) ||
      !isFiniteNumber(fallback)
    ) {
      return null;
    }
    if (min >= max) return null;
    if (step <= 0 || step > max - min) return null;
    if (fallback < min || fallback > max) return null;
    params[name] = { label, min, max, step, default: fallback };
  }
  return params;
}

/** 把候选值对齐格点再夹进区间。非有限值退回 `default`（NaN 会一路污染游戏计算）。 */
export function normalizeGameParamValue(
  declaration: GameParamDeclaration,
  value: unknown,
): number {
  if (!isFiniteNumber(value)) return declaration.default;
  const steps = Math.round((value - declaration.min) / declaration.step);
  const snapped = declaration.min + steps * declaration.step;
  const clamped = Math.min(declaration.max, Math.max(declaration.min, snapped));
  const decimals = (String(declaration.step).split(".")[1] ?? "").length;
  return decimals > 0 ? Number(clamped.toFixed(decimals)) : clamped;
}

/** 完整取值表：声明里有而覆盖里没有的落回 `default`，声明外的键丢弃。 */
export function resolveGameParamValues(
  declarations: GameParamDeclarations,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [name, declaration] of Object.entries(declarations)) {
    values[name] = normalizeGameParamValue(
      declaration,
      Object.prototype.hasOwnProperty.call(overrides, name)
        ? overrides[name]
        : declaration.default,
    );
  }
  return values;
}
