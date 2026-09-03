/**
 * The AI capabilities as *commands* — the L1 edit-bar and L2 left-console
 * entry points required by task criterion 4.
 *
 * The engine side already existed: `image-capability-engine.ts` has providers
 * for `inpaint` / `outpaint` / `upscale` and a direct `remove-bg`, and the
 * creation panel renders them. What did not exist was a way to reach them from
 * the edit bar or the agent: `image-command-surface.ts` had no AI command at
 * all, so the only route was knowing which panel to open. These definitions
 * join the same command surface as crop and rotate, which is what makes one
 * action one command with one history entry (five-layer spec §2 rule 2).
 *
 * Nothing here calls a provider directly. The runner is injected, so the
 * parameter checking, the mask geometry and the refusal paths can be tested
 * without spending a provider call — and so this file has no opinion about
 * how the request is transported.
 */

import {
  fail,
  ok,
  type VisualCommandDefinition,
} from "../../media-editors/visual-command-kit";
import { IMAGE_MAX_DIMENSION } from "../image-capability-engine";
import type { DocSize, SelectedSnapshot } from "../types";
import {
  AI_CAPABILITY_ENTRIES,
  AI_REWRITE_TEXT_ID,
  type AiEntryId,
} from "./ai-capability-entries";

export interface InpaintMaskRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The masked region for `inpaint`, derived from the current selection.
 *
 * `validateImageAiCommand` refuses to run without a mask, which is why the
 * existing panel leaves inpaint out entirely. Rather than ship a button that
 * always errors, the selection's own bounds become the mask: the user marks
 * what to erase by selecting it, which is what they were going to do anyway.
 *
 * The region is padded slightly. Inpainting exactly the bounding box leaves a
 * visible seam at the edge, because the model has no clean pixels just outside
 * the hole to blend against.
 */
export const INPAINT_MASK_PADDING_PX = 8;

export function inpaintMaskRegion(
  selected: Pick<SelectedSnapshot, "x" | "y" | "width" | "height">,
  doc: DocSize,
): InpaintMaskRegion | null {
  const left = Math.floor(selected.x - INPAINT_MASK_PADDING_PX);
  const top = Math.floor(selected.y - INPAINT_MASK_PADDING_PX);
  const right = Math.ceil(selected.x + selected.width + INPAINT_MASK_PADDING_PX);
  const bottom = Math.ceil(selected.y + selected.height + INPAINT_MASK_PADDING_PX);

  const clampedLeft = Math.max(0, left);
  const clampedTop = Math.max(0, top);
  const clampedRight = Math.min(doc.width, right);
  const clampedBottom = Math.min(doc.height, bottom);

  const width = clampedRight - clampedLeft;
  const height = clampedBottom - clampedTop;
  // A selection dragged fully outside the canvas has nothing to inpaint.
  if (width <= 0 || height <= 0) return null;
  return { left: clampedLeft, top: clampedTop, width, height };
}

export interface OutpaintMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type OutpaintRefusal =
  | { ok: true; margins: OutpaintMargins; width: number; height: number }
  | { ok: false; reason: string };

/**
 * Outpainting grows the canvas, and the engine caps images at
 * `IMAGE_MAX_DIMENSION`. Checking here means the user is told the target is too
 * big *before* a provider call is spent finding out.
 */
export function planOutpaint(
  doc: DocSize,
  margins: Partial<OutpaintMargins>,
): OutpaintRefusal {
  const resolved: OutpaintMargins = {
    top: Math.max(0, Math.round(margins.top ?? 0)),
    right: Math.max(0, Math.round(margins.right ?? 0)),
    bottom: Math.max(0, Math.round(margins.bottom ?? 0)),
    left: Math.max(0, Math.round(margins.left ?? 0)),
  };
  const total = resolved.top + resolved.right + resolved.bottom + resolved.left;
  if (total === 0) {
    return { ok: false, reason: "至少要往一个方向扩出一些像素。" };
  }
  const width = doc.width + resolved.left + resolved.right;
  const height = doc.height + resolved.top + resolved.bottom;
  if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
    return {
      ok: false,
      reason: `扩完是 ${width}×${height} 像素，超过 ${IMAGE_MAX_DIMENSION} 的上限，请把扩展范围改小。`,
    };
  }
  return { ok: true, margins: resolved, width, height };
}

