"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import {
  AdvancedWorkbenchShell,
  type EditorPanelDescriptor,
} from "../AdvancedWorkbenchShell";
import type { TopBarModel } from "../advanced-topbar";
import { useUI } from "../../i18n/ui/useUI";
import { AudioContextToolbar } from "../media-editors/AudioContextToolbar";
import {
  AudioControls,
  AudioStage,
  useAudioWorkbench,
} from "../media-editors/AudioWorkbench";
import { editorToolLabel } from "../workbench-routes";

export function AudioRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useAudioWorkbench(item, siteId);
  const savedItem = useMemo(
    () =>
      editor.savedUrl
        ? advancedSavedItem(item, { url: editor.savedUrl })
        : null,
    [editor.savedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.save();
    return url
      ? { ok: true as const, item: advancedSavedItem(item, { url }) }
      : { ok: false as const };
  }, [editor.save, item]);

  // 统一顶栏：撤销/重做 · 播放/停止 · 音频设置面板 —— 收尾区：下载 WAV / 保存到我的库。
  const topBarModel = useMemo<TopBarModel>(
    () => ({
      groups: [
        {
          id: "history",
          actions: [
            {
              kind: "action",
              id: "undo",
              label: tt("撤销"),
              icon: "undo",
              iconOnly: true,
              disabled: !editor.canUndo || editor.loading,
              onRun: editor.undo,
            },
            {
              kind: "action",
              id: "redo",
              label: tt("重做"),
              icon: "redo",
              iconOnly: true,
              disabled: !editor.canRedo || editor.loading,
              onRun: editor.redo,
            },
          ],
        },
        {
          id: "transport",
          actions: [
            {
              kind: "toggle",
              id: "play",
              label: editor.playing ? tt("暂停") : tt("播放"),
              icon: "present",
              active: editor.playing,
              disabled: editor.loading,
              onRun: editor.playPause,
            },
            {
              kind: "action",
              id: "stop",
              label: tt("停止"),
              onRun: editor.stop,
            },
          ],
        },
        {
          id: "settings",
          actions: [
            {
              kind: "panel",
              id: "settings",
              label: tt("音频设置"),
              icon: "volume",
              panelId: "settings",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "download",
          label: tt("下载 WAV"),
          icon: "download",
          iconOnly: true,
          disabled: editor.loading,
          onRun: editor.download,
        },
        {
          kind: "action",
          id: "save",
          label: editor.saving ? tt("保存中…") : tt("保存到我的库"),
          icon: "save",
          disabled: editor.saving || editor.loading,
          onRun: () => void editor.save(),
        },
      ],
    }),
    [
      editor.canRedo,
      editor.canUndo,
      editor.download,
      editor.loading,
      editor.playPause,
      editor.playing,
      editor.redo,
      editor.save,
      editor.saving,
      editor.stop,
      editor.undo,
      tt,
    ],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "settings",
        title: tt("音频设置"),
        width: 300,
        content: <AudioControls editor={editor} accent={accent} />,
      },
    ],
    [accent, editor, tt],
  );

  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "audio" })}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
      editorContextualToolbar={
        <AudioContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<AudioStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        (editor.dirty
          ? "有未保存的修改"
          : editor.savedUrl
          ? "已保存到我的库"
          : editor.loading
            ? "正在载入音频"
            : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
