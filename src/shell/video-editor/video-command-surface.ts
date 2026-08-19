/**
 * 视频时间线的指令面（合同 §3.1，editorId = 编辑栏适配器 id `video-timeline`）。
 *
 * agent 能剪掉一段、删某个片段、插入一段素材、调某片段的音量与速度、跳转、导出。
 * 时间一律用毫秒；片段用 `state()` 里报出来的 id 指定，不许靠「当前选中」猜。
 */

import type { PluginCommandSurfaceInput } from "../plugin-command/types";
import {
  createVisualCommandSurface,
  fail,
  ok,
  type VisualCommandDefinition,
} from "../media-editors/visual-command-kit";
import { visualDownloadFormats } from "../media-editors/visual-formats";
import type { VideoTimelineState } from "./use-video-timeline";

const EDITOR_ID = "video-timeline";
const MAX_TIMELINE_MS = 6 * 60 * 60 * 1000;

export interface VideoCommandDeps {
  editor: VideoTimelineState;
  /** 由路由提供：mp4 直接渲染，webm 渲染后再转一道。 */
  deliver: (format: string) => Promise<void>;
}

function clipEntries(editor: VideoTimelineState) {
  return editor.doc.tracks.flatMap((track) =>
    track.clips.map((clip) => ({
      id: clip.id,
      kind: track.kind,
      startMs: clip.start_ms,
      durationMs: clip.duration_ms,
      volume: clip.volume ?? 1,
      speed: clip.speed ?? 1,
      text: clip.text ? clip.text.slice(0, 30) : "",
    })),
  );
}

