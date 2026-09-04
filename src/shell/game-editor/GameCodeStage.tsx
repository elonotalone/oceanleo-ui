"use client";

/**
 * 游戏新核叶子。flag=`next` 时由 GameRoute 经 dynamic(..., { ssr: false }) 拉起。
 *
 * 普通模式：代码编辑器 + 沙箱预览 + 运行/停止/重载 + 参数面板。
 * 专业模式（L0 setMode）：microStudio hosted iframe。
 * agent 改源码的唯一入口是 `createGameAgentSurface`（默认送审）。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import {
  advancedSavedItem,
  commitAdvancedSavedRevision,
} from "../advanced-session";
import { createArtifactRevision } from "../artifact-client";
import { GAME_DOCUMENT_SOURCE_FORMAT } from "../artifact-contract";
import { rememberEditorChips, publishAgentSelection } from "../agent-review";
import { uploadFile } from "../../lib/database";
import { isDurableLibraryItem } from "../library-data";
import { usePluginCommandSurface } from "../plugin-command";
import { editorToolLabel } from "../workbench-routes";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor/index";
import {
  createGameAgentSurface,
  type GameAgentEditorPort,
} from "./game-agent-gate";
import { GAME_AGENT_CHIPS, gameToolsManifestChips } from "./l4-chips";
import {
  inspectGameDraft,
  readGameEnvelope,
  readGameParamDeclarations,
  resolveGameParamValues,
  type GameParamDeclarations,
} from "./game-source";
import { saveGameDraft, sha256Text } from "./game-draft-save";
import {
  GAME_NEXT_MODE_ATTR,
  GAME_NEXT_STAGE_ATTR,
  applyGameNextMode,
} from "./game-next-mode";
import {
  GAME_PREVIEW_INITIAL,
  planGamePreviewControl,
  type GamePreviewPlayback,
} from "./game-preview-controls";
import { useGamePreviewHost } from "./preview-host";
import {
  buildGameIdeImportEnvelope,
  computeGameIdeHostedEmbedSrc,
  gameIdeHostedEmbedBase,
} from "./game-microstudio-embed";
import {
  GameHostedFrame,
  postGameIdeExportRequest,
  postGameIdeImport,
} from "./GameHostedFrame";

const GAME_EDITOR_CAPABILITY = "game-editor";
const EMPTY_DOC =
  "<!doctype html><html><body><script></script></body></html>";

function hostOriginNow(): string {
  if (typeof window === "undefined") return "https://oceanleo.com";
  return window.location.origin || "https://oceanleo.com";
}

function envelopeUrlOf(
  item: AdvancedContentWorkbenchProps["item"],
): string {
  if (isDurableLibraryItem(item)) {
    const envelope =
      item.artifact.renditions.full || item.artifact.renditions.source;
    return envelope?.url || "";
  }
  return String(item.url || item.previewUrl || "").trim();
}

function coverOf(item: AdvancedContentWorkbenchProps["item"]): {
  url: string;
  digest: string;
} {
  if (isDurableLibraryItem(item)) {
    const cover = item.artifact.renditions.preview;
    return { url: cover?.url || "", digest: cover?.digest || "" };
  }
  return { url: "", digest: "" };
}

export function GameCodeStage({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const instanceId = useRef(
    `gm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [source, setSource] = useState(EMPTY_DOC);
  const [origin, setOrigin] = useState("ai");
  const [prompt, setPrompt] = useState("");
  const [skeletonVersion, setSkeletonVersion] = useState("");
  const [engineApiVersion, setEngineApiVersion] = useState("");
  const [paramDeclarations, setParamDeclarations] =
    useState<GameParamDeclarations | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [playback, setPlayback] = useState<GamePreviewPlayback>(
    GAME_PREVIEW_INITIAL,
  );
  const [editRevision, setEditRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const hostedSessionRef = useRef(false);
  const chipsManifest = useMemo(() => gameToolsManifestChips(), []);
  const applied = applyGameNextMode(instanceId, mode);
  const PreviewHost = useGamePreviewHost();
  const inspection = useMemo(() => inspectGameDraft(source), [source]);

  const sourceRef = useRef(source);
  sourceRef.current = source;
  const revisionRef = useRef(editRevision);
  revisionRef.current = editRevision;
  const paramsRef = useRef(paramDeclarations);
  paramsRef.current = paramDeclarations;

  useEffect(() => {
    rememberEditorChips("game", GAME_AGENT_CHIPS);
    return () => {
      rememberEditorChips("game", undefined);
    };
  }, []);

  useEffect(() => {
    const url = envelopeUrlOf(item);
    const inline =
      typeof item.meta.game_source === "string" ? item.meta.game_source : "";
    if (inline.trim()) {
      setSource(inline);
      setOrigin("ai");
      const declared = readGameParamDeclarations({
        paramDeclarations: item.meta.paramDeclarations,
      });
      if (declared) {
        setParamDeclarations(declared);
        setParamValues(resolveGameParamValues(declared));
      }
      return;
    }
    if (!url) return;
    let cancelled = false;
    void fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`工程档读取失败（HTTP ${response.status}）`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((json) => {
        if (cancelled) return;
        const read = readGameEnvelope(json);
        if (!read.ok) {
          setStatus(read.reason);
          return;
        }
        setSource(read.envelope.source);
        setOrigin(read.envelope.origin || "ai");
        const declared = readGameParamDeclarations(read.envelope.manifest);
        setParamDeclarations(declared);
        if (declared) setParamValues(resolveGameParamValues(declared));
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setStatus(
            caught instanceof Error ? caught.message : "工程档读取失败。",
          );
        }
      });
    setPrompt(String(item.meta.generation_prompt || ""));
    setSkeletonVersion(String(item.meta.skeleton_version || ""));
    setEngineApiVersion(String(item.meta.engine_api_version || ""));
    return () => {
      cancelled = true;
    };
  }, [item]);

  const hostedSrc = useMemo(() => {
    if (typeof window === "undefined") return "";
    return computeGameIdeHostedEmbedSrc({
      embedBase: gameIdeHostedEmbedBase(),
      instanceId,
      hostOrigin: hostOriginNow(),
      assetTitle: item.title,
    });
  }, [instanceId, item.title]);

  const applyMode = useCallback(
    (next: EditorMode) => {
      const planned = applyGameNextMode(instanceId, next);
      setMode(planned.mode);
      if (!planned.showHostedEditor) {
        setReady(false);
        hostedSessionRef.current = false;
      }
    },
    [instanceId],
  );

  useEffect(() => {
    if (!applied.showHostedEditor || !ready || hostedSessionRef.current) return;
    const frame = iframeRef.current?.contentWindow || null;
    if (!frame || !sourceRef.current.trim()) return;
    try {
      hostedSessionRef.current = true;
      postGameIdeImport(
        frame,
        instanceId,
        buildGameIdeImportEnvelope(instanceId, {
          source: sourceRef.current,
          title: item.title,
        }),
      );
    } catch (caught) {
      setStatus(
        caught instanceof Error ? caught.message : "没法把源码送进专业模式。",
      );
    }
  }, [applied.showHostedEditor, instanceId, item.title, ready]);

  const bump = useCallback(() => {
    setEditRevision((value) => value + 1);
    setDirty(true);
  }, []);

  const runControl = useCallback((action: "run" | "stop" | "reload") => {
    setPlayback((current) => planGamePreviewControl(current, action));
  }, []);

  const agentPort = useMemo<GameAgentEditorPort>(
    () => ({
      source: () => sourceRef.current,
      revision: () => revisionRef.current,
      writeSource: (next) => {
        setSource(next);
        bump();
      },
      params: () => paramsRef.current,
      writeParams: (next) => {
        const declared = readGameParamDeclarations({ paramDeclarations: next });
        setParamDeclarations(declared);
        if (declared) setParamValues(resolveGameParamValues(declared));
        bump();
      },
    }),
    [bump],
  );

  usePluginCommandSurface(
    useMemo(() => createGameAgentSurface(agentPort), [agentPort]),
  );

  const onCodeSelect = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      const node = event.currentTarget;
      const start = node.selectionStart ?? 0;
      const end = node.selectionEnd ?? 0;
      const picked =
        end > start ? node.value.slice(start, end) : node.value.slice(0, 400);
      publishAgentSelection({
        kind: end > start ? "game-code" : "game-document",
        id: "game-source",
        summary: picked.slice(0, 500),
        editorId: "game",
      });
    },
    [],
  );

  const exportFromPro = useCallback(() => {
    const frame = iframeRef.current?.contentWindow || null;
    postGameIdeExportRequest(
      frame,
      instanceId,
      `game-export-${Date.now().toString(36)}`,
    );
  }, [instanceId]);

  const flush = useCallback(async () => {
    if (!inspection.publishable) {
      return {
        ok: false as const,
        error: inspection.issues[0]
          ? `这份草稿现在不能保存：${inspection.issues.join("，")}。`
          : "这份草稿现在不能保存。",
      };
    }
    if (origin !== "ai" && origin !== "remix") {
      return { ok: false as const, error: "产物来源不合法，拒绝提交 revision。" };
    }
    const cover = coverOf(item);
    const saved = await saveGameDraft(
      {
        source,
        origin,
        prompt,
        skeletonVersion,
        engineApiVersion,
        paramDeclarations,
        editedBy: applied.showHostedEditor ? "microstudio-pro" : "code-editor",
        title: item.title || "game",
      },
      {
        uploadJson: async (json, fileName, seed) => {
          const file = new File([json], fileName, { type: "application/json" });
          const uploaded = await uploadFile(file, {
            siteId,
            idempotencyKey: `game-draft:${seed}:${String(item.id).slice(-80)}`,
          });
          if (!uploaded.ok) {
            throw new Error(uploaded.error || "上传失败");
          }
          const url = uploaded.data?.file?.url || "";
          const digest = String(
            uploaded.data?.file?.meta?.content_digest ||
              uploaded.data?.file?.meta?.sha256 ||
              (await sha256Text(json)),
          ).replace(/^sha256:/, "");
          return { url, digest };
        },
        commit: async (input) => {
          if (!isDurableLibraryItem(item)) {
            return advancedSavedItem(item, {
              url: input.envelopeUrl,
              versionId: input.envelopeDigest,
              meta: {
                editor: GAME_EDITOR_CAPABILITY,
                editor_project_schema: GAME_DOCUMENT_SOURCE_FORMAT,
              },
            });
          }
          if (!cover.url || !cover.digest) {
            throw new Error(
              "缺少封面位图（preview rendition），游戏 revision 无法保存。",
            );
          }
          return commitAdvancedSavedRevision(item, {
            publish: createArtifactRevision,
            commit: {
              source: {
                format: GAME_DOCUMENT_SOURCE_FORMAT,
                url: input.envelopeUrl,
                digest: input.envelopeDigest,
              },
              renditions: [
                {
                  purpose: "full",
                  url: input.envelopeUrl,
                  digest: input.envelopeDigest,
                },
                {
                  purpose: "preview",
                  url: cover.url,
                  digest: cover.digest,
                },
                {
                  purpose: "editor_manifest",
                  url: input.manifestUrl,
                  digest: input.manifestDigest,
                },
              ],
              provenance: {
                origin,
                prompt,
                engineApiVersion,
                skeletonVersion,
                editor: GAME_EDITOR_CAPABILITY,
                editorProjectSchema: GAME_DOCUMENT_SOURCE_FORMAT,
                previousRevisionId: item.revisionId,
              },
            },
            meta: {
              generation_prompt: prompt,
              engine_api_version: engineApiVersion,
              skeleton_version: skeletonVersion,
              editor_project_schema: GAME_DOCUMENT_SOURCE_FORMAT,
              cover_stale: true,
              chips: chipsManifest.chips.map((chip) => chip.id).join(","),
            },
          });
        },
      },
    );
    if (!saved.ok) return { ok: false as const, error: saved.error };
    setDirty(false);
    return { ok: true as const, item: saved.item };
  }, [
    applied.showHostedEditor,
    chipsManifest.chips,
    engineApiVersion,
    inspection.issues,
    inspection.publishable,
    item,
    origin,
    paramDeclarations,
    prompt,
    siteId,
    skeletonVersion,
    source,
  ]);

  const showHosted = applied.showHostedEditor && Boolean(hostedSrc);
  const paramEntries = paramDeclarations
    ? Object.entries(paramDeclarations)
    : [];

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "game",
        label: editorToolLabel({ type: "game" }),
        mode: { current: mode, setMode: applyMode },
        toolbox: {
          label: "运行",
          icon: "code",
          content: (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="game-run"
                  onClick={() => runControl("run")}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--awb-on-accent,#fff)]"
                  style={{ background: accent }}
                >
                  运行
                </button>
                <button
                  type="button"
                  data-testid="game-stop"
                  onClick={() => runControl("stop")}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  停止
                </button>
                <button
                  type="button"
                  data-testid="game-reload"
                  onClick={() => runControl("reload")}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  重载
                </button>
              </div>
              {paramEntries.length > 0 ? (
                <div data-testid="game-param-panel" className="flex flex-col gap-2">
                  {paramEntries.map(([name, declaration]) => (
                    <label key={name} className="flex items-center gap-2 text-xs">
                      <span className="w-20 truncate">{declaration.label}</span>
                      <input
                        type="range"
                        data-testid={`game-param-${name}`}
                        min={declaration.min}
                        max={declaration.max}
                        step={declaration.step}
                        value={paramValues[name] ?? declaration.default}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setParamValues((current) => ({
                            ...current,
                            [name]: next,
                          }));
                        }}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              {applied.showHostedEditor ? (
                <button
                  type="button"
                  data-testid="game-pro-export"
                  onClick={exportFromPro}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  从专业模式导出
                </button>
              ) : null}
            </div>
          ),
        },
        actions: [],
        stage: (
          <div
            className="flex h-full min-h-0 flex-col"
            {...{ [GAME_NEXT_STAGE_ATTR]: "true" }}
            {...{ [GAME_NEXT_MODE_ATTR]: mode }}
            data-game-preview-paused={String(playback.paused)}
            data-game-preview-reload={String(playback.reloadKey)}
          >
            {showHosted ? (
              <GameHostedFrame
                instanceId={instanceId}
                hostOrigin={hostOriginNow()}
                src={hostedSrc}
                title="microStudio"
                iframeRef={iframeRef}
                onReady={() => setReady(true)}
                onExport={(next) => {
                  setSource(next);
                  bump();
                  setStatus("专业模式的导出已写进草稿，还没保存。");
                }}
                onError={setStatus}
              />
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
                <textarea
                  data-testid="game-code-editor"
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value);
                    bump();
                  }}
                  onSelect={onCodeSelect}
                  spellCheck={false}
                  className="h-full min-h-[240px] resize-none border-r bg-[var(--card,#fff)] p-3 font-mono text-xs"
                />
                <div data-testid="game-preview-slot" className="min-h-[240px]">
                  {PreviewHost ? (
                    <PreviewHost
                      artifactId={item.artifactId || ""}
                      revisionId={item.revisionId || ""}
                      envelopeUrl={envelopeUrlOf(item)}
                      bundleFormat="html"
                      engineApiVersion={engineApiVersion}
                      title={item.title}
                      paused={playback.paused}
                      reloadKey={playback.reloadKey}
                      paramDeclarations={paramDeclarations || undefined}
                      paramValues={paramValues}
                      onRuntimeError={setStatus}
                    />
                  ) : (
                    <div
                      role="alert"
                      className="grid h-full place-items-center p-8 text-center text-sm"
                    >
                      可玩预览需要宿主站注册沙箱容器（registerGamePreviewHost）。
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ),
        status:
          status ||
          (!hostedSrc && applied.showHostedEditor
            ? "托管地址未放行"
            : inspection.publishable
              ? ""
              : inspection.issues
                  .map((issue) => issue)
                  .join("，")),
        persistence: {
          dirty,
          editRevision,
          flush,
          recovery: {
            key: advancedRecoveryKey("game", item),
            ready: true,
            capture: () => ({ source, origin, playback }),
            restore: (payload) => {
              const next = payload as { source?: string; origin?: string } | null;
              if (!next?.source) return false;
              setSource(next.source);
              if (next.origin) setOrigin(next.origin);
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
