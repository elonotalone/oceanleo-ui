"use client";

// LeoPlay 的游戏编辑器 route。
//
// 编辑面只有三样东西：**prompt 迭代、可玩预览、保存 revision**。
// 刻意缺席的两样（`01-decisions.md` D7/D8）：
//   · 没有代码编辑面 —— 玩法由平台生成链按注入骨架产出，用户改的是 prompt 不是源码；
//     给 `game` 复用 `website` 的源码工作台（CAS 源码树 + dev preview）是错的。
//   · 没有上传入口 —— adapter 不声明 `upload`，也不接受任何 `origin: "import"` 的产物。
//
// 沙箱宿主与生成链都不住在这个包里：宿主是 game 仓的 `components/UgcGameFrame.tsx`
// （沙箱域 + iframe sandbox 属性由那边负责），生成链是 game 仓 + 后端 router。
// 本文件只定义两者的注入契约，并在未注入时 fail-closed 地停下来。

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { createArtifactRevision, forkArtifact } from "../artifact-client";
import { GAME_DOCUMENT_SOURCE_FORMAT } from "../artifact-contract";
import {
  advancedSavedItem,
  commitAdvancedSavedRevision,
} from "../advanced-session";
import { useAdvancedSession } from "../advanced-session-context";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import { editorToolLabel } from "../workbench-routes";

export const GAME_PROJECT_SCHEMA = GAME_DOCUMENT_SOURCE_FORMAT;
export const GAME_EDITOR_CAPABILITY = "game-editor";

/**
 * 宿主桥仍保留旧的二值类型，但新载体只会交出 `html`：`source` 已是一份完整文档，
 * 不再允许把当前格式误归成需要平台补骨架的 JS 槽位。
 */
export type GameBundleFormat = "html" | "js";

/**
 * artifact 的 source format 与 media type。
 *
 * 可玩产物以 `oceanleo.game-document.v1` JSON 信封落库，**绝不是**裸 `text/html`：
 * `media_rehost._BLOCKED_MIME` 与 `_validate_upload_media_type` 两道黑名单都拒收
 * text/html，而它们是 `policy:security.untrusted-content-domain` 的落点。
 * 信封的 `source` 是完整 HTML，由沙箱域原样装载。
 */
export const GAME_SOURCE_FORMAT = GAME_DOCUMENT_SOURCE_FORMAT;
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

// ── 沙箱宿主注入契约（W11 侧实现） ─────────────────────────────────────────

export interface GamePreviewHostProps {
  artifactId: string;
  revisionId: string;
  /**
   * `oceanleo.game-document.v1` 信封的签名 URL（`full` rendition，application/json）。
   * 宿主必须让沙箱域去取它并在那边装载完整文档，**不得**塞进 iframe 的 `srcdoc`
   * —— `srcdoc` 文档继承父页面 origin，会让整个域隔离方案失效。
   */
  envelopeUrl: string;
  bundleFormat: GameBundleFormat;
  engineApiVersion: string;
  title: string;
  /** 沙箱回报的运行时错误，用于把「生成的东西跑不起来」显式暴露给用户。 */
  onRuntimeError?: (message: string) => void;
}

export type GamePreviewHost = ComponentType<GamePreviewHostProps>;

let gamePreviewHost: GamePreviewHost | null = null;

/**
 * 由宿主站（game 仓）在模块初始化时注册 `UgcGameFrame`。
 *
 * 共享包**永远不会**自己渲染游戏 iframe：sandbox 属性、沙箱子域、
 * `postMessage` 双向 origin 校验全部是宿主的职责，放在这里会让隔离方案失效。
 */
export function registerGamePreviewHost(host: GamePreviewHost | null): void {
  gamePreviewHost = host;
}

// ── 生成链注入契约（W10 侧实现） ───────────────────────────────────────────

export interface GameIterationRequest {
  artifactId: string;
  revisionId: string;
  /** 用户这一轮写的 prompt。审核前置发生在 runner 内部。 */
  prompt: string;
  /** 上一轮的 engine API 版本，供兼容判断；首轮为空。 */
  engineApiVersion: string;
}

export type GameIterationResult =
  | { ok: true; document: GameBundleDocument }
  | { ok: false; error: string };

export type GameIterationRunner = (
  request: GameIterationRequest,
) => Promise<GameIterationResult>;

let gameIterationRunner: GameIterationRunner | null = null;

export function registerGameIterationRunner(
  runner: GameIterationRunner | null,
): void {
  gameIterationRunner = runner;
}

// ── Route ──────────────────────────────────────────────────────────────────

