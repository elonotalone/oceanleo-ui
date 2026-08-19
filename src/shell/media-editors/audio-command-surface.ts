/**
 * 音频编辑器的指令面（合同 §3.1，editorId = 编辑栏适配器 id `audio`）。
 *
 * agent 能裁掉一段、删掉一段、调音量、加淡入淡出、跳到某个位置、按格式导出。
 * 时间一律用秒，越界的直接拒绝并说清楚当前音频有多长。
 */

import type { PluginCommandSurfaceInput } from "../plugin-command/types";
import type { AudioWorkbenchState } from "./audio-workbench-state";
import {
  createVisualCommandSurface,
  fail,
  ok,
  type VisualCommandDefinition,
} from "./visual-command-kit";
import { visualDownloadFormats } from "./visual-formats";

const EDITOR_ID = "audio";

export interface AudioCommandDeps {
  editor: AudioWorkbenchState;
  /** 由路由提供：wav 本地出，mp3/m4a 走后端转换。 */
  deliver: (format: string) => Promise<void>;
}

export function audioCommandDefinitions(
  deps: AudioCommandDeps,
): VisualCommandDefinition[] {
  const { editor } = deps;
  if (editor.loading || editor.duration <= 0) return [];
  const total = editor.duration;
  const revision = () => editor.editRevision;
  const seconds = (value: number) => Math.round(value * 100) / 100;

  return [
    {
      spec: {
        id: "audio.keep-range",
        label: "只留下这一段",
        summary: "把指定时间段以外的声音全部裁掉。",
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
            hint: `当前音频 ${seconds(total)} 秒`,
          },
        ],
      },
      bounds: {
        startSeconds: { min: 0, max: total },
        endSeconds: { min: 0, max: total },
      },
      run: async (params) => {
        const done = await editor.editRange(
          "crop",
          Number(params.startSeconds),
          Number(params.endSeconds),
        );
        if (!done) return fail(editor.error || "这一段没有裁成。");
        return ok(
          `已只保留 ${seconds(Number(params.startSeconds))}–${seconds(Number(params.endSeconds))} 秒。`,
          revision(),
        );
      },
    },
    {
      spec: {
        id: "audio.cut-range",
        label: "剪掉这一段",
        summary: "把指定时间段的声音删掉，后面的接上来。",
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
            hint: `当前音频 ${seconds(total)} 秒`,
          },
        ],
      },
      bounds: {
        startSeconds: { min: 0, max: total },
        endSeconds: { min: 0, max: total },
      },
      run: async (params) => {
        const done = await editor.editRange(
          "delete",
          Number(params.startSeconds),
          Number(params.endSeconds),
        );
        if (!done) return fail(editor.error || "这一段没有剪掉。");
        return ok(
          `已剪掉 ${seconds(Number(params.startSeconds))}–${seconds(Number(params.endSeconds))} 秒。`,
          revision(),
        );
      },
    },
    {
      spec: {
        id: "audio.set-volume",
        label: "调音量",
        summary: "按百分比放大或减小音量，100 是原样。",
        mutates: true,
        params: [
          {
            key: "percent",
            label: "音量百分比",
            type: "number",
            required: true,
            hint: "10 到 400，100 是原样",
          },
          {
            key: "startSeconds",
            label: "开始（秒）",
            type: "number",
            hint: "不填就是整段",
          },
          {
            key: "endSeconds",
            label: "结束（秒）",
            type: "number",
            hint: "不填就是整段",
          },
        ],
      },
      bounds: {
        percent: { min: 10, max: 400 },
        startSeconds: { min: 0, max: total },
        endSeconds: { min: 0, max: total },
      },
      run: async (params) => {
        const hasRange =
          typeof params.startSeconds === "number" &&
          typeof params.endSeconds === "number";
        const done = await editor.applyGainRange(
          Number(params.percent),
          hasRange
            ? {
                start: Number(params.startSeconds),
                end: Number(params.endSeconds),
              }
            : null,
        );
        if (!done) return fail(editor.error || "音量没有调成。");
        return ok(
          `音量已调到 ${Number(params.percent)}%${hasRange ? "（限定区间）" : ""}。`,
          revision(),
        );
      },
    },
    {
      spec: {
        id: "audio.fade",
        label: "加淡入或淡出",
        summary: "在开头做淡入、或在结尾做淡出，时长用当前设定。",
        mutates: true,
        params: [
          {
            key: "edge",
            label: "位置",
            type: "enum",
            required: true,
            enumValues: [
              { value: "in", label: "开头淡入" },
              { value: "out", label: "结尾淡出" },
            ],
          },
        ],
      },
      run: (params) => {
        editor.applyFade(params.edge === "out" ? "out" : "in");
        return ok(
          params.edge === "out" ? "已加结尾淡出。" : "已加开头淡入。",
          revision(),
        );
      },
    },
    {
      spec: {
        id: "audio.seek",
        label: "跳到某个位置",
        summary: "把播放头移到指定秒数；不改音频本身。",
        mutates: false,
        params: [
          {
            key: "seconds",
            label: "位置（秒）",
            type: "number",
            required: true,
            hint: `0 到 ${seconds(total)}`,
          },
        ],
      },
      bounds: { seconds: { min: 0, max: total } },
      run: (params) => {
        editor.seekTo(Number(params.seconds));
        return ok(`播放头已移到 ${seconds(Number(params.seconds))} 秒。`);
      },
    },
    {
      spec: {
        id: "audio.export",
        label: "导出音频",
        summary: "按选定格式把当前音频下载下来；不改音频本身。",
        mutates: false,
        params: [
          {
            key: "format",
            label: "文件格式",
            type: "enum",
            required: true,
            enumValues: visualDownloadFormats(EDITOR_ID).map((entry) => ({
              value: entry.format,
              label: entry.label,
            })),
          },
        ],
      },
      run: async (params) => {
        try {
          await deps.deliver(String(params.format));
        } catch (caught) {
          return fail(
            caught instanceof Error && caught.message.trim()
              ? caught.message.trim()
              : "导出失败。",
          );
        }
        return ok(`已按 ${String(params.format).toUpperCase()} 导出。`);
      },
    },
  ];
}

export function audioCommandState(
  editor: AudioWorkbenchState,
): Record<string, unknown> {
  return {
    editor: "音频",
    durationSeconds: Math.round(editor.duration * 100) / 100,
    playheadSeconds: Math.round(editor.currentTime * 100) / 100,
    playing: editor.playing,
    selection: editor.selection
      ? {
          startSeconds: Math.round(editor.selection.start * 100) / 100,
          endSeconds: Math.round(editor.selection.end * 100) / 100,
        }
      : null,
    fadeSeconds: editor.fadeDuration,
    gainPercent: editor.gain,
    unsaved: editor.dirty,
    loading: editor.loading,
  };
}

export function createAudioCommandSurface(
  deps: AudioCommandDeps,
): PluginCommandSurfaceInput {
  return createVisualCommandSurface({
    editorId: EDITOR_ID,
    commands: () => audioCommandDefinitions(deps),
    state: () => audioCommandState(deps.editor),
  });
}
