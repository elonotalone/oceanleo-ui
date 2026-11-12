"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import type { ArtifactProjection } from "../artifact-contract";
import type { GameBundleFormat, GamePreviewHost, GamePreviewHostProps } from "../game-editor/preview-host";
import { GameProjectEditor } from "../game-editor/GameProjectEditor";
export { registerGamePreviewHost } from "../game-editor/preview-host";
export { registerGameIterationRunner } from "../game-editor/game-iteration-runner";
export { GAME_DUAL_ENGINE_HANDOFF, gameLeavePolicy } from "../game-editor/game-pages";
export { gameSourceAdmission } from "./non-richdoc-source-gate";
export type { GameBundleFormat, GamePreviewHost, GamePreviewHostProps };

export const GAME_PROJECT_SCHEMA = "game-project@1";
export const GAME_EDITOR_CAPABILITY = "game-editor";

/**
 * artifact 的 source format 与 media type。
 *
 * 可玩产物以 `oceanleo.game-document.v1` JSON 信封落库，**绝不是**裸 `text/html`：
 * `media_rehost._BLOCKED_MIME` 与 `_validate_upload_media_type` 两道黑名单都拒收
 * text/html，而它们是 `policy:security.untrusted-content-domain` 的落点。
 * 信封的 `source` 是完整 HTML，由沙箱域原样装载。
 */
export const GAME_SOURCE_FORMAT = GAME_PROJECT_SCHEMA;
export const GAME_SOURCE_MEDIA_TYPE = "application/json";

/**
 * revision 允许声明的来源。**`import` 不在其中，且不得被加回来**：
 * 全站不提供上传入口是 D8 的硬约束，放开这里等于从编辑器侧开一个后门。
 */
export const GAME_REVISION_ORIGINS = ["ai", "remix"] as const;
export type GameRevisionOrigin = (typeof GAME_REVISION_ORIGINS)[number];

export function isAllowedGameRevisionOrigin(
  value: unknown,
): value is GameRevisionOrigin {
  return (GAME_REVISION_ORIGINS as readonly string[]).includes(
    String(value || "").trim(),
  );
}

/** 一条可玩产物的完整证据。URL 全部由生成链上传后给出，前端不自己产字节。 */
export interface GameBundleDocument {
  /**
   * `oceanleo.game-document.v1` JSON 信封的签名 URL。
   * 同一份字节同时充当 `source` 与 `full` 两个 rendition —— 后端
   * `_SAVE_CONTRACT[GAME].full_media` 只接受 `application/json`。
   */
  envelopeUrl: string;
  envelopeDigest: string;
  /** 信封里那段源码的形态，交给沙箱宿主决定怎么合成文档。 */
  bundleFormat: GameBundleFormat;
  /** 封面位图，`image/*`；卡片缩略图从它派生。 */
  coverUrl: string;
  coverDigest: string;
  /** editor manifest：生成 prompt、骨架版本、engine API 版本。 */
  manifestUrl: string;
  manifestDigest: string;
  engineApiVersion: string;
  skeletonVersion: string;
  prompt: string;
  origin: GameRevisionOrigin;
}

/** @deprecated Compatibility reader for old recovery records; no new editor writes this format. */
export const GAME_WORKING_DOCUMENT_SCHEMA = "oceanleo.game.edit.v1";

export type GameWorkingDocument = GameBundleDocument & {
  source?: string;
  sourceDirty?: boolean;
  /** 平台内联的 three 运行时。只在进程内存暂存里带，绝不进恢复草稿。 */
  hiddenRuntime?: string;
  paramDeclarations?: Record<string, unknown> | null;
};

const GAME_WORKING_HEADS = new Map<string, GameWorkingDocument>();

export function gameWorkingHeadKey(item: {
  artifactId?: string;
  id?: string;
  key?: string;
}): string {
  return String(item.artifactId || item.key || item.id || "");
}

export function stashGameWorkingDocument(
  item: { artifactId?: string; id?: string; key?: string },
  doc: GameWorkingDocument | null,
): void {
  const key = gameWorkingHeadKey(item);
  if (!key) return;
  if (!doc) GAME_WORKING_HEADS.delete(key);
  else GAME_WORKING_HEADS.set(key, doc);
}

export function peekGameWorkingDocument(item: {
  artifactId?: string;
  id?: string;
  key?: string;
}): GameWorkingDocument | null {
  return GAME_WORKING_HEADS.get(gameWorkingHeadKey(item)) ?? null;
}

export function asGameWorkingDocument(
  payload: unknown,
): GameWorkingDocument | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  const origin = value.origin;
  if (origin != null && origin !== "" && !isAllowedGameRevisionOrigin(origin)) {
    return null;
  }
  const source = typeof value.source === "string" ? value.source : "";
  const envelopeUrl = String(value.envelopeUrl || "").trim();
  const envelopeDigest = String(value.envelopeDigest || "").trim();
  if (!source && (!envelopeUrl || !envelopeDigest)) return null;
  return {
    envelopeUrl,
    envelopeDigest,
    bundleFormat: "html",
    coverUrl: String(value.coverUrl || ""),
    coverDigest: String(value.coverDigest || ""),
    manifestUrl: String(value.manifestUrl || ""),
    manifestDigest: String(value.manifestDigest || ""),
    engineApiVersion: String(value.engineApiVersion || ""),
    skeletonVersion: String(value.skeletonVersion || ""),
    prompt: String(value.prompt || ""),
    origin: isAllowedGameRevisionOrigin(origin) ? origin : "ai",
    ...(source ? { source } : {}),
    sourceDirty: value.sourceDirty === true,
    ...(value.paramDeclarations !== undefined
      ? {
          paramDeclarations:
            value.paramDeclarations &&
            typeof value.paramDeclarations === "object" &&
            !Array.isArray(value.paramDeclarations)
              ? (value.paramDeclarations as Record<string, unknown>)
              : null,
        }
      : {}),
  };
}

// 沙箱宿主槽位在 `../game-editor/preview-host.ts`：legacy 与 next 共用同一模块实例。

// ── 生成链注入契约（W10 侧实现） ───────────────────────────────────────────

export interface GameIterationRequest {
  artifactId: string;
  revisionId: string;
  /** 用户这一轮写的 prompt。审核前置发生在 runner 内部。 */
  prompt: string;
  /** 上一轮的 engine API 版本，供兼容判断；首轮为空。 */
  engineApiVersion: string;
  /** Resume only reads an existing owner-bound job; it must never generate. */
  resume?: boolean;
  signal?: AbortSignal;
  onProgress?: (state: "running" | "reconnecting" | import("../game-editor/game-project-api").GameProjectJob) => void;
}

export type GameIterationResult =
  | { ok: true; document?: GameBundleDocument; artifact?: ArtifactProjection }
  | { ok: false; error: string; idle?: boolean };

export type GameIterationRunner = ((
  request: GameIterationRequest,
) => Promise<GameIterationResult>) & { supportsResume?: boolean };


/** One file-project editor for every game; legacy documents open read-only. */
export function GameRoute(props: AdvancedContentWorkbenchProps) {
  return <GameProjectEditor {...props} />;
}
