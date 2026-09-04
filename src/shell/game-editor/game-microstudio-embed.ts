/**
 * 专业模式：microStudio（MIT，自托管在 `game-ide.oceanleo.app`）的嵌入与往返契约。
 *
 * ## 三条硬约束，先说清楚
 *
 * 1. **origin 与 embed base 都走 W01 已放行的那两张表**（`hosted-editor-origins.ts` /
 *    `editor-sandbox-origin.ts`）。本文件**一个字都不改那两张表**，只消费。
 * 2. **不申请 `allow-same-origin`。** microStudio 是未修改的第三方整站应用（自带
 *    express 服务端与一整套上游 JS），`allow-scripts` + `allow-same-origin` 同时给出去
 *    沙箱就等于没有。W01 契约 v2.1 §B 已经把六件钉在「不可信档」上，我不申请例外。
 *    持久化全走 postMessage，宿主拿自己的凭据落库。
 * 3. **iframe 内零凭据。** 嵌入 URL 不带 token、不带签名 URL、不带用户 id。
 *
 * ## 往返的真实形状（这是本文件最要紧的一段，别照判据原文想象）
 *
 * 判据 2 原文是「把 vibe-coding 产出的源码导入其工程继续改，导出回来」。
 * 实际能兑现的是**两种不同构的工程模型之间的搬运**，而不是同一份文档来回：
 *
 * - 我们的载体：一份自洽的完整 HTML 文档（`source`），自带 canvas、循环、输入、界面。
 * - microStudio 的工程：它自己的多份代码文件 + sprites + maps，跑在它自带的运行时上。
 *
 * 把任意 HTML+JS 整份文档「导入成一个可直接运行的 microStudio 程序」**不成立**——
 * 不是接线没做，是两种模型不同构。所以：
 *
 * - **导入**（host → editor）：把源码作为**一份代码文件**送进 microStudio 工程，
 *   作者在专业模式里照着改写或复用。
 * - **导出**（editor → host）：收 microStudio 的 **HTML5 导出产物**（同样是一份
 *   自洽完整文档）回到我们的信封。
 *
 * 宿主**不解释** microStudio 的内部工程格式：那是它的私事，解释它就等于在共享包里
 * 复制一份第三方内核的工程模型，`_COMMON.md` §10 第 2 条明禁。
 *
 * ## ⚠️ 两个方向都**不新增协议指令**
 *
 * 协议的指令白名单是闭集（`editor-protocol-message-types.ts`），且
 * `untrusted-content-sandbox-origin.test.mjs` 有两个 size 断言**故意让人不能顺手加指令**；
 * 那张表是 W01 的面，我不动。所以：
 *
 * - 导入走 **`init`** 的自由载荷（`content.source` / `content.fileName`），
 *   与 W08 的 `buildRichDocInitEnvelope` 同一条路；
 * - 导出走 **`recovery-capture` → `recovery-snapshot`**，正文在 `snapshot.payload` 里
 *   （契约允许 4 MB 载荷）。`export-result` 只能带 URL、带不了内联字节，用它就得
 *   先把用户代码上传到某个 origin 上，那恰恰是本波要避开的事。
 *
 * 我第一版真的写了 `game-ide.import-source` / `game-ide.export-document` 两个新
 * type，那样发出去会被 `asHostToEditorMessage` 当场拒掉、且没有任何报错 ——
 * 这条注释留着，免得下一个人再走一遍。
 */
import { EDITOR_PROTOCOL, buildEditorEmbedUrl } from "../editor-protocol";
import { HOSTED_EDITOR_ORIGINS } from "../hosted-editor-origins";
import { isTrustedEmbedEditorBase } from "../editor-sandbox-origin";
import { gameSourceByteLength, inspectGameDraft } from "./game-source";

/** W18 分给游戏专业模式的子域（A-17 / `signals/W18-domains.md`）。 */
export const GAME_IDE_HOSTED_EMBED_ORIGIN = "https://game-ide.oceanleo.app";

/**
 * 只认这**一个** origin。
 *
 * 从 W01 的六件全串清单里筛出自己那一条，而不是自己写一个字面量：
 * 那张表哪天改了（例如换域），这里跟着变；自己抄一份就会漂，而漂的方向一定是
 * 「宿主还信着一个已经不属于我们的 origin」。
 */
