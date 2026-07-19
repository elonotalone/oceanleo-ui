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
  "text",
  "font-size",
  "text-color",
  "bold",
  "italic",
  "underline",
  "linethrough",
  "line-height",
  "char-spacing",
  "align",
  "fill",
  "opacity",
  "stroke",
  "stroke-width",
  "radius",
  "position-x",
  "position-y",
  "object-width",
  "object-height",
  "angle",
  "image-fit",
  "shadow",
  "table-rows",
  "table-columns",
  "table-header-fill",
  "table-body-fill",
  "table-text-color",
  "table-border-color",
  "table-border-width",
  "crop-start",
  "crop-apply",
  "crop-ratio",
  "rotate-left",
  "rotate-right",
  "flip-x",
  "flip-y",
  "brightness",
  "contrast",
  "saturation",
  "blur",
  "pixelate",
  "grayscale",
  "sepia",
  "invert",
  "filter-reset",
  "layer-up",
  "layer-down",
  "duplicate",
  "delete",
  "replace-panel",
] as const;
const OBJECT_MUTATION_CONTROLS = new Set<string>(
  IMAGE_OBJECT_MUTATION_CONTROLS,
);

export const IMAGE_LOCKED_ALLOWED_CONTROLS = [
  "lock",
  "font-panel",
  "filter-panel",
  "crop-cancel",
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
