"use client";

// 视频画布交给内建 AI 抽屉的那一面：右边现在是什么样、现在能做什么、怎么做。
//
// 改造前这条线是断的。视频画布自己包了一层 CanvasAgentPanel 挂普通面板，
// 面板内容取的是契约里的 PluginAgentPanel——而那个面板的上下文来源**固定**是
// plugin-command 的模块级单例 `currentPluginCommandSurface()`，本仓从来没有向它
// 注册过任何东西（开工时全仓对 plugin-command 零命中）。于是抽屉里的 agent
// 既不知道选中了哪个节点，也没有一条能执行的画布指令：它只能聊天。
//
// 所以「拆掉第二套」不等于「保住原有能力」——原有能力压根没接上。这个文件是
// 第一次真的接上：把节点上下文与画布命令集通过 frame 契约的扩展点
// （`usePluginCommandSurface`）交给那个唯一的内建抽屉。
//
// 两条纪律：
//   1. **只报当前真的能执行的指令。** describe() 每次调用都过一遍
//      `workflow.availability()`，不可用的不出现在清单里。摆一个必然报错的指令
//      比不摆更糟——agent 会照着清单下手，然后撞校验失败、看不懂为什么。
//   2. **id 前缀逐字等于 editorId。** 注册表硬校验 `id.startsWith("video-canvas.")`
//      （registry.ts:95），前缀对不上整条指令被静默丢掉。所以对外一律
//      `video-canvas.*`，内部映射到既有的 `canvas.*` commandId，不新造执行路径。

import { usePluginCommandSurface } from "../../plugin-command";
import { useMemo } from "react";
import {
  NODE_MENU_CAPABILITIES,
  NODE_MENU_ENTRY_IDS,
  type NodeMenuEntryId,
} from "./command-registry";
import { projectHead } from "./project-model";
import type { useCanvasWorkflow } from "./use-canvas-workflow";

type CanvasWorkflow = ReturnType<typeof useCanvasWorkflow>;

/** agent 会话分区与指令面身份共用这一个字面量，和 frame 的 pluginId 一致。 */
export const CANVAS_AGENT_EDITOR_ID = "video-canvas";

/** agent 会话的站点分区。第二套传的是这个值，删它时不许把分区一起弄丢。 */
export const CANVAS_AGENT_SITE_ID = "video";

/** 现状摘要里最多列几个节点。注册表 4096 字节的上限会整键丢弃，先自己收着。 */
const CONTEXT_NODE_LIMIT = 40;

/** 摘要里的长文本截到这么长：agent 要的是认出它，不是读全文。 */
const CONTEXT_TEXT_LIMIT = 160;

type ParamType = "string" | "number" | "boolean" | "enum";

interface SurfaceParam {
  key: string;
  label: string;
  type: ParamType;
  required?: boolean;
  hint?: string;
  enumValues?: { value: string; label: string }[];
}

interface SurfaceSpec {
  id: string;
  label: string;
  summary: string;
  mutates: boolean;
  params?: SurfaceParam[];
  /** 内部 commandId；`null` 表示这条指令不走 CANVAS_COMMAND_REGISTRY。 */
  commandId: string | null;
  /** 查可用性时喂给 availability() 的参数（多数指令要读选中节点）。 */
  availabilityArgs?: (workflow: CanvasWorkflow) => Record<string, unknown>;
}

const CANVAS_VIEW_VALUES: { value: string; label: string }[] = [
  { value: "graph", label: "节点图" },
  { value: "storyboard", label: "分镜" },
  { value: "director", label: "镜头计划（分镜内）" },
  { value: "timeline", label: "时间线" },
  { value: "history", label: "历史" },
];

/** 能创建节点的入口 = 走 canvas.node.create 且当前开放的那几项。 */
function createEntryValues(): { value: string; label: string }[] {
  return NODE_MENU_ENTRY_IDS.filter((entryId) => {
    const capability = NODE_MENU_CAPABILITIES[entryId];
    return capability.commandId === "canvas.node.create" && capability.enabled;
  }).map((entryId) => ({
    value: entryId,
    label: NODE_MENU_CAPABILITIES[entryId].label,
  }));
}