export interface UpscalePlan {
  ok: boolean;
  width: number;
  height: number;
  reason?: string;
}

export function planUpscale(doc: DocSize, scale: 2 | 4): UpscalePlan {
  const width = doc.width * scale;
  const height = doc.height * scale;
  if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
    return {
      ok: false,
      width,
      height,
      reason: `放大 ${scale} 倍后是 ${width}×${height} 像素，超过 ${IMAGE_MAX_DIMENSION} 的上限。`,
    };
  }
  return { ok: true, width, height };
}

export interface AiCommandRequest {
  id: AiEntryId;
  /** Rectangle to repaint, for `inpaint`. */
  maskRegion?: InpaintMaskRegion;
  margins?: OutpaintMargins;
  scale?: 2 | 4;
  prompt?: string;
  /** Replacement text, for `rewrite-text`. */
  text?: string;
}

export interface AiCommandRunner {
  (request: AiCommandRequest): Promise<{ ok: boolean; message: string }>;
}

export interface ImageAiCommandDeps {
  doc: DocSize;
  selected: SelectedSnapshot | null;
  aiAvailable: boolean;
  busy: boolean;
  revision: () => number;
  run: AiCommandRunner;
}

const TEXT_KINDS = new Set(["text"]);

/**
 * The prompt length ceiling is a product decision, not a model limit: past a
 * couple of hundred characters users are writing a brief, not an instruction,
 * and the results get worse rather than better.
 */
export const AI_PROMPT_MAX_LENGTH = 500;

