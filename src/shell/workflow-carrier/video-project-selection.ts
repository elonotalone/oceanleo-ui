/**
 * 视频画布选区 → 统一编辑栏（D9）。
 *
 * 节点是「可移动对象」：只出对象组里做得到的规范项（`position` 面板、`lock`、
 * `duplicate`、`delete`），`arrange`（流程图没有层级）和 `animation` 不出。
 * 节点特有的参数（名称 / 文案或提示词 / 时长 / 比例）收进「节点参数」面板，
 * 排在对象组之后，图标用非规范的 `note`。连线只有 `delete`。
 *
 * 命令处理是纯函数：输入文档和选区，返回新文档（进撤销栈）和新选区。
 */
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context-types";
import {
  VIDEO_NODE_DURATION_MAX,
  VIDEO_NODE_RATIOS,
  patchVideoNodeField,
  videoNodeDuration,
  videoNodeLocked,
  videoNodeOffersDuration,
  videoNodeOffersRatio,
  videoNodeRatio,
  videoNodeText,
  videoNodeTextField,
  videoNodeTextLabel,
  type VideoNodeFieldPatch,
} from "./video-project-node-fields";
import {
  VIDEO_DOC_COORDINATE_LIMIT,
  duplicateVideoDocNodes,
  moveVideoDocNodes,
  patchVideoDocNode,
  removeVideoDocElements,
  videoDocGraph,
  type VideoProjectDoc,
} from "./video-project-doc";
import { videoKindSpec } from "./video-canvas-kinds";
import type { VideoCanvasSelection } from "./VideoProjectCanvas";

export const VIDEO_NODE_PARAMS_GROUP = "video-node-params";

type Translate = (text: string, vars?: Record<string, string | number>) => string;

export const EMPTY_VIDEO_SELECTION: VideoCanvasSelection = Object.freeze({
  nodeIds: [],
  edgeIds: [],
}) as VideoCanvasSelection;

/** Drop ids that no longer exist (after undo, delete, external reload). */
export function pruneVideoSelection(
  doc: VideoProjectDoc | null,
  selection: VideoCanvasSelection,
): VideoCanvasSelection {
  if (!doc) return EMPTY_VIDEO_SELECTION;
  const { nodes, edges } = videoDocGraph(doc);
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const edgeIds = new Set(edges.map((edge) => edge.edgeId));
  const keptNodes = selection.nodeIds.filter((id) => nodeIds.has(id));
  const keptEdges = selection.edgeIds.filter((id) => edgeIds.has(id));
  return keptNodes.length === selection.nodeIds.length && keptEdges.length === selection.edgeIds.length
    ? selection
    : { nodeIds: keptNodes, edgeIds: keptEdges };
}

function paramsPanel(tt: Translate) {
  return {
    slot: "inspector" as const,
    inspectorGroup: VIDEO_NODE_PARAMS_GROUP,
    inspectorLabel: tt("节点参数"),
    inspectorIcon: "note" as const,
  };
}