export function videoCommandDefinitions(
  deps: VideoCommandDeps,
): VisualCommandDefinition[] {
  const { editor } = deps;
  // 源没验过就不许下指令：空回退工程上的每一步都是白干。
  if (editor.loadingSource || !editor.sourceReady) return [];
  const revision = () => editor.editRevision;
  const clips = clipEntries(editor);
  const clipEnum = clips.slice(0, 40).map((clip) => ({
    value: clip.id,
    label: `${clip.kind} ${Math.round(clip.startMs / 100) / 10}s${
      clip.text ? `「${clip.text}」` : ""
    }`,
  }));
  const definitions: VisualCommandDefinition[] = [];

  definitions.push({
    spec: {
      id: "video-timeline.cut-range",
      label: "剪掉一段时间",
      summary: "把这段时间从所有轨道上剪掉，后面的内容左移接上。",
      mutates: true,
      params: [
        {
          key: "startMs",
          label: "开始（毫秒）",
          type: "number",
          required: true,
        },
        {
          key: "endMs",
          label: "结束（毫秒）",
          type: "number",
          required: true,
          hint: `当前总长 ${editor.durationMs} 毫秒`,
        },
      ],
    },
    bounds: {
      startMs: { min: 0, max: MAX_TIMELINE_MS, integer: true },
      endMs: { min: 0, max: MAX_TIMELINE_MS, integer: true },
    },
    run: (params) => {
      const startMs = Number(params.startMs);
      const endMs = Number(params.endMs);
      if (Math.abs(endMs - startMs) < 100) {
        return fail("要剪掉的这段不足 100 毫秒，太短了。");
      }
      if (!editor.cutRange(startMs, endMs)) {
        return fail(
          editor.error || "这一段没有剪掉：范围内没有内容，或者剩下的片段太碎。",
        );
      }
      return ok(`已剪掉 ${startMs}–${endMs} 毫秒。`, revision());
    },
  });

  if (clipEnum.length) {
    definitions.push({
      spec: {
        id: "video-timeline.delete-clip",
        label: "删掉一个片段",
        summary: "把指定的片段从时间线上去掉，其他片段位置不动。",
        mutates: true,
        params: [
          {
            key: "clipId",
            label: "片段",
            type: "enum",
            required: true,
            enumValues: clipEnum,
          },
        ],
      },
      run: (params) => {
        if (!editor.deleteClip(String(params.clipId))) {
          return fail(editor.error || "没找到这个片段，可能已经被删掉了。");
        }
        return ok(`已删掉片段 ${String(params.clipId)}。`, revision());
      },
    });

    definitions.push({
      spec: {
        id: "video-timeline.set-clip-volume",
        label: "调片段音量",
        summary: "按百分比调整某个片段的音量，100 是原样。",
        mutates: true,
        params: [
          {
            key: "clipId",
            label: "片段",
            type: "enum",
            required: true,
            enumValues: clipEnum,
          },
          {
            key: "percent",
            label: "音量百分比",
            type: "number",
            required: true,
            hint: "0 到 200，100 是原样",
          },
        ],
      },
      bounds: { percent: { min: 0, max: 200 } },
      run: (params) => {
        const clipId = String(params.clipId);
        if (!clips.some((clip) => clip.id === clipId)) {
          return fail("没找到这个片段。");
        }
        const percent = Number(params.percent);
        editor.patchClip(clipId, {
          volume: percent / 100,
          muted: percent === 0,
        });
        return ok(`片段音量已调到 ${percent}%。`, revision());
      },
    });

    definitions.push({
      spec: {
        id: "video-timeline.set-clip-speed",
        label: "调片段速度",
        summary: "把某个片段放快或放慢，时间线上的时长会跟着变。",
        mutates: true,
        params: [
          {
            key: "clipId",
            label: "片段",
            type: "enum",
            required: true,
            enumValues: clipEnum,
          },
          {
            key: "speed",
            label: "倍速",
            type: "number",
            required: true,
            hint: "0.25 到 4，1 是原速",
          },
        ],
      },
      bounds: { speed: { min: 0.25, max: 4 } },
      run: (params) => {
        const clipId = String(params.clipId);
        if (!clips.some((clip) => clip.id === clipId)) {
          return fail("没找到这个片段。");
        }
        editor.setClipSpeed(clipId, Number(params.speed));
        return ok(`片段已改成 ${Number(params.speed)} 倍速。`, revision());
      },
    });
  }

  definitions.push({
    spec: {
      id: "video-timeline.insert-media",
      label: "插入一段素材",
      summary: "把一个视频、音频或图片按地址插到时间线上。",
      mutates: true,
      params: [
        {
          key: "url",
          label: "素材地址",
          type: "string",
          required: true,
          hint: "我的库或站内的文件地址",
        },
        {
          key: "atMs",
          label: "插入位置（毫秒）",
          type: "number",
          hint: "不填就插在播放头处",
        },
      ],
    },
    bounds: {
      url: { maxLength: 2000, nonEmpty: true },
      atMs: { min: 0, max: MAX_TIMELINE_MS, integer: true },
    },
    run: async (params) => {
      const url = String(params.url).trim();
      if (!/^https?:\/\//i.test(url)) {
        return fail("素材地址要以 http:// 或 https:// 开头。");
      }
      const at =
        typeof params.atMs === "number" ? Number(params.atMs) : editor.playheadMs;
      try {
        await editor.addMediaUrl(url, at);
      } catch (caught) {
        return fail(
          caught instanceof Error && caught.message.trim()
            ? caught.message.trim()
            : "这段素材没能插进来。",
        );
      }
      if (editor.error) return fail(editor.error);
      return ok(`已在 ${at} 毫秒处插入素材。`, revision());
    },
  });

  definitions.push({
    spec: {
      id: "video-timeline.seek",
      label: "跳到某个时间",
      summary: "把播放头移到指定毫秒；不改时间线本身。",
      mutates: false,
      params: [
        {
          key: "atMs",
          label: "位置（毫秒）",
          type: "number",
          required: true,
          hint: `0 到 ${editor.durationMs}`,
        },
      ],
    },
    bounds: { atMs: { min: 0, max: MAX_TIMELINE_MS, integer: true } },
    run: (params) => {
      editor.seek(Number(params.atMs));
      return ok(`播放头已移到 ${Number(params.atMs)} 毫秒。`);
    },
  });

  if (!editor.exporting) {
    definitions.push({
      spec: {
        id: "video-timeline.export",
        label: "导出视频",
        summary: "按选定格式渲染并交付；渲染要花一会儿，不改时间线本身。",
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
    });
  }

  return definitions;
}

export function videoCommandState(
  editor: VideoTimelineState,
): Record<string, unknown> {
  const clips = clipEntries(editor);
  return {
    editor: "视频时间线",
    durationMs: editor.durationMs,
    playheadMs: editor.playheadMs,
    playing: editor.playing,
    canvas: {
      width: editor.doc.width,
      height: editor.doc.height,
      fps: editor.doc.fps,
    },
    trackCount: editor.doc.tracks.length,
    clipCount: clips.length,
    // 片段可能很多；只报前 12 个，agent 要更多可以先剪短或按轨道问。
    clips: clips.slice(0, 12),
    selectedClipId: editor.selectedClipId,
    exporting: editor.exporting,
    sourceReady: editor.sourceReady,
    unsaved: editor.dirty,
  };
}

export function createVideoCommandSurface(
  deps: VideoCommandDeps,
): PluginCommandSurfaceInput {
  return createVisualCommandSurface({
    editorId: EDITOR_ID,
    commands: () => videoCommandDefinitions(deps),
    state: () => videoCommandState(deps.editor),
  });
}
