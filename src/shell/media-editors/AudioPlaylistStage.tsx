"use client";

/**
 * 音频新核叶子。flag=`next` 时由 AudioRoute 经 dynamic(..., { ssr: false }) 拉起。
 *
 * L0 adapter.mode（默认 normal）
 * L1/L2 现有 edit bar 控件接 waveform-playlist ee
 * L3 专业模式才挂 AudioMass iframe
 * L4 chips + review-proposal（只造消息）+ 转写稿「按文字剪」
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { uploadFile } from "../../lib/database";
import { saveFileToLibrary } from "../doc-editors/doc-io";
import { editorToolLabel } from "../workbench-routes";
import { usePluginCommandSurface } from "../plugin-command";
import { createVisualCommandSurface, fail, ok } from "./visual-command-kit";
import {
  DEFAULT_EDITOR_MODE,
  type EditorMode,
} from "../hosted-editor/index";
import { applyAudioOperation, encodeWav } from "./audio-workbench-utils";
import {
  AUDIO_LEGACY_READONLY_NOTICE,
  AUDIO_NEXT_PROJECT_SCHEMA,
  inspectAudioProject,
  nextAudioConversionState,
  planAudioLegacyConversion,
  type AudioConversionState,
} from "./audio-next-conversion";
import {
  AUDIO_AGENT_CHIPS,
  buildAudioReviewProposal,
  audioToolsManifestChips,
} from "./audio-next-l4-chips";
import {
  AUDIO_NEXT_MODE_ATTR,
  AUDIO_NEXT_STAGE_ATTR,
  applyAudioNextMode,
} from "./audio-next-mode";
import {
  base64ToBytes,
  bytesToBase64,
  buildAudioEmbedUrl,
  buildAudioInitEnvelope,
} from "./audio-hosted-embed";
import {
  AudioHostedFrame,
  postAudioInit,
  postAudioSaveRequest,
  postAudioSetMode,
} from "./AudioHostedFrame";
import { AudioPlaylistToolbar } from "./AudioPlaylistToolbar";
import { AudioTranscriptPanel } from "./AudioTranscriptPanel";
import {
  runAudioPlaylistCommand,
  type AudioPlaylistPort,
  type AudioPlaylistSelection,
} from "./audio-playlist-engine";
import { mountWaveformPlaylist } from "./audio-playlist-mount";
import {
  cutPlanForSentence,
  pollBailianAsr,
  sentencesFromAsrStatus,
  submitBailianAsr,
  type AudioTranscriptSentence,
} from "./audio-transcript";

function hostOriginNow(): string {
  if (typeof window === "undefined") return "https://oceanleo.com";
  return window.location.origin || "https://oceanleo.com";
}

async function postGatewayJson(path: string, body: unknown): Promise<unknown> {
  const token = await accessToken();
  if (!token) throw new Error("请先登录再转写。");
  const response = await fetch(`${GATEWAY_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.detail || `转写失败（${response.status}）`));
  }
  return data;
}

export function AudioPlaylistStage({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const instanceId = useRef(
    `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const iframeHolderRef = useRef<HTMLIFrameElement | null>(null);
  const playlistRootRef = useRef<HTMLDivElement | null>(null);
  const portRef = useRef<AudioPlaylistPort | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const [hostedSrc, setHostedSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [selection, setSelection] = useState<AudioPlaylistSelection | null>(null);
  const [fadeDuration, setFadeDuration] = useState(1);
  const [gain, setGain] = useState(100);
  const [duration, setDuration] = useState(0);
  const [editRevision, setEditRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [conversion, setConversion] = useState<AudioConversionState>("converted");
  const [inspectDiffs, setInspectDiffs] = useState<
    { feature: string; reason: string }[]
  >([]);
  const [sentences, setSentences] = useState<AudioTranscriptSentence[]>([]);
  const [transcriptEstimated, setTranscriptEstimated] = useState(false);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");
  const hostedSessionRef = useRef(false);
  const chipsManifest = useMemo(() => audioToolsManifestChips(), []);
  const readonly = conversion === "readonly" || conversion === "converting";
  const applied = applyAudioNextMode(instanceId, mode);

  useEffect(() => {
    try {
      setHostedSrc(
        buildAudioEmbedUrl({
          instanceId,
          hostOrigin: hostOriginNow(),
          assetTitle: item.title,
        }),
      );
    } catch {
      setHostedSrc("");
    }
  }, [instanceId, item.title]);

  useEffect(() => {
    const url = item.url || item.previewUrl || "";
    if (!url) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchMediaBlob(url, { maxBytes: 128 * 1024 * 1024 })
      .then(async (blob) => {
        if (cancelled) return;
        setSourceBlob(blob);
        const ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
        await ctx.close();
        if (cancelled) return;
        bufferRef.current = buffer;
        setDuration(buffer.duration);
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "音频加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const projectUrl = String(item.meta.editor_project_url || "").trim();
    if (projectUrl) {
      void fetch(projectUrl, { cache: "no-store" })
        .then((response) => response.json())
        .then((json) => {
          if (cancelled) return;
          const looked = inspectAudioProject(json);
          if (looked.kind === "legacy") {
            setConversion("readonly");
            setInspectDiffs(looked.differences);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [item]);

  useEffect(() => {
    const root = playlistRootRef.current;
    if (!root || !sourceBlob || applied.showHostedEditor) return;
    let cancelled = false;
    void mountWaveformPlaylist(root, [
      { src: sourceBlob, name: item.title || "track-1" },
    ]).then((port) => {
      if (cancelled) return;
      portRef.current = port;
      setDuration((current) => port.getDuration() || current);
    });
    return () => {
      cancelled = true;
      portRef.current?.emit("clear");
      portRef.current = null;
    };
  }, [applied.showHostedEditor, item.title, sourceBlob]);

  useEffect(() => {
    if (!applied.showHostedEditor) {
      setReady(false);
      hostedSessionRef.current = false;
    }
  }, [applied.showHostedEditor]);

  useEffect(() => {
    if (!applied.showHostedEditor || !ready || hostedSessionRef.current) return;
    const frame = iframeHolderRef.current?.contentWindow || null;
    const buffer = bufferRef.current;
    if (!frame || !buffer) return;
    hostedSessionRef.current = true;
    const wav = encodeWav(buffer);
    void wav.arrayBuffer().then((bytes) => {
      postAudioSetMode(frame, instanceId, "pro");
      postAudioInit(
        frame,
        instanceId,
        buildAudioInitEnvelope(instanceId, {
          audioBase64: bytesToBase64(bytes),
          mime: "audio/wav",
          readOnly: readonly,
          title: item.title,
          trackCount: portRef.current?.trackCount() || 1,
        }),
      );
    });
  }, [applied.showHostedEditor, instanceId, item.title, ready, readonly]);

  const bump = useCallback(() => {
    setEditRevision((value) => value + 1);
    setDirty(true);
  }, []);

  const applyDeleteRange = useCallback(
    async (start: number, end: number) => {
      const source = bufferRef.current;
      if (!source) return false;
      const next = applyAudioOperation(source, { type: "delete", start, end });
      bufferRef.current = next;
      const wav = encodeWav(next);
      setSourceBlob(wav);
      setDuration(next.duration);
      bump();
      return true;
    },
    [bump],
  );

  const runControl = useCallback(
    (id: string, value?: number) => {
      if (id === "fade-duration" && typeof value === "number") {
        setFadeDuration(value);
        return;
      }
      if (id === "gain" && typeof value === "number") {
        setGain(value);
        return;
      }
      const port = portRef.current;
      if (!port) return;
      const params: Record<string, unknown> = {
        duration: fadeDuration,
        percent: gain,
      };
      if (selection) {
        params.startSeconds = selection.start;
        params.endSeconds = selection.end;
      }
      const result = runAudioPlaylistCommand(port, id, params);
      if (result.ok && "action" in result && result.action === "delete-range") {
        void applyDeleteRange(result.start, result.end);
        return;
      }
      if (result.ok) {
        setSelection(port.getTimeSelection());
        bump();
      } else {
        setStatus(result.reason);
      }
    },
    [applyDeleteRange, bump, fadeDuration, gain, selection],
  );

  const applyMode = useCallback(
    (next: EditorMode) => {
      const appliedNext = applyAudioNextMode(instanceId, next);
      setMode(appliedNext.mode);
      const frame = iframeHolderRef.current?.contentWindow || null;
      if (appliedNext.showHostedEditor) {
        postAudioSetMode(frame, instanceId, "pro");
        const buffer = bufferRef.current;
        if (buffer && ready) {
          const wav = encodeWav(buffer);
          void wav.arrayBuffer().then((bytes) => {
            postAudioInit(
              frame,
              instanceId,
              buildAudioInitEnvelope(instanceId, {
                audioBase64: bytesToBase64(bytes),
                mime: "audio/wav",
                readOnly: readonly,
                title: item.title,
                trackCount: portRef.current?.trackCount() || 1,
              }),
            );
          });
        }
      } else {
        postAudioSetMode(frame, instanceId, "normal");
        postAudioSaveRequest(frame, instanceId, `save-${Date.now().toString(36)}`);
      }
    },
    [instanceId, item.title, ready, readonly],
  );

  const convertLegacy = useCallback(() => {
    setConversion((state) => nextAudioConversionState(state, { type: "request" }));
    const projectUrl = String(item.meta.editor_project_url || "").trim();
    if (!projectUrl) {
      setStatus("没有旧工程档可转。");
      setConversion((state) => nextAudioConversionState(state, { type: "reject" }));
      return;
    }
    void fetch(projectUrl, { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        const planned = planAudioLegacyConversion(json);
        if (!planned.ok) {
          setStatus(planned.reason);
          setConversion((state) =>
            nextAudioConversionState(state, { type: "reject" }),
          );
          return;
        }
        setInspectDiffs(planned.dropped);
        setConversion((state) =>
          nextAudioConversionState(state, { type: "resolve" }),
        );
        setStatus(planned.summary);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "转换失败");
        setConversion((state) =>
          nextAudioConversionState(state, { type: "reject" }),
        );
      });
  }, [item.meta.editor_project_url]);

  const save = useCallback(async () => {
    if (readonly) {
      return { ok: false as const, error: AUDIO_LEGACY_READONLY_NOTICE };
    }
    const buffer = bufferRef.current;
    if (!buffer) {
      return { ok: false as const, error: "还没有可保存的音频。" };
    }
    const wav = encodeWav(buffer);
    const file = new File([wav], `${item.title || "audio"}.wav`, {
      type: "audio/wav",
    });
    const saved = await saveFileToLibrary({
      item,
      siteId,
      fallbackSite: "audio",
      title: item.title || "audio",
      createFile: async () => file,
      sourceFormat: "wav",
      sourceMediaType: "audio/wav",
      mediaType: "audio",
      kind: "audio",
      idempotencyKey: `audio-next:${item.id}:${editRevision}`,
      deliveryProjectSchema: AUDIO_NEXT_PROJECT_SCHEMA,
      editorManifest: {
        id: "audio-editor",
        format: AUDIO_NEXT_PROJECT_SCHEMA,
      },
      meta: {
        editor: "audio-next",
        chips: chipsManifest.chips.map((chip) => chip.id).join(","),
      },
      project: {
        schema: AUDIO_NEXT_PROJECT_SCHEMA,
        data: {
          trackCount: portRef.current?.trackCount() || 1,
          chips: chipsManifest.chips.map((chip) => chip.id),
        },
      },
    });
    if (!saved.ok) return { ok: false as const, error: saved.error || "保存失败" };
    return {
      ok: true as const,
      item: advancedSavedItem(item, {
        url: saved.url,
        versionId: saved.versionId,
      }),
    };
  }, [chipsManifest.chips, editRevision, item, readonly, siteId]);

  const transcribe = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer) {
      setTranscriptError("还没有音频可转写。");
      return;
    }
    setTranscriptBusy(true);
    setTranscriptError("");
    try {
      const wav = encodeWav(buffer);
      const uploaded = await uploadFile(
        new File([wav], `${item.title || "audio"}.wav`, { type: "audio/wav" }),
        { siteId, title: item.title || "audio" },
      );
      const fileUrl = String(uploaded.data?.file?.url || "");
      if (!uploaded.ok || !fileUrl) {
        throw new Error(uploaded.error || "转写前没能保存一份音频地址。");
      }
      const submitted = await submitBailianAsr(
        { postJson: postGatewayJson },
        { siteId, fileUrls: [fileUrl] },
      );
      let payload: unknown = { status: "PENDING" };
      for (let attempt = 0; attempt < 24; attempt += 1) {
        payload = await pollBailianAsr(
          { postJson: postGatewayJson },
          submitted.taskId,
        );
        const status = String(
          (payload as { status?: string })?.status || "",
        ).toUpperCase();
        if (status === "SUCCEEDED" || status === "FAILED") break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      const parsed = sentencesFromAsrStatus(payload, buffer.duration);
      setSentences(parsed.sentences);
      setTranscriptEstimated(parsed.estimated);
      if (!parsed.sentences.length) {
        setTranscriptError(parsed.text ? "转写没有切出句子。" : "转写是空的。");
      }
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : "转写失败");
    } finally {
      setTranscriptBusy(false);
    }
  }, [item.title, siteId]);

  const cutSentence = useCallback(
    (sentence: AudioTranscriptSentence) => {
      const plan = cutPlanForSentence(sentence, duration);
      if (!plan) {
        setTranscriptError("这一句对不上时间轴。");
        return;
      }
      void applyDeleteRange(plan.start, plan.end).then(() => {
        setSentences((list) => list.filter((row) => row.id !== sentence.id));
      });
    },
    [applyDeleteRange, duration],
  );

  usePluginCommandSurface(
    useMemo(
      () =>
        createVisualCommandSurface({
          editorId: "audio",
          state: () => ({
            mode,
            conversion,
            revision: editRevision,
            chips: chipsManifest.chips.map((chip) => chip.id),
            chipCount: AUDIO_AGENT_CHIPS.length,
          }),
          commands: () => [
            {
              spec: {
                id: "audio.cut-range",
                label: "剪掉这一段",
                summary: "按起止秒数删除。用户操作直接剪；agent 走审阅。",
                mutates: true,
                params: [
                  {
                    key: "startSeconds",
                    label: "开始（秒）",
                    type: "number",
                    required: true,
                  },
                  {
                    key: "endSeconds",
                    label: "结束（秒）",
                    type: "number",
                    required: true,
                  },
                ],
              },
              run: async (params) => {
                const start = Number(params.startSeconds);
                const end = Number(params.endSeconds);
                const proposal = buildAudioReviewProposal({
                  proposalId: `audio-review-${editRevision}-${start}-${end}`,
                  commandId: "audio.cut-range",
                  revision: editRevision,
                  changes: [
                    {
                      id: `range-${start}-${end}`,
                      label: "删段",
                      before: `${start}s–${end}s 保留`,
                      after: `${start}s–${end}s 将删除`,
                    },
                  ],
                });
                return proposal
                  ? ok("改动已送审阅，接受前不会剪音频。", editRevision)
                  : fail("审阅提案没有通过契约校验，音频未改。");
              },
            },
          ],
        }),
      [chipsManifest.chips, conversion, editRevision, mode],
    ),
  );

  const showHosted = applied.showHostedEditor && Boolean(hostedSrc);

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "audio",
        label: editorToolLabel({ type: "audio" }),
        mode: { current: mode, setMode: applyMode },
        pages: { proLabel: "专业编辑" },
        contextToolbar: (
          <AudioPlaylistToolbar
            selection={selection}
            fadeDuration={fadeDuration}
            gain={gain}
            loading={loading}
            accent={accent}
            disabled={readonly}
            onCommand={runControl}
          />
        ),
        toolbox: {
          label: "转写稿",
          icon: "note",
          content: (
            <AudioTranscriptPanel
              sentences={sentences}
              estimated={transcriptEstimated}
              busy={transcriptBusy}
              error={transcriptError}
              onTranscribe={() => {
                void transcribe();
              }}
              onCutSentence={cutSentence}
            />
          ),
        },
        actions: readonly
          ? [
              {
                id: "audio-convert-legacy",
                label: "转换为新音频工程",
                disabled: conversion === "converting",
                onTrigger: convertLegacy,
              },
            ]
          : [],
        upload: {
          accept: "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac",
          onFiles: async (files) => {
            const file = files[0];
            if (!file || readonly) return;
            const port = portRef.current;
            if (port && port.trackCount() > 0) {
              runAudioPlaylistCommand(port, "add-track", { file });
              bump();
              return;
            }
            setSourceBlob(file);
            const ctx = new AudioContext();
            const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
            await ctx.close();
            bufferRef.current = buffer;
            setDuration(buffer.duration);
            bump();
          },
        },
        stage: (
          <div
            className="flex h-full min-h-0 flex-col"
            {...{ [AUDIO_NEXT_STAGE_ATTR]: "true" }}
            {...{ [AUDIO_NEXT_MODE_ATTR]: mode }}
          >
            {readonly ? (
              <div className="shrink-0 border-b px-4 py-3 text-sm">
                <p className="font-medium">{AUDIO_LEGACY_READONLY_NOTICE}</p>
                <ul className="mt-2 max-h-24 overflow-auto text-xs opacity-80">
                  {inspectDiffs.slice(0, 8).map((entry) => (
                    <li key={`${entry.feature}:${entry.reason}`}>
                      {entry.feature} · {entry.reason}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-2 rounded-md border px-3 py-1 text-xs"
                  onClick={convertLegacy}
                >
                  一键转换为新音频工程
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              {showHosted ? (
                <AudioHostedFrame
                  instanceId={instanceId}
                  hostOrigin={hostOriginNow()}
                  iframeRef={iframeHolderRef}
                  src={hostedSrc}
                  title="AudioMass"
                  onReady={() => setReady(true)}
                  onSnapshot={(payload) => {
                    if (!payload.audioBase64) return;
                    const bytes = base64ToBytes(payload.audioBase64);
                    const copy = new ArrayBuffer(bytes.byteLength);
                    new Uint8Array(copy).set(bytes);
                    const blob = new Blob([copy], {
                      type: payload.mime || "audio/wav",
                    });
                    setSourceBlob(blob);
                    void blob.arrayBuffer().then(async (buffer) => {
                      const ctx = new AudioContext();
                      const decoded = await ctx.decodeAudioData(buffer.slice(0));
                      await ctx.close();
                      bufferRef.current = decoded;
                      setDuration(decoded.duration);
                      bump();
                    });
                  }}
                  onError={setStatus}
                />
              ) : (
                <div
                  ref={playlistRootRef}
                  data-testid="audio-playlist-root"
                  className="playlist h-full min-h-[240px] w-full overflow-auto"
                />
              )}
            </div>
          </div>
        ),
        status:
          status ||
          (readonly ? AUDIO_LEGACY_READONLY_NOTICE : "") ||
          (loading ? "正在载入音频" : "") ||
          (showHosted && !ready ? "正在连接音频专业内核" : ""),
        persistence: {
          dirty,
          editRevision,
          autoSave: !readonly,
          flush: save,
          recovery: {
            key: advancedRecoveryKey("audio", item),
            ready: Boolean(bufferRef.current),
            capture: () => ({ schema: AUDIO_NEXT_PROJECT_SCHEMA, duration }),
            restore: () => false,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
