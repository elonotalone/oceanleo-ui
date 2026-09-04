/**
 * 把改完的草稿存成一版 game artifact revision。
 *
 * ## 这条链为什么是「先上传字节、再提交 revision」
 *
 * `game` 的保存合同（后端 `_SAVE_CONTRACT[GAME]`）要的是 **URL + digest**，
 * 不接受内联字节。所以顺序固定：
 *
 *   1. 把信封 JSON 与 editor manifest 各上传一次，拿回 URL；
 *   2. 用 URL + digest 提交 revision（`source` 与 `full` 指同一份字节 ——
 *      后端 `full_media` 只接受 `application/json`，可玩产物只以信封形态存在）。
 *
 * ## 封面（preview rendition）沿用上一版，且这件事必须说出来
 *
 * 保存合同要求 `preview` 非空。代码编辑面**没有截图能力**（要截图就得先把游戏跑起来
 * 再抓帧，那是沙箱侧的事，不在共享包里）。所以这里沿用上一版的封面，
 * 并在 `meta.cover_stale` 上留标记 —— 作者改了美术风格却看到旧封面时，
 * 至少这条记录能让人查到为什么，而不是以为封面生成坏了。
 *
 * ## 来路（origin）原样透传，一个新值都不引入
 *
 * `ai` / `remix` 是唯二允许值，`import` / `upload` / `paste` 被永久禁用（D8）。
 * 作者在代码编辑器里改自己那份平台生成的游戏，**不是新增一条产物来路**。
 * 编辑动作记在 `provenance.editor` 上，与来路分开。
 */
import type { LibraryItem } from "../library-data";
import { buildGameEnvelope, gameSourceByteLength } from "./game-source";

/** 上传一份字节要用到的最小依赖面，注入以便测试不碰网络。 */
export interface GameDraftSaveDeps {
  uploadJson: (
    json: string,
    fileName: string,
    idempotencySeed: string,
  ) => Promise<{ url: string; digest: string }>;
  commit: (input: {
    envelopeUrl: string;
    envelopeDigest: string;
    manifestUrl: string;
    manifestDigest: string;
  }) => Promise<LibraryItem>;
}

export interface GameDraftSaveInput {
  source: string;
  /** 上一版的来路，原样透传。 */
  origin: string;
  /** 生成 prompt / 骨架版本 / engine API 版本，沿用上一版。 */
  prompt: string;
  skeletonVersion: string;
  engineApiVersion: string;
  /** 这一版声明的可调参数，写进信封 manifest 供沙箱读。 */
  paramDeclarations?: Record<string, unknown> | null;
  /** 是谁改的：代码编辑器还是 microStudio 专业模式。 */
  editedBy: "code-editor" | "microstudio-pro";
  title: string;
}

export type GameDraftSaveResult =
  | { ok: true; item: LibraryItem }
  | { ok: false; error: string };

/** SHA-256 十六进制。没有 WebCrypto（非安全上下文）时返回空串，由调用方判。 */
export async function sha256Text(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return "";
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function buildGameEditorManifest(input: GameDraftSaveInput): string {
  return JSON.stringify({
    schema: "oceanleo.game-editor-manifest.v1",
    generationPrompt: input.prompt,
    skeletonVersion: input.skeletonVersion,
    engineApiVersion: input.engineApiVersion,
    // 这一版是谁改的。审计与「为什么封面是旧的」都从这里查。
    editedBy: input.editedBy,
    editedAt: new Date().toISOString(),
    sourceBytes: gameSourceByteLength(input.source),
    ...(input.paramDeclarations
      ? { paramDeclarations: input.paramDeclarations }
      : {}),
  });
}

/**
 * 存一版。
 *
 * 失败一律返回 `{ ok:false, error }` 而不抛：调用方是编辑栏的保存按钮，
 * 它要把原因显示给作者，而不是让整个工作台崩掉。
 */
export async function saveGameDraft(
  input: GameDraftSaveInput,
  deps: GameDraftSaveDeps,
): Promise<GameDraftSaveResult> {
  const source = String(input.source ?? "");
  if (!source.trim()) {
    return { ok: false, error: "源码是空的，没有可保存的东西。" };
  }
  const envelopeJson = JSON.stringify(
    buildGameEnvelope({
      source,
      origin: input.origin,
      ...(input.paramDeclarations
        ? { manifest: { paramDeclarations: input.paramDeclarations } }
        : {}),
    }),
  );
  const manifestJson = buildGameEditorManifest(input);
  const safeTitle = (input.title || "game").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
  try {
    const envelope = await deps.uploadJson(
      envelopeJson,
      `${safeTitle}.game-document.json`,
      "envelope",
    );
    if (!envelope.url) {
      return { ok: false, error: "存储服务没有返回游戏工程档地址。" };
    }
    const manifest = await deps.uploadJson(
      manifestJson,
      `${safeTitle}.game-manifest.json`,
      "manifest",
    );
    if (!manifest.url) {
      return { ok: false, error: "存储服务没有返回 editor manifest 地址。" };
    }
    const item = await deps.commit({
      envelopeUrl: envelope.url,
      envelopeDigest: envelope.digest,
      manifestUrl: manifest.url,
      manifestDigest: manifest.digest,
    });
    return { ok: true, item };
  } catch (caught) {
    return {
      ok: false,
      error:
        caught instanceof Error
          ? caught.message
          : "这一版没保存成功，草稿还在编辑器里。",
    };
  }
}