export function imageAiCommandDefinitions(
  deps: ImageAiCommandDeps,
): VisualCommandDefinition[] {
  if (!deps.aiAvailable) return [];

  const entry = (id: AiEntryId) =>
    AI_CAPABILITY_ENTRIES.find((candidate) => candidate.id === id)!;
  const guard = (): string | null => {
    // Every one of these spends a provider call, and the engine runs one at a
    // time; queueing a second would either be dropped or double-charge.
    if (deps.busy) return "上一个 AI 动作还没跑完，等它结束再试。";
    return null;
  };

  const definitions: VisualCommandDefinition[] = [];

  definitions.push({
    spec: {
      id: "image.ai.remove-bg",
      label: entry("remove-bg").label,
      summary: entry("remove-bg").summary,
      mutates: true,
      params: [],
    },
    run: async () => {
      const blocked = guard();
      if (blocked) return fail(blocked);
      const result = await deps.run({ id: "remove-bg" });
      return result.ok ? ok(result.message, deps.revision()) : fail(result.message);
    },
  });

  definitions.push({
    spec: {
      id: "image.ai.inpaint",
      label: entry("inpaint").label,
      summary: `${entry("inpaint").summary}选中要处理的对象后再执行。`,
      mutates: true,
      params: [
        {
          key: "prompt",
          label: "想让这块变成什么",
          type: "string",
          hint: `留空就只是把它抹掉并补上背景；最多 ${AI_PROMPT_MAX_LENGTH} 字`,
        },
      ],
    },
    bounds: { prompt: { maxLength: AI_PROMPT_MAX_LENGTH } },
    run: async (params) => {
      const blocked = guard();
      if (blocked) return fail(blocked);
      if (!deps.selected) {
        return fail("先选中要擦除或重绘的对象，它的范围就是这次的处理区域。");
      }
      const maskRegion = inpaintMaskRegion(deps.selected, deps.doc);
      if (!maskRegion) {
        return fail("选中的对象不在画布范围内，没有可以重绘的区域。");
      }
      const result = await deps.run({
        id: "inpaint",
        maskRegion,
        ...(typeof params.prompt === "string" && params.prompt.trim()
          ? { prompt: params.prompt.trim() }
          : {}),
      });
      return result.ok ? ok(result.message, deps.revision()) : fail(result.message);
    },
  });

  definitions.push({
    spec: {
      id: "image.ai.outpaint",
      label: entry("outpaint").label,
      summary: entry("outpaint").summary,
      mutates: true,
      params: [
        { key: "top", label: "向上扩（像素）", type: "number" },
        { key: "right", label: "向右扩（像素）", type: "number" },
        { key: "bottom", label: "向下扩（像素）", type: "number" },
        { key: "left", label: "向左扩（像素）", type: "number" },
        {
          key: "prompt",
          label: "补出来的部分要有什么",
          type: "string",
          hint: `留空就顺着原画面补；最多 ${AI_PROMPT_MAX_LENGTH} 字`,
        },
      ],
    },
    bounds: {
      top: { min: 0, max: 4096, integer: true },
      right: { min: 0, max: 4096, integer: true },
      bottom: { min: 0, max: 4096, integer: true },
      left: { min: 0, max: 4096, integer: true },
      prompt: { maxLength: AI_PROMPT_MAX_LENGTH },
    },
    run: async (params) => {
      const blocked = guard();
      if (blocked) return fail(blocked);
      const plan = planOutpaint(deps.doc, {
        top: Number(params.top ?? 0),
        right: Number(params.right ?? 0),
        bottom: Number(params.bottom ?? 0),
        left: Number(params.left ?? 0),
      });
      if (!plan.ok) return fail(plan.reason);
      const result = await deps.run({
        id: "outpaint",
        margins: plan.margins,
        ...(typeof params.prompt === "string" && params.prompt.trim()
          ? { prompt: params.prompt.trim() }
          : {}),
      });
      return result.ok
        ? ok(`${result.message}画布现在是 ${plan.width}×${plan.height} 像素。`, deps.revision())
        : fail(result.message);
    },
  });

  definitions.push({
    spec: {
      id: "image.ai.upscale",
      label: entry("upscale").label,
      summary: entry("upscale").summary,
      mutates: true,
      params: [
        {
          key: "scale",
          label: "放大倍数",
          type: "enum",
          required: true,
          enumValues: [
            { value: "2", label: "2 倍" },
            { value: "4", label: "4 倍" },
          ],
        },
      ],
    },
    run: async (params) => {
      const blocked = guard();
      if (blocked) return fail(blocked);
      const scale = Number(params.scale) === 4 ? 4 : 2;
      const plan = planUpscale(deps.doc, scale);
      if (!plan.ok) return fail(plan.reason!);
      const result = await deps.run({ id: "upscale", scale });
      return result.ok
        ? ok(`${result.message}现在是 ${plan.width}×${plan.height} 像素。`, deps.revision())
        : fail(result.message);
    },
  });

  definitions.push({
    spec: {
      id: "image.ai.rewrite-text",
      label: entry(AI_REWRITE_TEXT_ID).label,
      summary: "改掉选中文字的内容，并重绘它所在的画面区域。",
      mutates: true,
      params: [
        {
          key: "text",
          label: "改成什么字",
          type: "string",
          required: true,
          hint: "最多 200 个字",
        },
      ],
    },
    bounds: { text: { maxLength: 200, nonEmpty: true } },
    run: async (params) => {
      const blocked = guard();
      if (blocked) return fail(blocked);
      if (!deps.selected || !TEXT_KINDS.has(deps.selected.kind)) {
        return fail("先选中一个文字对象。");
      }
      const text = String(params.text).trim();
      if (!text) return fail("要改成的文字不能是空的。");
      const result = await deps.run({ id: "rewrite-text", text });
      return result.ok ? ok(result.message, deps.revision()) : fail(result.message);
    },
  });

  return definitions;
}
