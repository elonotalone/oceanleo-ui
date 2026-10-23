/**
 * 视频画布 v2 节点的「可编辑参数」：名称、文案/提示词、时长、画面比例、锁定。
 *
 * v2 core 把这些写在节点顶层（`prompt` / `text` / `durationSeconds` / `ratio`），
 * 官方模板写在 `params.*`。读写都按「原来在哪就写回哪」，不搬字段、不改 kind，
 * 所以旧的视频编辑器和官方模板读回来都还是原样。
 */
import type { VideoDocNode } from "./video-project-doc";

type Rec = Record<string, unknown>;

export const VIDEO_NODE_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type VideoNodeRatio = (typeof VIDEO_NODE_RATIOS)[number];
export const VIDEO_NODE_TITLE_LIMIT = 80;
export const VIDEO_NODE_TEXT_LIMIT = 2_000;
export const VIDEO_NODE_DURATION_MAX = 600;

/** 文案类节点编辑 `text`，其余编辑 `prompt`。 */
const TEXT_KINDS = new Set(["prompt", "script", "text", "subtitle"]);
const PROMPT_KINDS = new Set(["generate", "video", "image", "audio", "model"]);
const DURATION_KINDS = new Set(["generate", "video", "audio", "timeline", "delivery"]);
const RATIO_KINDS = new Set(["generate", "video", "image", "delivery", "timeline"]);

function params(node: VideoDocNode): Rec | null {
  const value = node.params;
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** Where a field currently lives; new values go to the top level (v2 core shape). */
function fieldHome(node: VideoDocNode, key: string): "params" | "top" {
  const nested = params(node);
  if (nested && Object.hasOwn(nested, key) && !Object.hasOwn(node, key)) return "params";
  return "top";
}

function readField(node: VideoDocNode, key: string): unknown {
  if (Object.hasOwn(node, key)) return node[key];
  return params(node)?.[key];
}

function writeField(node: VideoDocNode, key: string, value: unknown): VideoDocNode {
  if (readField(node, key) === value) return node;
  if (fieldHome(node, key) === "params") {
    return { ...node, params: { ...params(node), [key]: value } };
  }
  return { ...node, [key]: value };
}

export type VideoNodeTextField = "text" | "prompt";

/** Which free-text field this node offers, or null when it has none. */
export function videoNodeTextField(node: VideoDocNode): VideoNodeTextField | null {
  if (typeof readField(node, "text") === "string" && !PROMPT_KINDS.has(node.kind)) return "text";
  if (typeof readField(node, "prompt") === "string") return "prompt";
  if (TEXT_KINDS.has(node.kind)) return "text";
  if (PROMPT_KINDS.has(node.kind)) return "prompt";
  return null;
}

export function videoNodeTextLabel(field: VideoNodeTextField): string {
  return field === "text" ? "文案" : "提示词";
}

export function videoNodeText(node: VideoDocNode): string {
  const field = videoNodeTextField(node);
  const value = field ? readField(node, field) : "";
  return typeof value === "string" ? value : "";
}

export function videoNodeOffersDuration(node: VideoDocNode): boolean {
  return typeof readField(node, "durationSeconds") === "number" || DURATION_KINDS.has(node.kind);
}

export function videoNodeDuration(node: VideoDocNode): number | null {
  const value = readField(node, "durationSeconds");
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function videoNodeOffersRatio(node: VideoDocNode): boolean {
  return typeof readField(node, "ratio") === "string" || RATIO_KINDS.has(node.kind);
}

export function videoNodeRatio(node: VideoDocNode): VideoNodeRatio | "" {
  const value = readField(node, "ratio");
  return (VIDEO_NODE_RATIOS as readonly unknown[]).includes(value) ? (value as VideoNodeRatio) : "";
}

export function videoNodeLocked(node: VideoDocNode): boolean {
  return node.locked === true;
}

export type VideoNodeFieldPatch =
  | { field: "title"; value: string }
  | { field: "text"; value: string }
  | { field: "durationSeconds"; value: number }
  | { field: "ratio"; value: string }
  | { field: "locked"; value: boolean };

/** Pure patch; returns the same node object when nothing changes or input is invalid. */
export function patchVideoNodeField(node: VideoDocNode, patch: VideoNodeFieldPatch): VideoDocNode {
  switch (patch.field) {
    case "title": {
      const title = patch.value.replace(/\s+/g, " ").trim().slice(0, VIDEO_NODE_TITLE_LIMIT);
      return title === node.title ? node : { ...node, title };
    }
    case "text": {
      const field = videoNodeTextField(node);
      if (!field) return node;
      return writeField(node, field, patch.value.slice(0, VIDEO_NODE_TEXT_LIMIT));
    }
    case "durationSeconds": {
      if (!videoNodeOffersDuration(node) || !Number.isFinite(patch.value)) return node;
      const seconds = Math.max(1, Math.min(VIDEO_NODE_DURATION_MAX, Math.round(patch.value)));
      return writeField(node, "durationSeconds", seconds);
    }
    case "ratio": {
      if (!videoNodeOffersRatio(node)) return node;
      if (!(VIDEO_NODE_RATIOS as readonly string[]).includes(patch.value)) return node;
      return writeField(node, "ratio", patch.value);
    }
    case "locked": {
      if (videoNodeLocked(node) === patch.value) return node;
      if (patch.value) return { ...node, locked: true };
      const next = { ...node };
      delete next.locked;
      return next;
    }
  }
}

/** One line shown under the title on the node card. */
export function videoNodeSummary(node: VideoDocNode): string {
  const text = videoNodeText(node).replace(/\s+/g, " ").trim();
  const parts: string[] = [];
  const seconds = videoNodeDuration(node);
  const ratio = videoNodeRatio(node);
  if (seconds !== null) parts.push(`${seconds}s`);
  if (ratio) parts.push(ratio);
  const meta = parts.join(" · ");
  if (!text) return meta;
  const clipped = text.length > 48 ? `${text.slice(0, 48)}…` : text;
  return meta ? `${meta} · ${clipped}` : clipped;
}