export function videoProjectSelectionContext(
  doc: VideoProjectDoc | null,
  selection: VideoCanvasSelection,
  options: { tt: Translate; readOnly: boolean },
): SelectionContext | null {
  if (!doc) return null;
  const { tt } = options;
  const { nodes } = videoDocGraph(doc);
  const picked = nodes.filter((node) => selection.nodeIds.includes(node.nodeId));
  const edgeCount = selection.edgeIds.length;
  if (!picked.length && !edgeCount) return null;
  const controls: SelectionControl[] = [];
  const single = picked.length === 1 && !edgeCount ? picked[0] : null;
  if (single) {
    const locked = videoNodeLocked(single);
    controls.push(
      {
        id: "position-x",
        kind: "number",
        label: "X",
        value: single.position.x,
        min: -VIDEO_DOC_COORDINATE_LIMIT,
        max: VIDEO_DOC_COORDINATE_LIMIT,
        step: 10,
        slot: "inspector",
        inspectorGroup: "position",
        disabled: locked,
      },
      {
        id: "position-y",
        kind: "number",
        label: "Y",
        value: single.position.y,
        min: -VIDEO_DOC_COORDINATE_LIMIT,
        max: VIDEO_DOC_COORDINATE_LIMIT,
        step: 10,
        slot: "inspector",
        inspectorGroup: "position",
        disabled: locked,
      },
      { id: "lock", kind: "toggle", label: locked ? tt("解锁") : tt("锁定"), value: locked },
    );
  }
  if (picked.length) {
    controls.push({ id: "duplicate", kind: "action", label: tt("复制一份") });
  }
  const anyLocked = picked.some(videoNodeLocked);
  if (!anyLocked) {
    controls.push({ id: "delete", kind: "action", label: tt("删除"), danger: true });
  }
  if (single) {
    controls.push({
      id: "node-title",
      kind: "text",
      label: tt("名称"),
      value: single.title,
      ...paramsPanel(tt),
    });
    const textField = videoNodeTextField(single);
    if (textField) {
      controls.push({
        id: "node-text",
        kind: "text",
        label: tt(videoNodeTextLabel(textField)),
        value: videoNodeText(single),
        ...paramsPanel(tt),
      });
    }
    if (videoNodeOffersDuration(single)) {
      controls.push({
        id: "node-duration",
        kind: "number",
        label: tt("时长（秒）"),
        value: videoNodeDuration(single) ?? 5,
        min: 1,
        max: VIDEO_NODE_DURATION_MAX,
        step: 1,
        ...paramsPanel(tt),
      });
    }
    if (videoNodeOffersRatio(single)) {
      controls.push({
        id: "node-ratio",
        kind: "select",
        label: tt("画面比例"),
        value: videoNodeRatio(single) || "16:9",
        options: VIDEO_NODE_RATIOS.map((ratio) => ({ value: ratio, label: ratio })),
        ...paramsPanel(tt),
      });
    }
  }
  const label = single
    ? single.title || tt(videoKindSpec(single.kind).label)
    : picked.length
      ? tt("{count} 个节点", { count: picked.length })
      : tt("连线");
  const built: SelectionContext = {
    version: 1,
    kind: picked.length ? "workflow-node" : "workflow-edge",
    bar: "object",
    id: `video-canvas:${[...selection.nodeIds, ...selection.edgeIds].join(",")}`,
    label,
    controls,
  };
  if (!options.readOnly) return built;
  return {
    ...built,
    controls: built.controls.map((control) => ({
      ...control,
      disabled: true,
      unavailableReason: tt("只能查看，不能修改"),
    })),
  };
}

export interface VideoSelectionCommandResult {
  doc: VideoProjectDoc;
  selection: VideoCanvasSelection;
}

const FIELD_COMMANDS: Record<string, VideoNodeFieldPatch["field"]> = {
  "node-title": "title",
  "node-text": "text",
  "node-duration": "durationSeconds",
  "node-ratio": "ratio",
};

/**
 * Applies one edit-bar command. Returns null when it changes nothing (preview
 * phases, stale selection, invalid value): the caller records no history entry.
 */
export function applyVideoProjectSelectionCommand(
  doc: VideoProjectDoc,
  selection: VideoCanvasSelection,
  command: Pick<SelectionCommand, "controlId" | "value" | "phase">,
): VideoSelectionCommandResult | null {
  if (command.phase === "start" || command.phase === "update" || command.phase === "cancel") return null;
  const { nodes } = videoDocGraph(doc);
  const picked = nodes.filter((node) => selection.nodeIds.includes(node.nodeId));
  const single = picked.length === 1 && !selection.edgeIds.length ? picked[0] : null;
  const changed = (next: VideoProjectDoc, nextSelection = selection) =>
    next === doc ? null : { doc: next, selection: nextSelection };
  switch (command.controlId) {
    case "delete": {
      if (picked.some(videoNodeLocked)) return null;
      return changed(removeVideoDocElements(doc, selection.nodeIds, selection.edgeIds), EMPTY_VIDEO_SELECTION);
    }
    case "duplicate": {
      const copied = duplicateVideoDocNodes(doc, picked.map((node) => node.nodeId));
      return copied.ids.length ? { doc: copied.doc, selection: { nodeIds: copied.ids, edgeIds: [] } } : null;
    }
    case "lock": {
      if (!single) return null;
      const value = typeof command.value === "boolean" ? command.value : !videoNodeLocked(single);
      return changed(
        patchVideoDocNode(doc, single.nodeId, (node) => patchVideoNodeField(node, { field: "locked", value })),
      );
    }
    case "position-x":
    case "position-y": {
      if (!single || videoNodeLocked(single)) return null;
      const value = Number(command.value);
      if (!Number.isFinite(value)) return null;
      const x = command.controlId === "position-x" ? value : single.position.x;
      const y = command.controlId === "position-y" ? value : single.position.y;
      return changed(moveVideoDocNodes(doc, [{ id: single.nodeId, x, y }]));
    }
  }
  const field = FIELD_COMMANDS[command.controlId];
  if (!field || !single) return null;
  let patch: VideoNodeFieldPatch;
  if (field === "durationSeconds") {
    const value = Number(command.value);
    if (!Number.isFinite(value)) return null;
    patch = { field, value };
  } else {
    if (typeof command.value !== "string") return null;
    patch = { field, value: command.value } as VideoNodeFieldPatch;
  }
  return changed(patchVideoDocNode(doc, single.nodeId, (node) => patchVideoNodeField(node, patch)));
}
