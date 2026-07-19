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

export type SelectionControlIcon =
  | "add" | "ai" | "align-center" | "align-justify" | "align-left"
  | "align-right" | "animate" | "background" | "bold" | "border"
  | "bring-forward" | "crop" | "color" | "case" | "delete" | "download"
  | "draw" | "duplicate" | "effects" | "elements" | "filter"
  | "flip-horizontal" | "flip-vertical" | "font" | "image" | "italic"
  | "layers" | "line" | "link" | "lock" | "more" | "materials" | "note"
  | "opacity" | "pages" | "position" | "redo" | "rotate" | "save"
  | "select" | "send-backward" | "shape" | "signature" | "spacing"
  | "strike" | "table" | "text" | "templates" | "underline" | "undo"
  | "unlock" | "vertical-text";

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
