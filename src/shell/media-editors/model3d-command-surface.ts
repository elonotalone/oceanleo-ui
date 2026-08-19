/**
 * 3D 编辑器的指令面（合同 §3.1，editorId = 编辑栏适配器 id `threed`）。
 *
 * agent 能换视角、缩放、开关自转、切换动画、导出 GLB 与截图，并且能问一句
 * 「现在能打开什么格式」。
 *
 * **格式能力是照实报的**：今天只认 GLB 与 glTF 2.x。obj / stl / fbx 能不能转成
 * GLB 还没有人证过（合同 §1 的 `[待核]`，W10 在证），在它落盘之前这里不假设能转，
 * 也不给用户「传上来试试」的暗示。
 */

import type { PluginCommandSurfaceInput } from "../plugin-command/types";
import type { Model3DWorkbenchState } from "./model3d-workbench-state";
import {
  createVisualCommandSurface,
  fail,
  ok,
  type VisualCommandDefinition,
} from "./visual-command-kit";
import { visualDownloadFormats, visualImportPlan } from "./visual-formats";

const EDITOR_ID = "threed";

/** 今天真能打开的 3D 源格式。 */
export const MODEL3D_OPENABLE_FORMATS: readonly string[] = ["glb", "gltf"];

/** 常被问到、但今天打不开的格式。 */
export const MODEL3D_PROBED_FORMATS: readonly string[] = [
  "obj",
  "stl",
  "fbx",
  "dae",
  "ply",
  "3ds",
  "usdz",
  "blend",
];

export interface Model3DFormatReport {
  openable: readonly string[];
  blocked: { format: string; reason: string }[];
}

/** 能力探测：谁能开、谁不能开、不能开的原因是什么。 */
export function model3dFormatReport(): Model3DFormatReport {
  return {
    openable: MODEL3D_OPENABLE_FORMATS,
    blocked: MODEL3D_PROBED_FORMATS.map((format) => ({
      format,
      reason:
        visualImportPlan(EDITOR_ID, `probe.${format}`).message ||
        `打不开 .${format}。`,
    })),
  };
}

export interface Model3DCommandDeps {
  editor: Model3DWorkbenchState;
  /** 由路由提供：glb 是模型本体，png 是当前视角截图。 */
  deliver: (format: string) => Promise<void>;
}

export function model3dCommandDefinitions(
  deps: Model3DCommandDeps,
): VisualCommandDefinition[] {
  const { editor } = deps;
  const revision = () => editor.editRevision;
  const definitions: VisualCommandDefinition[] = [];

  definitions.push({
    spec: {
      id: "threed.describe-formats",
      label: "能打开哪些模型格式",
      summary: "照实报出今天能打开的 3D 格式，以及打不开的那些为什么打不开。",
      mutates: false,
    },
    run: () => {
      const report = model3dFormatReport();
      return ok(
        `现在能打开：${report.openable
          .map((format) => `.${format}`)
          .join("、")}。打不开：${report.blocked
          .map((entry) => `.${entry.format}`)
          .join("、")}——这些格式还没有可用的转换通道，请先在建模软件里导出 GLB。`,
      );
    },
  });

  if (!editor.modelLoaded) return definitions;

  const busy = editor.downloading || editor.capturing || editor.saving;

  definitions.push({
    spec: {
      id: "threed.set-view",
      label: "换视角",
      summary: "把相机转到指定的水平角与俯仰角。",
      mutates: true,
      params: [
        {
          key: "azimuth",
          label: "水平角（度）",
          type: "number",
          required: true,
          hint: "-360 到 360",
        },
        {
          key: "elevation",
          label: "俯仰角（度）",
          type: "number",
          required: true,
          hint: "-89 到 89",
        },
      ],
    },
    bounds: {
      azimuth: { min: -360, max: 360 },
      elevation: { min: -89, max: 89 },
    },
    run: (params) => {
      editor.setOrbit(Number(params.azimuth), Number(params.elevation));
      return ok(
        `视角已转到 ${Number(params.azimuth)}° / ${Number(params.elevation)}°。`,
        revision(),
      );
    },
  });

  definitions.push({
    spec: {
      id: "threed.zoom",
      label: "拉近或拉远",
      summary: "按百分比设置相机距离，100 是默认距离。",
      mutates: true,
      params: [
        {
          key: "percent",
          label: "距离百分比",
          type: "number",
          required: true,
          hint: "20 到 500",
        },
      ],
    },
    bounds: { percent: { min: 20, max: 500 } },
    run: (params) => {
      editor.setZoom(Number(params.percent));
      return ok(`相机距离已设为 ${Number(params.percent)}%。`, revision());
    },
  });

  definitions.push({
    spec: {
      id: "threed.reset-camera",
      label: "回到默认视角",
      summary: "把相机复位到刚打开模型时的角度和距离。",
      mutates: true,
    },
    run: () => {
      editor.resetCamera();
      return ok("相机已回到默认视角。", revision());
    },
  });

  definitions.push({
    spec: {
      id: "threed.set-auto-rotate",
      label: "开关自动旋转",
      summary: "让模型自己慢慢转，或者停下来。",
      mutates: true,
      params: [
        {
          key: "enabled",
          label: "自动旋转",
          type: "boolean",
          required: true,
        },
      ],
    },
    run: (params) => {
      editor.setAutoRotate(params.enabled === true);
      return ok(
        params.enabled === true ? "已开始自动旋转。" : "已停止自动旋转。",
        revision(),
      );
    },
  });

  if (editor.animations.length) {
    definitions.push({
      spec: {
        id: "threed.play-animation",
        label: "播放某个动画",
        summary: "切换到模型自带的某段动画并播放。",
        mutates: true,
        params: [
          {
            key: "name",
            label: "动画",
            type: "enum",
            required: true,
            enumValues: editor.animations.slice(0, 30).map((name) => ({
              value: name,
              label: name,
            })),
          },
        ],
      },
      run: (params) => {
        editor.selectAnimation(String(params.name));
        editor.setAnimationPlaying(true);
        return ok(`已播放动画「${String(params.name)}」。`, revision());
      },
    });
  }

  definitions.push({
    spec: {
      id: "threed.export",
      label: "导出",
      summary: "把改完的模型或当前视角的截图下载下来；不改模型本身。",
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
      if (busy) return fail("上一次导出还没结束，请等它完成。");
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

  return definitions;
}

export function model3dCommandState(
  editor: Model3DWorkbenchState,
): Record<string, unknown> {
  return {
    editor: "3D 模型",
    modelLoaded: editor.modelLoaded,
    sourceFormat: editor.sourceFormat || "",
    openableFormats: MODEL3D_OPENABLE_FORMATS,
    azimuth: Math.round(editor.azimuth),
    elevation: Math.round(editor.elevation),
    zoomPercent: Math.round(editor.zoom),
    autoRotate: editor.autoRotate,
    background: editor.background,
    animations: editor.animations.slice(0, 12),
    animationPlaying: editor.animationPlaying,
    nodeCount: editor.sceneNodes.length,
    materialCount: editor.materials.length,
    annotationCount: editor.annotations.length,
    unsaved: editor.dirty,
    loading: editor.loading,
  };
}

export function createModel3DCommandSurface(
  deps: Model3DCommandDeps,
): PluginCommandSurfaceInput {
  return createVisualCommandSurface({
    editorId: EDITOR_ID,
    commands: () => model3dCommandDefinitions(deps),
    state: () => model3dCommandState(deps.editor),
  });
}
