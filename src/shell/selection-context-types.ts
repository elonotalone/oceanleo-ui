export type AnimationPresetId =
  | "typewriter"
  | "ascend"
  | "shift"
  | "merge"
  | "block"
  | "burst"
  | "bounce"
  | "roll"
  | "skate"
  | "spread"
  | "clarify"
  | "rise"
  | "pan"
  | "fade";

export type SelectionControlKind =
  | "action"
  | "toggle"
  | "select"
  | "number"
  | "range"
  | "color"
  | "text"
  | "panel"
  | "animation-gallery";

/**
 * Every icon a selection control may name. Runtime list (not just a union) so
 * `normalizeSelectionContext` can drop unknown names from iframe hosts, and so
 * the list and the type can never drift apart.
 *
 * 2026-10-23 (W03, D9): the canonical edit-bar vocabulary added `text-color`
 * … `rotate-ccw`. Each one is a distinct glyph in `AdvancedEditorIcon.tsx`.
 */
export const SELECTION_CONTROL_ICONS = [
  "add", "ai", "align-center", "align-justify", "align-left",
  "align-right", "animate", "background", "bold", "border",
  "bring-forward", "crop", "color", "case", "delete", "download",
  "draw", "duplicate", "effects", "elements", "filter",
  "flip-horizontal", "flip-vertical", "font", "font-size", "image", "italic",
  "layers", "line", "link", "list", "lock", "more", "materials", "note",
  "opacity", "pages", "position", "transparency", "redo", "rotate", "save",
  "select", "send-backward", "shape", "signature", "spacing",
  "strike", "table", "text", "templates", "underline", "underline-color",
  "undo", "unlock", "vertical-text",
  // Canonical edit-bar vocabulary (00-dispatch.md §4).
  "text-color", "highlight", "line-height", "letter-spacing", "clear-format",
  "indent-increase", "indent-decrease", "list-ordered", "replace", "radius",
  "adjust", "fill", "stroke", "shadow", "arrange", "alt", "image-fit",
  "remove-background", "rotate-ccw",
  // 音频特有控件（W12 申请，2026-10-23）：不借规范图标的独立字形。
  "trim", "fade-in", "fade-out", "gain", "equalizer", "speed",
] as const;

export type SelectionControlIcon = (typeof SELECTION_CONTROL_ICONS)[number];

/**
 * Which unified edit bar a selection gets (D9). `text` / `image` / `shape`
 * pick the type group; every movable object also gets the object group.
 * Absent ⇒ the shell infers it from `kind` and the controls.
 */
export const SELECTION_BARS = ["text", "image", "shape", "object"] as const;
export type SelectionBar = (typeof SELECTION_BARS)[number];

export type SelectionControlValue = string | number | boolean | null;
export type SelectionPanelAction = "insert" | "replace" | "apply" | "merge";
export type SelectionRevision = string | number;
export type SelectionControlSemantic =
  | "font-size" | "color" | "bold" | "italic" | "underline" | "strike"
  | "case" | "alignment" | "spacing" | "vertical-text" | "opacity"
  | "effects" | "animation" | "position";
export type SelectionControlSlot =
  | "compact" | "inspector" | "stage" | "context-menu";
export type SelectionControlPlacement = "primary" | "more" | "tools";
export type SelectionCommandPhase = "start" | "update" | "commit" | "cancel";

export interface SelectionControlOption {
  value: string;
  label: string;
}

export interface SelectionAnimationParameterCapability {
  id: string;
  label: string;
  commandId: string;
  kind: "number" | "select";
  value: string | number;
  options?: SelectionControlOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface SelectionAnimationPreviewCapability {
  /** A real adapter-owned preview command. The host never invents keyframes. */
  commandId: string;
  durationMs: number;
  parameterIds?: string[];
}

export interface SelectionAnimationPresetCapability {
  id: AnimationPresetId;
  label: string;
  applyCommandId: string;
  current?: boolean;
  preview?: SelectionAnimationPreviewCapability;
  parameters?: SelectionAnimationParameterCapability[];
}

export interface SelectionAnimationGalleryCapability {
  presets: SelectionAnimationPresetCapability[];
  removeCommandId?: string;
  clearCommandId?: string;
}

export interface SelectionControl {
  id: string;
  kind: SelectionControlKind;
  label: string;
  icon?: SelectionControlIcon;
  group?: string;
  semantic?: SelectionControlSemantic;
  iconOnly?: boolean;
  panelId?: string;
  panelAction?: SelectionPanelAction;
  suffix?: string;
  slot?: SelectionControlSlot;
  inspectorGroup?: string;
  inspectorLabel?: string;
  inspectorIcon?: SelectionControlIcon;
  value?: SelectionControlValue;
  options?: SelectionControlOption[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  unavailableReason?: string;
  danger?: boolean;
  tone?: "danger";
  animationGallery?: SelectionAnimationGalleryCapability;
  placement?: SelectionControlPlacement;
}

export interface SelectionAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionContext {
  version: 1;
  kind: string;
  id: string;
  /** Unified edit bar for this selection (D9). See `edit-bar-canon.ts`. */
  bar?: SelectionBar;
  label?: string;
  text?: string;
  revision?: SelectionRevision;
  epoch?: SelectionRevision;
  anchor?: SelectionAnchorRect;
  controls: SelectionControl[];
}

export interface SelectionCommand {
  requestId: string;
  selectionId: string;
  controlId: string;
  value?: SelectionControlValue;
  selectionRevision?: SelectionRevision;
  selectionEpoch?: SelectionRevision;
  history?: "document" | "view";
  phase?: SelectionCommandPhase;
  transactionId?: string;
}
