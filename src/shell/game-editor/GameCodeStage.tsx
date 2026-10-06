"use client";

/**
 * 游戏 Code 页：代码编辑器 + 沙箱预览 + 运行/停止/重载 + 参数面板。
 * 专业编辑不可用。agent 改源码的唯一入口是 `createGameAgentSurface`（默认送审）。
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
import type { AdvancedEditorPagesAdapter } from "../plugin-chrome/plugin-pages";
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
} from "./game-next-mode";
import {
  GAME_PREVIEW_INITIAL,
  planGamePreviewControl,
  type GamePreviewPlayback,
} from "./game-preview-controls";
import { useGamePreviewHost } from "./preview-host";
import { gameModeUnavailable, gamePagesAdapter } from "./game-pages";
import { useUI } from "../../i18n/ui/useUI";
import { useImEnabled } from "../../lib/im/client";
import {
  bindTextarea,
  useCollabReadOnly,
  useCollabRoom,
  useCollabRoomVersion,
  useCollabSaveGate,
} from "../collab";
import { GAME_MAIN_PAGE, gameTextName } from "../collab/adapters/game";
import { fetchRevisionJson } from "../collab/adapters/use-entity-collab";
import {
  GAME_WORKING_DOCUMENT_SCHEMA,
  asGameWorkingDocument,
  peekGameWorkingDocument,
  stashGameWorkingDocument,
} from "../advanced-routes/GameRoute";

const GAME_EDITOR_CAPABILITY = "game-editor";
const EMPTY_DOC =
  "<!doctype html><html><body><script></script></body></html>";
/** 本端对共享代码文本的程序性写入（agent 改源码、外部版本）的事务来源；bindTextarea 把它当远端处理，会同步到文本框。 */
const GAME_EXTERNAL_ORIGIN = "oceanleo-game-external";
const SAFE_PEER_COLOR = /^(#[0-9a-f]{3,8}|hsl\([\d\s.,%]+\))$/i;

interface PeerLine {
  id: string;
  name: string;
  color: string;
  line: number;
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

function workingDocumentFromCode(
  item: AdvancedContentWorkbenchProps["item"],
  fields: {
    source: string;
    origin: string;
    prompt: string;
    skeletonVersion: string;
    engineApiVersion: string;
    paramDeclarations: GameParamDeclarations | null;
  },
) {
  const cover = coverOf(item);
  return {
    envelopeUrl: envelopeUrlOf(item),
    envelopeDigest: isDurableLibraryItem(item)
      ? String(
          (item.artifact.renditions.full || item.artifact.renditions.source)
            ?.digest || "local",
        )
      : String(item.meta.envelope_digest || item.revisionId || "local"),
    bundleFormat: "html" as const,
    coverUrl: cover.url,
    coverDigest: cover.digest,
    manifestUrl: isDurableLibraryItem(item)
      ? String(item.artifact.renditions.editor_manifest?.url || "")
      : "",
    manifestDigest: isDurableLibraryItem(item)
      ? String(item.artifact.renditions.editor_manifest?.digest || "")
      : "",
    engineApiVersion: fields.engineApiVersion,
    skeletonVersion: fields.skeletonVersion,
    prompt: fields.prompt,
    origin: (fields.origin === "remix" ? "remix" : "ai") as "ai" | "remix",
    source: fields.source,
    paramDeclarations: fields.paramDeclarations,
  };
}

export function GameCodeStage({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
  pages,
}: AdvancedContentWorkbenchProps & {
  pages?: AdvancedEditorPagesAdapter;
}) {
  const tt = useUI();
  const [source, setSource] = useState(EMPTY_DOC);
  const [sourceReady, setSourceReady] = useState(false);
  const [codeEl, setCodeEl] = useState<HTMLTextAreaElement | null>(null);
  const [peerLines, setPeerLines] = useState<PeerLine[]>([]);
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
  const chipsManifest = useMemo(() => gameToolsManifestChips(), []);
  const PreviewHost = useGamePreviewHost();
  const inspection = useMemo(() => inspectGameDraft(source), [source]);
  const chromePages =
    pages ??
    gamePagesAdapter("code", () => {});

  const sourceRef = useRef(source);
  sourceRef.current = source;

  // ---- 多人同改（W14）：代码是共享的 Y.Text，逐字合并；一页（main）。
  const imOn = useImEnabled();
  const room = useCollabRoom({
    resource: item.artifactId ? { kind: "artifact", id: item.artifactId } : null,
    editorKind: "game",
    enabled: imOn,
  });
  const collabReadOnly = useCollabReadOnly(room);
  const saveGate = useCollabSaveGate(room);
  useCollabRoomVersion(room);
  const synced = room?.status === "synced";
  const roomRef = useRef(room);
  roomRef.current = room;
  const boundRef = useRef(false);
  const readOnlyRef = useRef(collabReadOnly);
  readOnlyRef.current = collabReadOnly;
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
    setSourceReady(false);
    const stashed = peekGameWorkingDocument(item);
    if (stashed?.source?.trim()) {
      setSource(stashed.source);
      setSourceReady(true);
      if (stashed.origin) setOrigin(stashed.origin);
      if (typeof stashed.prompt === "string") setPrompt(stashed.prompt);
      if (typeof stashed.skeletonVersion === "string") {
        setSkeletonVersion(stashed.skeletonVersion);
      }
      if (typeof stashed.engineApiVersion === "string") {
        setEngineApiVersion(stashed.engineApiVersion);
      }
      if (stashed.paramDeclarations !== undefined) {
        const declared = readGameParamDeclarations({
          paramDeclarations: stashed.paramDeclarations,
        });
        setParamDeclarations(declared);
        if (declared) setParamValues(resolveGameParamValues(declared));
      }
      return;
    }
    const url = envelopeUrlOf(item);
    const inline =
      typeof item.meta.game_source === "string" ? item.meta.game_source : "";
    if (inline.trim()) {
      setSource(inline);
      setSourceReady(true);
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
    if (!url) {
      setSourceReady(true);
      return;
    }
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
        setSourceReady(true);
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

  const bump = useCallback(() => {
    setEditRevision((value) => value + 1);
    setDirty(true);
  }, []);

  /** 程序性改源码（agent、外部版本）：把差异写进共享文本，所有人同时看到。 */
  const writeThrough = useCallback((next: string) => {
    const current = roomRef.current;
    if (!current || !boundRef.current || readOnlyRef.current) return;
    const ytext = current.doc.getText(gameTextName(GAME_MAIN_PAGE));
    const before = ytext.toString();
    if (before === next) return;
    let head = 0;
    const max = Math.min(before.length, next.length);
    while (head < max && before.charCodeAt(head) === next.charCodeAt(head)) head += 1;
    let tail = 0;
    while (
      tail < max - head &&
      before.charCodeAt(before.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
    ) {
      tail += 1;
    }
    current.doc.transact(() => {
      const removed = before.length - head - tail;
      if (removed > 0) ytext.delete(head, removed);
      const inserted = next.slice(head, next.length - tail);
      if (inserted) ytext.insert(head, inserted);
    }, GAME_EXTERNAL_ORIGIN);
  }, []);

  // 绑定文本框：等房间同步、本端源码载入完。绑定后远端的字会直接进文本框，这里再把它同步回 React 状态。
  useEffect(() => {
    if (!room || !codeEl || !synced || !sourceReady) return undefined;
    const textName = gameTextName(GAME_MAIN_PAGE);
    const ytext = room.doc.getText(textName);
    const binding = bindTextarea(room, textName, codeEl);
    boundRef.current = true;
    const pull = () => {
      const text = ytext.toString();
      if (text === sourceRef.current) return;
      setSource(text);
      bump();
    };
    // 初次：房间里已有代码就以房间为准；房间里还是空的（别人正在种）就不把本地盖掉。
    if (ytext.length > 0) pull();
    ytext.observe(pull);
    return () => {
      boundRef.current = false;
      ytext.unobserve(pull);
      binding.destroy();
    };
  }, [room, codeEl, synced, sourceReady, bump]);

  // 外部版本（AI 或别人另存的新版）：取来写进共享文本，标记已保存。
  useEffect(() => {
    if (!room) return undefined;
    return room.onExternalRevision((revisionId) => {
      void fetchRevisionJson(String(item.artifactId || ""), revisionId, (found) => envelopeUrlOf(found))
        .then((json) => {
          if (!json) return;
          const read = readGameEnvelope(json);
          if (!read.ok) return;
          writeThrough(read.envelope.source);
          setSource(read.envelope.source);
          setDirty(false);
          room.markSaved(revisionId);
        })
        .catch(() => undefined);
    });
  }, [room, item.artifactId, writeThrough]);

  // 别人的光标所在行（颜色是他们自己的）。
  useEffect(() => {
    if (!room) {
      setPeerLines([]);
      return undefined;
    }
    const awareness = room.awareness;
    const compute = () => {
      const out: PeerLine[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = (state as { user?: { name?: unknown; color?: unknown } }).user;
        const selection = (state as { selection?: { line?: unknown } }).selection;
        if (!user || !selection || typeof selection.line !== "number") return;
        const color = typeof user.color === "string" && SAFE_PEER_COLOR.test(user.color) ? user.color : "#6b7280";
        out.push({
          id: String(clientId),
          name: String(user.name ?? "").slice(0, 40),
          color,
          line: Math.max(1, Math.floor(selection.line)),
        });
      });
      setPeerLines(out);
    };
    compute();
    awareness.on("change", compute);
    return () => {
      awareness.off("change", compute);
    };
  }, [room]);

  useEffect(() => {
    stashGameWorkingDocument(
      item,
      workingDocumentFromCode(item, {
        source,
        origin,
        prompt,
        skeletonVersion,
        engineApiVersion,
        paramDeclarations,
      }),
    );
  }, [
    engineApiVersion,
    item,
    origin,
    paramDeclarations,
    prompt,
    skeletonVersion,
    source,
  ]);

  const runControl = useCallback((action: "run" | "stop" | "reload") => {
    setPlayback((current) => planGamePreviewControl(current, action));
  }, []);

  const agentPort = useMemo<GameAgentEditorPort>(
    () => ({
      source: () => sourceRef.current,
      revision: () => revisionRef.current,
      writeSource: (next) => {
        writeThrough(next);
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
    [bump, writeThrough],
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
      const line = node.value.slice(0, start).split("\n").length;
      roomRef.current?.awareness.setLocalStateField("selection", {
        page: GAME_MAIN_PAGE,
        start,
        end,
        line,
      });
      publishAgentSelection({
        kind: end > start ? "game-code" : "game-document",
        id: "game-source",
        summary: picked.slice(0, 500),
        editorId: "game",
      });
    },
    [],
  );

  const flush = useCallback(async () => {
    // 协同房间里只有存档人落库；其余端的字已经在房间里。
    if (room && (!saveGate || collabReadOnly)) return { ok: true as const, item };
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
        editedBy: "code-editor",
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
    if (room && saved.item.revisionId) room.markSaved(String(saved.item.revisionId));
    stashGameWorkingDocument(
      saved.item,
      workingDocumentFromCode(saved.item, {
        source,
        origin,
        prompt,
        skeletonVersion,
        engineApiVersion,
        paramDeclarations,
      }),
    );
    return { ok: true as const, item: saved.item };
  }, [
    chipsManifest.chips,
    engineApiVersion,
    inspection.issues,
    inspection.publishable,
    item,
    origin,
    paramDeclarations,
    prompt,
    room,
    saveGate,
    collabReadOnly,
    siteId,
    skeletonVersion,
    source,
  ]);

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
        collab: item.artifactId
          ? { room, artifact: { id: item.artifactId, title: item.title || "", editorKind: "game" } }
          : undefined,
        id: "game",
        label: editorToolLabel({ type: "game" }),
        mode: gameModeUnavailable(),
        pages: chromePages,
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
            </div>
          ),
        },
        actions: [],
        stage: (
          <div
            className="flex h-full min-h-0 flex-col"
            {...{ [GAME_NEXT_STAGE_ATTR]: "true" }}
            {...{ [GAME_NEXT_MODE_ATTR]: "normal" }}
            data-game-preview-paused={String(playback.paused)}
            data-game-preview-reload={String(playback.reloadKey)}
          >
            {status ? (
              <div
                role="alert"
                data-game-ide-notice="true"
                className="border-b border-[var(--awb-danger-line,#fecdd3)] bg-[var(--awb-danger-soft,#fff1f2)] px-3 py-1.5 text-[12px] leading-4 text-[var(--awb-danger,#be123c)]"
              >
                {status}
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
              <div className="flex min-h-0 flex-col border-r">
                <textarea
                  ref={setCodeEl}
                  data-testid="game-code-editor"
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value);
                    bump();
                  }}
                  onSelect={onCodeSelect}
                  spellCheck={false}
                  className="min-h-[240px] flex-1 resize-none bg-[var(--card,#fff)] p-3 font-mono text-xs"
                />
                {peerLines.length > 0 ? (
                  <div
                    data-testid="game-peer-lines"
                    className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-1 text-[11px] leading-4"
                  >
                    {peerLines.map((peer) => (
                      <span key={peer.id} className="inline-flex items-center gap-1">
                        <span
                          aria-hidden="true"
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: peer.color }}
                        />
                        {tt("{name} 在第 {n} 行", { name: peer.name, n: peer.line })}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
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
          </div>
        ),
        status:
          status ||
          (inspection.publishable
            ? ""
            : inspection.issues.map((issue) => issue).join("，")),
        persistence: {
          dirty: saveGate && !collabReadOnly ? dirty : false,
          editRevision,
          autoSave: saveGate && !collabReadOnly,
          flush,
          recovery: {
            draftSchema: GAME_WORKING_DOCUMENT_SCHEMA,
            key: advancedRecoveryKey("game", item),
            ready: true,
            capture: () => {
              const working = workingDocumentFromCode(item, {
                source,
                origin,
                prompt,
                skeletonVersion,
                engineApiVersion,
                paramDeclarations,
              });
              stashGameWorkingDocument(item, working);
              return working;
            },
            restore: (payload) => {
              const next = asGameWorkingDocument(payload);
              if (!next?.source && !next?.envelopeUrl) return false;
              if (next.source) {
                writeThrough(next.source);
                setSource(next.source);
              }
              if (next.origin) setOrigin(next.origin);
              if (typeof next.prompt === "string") setPrompt(next.prompt);
              if (typeof next.skeletonVersion === "string") {
                setSkeletonVersion(next.skeletonVersion);
              }
              if (typeof next.engineApiVersion === "string") {
                setEngineApiVersion(next.engineApiVersion);
              }
              if (next.paramDeclarations !== undefined) {
                const declared = readGameParamDeclarations({
                  paramDeclarations: next.paramDeclarations,
                });
                setParamDeclarations(declared);
                if (declared) setParamValues(resolveGameParamValues(declared));
              }
              stashGameWorkingDocument(item, next);
              bump();
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
