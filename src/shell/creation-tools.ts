import type { SelectionControl } from "./selection-context-types";

/** Creation is a separate semantic domain; these are never formatting canon ids. */
export const CREATION_TOOL_LABELS = {
  highlight: "高亮", underline: "下划线", strikeout: "删除线", check: "打勾", cross: "打叉",
  text: "加文字", signature: "签名", ink: "画笔", note: "便签", find: "查找",
  select: "选择", templates: "模板", elements: "元素", image: "图片", shape: "形状",
  line: "线条", draw: "绘画", table: "表格", pages: "页面", materials: "素材库",
  effects: "效果", layers: "图层", audio: "音频", video: "视频", model: "模型",
  properties: "属性", action: "操作",
} as const;
export type CreationToolId = keyof typeof CREATION_TOOL_LABELS;

export interface AdvancedEditorCreationTool {
  id: string;
  tool: CreationToolId;
  label?: string;
  value?: boolean;
  disabled?: boolean;
  unavailableReason?: string;
  execute?: (anchor?: HTMLElement) => void;
  panelId?: string;
  panelAction?: SelectionControl["panelAction"];
}

export function creationToolControl(tool: AdvancedEditorCreationTool, tt: (label: string) => string = (label) => label): SelectionControl {
  return {
    id: tool.id, domain: "creation", creationTool: tool.tool,
    kind: tool.panelId ? "panel" : typeof tool.value === "boolean" ? "toggle" : "action",
    label: tt(tool.label || CREATION_TOOL_LABELS[tool.tool]),
    iconOnly: true, group: "creation", placement: "primary",
    ...(tool.value !== undefined ? { value: tool.value } : {}),
    ...(tool.disabled ? { disabled: true } : {}),
    ...(tool.unavailableReason ? { unavailableReason: tool.unavailableReason } : {}),
    ...(tool.panelId ? { panelId: tool.panelId, panelAction: tool.panelAction } : {}),
  };
}

/** Drawer icons describe creation tools, never selection formatting. */
export function creationToolForIcon(icon: string | undefined): CreationToolId {
  if (icon && Object.hasOwn(CREATION_TOOL_LABELS, icon)) return icon as CreationToolId;
  const aliases: Record<string, CreationToolId> = {
    search: "find", "check-mark": "check", "cross-mark": "cross", strike: "strikeout",
    background: "properties", color: "properties", font: "text", "font-size": "text",
  };
  return aliases[icon || ""] || "action";
}