const SPECS: readonly SurfaceSpec[] = [
  {
    id: "video-canvas.node.select",
    label: "选中一个节点",
    summary:
      "把画布选区切到指定节点。选区决定了下面绝大多数指令能不能用，改动前先选对。",
    mutates: false,
    commandId: null,
    params: [
      {
        key: "nodeId",
        label: "节点 id",
        type: "string",
        required: true,
        hint: "取自现状摘要 nodes[].nodeId",
      },
    ],
  },
  {
    id: "video-canvas.node.create",
    label: "新建节点",
    summary: "在画布中央新建一个节点（文本、图像、视频、音频、剧本、合成等）。",
    mutates: true,
    commandId: "canvas.node.create",
    params: [
      {
        key: "entryId",
        label: "节点类型",
        type: "enum",
        required: true,
        enumValues: createEntryValues(),
      },
    ],
    availabilityArgs: () => ({ entryId: "text" }),
  },
  {
    id: "video-canvas.node.field.update",
    label: "改选中节点的一个字段",
    summary:
      "改选中节点的标题、提示词、正文或模型名。每次改动都进不可变的 Project 历史。",
    mutates: true,
    commandId: "canvas.node.field.update",
    params: [
      {
        key: "field",
        label: "字段",
        type: "enum",
        required: true,
        enumValues: [
          { value: "title", label: "标题" },
          { value: "prompt", label: "提示词" },
          { value: "text", label: "正文" },
          { value: "model", label: "模型" },
        ],
      },
      { key: "value", label: "新内容", type: "string", required: true },
    ],
  },
  {
    id: "video-canvas.node.delete",
    label: "删除选中节点",
    summary: "把选中节点从画布上删掉。源 Asset 不受影响，历史可回溯。",
    mutates: true,
    commandId: "canvas.node.delete",
  },
  {
    id: "video-canvas.image.generate",
    label: "为选中节点生成图像",
    summary:
      "按提示词生成一张图，作为新的不可变 Asset 挂到选中的图像节点上。按服务商计费。",
    mutates: true,
    commandId: "canvas.node.generate.image",
    params: [
      {
        key: "prompt",
        label: "提示词",
        type: "string",
        hint: "省略则用节点自己的提示词",
      },
    ],
  },
  {
    id: "video-canvas.script.generate",
    label: "为选中节点生成文字",
    summary: "按提示词生成剧本或文本，写进选中节点的下一个 Project 版本。按服务商计费。",
    mutates: true,
    commandId: "canvas.node.generate.script",
    params: [
      {
        key: "prompt",
        label: "提示词",
        type: "string",
        hint: "省略则用节点自己的提示词或正文",
      },
    ],
  },
  {
    id: "video-canvas.video.generate",
    label: "为选中节点生成视频",
    summary:
      "提交一次 Durable 视频 Run。这条是异步的：提交成功不等于片子已经出来。按服务商计费。",
    mutates: true,
    commandId: "canvas.node.generate.video",
    params: [
      {
        key: "prompt",
        label: "提示词",
        type: "string",
        hint: "省略则用节点自己的提示词",
      },
    ],
  },
  {
    id: "video-canvas.script.structure",
    label: "把剧本拆成场景与镜头",
    summary: "读选中的剧本/文本节点，拆出场景与镜头，并切到分镜视图。不计费。",
    mutates: true,
    commandId: "canvas.script.structure",
  },
  {
    id: "video-canvas.director.camera-plan",
    label: "为镜头做机位方案",
    summary: "给镜头加一台 35mm 机位与推轨路径，并在分镜卡片里显示。不计费。",
    mutates: true,
    commandId: "canvas.director.camera-plan.create",
  },
  {
    id: "video-canvas.timeline.build-approved",
    label: "用通过的镜次搭时间线",
    summary: "把已通过的镜次按顺序摆上时间线，并切到时间线视图。不计费。",
    mutates: true,
    commandId: "canvas.timeline.build-approved",
  },
  {
    id: "video-canvas.timeline.final-render",
    label: "成片渲染",
    summary: "对当前时间线发起一次成片渲染。按服务商计费，过程可取消。",
    mutates: true,
    commandId: "canvas.timeline.final-render",
  },
  {
    id: "video-canvas.project.continuity-qc",
    label: "连贯性自查",
    summary: "检查场景、镜头、镜次之间的连贯性问题，出一份报告。不计费。",
    mutates: true,
    commandId: "canvas.project.continuity-qc.check",
  },
  {
    id: "video-canvas.view.set",
    label: "切换视图",
    summary: "在节点图、分镜、时间线、历史之间切换。只换看法，不改内容。",
    mutates: false,
    commandId: "canvas.session.view.set",
    params: [
      {
        key: "view",
        label: "视图",
        type: "enum",
        required: true,
        enumValues: CANVAS_VIEW_VALUES,
      },
    ],
    availabilityArgs: () => ({ view: "graph" }),
  },
  {
    id: "video-canvas.image-mode.set",
    label: "切换图像模式",
    summary: "选中图像节点时，在「修图」与「生成」之间切换。只换模式，不提交指令。",
    mutates: false,
    commandId: "canvas.session.image-mode.set",
    params: [
      {
        key: "mode",
        label: "模式",
        type: "enum",
        required: true,
        enumValues: [
          { value: "retouch", label: "修图" },
          { value: "generate", label: "生成" },
        ],
      },
    ],
    availabilityArgs: () => ({ mode: "retouch" }),
  },
  {
    id: "video-canvas.material-library.open",
    label: "打开素材库",
    summary: "在左侧打开共享素材库。插入与替换仍然是有历史的指令操作。",
    mutates: false,
    commandId: "canvas.panel.material-library.open",
  },
  {
    id: "video-canvas.project.save",
    label: "保存快照",
    summary: "把当前 Project 存成一个快照版本。未注入执行通道时只写回陈列馆文档。",
    mutates: true,
    commandId: "canvas.project.save",
  },
];

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.slice(0, CONTEXT_TEXT_LIMIT) : "";
}