function documentFromItem(item: LibraryItem): GameBundleDocument | null {
  if (!isDurableLibraryItem(item)) return null;
  const { renditions } = item.artifact;
  const envelope = renditions.full || renditions.source;
  const cover = renditions.preview;
  const manifest = renditions.editor_manifest;
  if (!envelope?.url || !envelope.digest) return null;
  return {
    envelopeUrl: envelope.url,
    envelopeDigest: envelope.digest,
    // 当前格式的 source 本身就是完整 HTML。忽略旧 metadata 里的 js 槽位提示，
    // 否则新文档会被旧宿主解析器静默误归。
    bundleFormat: "html",
    coverUrl: cover?.url || "",
    coverDigest: cover?.digest || "",
    manifestUrl: manifest?.url || "",
    manifestDigest: manifest?.digest || "",
    engineApiVersion: String(item.meta.engine_api_version || ""),
    skeletonVersion: String(item.meta.skeleton_version || ""),
    prompt: String(item.meta.generation_prompt || ""),
    origin: "ai",
  };
}

export function GameRoute({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const session = useAdvancedSession();
  const [history, setHistory] = useState<GameBundleDocument[]>(() => {
    const initial = documentFromItem(item);
    return initial ? [initial] : [];
  });
  const [cursor, setCursor] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const busyRef = useRef(false);

  const document_ = history[cursor] || null;
  const editRevision = `${cursor}:${document_?.envelopeDigest || "empty"}`;

  const iterate = useCallback(async () => {
    const draft = prompt.trim();
    if (busyRef.current || !draft) return;
    if (!isDurableLibraryItem(item)) {
      setError("这个条目没有 durable artifact identity，无法迭代。");
      return;
    }
    if (!gameIterationRunner) {
      setError(
        "生成链尚未接入本站（未注册 game iteration runner），无法迭代玩法。",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await gameIterationRunner({
        artifactId: item.artifactId,
        revisionId: item.revisionId,
        prompt: draft,
        engineApiVersion: document_?.engineApiVersion || "",
      });
      if (!result.ok) {
        setError(result.error || "这一轮生成失败，游戏保持上一版。");
        return;
      }
      if (!isAllowedGameRevisionOrigin(result.document.origin)) {
        setError(
          `生成链回报了不允许的产物来源 ${result.document.origin}；本站不接受上传或导入的游戏。`,
        );
        return;
      }
      setHistory((entries) => [
        ...entries.slice(0, cursor + 1),
        result.document,
      ]);
      setCursor((value) => (history.length === 0 ? 0 : value + 1));
      setPrompt("");
      setDirty(true);
      setNotice("新玩法已生成，先试玩再保存。");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "这一轮生成失败。",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [cursor, document_?.engineApiVersion, history.length, item, prompt]);

  const flush = useCallback(async () => {
    if (!document_) {
      return { ok: false as const, error: "还没有可保存的可玩产物。" };
    }
    if (!isAllowedGameRevisionOrigin(document_.origin)) {
      return {
        ok: false as const,
        error: "产物来源不合法，拒绝提交 revision。",
      };
    }
    if (!isDurableLibraryItem(item)) {
      return {
        ok: true as const,
        item: advancedSavedItem(item, {
          url: document_.envelopeUrl,
          versionId: document_.envelopeDigest,
          previewUrl: document_.coverUrl,
          thumbUrl: document_.coverUrl,
          meta: {
            editor: GAME_EDITOR_CAPABILITY,
            editor_project_schema: GAME_PROJECT_SCHEMA,
            generation_prompt: document_.prompt,
            engine_api_version: document_.engineApiVersion,
            skeleton_version: document_.skeletonVersion,
          },
        }),
      };
    }
    if (!document_.coverUrl || !document_.coverDigest) {
      return {
        ok: false as const,
        error: "缺少封面位图（preview rendition），游戏 revision 无法保存。",
      };
    }
    if (!document_.manifestUrl || !document_.manifestDigest) {
      return {
        ok: false as const,
        error:
          "缺少 editor manifest（生成 prompt / 骨架版本 / engine API 版本），游戏 revision 无法保存。",
      };
    }
    try {
      const committed = await commitAdvancedSavedRevision(item, {
        publish: createArtifactRevision,
        commit: {
          source: {
            format: GAME_SOURCE_FORMAT,
            url: document_.envelopeUrl,
            digest: document_.envelopeDigest,
          },
          renditions: [
            {
              // 与 `source` 同一份字节：后端 `_SAVE_CONTRACT[GAME].full_media`
              // 只接受 application/json，可玩产物只以信封形态存在。
              purpose: "full",
              url: document_.envelopeUrl,
              digest: document_.envelopeDigest,
            },
            {
              purpose: "preview",
              url: document_.coverUrl,
              digest: document_.coverDigest,
            },
            {
              purpose: "editor_manifest",
              url: document_.manifestUrl,
              digest: document_.manifestDigest,
            },
          ],
          provenance: {
            origin: document_.origin,
            prompt: document_.prompt,
            engineApiVersion: document_.engineApiVersion,
            skeletonVersion: document_.skeletonVersion,
            editor: GAME_EDITOR_CAPABILITY,
            editorProjectSchema: GAME_PROJECT_SCHEMA,
            previousRevisionId: item.revisionId,
          },
        },
        meta: {
          generation_prompt: document_.prompt,
          engine_api_version: document_.engineApiVersion,
          skeleton_version: document_.skeletonVersion,
          editor_project_schema: GAME_PROJECT_SCHEMA,
        },
      });
      setDirty(false);
      return { ok: true as const, item: committed };
    } catch (caught) {
      return {
        ok: false as const,
        error:
          caught instanceof Error
            ? caught.message
            : "游戏 artifact revision 保存失败。",
      };
    }
  }, [document_, item]);

  // remix 直接复用既有的 `POST /v1/artifacts/{id}:fork`：血缘由服务端的
  // `provenance.parent_revision_ids` 承载，这里不发明第二套血缘机制（D7）。
  const remix = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const forked = await forkArtifact(item);
      if (!forked.ok || !forked.data) {
        setError(forked.error || "二创副本创建失败。");
        return;
      }
      const recorded = await session?.recordSavedItem(forked.data);
      setNotice(
        recorded === false
          ? "二创副本已创建，但工作台会话未能切换；请从我的库打开它。"
          : "已创建二创副本，后续修改只影响你的副本。",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [item, session]);

  const PreviewHost = gamePreviewHost;
  const stage = useMemo(() => {
    if (!document_) {
      return (
        <div className="grid h-full place-items-center bg-stone-50 p-8 text-center text-sm text-stone-600">
          这个游戏还没有可玩产物；在左侧描述你想要的玩法来生成第一版。
        </div>
      );
    }
    if (!PreviewHost) {
      return (
        <div
          role="alert"
          className="grid h-full place-items-center bg-stone-50 p-8 text-center text-sm text-amber-700"
        >
          可玩预览需要宿主站注册沙箱容器（registerGamePreviewHost）。
          共享包不会自行渲染游戏 iframe，以免绕过沙箱域隔离。
        </div>
      );
    }
    return (
      <PreviewHost
        artifactId={item.artifactId || ""}
        revisionId={item.revisionId || ""}
        envelopeUrl={document_.envelopeUrl}
        bundleFormat={document_.bundleFormat}
        engineApiVersion={document_.engineApiVersion}
        title={item.title}
        onRuntimeError={setError}
      />
    );
  }, [PreviewHost, document_, item.artifactId, item.revisionId, item.title]);

  const toolbox = useMemo(
    () => (
      <div className="flex flex-col gap-3 p-3">
        <label
          className="text-xs font-medium text-stone-600"
          htmlFor="game-prompt"
        >
          描述这一轮想要的玩法改动
        </label>
        <textarea
          id="game-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={6}
          disabled={busy}
          placeholder="例：加入二段跳，被击中三次后结束并显示得分。"
          className="w-full resize-y rounded-lg border border-stone-300 bg-white p-2 text-sm outline-none focus:border-stone-500"
        />
        <button
          type="button"
          onClick={iterate}
          disabled={busy || !prompt.trim()}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy ? "生成中…" : document_ ? "迭代这一版" : "生成第一版"}
        </button>
        {history.length > 0 ? (
          <ol className="flex flex-col gap-1 text-xs text-stone-600">
            {history.map((entry, index) => (
              <li key={`${index}:${entry.envelopeDigest}`}>
                <button
                  type="button"
                  onClick={() => setCursor(index)}
                  disabled={busy}
                  className={`w-full truncate rounded px-2 py-1 text-left ${
                    index === cursor ? "bg-stone-200" : "hover:bg-stone-100"
                  }`}
                >
                  {`v${index + 1} · ${entry.prompt || "初始版本"}`}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    ),
    [accent, busy, cursor, document_, history, iterate, prompt],
  );

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "game",
        label: editorToolLabel({ type: "game" }),
        toolbox: {
          label: "玩法",
          icon: "add",
          content: toolbox,
        },
        history: {
          canUndo: cursor > 0,
          canRedo: cursor + 1 < history.length,
          undo: () => setCursor((value) => Math.max(0, value - 1)),
          redo: () =>
            setCursor((value) => Math.min(history.length - 1, value + 1)),
        },
        actions: [
          {
            id: "game-remix",
            label: "另存为二创副本",
            disabled: busy || !isDurableLibraryItem(item),
            busy,
            onTrigger: remix,
          },
        ],
        // `upload` 刻意缺席：game 站全站不提供上传/导入入口（D8）。
        stage,
        status: error || notice,
        persistence: {
          dirty,
          editRevision,
          flush,
          recovery: {
            key: advancedRecoveryKey("game", item),
            ready: !busy,
            capture: () => (document_ ? { ...document_ } : null),
            restore: (payload) => {
              const restored = payload as GameBundleDocument | null;
              if (
                !restored?.envelopeUrl ||
                !restored.envelopeDigest ||
                !isAllowedGameRevisionOrigin(restored.origin)
              ) {
                return false;
              }
              setHistory((entries) => [...entries, restored]);
              setCursor((value) => value + 1);
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