const GAME_IDE_ORIGIN_SET = new Set<string>(
  HOSTED_EDITOR_ORIGINS.filter(
    (origin) => origin === GAME_IDE_HOSTED_EMBED_ORIGIN,
  ),
);

/**
 * 归一化 embed base。
 *
 * 任何不是 `game-ide.oceanleo.app` 的 override 一律**退回默认值**而不是抛错：
 * 这条路径上的 override 来自环境配置，配错时「回到默认的那个正确 origin」
 * 比「整个专业模式打不开」更接近作者要的东西。带查询/片段/凭据的一律拒绝——
 * 那些是往 iframe 里塞东西的常见形状。
 */
export function gameIdeHostedEmbedBase(override?: string): string {
  if (!override) return GAME_IDE_HOSTED_EMBED_ORIGIN;
  try {
    const url = new URL(override);
    if (!GAME_IDE_ORIGIN_SET.has(url.origin)) {
      return GAME_IDE_HOSTED_EMBED_ORIGIN;
    }
    if (url.search || url.hash || url.username || url.password) {
      return GAME_IDE_HOSTED_EMBED_ORIGIN;
    }
    return (
      `${url.origin}${url.pathname.replace(/\/+$/, "")}` ||
      GAME_IDE_HOSTED_EMBED_ORIGIN
    );
  } catch {
    return GAME_IDE_HOSTED_EMBED_ORIGIN;
  }
}

export function canBuildGameIdeEmbedUrl(base: string): boolean {
  return isTrustedEmbedEditorBase(base);
}

export type GameIdeEmbedSrcInput = {
  embedBase: string;
  instanceId: string;
  hostOrigin: string;
  assetTitle?: string;
};

/**
 * 专业模式 iframe 真正挂上去的地址。抽成可调用的函数，是为了让闸能跑这条
 * 计算，而不是只在源码里搜标签名——`useMemo` 开头 `return ""` 时标签还在、
 * 用户已经看见「无法构造嵌入地址」。
 */
export function computeGameIdeHostedEmbedSrc(
  input: GameIdeEmbedSrcInput,
): string {
  if (!input.embedBase || !canBuildGameIdeEmbedUrl(input.embedBase)) return "";
  try {
    return buildGameIdeEmbedUrl({
      instanceId: input.instanceId,
      hostOrigin: input.hostOrigin,
      assetTitle: input.assetTitle,
      base: input.embedBase,
    });
  } catch {
    return "";
  }
}

export function buildGameIdeEmbedUrl(opts: {
  instanceId: string;
  hostOrigin: string;
  assetTitle?: string;
  base?: string;
}): string {
  const base = gameIdeHostedEmbedBase(opts.base);
  if (!canBuildGameIdeEmbedUrl(base)) {
    throw new TypeError(
      "game-ide.oceanleo.app 还不在宿主可信 embed 白名单里",
    );
  }
  return buildEditorEmbedUrl(base, {
    instanceId: opts.instanceId,
    hostOrigin: opts.hostOrigin,
    // 刻意不传 assetUrl：签名 URL 一旦进 iframe，第三方整站就拿到了一条
    // 我们自己的存储读取凭据。源码走 postMessage 送进去。
    assetTitle: opts.assetTitle,
    assetKind: "game",
  });
}

// ── 往返消息 ────────────────────────────────────────────────────────────────

/** 导入走 `init` 的自由载荷，**不新增协议指令**（见文件头）。 */
export const GAME_IDE_IMPORT_MESSAGE_TYPE = "init";
/** 导出走 `recovery-snapshot`，正文在 `snapshot.payload` 里。 */
export const GAME_IDE_EXPORT_MESSAGE_TYPE = "recovery-snapshot";
/** `payload.kind` 的字面量，用来把「这是游戏源码」与别的快照区分开。 */
export const GAME_IDE_PAYLOAD_KIND = "oceanleo.game-ide-source.v1";

/** 单次搬运的源码上限，与草稿上限同一个数。 */
export const GAME_IDE_MAX_SOURCE_BYTES = 2 * 1024 * 1024;

/**
 * 导入信封（`init` 自由载荷）。
 *
 * `fileName` 由宿主定而不是让编辑器猜：作者在 microStudio 的文件树里要认得出
 * 「这就是我从 OceanLeo 带过来的那份」。
 */