/**
 * 「右边现在是什么样」。
 *
 * 只报 agent 用得上、且能靠它下一步决策的东西：选中了什么、画布上有什么、
 * 处在哪个视图、存没存、执行通道通不通。**执行降级要明说**——不说的话
 * agent 会一直劝用户点那些生成指令，而它们此刻一条都跑不通。
 */
function canvasAgentState(workflow: CanvasWorkflow): Record<string, unknown> {
  const head = projectHead(workflow.project);
  const nodes = head.graph.nodes;
  const selected = workflow.selectedNode;
  const latestRun = workflow.project.durable?.runs.at(-1);
  return {
    projectId: workflow.project.projectId,
    title: trimmed(workflow.project.title),
    revision: head.revision,
    view: workflow.workspaceView,
    imageMode: workflow.imageMode,
    dirty: workflow.dirty,
    saving: workflow.saving,
    // 诚实告知：没接执行通道时所有服务端指令都跑不通，别让 agent 白劝。
    executionDegraded: workflow.executionDegraded,
    nodeCount: nodes.length,
    edgeCount: head.graph.edges.length,
    sceneCount: head.scenes.length,
    shotCount: head.shots.length,
    approvedTakeCount: head.takes.filter((take) => take.status === "approved")
      .length,
    timelineCount: head.timelines.length,
    selected: selected
      ? {
          nodeId: selected.nodeId,
          kind: selected.kind,
          title: trimmed(selected.title),
          prompt: trimmed(selected.prompt),
          text: trimmed(selected.text),
          ratio: selected.ratio || "",
          durationSeconds: selected.durationSeconds ?? null,
          hasAsset: Boolean(selected.assetId),
        }
      : null,
    nodes: nodes.slice(0, CONTEXT_NODE_LIMIT).map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      title: trimmed(node.title),
    })),
    nodesTruncated: nodes.length > CONTEXT_NODE_LIMIT,
    latestRun: latestRun
      ? { runId: latestRun.runId, status: latestRun.status }
      : null,
  };
}

