/**
 * Locking is a document invariant, not a toolbar affordance. Every mutation
 * entry point uses the same intent check so a stale/enabled control cannot
 * bypass a locked layer.
 */
export type ImageObjectMutationIntent =
  | "style"
  | "geometry"
  | "content"
  | "replace"
  | "layer"
  | "visibility"
  | "duplicate"
  | "delete"
  | "unlock"
  | "metadata";

export const IMAGE_LOCK_SERIALIZED_PROPS = [
  "oceanleoLocked",
  "selectable",
  "evented",
  "lockMovementX",
  "lockMovementY",
  "lockScalingX",
  "lockScalingY",
  "lockRotation",
  "lockSkewingX",
  "lockSkewingY",
  "hasControls",
  "hoverCursor",
] as const;

const LOCKED_ALLOWED_INTENTS = new Set<ImageObjectMutationIntent>([
  "unlock",
  "metadata",
]);

export const IMAGE_OBJECT_MUTATION_CONTROLS = [
  // 统一编辑栏规范 id（2026-10-23 D9）与面板子控件
  "text",
  "font-family",
  "font-size",
  "bold",
  "italic",
  "underline",
  "strike",
  "text-color",
  "highlight",
  "align",
  "list",
  "line-height",
  "letter-spacing",
  "case",
  "clear-format",
  "replace",
  "crop",
  "crop-apply",
  "crop-ratio",
  "flip-x",
  "flip-y",
  "rotate",
  "radius",
  "border-color",
  "border-width",
  "opacity",
  "brightness",
  "contrast",
  "saturation",
  "blur",
  "pixelate",
  "grayscale",
  "sepia",
  "invert",
  "filter-reset",
  "image-fit",
  "fill",
  "stroke-color",
  "stroke-width",
  "stroke-dash",
  "shadow",
  "arrange",
  "position-x",
  "position-y",
  "object-width",
  "object-height",
  "angle",
  "position-flip-x",
  "position-flip-y",
  "duplicate",
  "delete",
  "table-rows",
  "table-columns",
  "table-header-fill",
  "table-body-fill",
  "table-text-color",
  "table-border-color",
  "table-border-width",
  // 旧 id：命令面与旧消息仍可能发来，同样受锁定约束
  "text-case",
  "linethrough",
  "char-spacing",
  "stroke",
  "crop-start",
  "rotate-left",
  "rotate-right",
  "layer-up",
  "layer-down",
  "replace-panel",
] as const;
const OBJECT_MUTATION_CONTROLS = new Set<string>(
  IMAGE_OBJECT_MUTATION_CONTROLS,
);

export const IMAGE_LOCKED_ALLOWED_CONTROLS = [
  "lock",
  "crop-cancel",
  // 旧的只开面板的 id（不改对象）
  "font-panel",
  "filter-panel",
] as const;

const LOCKED_ALLOWED_CONTROLS = new Set<string>(
  IMAGE_LOCKED_ALLOWED_CONTROLS,
);

export function imageObjectMutationAllowed(
  locked: boolean,
  intent: ImageObjectMutationIntent,
): boolean {
  return !locked || LOCKED_ALLOWED_INTENTS.has(intent);
}

export function imageLockInteractionProps(locked: boolean) {
  return {
    selectable: true,
    evented: true,
    // Transparent PNG/WebP composites must stay clickable via AABB; per-pixel
    // hit testing skips empty alpha and breaks snap-matrix selection.
    perPixelTargetFind: false,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    lockSkewingX: locked,
    lockSkewingY: locked,
    hasControls: !locked,
    hoverCursor: locked ? "not-allowed" : "move",
  } as const;
}

export function imageToolbarCommandAllowed(
  locked: boolean,
  controlId: string,
): boolean {
  return !locked || LOCKED_ALLOWED_CONTROLS.has(controlId);
}

export function imageControlMutatesSelectedObject(controlId: string): boolean {
  return OBJECT_MUTATION_CONTROLS.has(controlId);
}