export function buildGameIdeImportEnvelope(
  instanceId: string,
  payload: { source: string; title?: string; fileName?: string },
): Record<string, unknown> {
  if (!instanceId || instanceId.length > 128) {
    throw new TypeError("game-ide: instanceId 必须非空且 ≤128");
  }
  const source = String(payload.source ?? "");
  if (!source.trim()) {
    throw new TypeError("game-ide: 没有可导入的源码");
  }
  if (gameSourceByteLength(source) > GAME_IDE_MAX_SOURCE_BYTES) {
    throw new TypeError("game-ide: 源码超过单次搬运上限");
  }
  return {
    protocol: EDITOR_PROTOCOL,
    type: GAME_IDE_IMPORT_MESSAGE_TYPE,
    instanceId,
    content: {
      kind: GAME_IDE_PAYLOAD_KIND,
      source,
      fileName: payload.fileName || "oceanleo-import.html",
    },
    readOnly: false,
    ...(payload.title ? { title: payload.title } : {}),
  };
}

export type GameIdeExportRead =
  | { ok: true; source: string }
  | { ok: false; reason: string };

/**
 * 校验 microStudio 送回来的导出产物（`recovery-snapshot` 的 `snapshot.payload`）。
 *
 * **fail-closed，逐条说清为什么拒**：这条消息是从一个跑着第三方整站的不可信沙箱
 * 里来的，它交回来的字节会成为作者作品的下一版。所以这里不做任何「大概能用就收下」
 * 的宽容处理：
 *
 * - 不是我们的协议信封 / 不是本实例 ⇒ 拒（防同页另一个 iframe 冒名）；
 * - `payload.kind` 不是游戏源码那一种 ⇒ 拒（同一条通道上还跑着别的快照）；
 * - `source` 不是非空字符串 ⇒ 拒；
 * - 过不了 `inspectGameDraft` 的可发布判据 ⇒ 拒（超限、空、不是完整文档）。
 *
 * 收下之后**仍然不直接落库**：它进的是草稿，作者要自己点保存。
 *
 * ⚠️ 调用方**必须先过 `acceptEditorFrameMessage()`**（origin + frameWindow + instanceId
 * 三重校验）再把消息交给本函数。本函数是第二道，不是第一道 —— 它看不到 `MessageEvent`，
 * 也就判不了 origin。
 */
export function readGameIdeExport(
  message: Record<string, unknown> | null | undefined,
  instanceId: string,
): GameIdeExportRead {
  if (!message || typeof message !== "object") {
    return { ok: false, reason: "专业模式回了一条空消息。" };
  }
  if (message.protocol !== EDITOR_PROTOCOL) {
    return { ok: false, reason: "专业模式回的消息不是宿主协议信封，已拒收。" };
  }
  if (message.type !== GAME_IDE_EXPORT_MESSAGE_TYPE) {
    return { ok: false, reason: "这条消息不是导出产物。" };
  }
  if (!instanceId || message.instanceId !== instanceId) {
    return { ok: false, reason: "导出产物的实例标识不匹配，已拒收。" };
  }
  if (message.ok !== true) {
    return { ok: false, reason: "专业模式回报导出失败，草稿未改动。" };
  }
  const snapshot =
    typeof message.snapshot === "object" && message.snapshot !== null
      ? (message.snapshot as Record<string, unknown>)
      : null;
  const payload =
    snapshot && typeof snapshot.payload === "object" && snapshot.payload !== null
      ? (snapshot.payload as Record<string, unknown>)
      : null;
  if (!payload) {
    return { ok: false, reason: "导出产物里没有载荷，已拒收。" };
  }
  if (payload.kind !== GAME_IDE_PAYLOAD_KIND) {
    return {
      ok: false,
      reason: "这份快照不是游戏源码（载荷 kind 不匹配），已拒收。",
    };
  }
  const source = payload.source;
  if (typeof source !== "string" || !source.trim()) {
    return { ok: false, reason: "导出产物里没有源码，已拒收。" };
  }
  if (gameSourceByteLength(source) > GAME_IDE_MAX_SOURCE_BYTES) {
    return { ok: false, reason: "导出产物超过单次搬运上限，已拒收。" };
  }
  const checked = inspectGameDraft(source);
  if (!checked.publishable) {
    return {
      ok: false,
      reason:
        "导出产物不是一份能发布的完整游戏文档（空、超限或缺 html/body 结构），已拒收。",
    };
  }
  return { ok: true, source };
}
