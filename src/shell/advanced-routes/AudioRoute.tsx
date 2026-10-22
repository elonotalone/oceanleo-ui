"use client";

import { afterAdvancedDraftExport, ensureAdvancedDraftExport } from "../advanced-draft-gates";
import { useCallback, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { usePluginCommandSurface } from "../plugin-command";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import { guardPluginSurface } from "../collab/adapters/visual-readonly";
import { createAudioCommandSurface } from "../media-editors/audio-command-surface";
import {
  convertMediaBlob,
  downloadVisualBlob,
  withExtension,
} from "../media-editors/visual-convert-client";
import { normalizeVisualUploads } from "../media-editors/visual-import-normalize";
import {
  visualDownloadFormats,
  visualUploadAccept,
} from "../media-editors/visual-formats";
import { AudioTranscriptSection } from "../media-editors/AudioTranscriptSection";
import { AudioContextToolbar } from "../media-editors/AudioContextToolbar";
import {
  AudioControls,
  AudioStage,
  useAudioWorkbench,
  type AudioWorkbenchState,
} from "../media-editors/AudioWorkbench";
import { editorToolLabel } from "../workbench-routes";
import { fetchRevisionJson, useEntityCollab } from "../collab/adapters/use-entity-collab";
import {
  AUDIO_ROOT,
  audioFromEntities,
  audioFromRevisionJson,
  audioToEntities,
  type AudioCollabState,
} from "../collab/adapters/audio";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import { audioSourcePersistenceAdmitted } from "./non-richdoc-source-gate";

/** 协同只读时覆盖撤销/重做：不可用且点了不动。 */
const COLLAB_READONLY_HISTORY = {
  canUndo: false,
  canRedo: false,
  undo: () => {},
  redo: () => {},
};

/** 音频编辑器：wavesurfer.js 单一模式，没有 Pro 页。 */
export function AudioRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useAudioWorkbench(item, siteId);
  const [deliverBusy, setDeliverBusy] = useState(false);
  const [deliverNotice, setDeliverNotice] = useState("");
  // ---- 多人同改（W14 / F07）：合并粒度 = 一条编辑操作。对方的改动经 applyRemoteProject 重放上来：
  // 保住选区、播放位置和我自己的撤销栈，不标「未保存」、不触发自动保存；撤销只撤我自己的操作（见 use-entity-collab 的 history）。
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const collabLocal = useMemo(
    () => (editor.loading ? null : (editor.captureRecovery() as AudioCollabState | null)),
    // editRevision 随本端每次编辑递增、contentVersion 随对方改动落地递增；captureRecovery 读的是 ref，所以以它们作为变化信号。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor.loading, editor.editRevision, editor.contentVersion],
  );
  const remotePendingRef = useRef<AudioCollabState | null>(null);
  const remoteRunRef = useRef<Promise<void> | null>(null);
  const applyRemote = useCallback((next: AudioCollabState): Promise<void> => {
    // 重放要重新解码音频，期间到达的新远端状态只留最新一份，做完再接着放。
    remotePendingRef.current = next;
    if (remoteRunRef.current) return remoteRunRef.current;
    const run = (async () => {
      try {
        while (remotePendingRef.current) {
          const target = remotePendingRef.current;
          remotePendingRef.current = null;
          await editorRef.current.applyRemoteProject(target);
        }
      } catch {
        // 重放失败时保持当前画面；下一次远端改动再试。
      } finally {
        remoteRunRef.current = null;
      }
    })();
    remoteRunRef.current = run;
    return run;
  }, []);
  const applyLocal = useCallback(async (next: AudioCollabState): Promise<void> => {
    await editorRef.current.applyLocalProject(next);
  }, []);
  const loadRevision = useCallback(
    async (revisionId: string) => {
      const json = await fetchRevisionJson(String(item.artifactId || ""), revisionId, (found) =>
        String(found.meta.editor_project_url || ""),
      );
      return json ? audioFromRevisionJson(json) : null;
    },
    [item.artifactId],
  );
  const collab = useEntityCollab<AudioCollabState>({
    item,
    editorKind: "audio",
    rootName: AUDIO_ROOT,
    toEntities: audioToEntities,
    fromEntities: (input, prev) => audioFromEntities(input, prev),
    local: collabLocal,
    applyRemote,
    applyLocal,
    loadRevision,
  });
  const collabReadOnly = collab.readOnly;
  // 房间里撤销 / 重做只撤我自己的操作：舞台、工具栏、指令面都拿这份覆盖了历史入口的编辑器视图。
  const view: AudioWorkbenchState = collab.history.active
    ? {
        ...editor,
        undo: collab.history.undo,
        redo: collab.history.redo,
        canUndo: collab.history.canUndo,
        canRedo: collab.history.canRedo,
      }
    : editor;
  /** wav 本地出；mp3 / m4a 拿同一份 wav 去后端转一道再下载。 */
  const deliver = useCallback(
    async (format: string) => {
      if (!await ensureAdvancedDraftExport(item.key || item.id)) return;
      if (format === "wav") {
        editor.download();
        return;
      }
      const source = editor.wavBlob();
      if (!source) throw new Error("音频还没载入，导不出来。");
      setDeliverBusy(true);
      setDeliverNotice(`正在转成 ${format.toUpperCase()}…`);
      try {
        const converted = await convertMediaBlob(
          source,
          withExtension(item.title || "audio", "wav"),
          format,
        );
        downloadVisualBlob(
          converted,
          withExtension(`${item.title || "oceanleo-audio"}-edited`, format),
        );
        setDeliverNotice("");
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message.trim()
            ? caught.message.trim()
            : `转成 ${format.toUpperCase()} 失败。`;
        setDeliverNotice(message);
        throw new Error(message);
      } finally {
        setDeliverBusy(false);
      }
    },
    [editor.download, editor.wavBlob, item.title],
  );
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "audio-materials@2",
      actions: ["replace"],
      accepts: (material) => {
        if (collabReadOnly) return false;
        const url = material.url || material.previewUrl || "";
        return (
          material.kind === "audio" ||
          String(material.meta.mime || "").startsWith("audio/") ||
          /\.(?:mp3|wav|m4a|aac|ogg|flac)(?:$|[?#])/i.test(url)
        );
      },
      mutate: async (_action, material) => {
        const url = material.url || material.previewUrl || "";
        if (!url) throw new Error("这个音频素材没有可用地址。");
        const blob = await fetchMediaBlob(url, {
          maxBytes: 128 * 1024 * 1024,
        });
        const extension =
          url.split(/[?#]/)[0].split(".").pop() || "audio";
        await editor.importSource(
          new File([blob], `${material.title || "audio"}.${extension}`, {
            type: blob.type || "audio/mpeg",
          }),
        );
      },
    }),
    [collabReadOnly, editor.importSource],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  usePluginCommandSurface(
    useMemo(
      () =>
        guardPluginSurface(
          {
            ...createAudioCommandSurface({ editor: view, deliver }),
            target: () => pluginTargetForLibraryItem(
              item, "audio", `${view.editRevision}:${view.contentVersion}`,
            ),
          },
          collabReadOnly,
        ),
      [collabReadOnly, deliver, item, view],
    ),
  );
  const audioAdmitted = audioSourcePersistenceAdmitted({
    loading: editor.loading,
    capture: editor.captureRecovery(),
  });
  const saveBeforeNewConversation = useCallback(async () => {
    // 协同房间里只有存档人落库；其余端的改动已在房间里。
    if (!collab.saveGate || collabReadOnly) return { ok: true as const, item };
    const admitted = audioSourcePersistenceAdmitted({
      loading: editor.loading,
      capture: editor.captureRecovery(),
    });
    if (!admitted.ok) return { ok: false as const, error: admitted.error };
    const saved = await editor.save();
    if (saved?.versionId) collab.markSaved(String(saved.versionId));
    return saved
      ? {
          ok: true as const,
          item: advancedSavedItem(item, {
            url: saved.url,
            versionId: saved.versionId,
            meta: {
              editor_project_url: saved.projectUrl,
              editor_project_schema: saved.projectSchema,
            },
          }),
        }
      : { ok: false as const };
  }, [
    collab.markSaved,
    collab.saveGate,
    collabReadOnly,
    editor.captureRecovery,
    editor.loading,
    editor.save,
    item,
  ]);
  const importLocalAudio = useCallback(
    async (files: File[]) => {
      setDeliverNotice("");
      // flac / ogg / wma 浏览器多半解不了；先在后端转成 mp3 再交给波形解码器。
      const batch = await normalizeVisualUploads(files.slice(0, 1), "audio");
      const file = batch.files[0];
      if (file) await editor.importSource(file);
      setDeliverNotice(batch.notes.join(" "));
    },
    [editor.importSource],
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        collab: collab.collab,
        id: "audio",
        label: editorToolLabel({ type: "audio" }),
        toolbox: {
          label: "音轨工具",
          icon: "timeline",
          content: (
            <>
              <AudioControls editor={view} accent={accent} readOnly={collabReadOnly} />
              <AudioTranscriptSection
                editor={view}
                title={item.title || "audio"}
                siteId={siteId}
                readOnly={collabReadOnly}
              />
            </>
          ),
        },
        contextToolbar: <AudioContextToolbar editor={view} accent={accent} readOnly={collabReadOnly} />,
        history: {
          canUndo: view.canUndo,
          canRedo: view.canRedo,
          undo: view.undo,
          redo: view.redo,
          ...(collabReadOnly ? COLLAB_READONLY_HISTORY : {}),
        },
        viewport: {
          value: Math.round((editor.zoom / 30) * 100),
          min: 33,
          max: 667,
          step: 5,
          setValue: (value) => editor.setWaveformZoom((value / 100) * 30),
          fit: () => editor.setWaveformZoom(30),
        },
        directDownload: {
          id: "audio-download-wav",
          label: visualDownloadFormats("audio")[0].label,
          icon: "download",
          disabled: editor.loading || deliverBusy,
          onTrigger: () => afterAdvancedDraftExport(item.key || item.id, editor.download),
        },
        actions: visualDownloadFormats("audio")
          .slice(1)
          .map((entry) => ({
            id: entry.id,
            label: entry.label,
            icon: "download" as const,
            group: "download" as const,
            busy: deliverBusy,
            busyLabel: "转换中…",
            disabled: editor.loading || deliverBusy,
            onTrigger: () => deliver(entry.format).catch(() => undefined),
          })),
        upload: collabReadOnly
          ? undefined
          : {
              accept: visualUploadAccept("audio"),
              onFiles: importLocalAudio,
            },
        stage: <AudioStage editor={view} accent={accent} />,
        status:
          editor.error ||
          deliverNotice ||
          collab.history.notice ||
          (editor.loading ? "正在载入音频" : ""),
        persistence: {
          dirty:
            audioAdmitted.ok && collab.saveGate && !collabReadOnly
              ? editor.dirty
              : false,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            draftSchema: "oceanleo.audio.edit.v1",
            key: advancedRecoveryKey("audio", item),
            ready: audioAdmitted.ok,
            capture: editor.captureRecovery,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
