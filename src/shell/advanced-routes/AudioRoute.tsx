"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { resolveEditorCore } from "../editor-core-flags";
import { usePluginMode } from "../plugin-chrome/plugin-mode";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { usePluginCommandSurface } from "../plugin-command";
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
import { AudioContextToolbar } from "../media-editors/AudioContextToolbar";
import {
  AudioControls,
  AudioStage,
  useAudioWorkbench,
} from "../media-editors/AudioWorkbench";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

/**
 * 新核舞台的懒加载入口。
 *
 * `import()` 的字面量必须写在这一层：它是打包器切 chunk 的唯一依据。
 * `ssr: false` 是硬要求——waveform-playlist 碰 AudioContext / canvas。
 */
const AudioPlaylistStage = dynamic(
  () =>
    import("../media-editors/AudioPlaylistStage").then(
      (module) => module.AudioPlaylistStage,
    ),
  { ssr: false, loading: () => null },
);

/**
 * 双核分发口。flag 只在这里判一次，判完各走各的组件。
 *
 * 默认 `legacy`（`_COMMON.md` §10 第 3 条）。验收绿之后才翻 flag，
 * 删除旧核要单独成一个 commit，message 以 core-swap:delete 开头。
 */
export function AudioRoute(props: AdvancedContentWorkbenchProps) {
  if (resolveEditorCore("audio") === "next") {
    return <AudioPlaylistStage {...props} />;
  }
  return <AudioLegacyGate {...props} />;
}

function AudioLegacyGate(props: AdvancedContentWorkbenchProps) {
  const { pro } = usePluginMode("audio");
  if (pro) return <AudioPlaylistStage {...props} />;
  return <AudioLegacyRoute {...props} />;
}

function AudioLegacyRoute({
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
  /** wav 本地出；mp3 / m4a 拿同一份 wav 去后端转一道再下载。 */
  const deliver = useCallback(
    async (format: string) => {
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
    [editor.importSource],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  usePluginCommandSurface(
    useMemo(
      () => createAudioCommandSurface({ editor, deliver }),
      [deliver, editor],
    ),
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
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
  }, [editor.save, item]);
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
        id: "audio",
        label: editorToolLabel({ type: "audio" }),
        toolbox: {
          label: "音轨工具",
          icon: "timeline",
          content: <AudioControls editor={editor} accent={accent} />,
        },
        contextToolbar: (
          <AudioContextToolbar editor={editor} accent={accent} />
        ),
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
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
          onTrigger: editor.download,
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
        upload: {
          accept: visualUploadAccept("audio"),
          onFiles: importLocalAudio,
        },
        stage: <AudioStage editor={editor} accent={accent} />,
        status:
          editor.error ||
          deliverNotice ||
          (editor.loading ? "正在载入音频" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("audio", item),
            ready: !editor.loading,
            capture: editor.captureRecovery,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