/** 一条指令此刻能不能用。不走注册表的（选区切换）自己判。 */
function specEnabled(workflow: CanvasWorkflow, spec: SurfaceSpec): boolean {
  if (!spec.commandId) {
    return projectHead(workflow.project).graph.nodes.length > 0;
  }
  const args = spec.availabilityArgs
    ? spec.availabilityArgs(workflow)
    : { prompt: workflow.selectedNode?.prompt || workflow.selectedNode?.text || "" };
  return workflow.availability(spec.commandId, args).enabled;
}

function describeCanvasCommands(workflow: CanvasWorkflow) {
  return SPECS.filter((spec) => specEnabled(workflow, spec)).map((spec) => ({
    id: spec.id,
    label: spec.label,
    summary: spec.summary,
    mutates: spec.mutates,
    ...(spec.params ? { params: spec.params } : {}),
  }));
}

async function runCanvasCommand(
  workflow: CanvasWorkflow,
  id: string,
  params: Record<string, unknown> | undefined,
): Promise<{ ok: boolean; message: string; revision?: number }> {
  const spec = SPECS.find((entry) => entry.id === id);
  if (!spec) {
    return { ok: false, message: "视频画布没有这条指令。" };
  }
  const args = params || {};

  // 选区切换不经命令注册表：选中哪个节点是会话状态，和点一下节点是同一件事，
  // 没有版本要记。走注册表反而会为每次「看一眼」生成一条收据。
  if (!spec.commandId) {
    const nodeId = String(args.nodeId || "").trim();
    const exists = projectHead(workflow.project).graph.nodes.some(
      (node) => node.nodeId === nodeId,
    );
    if (!exists) {
      return { ok: false, message: `画布上没有 ${nodeId} 这个节点。` };
    }
    workflow.onNodeClick(nodeId);
    return { ok: true, message: "已切到那个节点。" };
  }

  // 生成类指令省略提示词时，用节点自己的——和用户按面板按钮走的是同一条路。
  const forwarded: Record<string, unknown> = { ...args };
  if (
    spec.commandId.startsWith("canvas.node.generate.") &&
    !String(forwarded.prompt || "").trim()
  ) {
    forwarded.prompt =
      workflow.selectedNode?.prompt || workflow.selectedNode?.text || "";
  }

  const result = await workflow.dispatchCommand(
    spec.commandId,
    forwarded,
    "protocol",
  );
  const ok = result.status === "succeeded" || result.status === "accepted";
  return {
    ok,
    message:
      result.message ||
      (ok ? "已完成。" : `这条指令没能执行（${result.status}）。`),
  };
}

/**
 * 把视频画布的领域面挂到 frame 内建 AI 抽屉上。
 *
 * 注册的是 `editorId: "video-canvas"`，与 frame 的 `pluginId` 逐字相同——
 * 抽屉、指令面、会话分区认的是同一个身份，不再各持一份。
 */
export function useCanvasAgentSurface(workflow: CanvasWorkflow): void {
  const surface = useMemo(
    () => ({
      editorId: CANVAS_AGENT_EDITOR_ID,
      describe: () => describeCanvasCommands(workflow),
      state: () => canvasAgentState(workflow),
      run: (id: string, params?: Record<string, unknown>) =>
        runCanvasCommand(workflow, id, params),
    }),
    [workflow],
  );
  usePluginCommandSurface(surface);
}

/** 测试用：不经 React 也能拿到同一套 describe/state/run。 */
export function createCanvasAgentSurface(workflow: CanvasWorkflow) {
  return {
    editorId: CANVAS_AGENT_EDITOR_ID,
    describe: () => describeCanvasCommands(workflow),
    state: () => canvasAgentState(workflow),
    run: (id: string, params?: Record<string, unknown>) =>
      runCanvasCommand(workflow, id, params),
  };
}
