export const SELECTION_PROTOCOL = "oceanleo.selection.v1" as const;
export const SELECTION_CONTEXT_VERSION = 1 as const;

export type SelectionControlKind =
  | "action"
  | "toggle"
  | "select"
  | "number"
  | "range"
  | "color"
  | "text";

export type SelectionControlValue = string | number | boolean | null;

export interface SelectionControlOption {
  value: string;
  label: string;
}

export interface SelectionControl {
  id: string;
  kind: SelectionControlKind;
  label: string;
  value?: SelectionControlValue;
  options?: SelectionControlOption[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  danger?: boolean;
  placement?: "primary" | "more";
}

export interface SelectionAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionContext {
  version: typeof SELECTION_CONTEXT_VERSION;
  kind: string;
  id: string;
  label?: string;
  text?: string;
  anchor?: SelectionAnchorRect;
  controls: SelectionControl[];
}

export interface SelectionCommand {
  requestId: string;
  selectionId: string;
  controlId: string;
  value?: SelectionControlValue;
}

const ID_RE = /^[a-z0-9][a-z0-9_.:-]{0,79}$/i;
const KIND_RE = /^[a-z][a-z0-9_-]{0,47}$/i;
const CONTROL_KINDS = new Set<SelectionControlKind>([
  "action",
  "toggle",
  "select",
  "number",
  "range",
  "color",
  "text",
]);

function finite(value: unknown, fallback?: number): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 10_000_000
    ? value
    : fallback;
}

function shortString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function controlValue(value: unknown): SelectionControlValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 2_000) return value;
  return undefined;
}

export function normalizeSelectionContext(
  value: unknown,
): SelectionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const kind = shortString(source.kind, 48);
  const id = shortString(source.id, 80);
  if (
    source.version !== SELECTION_CONTEXT_VERSION ||
    !KIND_RE.test(kind) ||
    !ID_RE.test(id) ||
    !Array.isArray(source.controls) ||
    source.controls.length > 32
  ) {
    return null;
  }

  const seen = new Set<string>();
  const controls: SelectionControl[] = [];
  for (const candidate of source.controls) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const raw = candidate as Record<string, unknown>;
    const controlId = shortString(raw.id, 80);
    const controlKind = shortString(raw.kind, 16) as SelectionControlKind;
    const label = shortString(raw.label, 120);
    if (
      !ID_RE.test(controlId) ||
      seen.has(controlId) ||
      !CONTROL_KINDS.has(controlKind) ||
      !label
    ) {
      return null;
    }
    seen.add(controlId);
    const options = Array.isArray(raw.options)
      ? raw.options.slice(0, 50).map((option) => {
          const record =
            option && typeof option === "object" && !Array.isArray(option)
              ? (option as Record<string, unknown>)
              : {};
          return {
            value: shortString(record.value, 160),
            label: shortString(record.label, 120),
          };
        })
      : undefined;
    if (
      options?.some((option) => !option.value || !option.label) ||
      (controlKind === "select" && !options?.length)
    ) {
      return null;
    }
    const normalizedValue = controlValue(raw.value);
    if (raw.value !== undefined && normalizedValue === undefined) return null;
    controls.push({
      id: controlId,
      kind: controlKind,
      label,
      ...(normalizedValue !== undefined ? { value: normalizedValue } : {}),
      ...(options?.length ? { options } : {}),
      ...(finite(raw.min) !== undefined ? { min: finite(raw.min) } : {}),
      ...(finite(raw.max) !== undefined ? { max: finite(raw.max) } : {}),
      ...(finite(raw.step) !== undefined ? { step: finite(raw.step) } : {}),
      ...(raw.disabled === true ? { disabled: true } : {}),
      ...(raw.danger === true ? { danger: true } : {}),
      ...(raw.placement === "more" ? { placement: "more" as const } : {}),
    });
  }

  let anchor: SelectionAnchorRect | undefined;
  if (source.anchor && typeof source.anchor === "object" && !Array.isArray(source.anchor)) {
    const raw = source.anchor as Record<string, unknown>;
    const x = finite(raw.x);
    const y = finite(raw.y);
    const width = finite(raw.width);
    const height = finite(raw.height);
    if (
      x === undefined ||
      y === undefined ||
      width === undefined ||
      height === undefined ||
      width < 0 ||
      height < 0
    ) {
      return null;
    }
    anchor = { x, y, width, height };
  }

  return {
    version: SELECTION_CONTEXT_VERSION,
    kind,
    id,
    controls,
    ...(shortString(source.label, 120)
      ? { label: shortString(source.label, 120) }
      : {}),
    ...(typeof source.text === "string"
      ? { text: source.text.slice(0, 4_000) }
      : {}),
    ...(anchor ? { anchor } : {}),
  };
}

export function normalizeSelectionCommand(
  value: unknown,
): SelectionCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const requestId = shortString(source.requestId, 128);
  const selectionId = shortString(source.selectionId, 80);
  const controlId = shortString(source.controlId, 80);
  const valueField = controlValue(source.value);
  if (
    !requestId ||
    !ID_RE.test(selectionId) ||
    !ID_RE.test(controlId) ||
    (source.value !== undefined && valueField === undefined)
  ) {
    return null;
  }
  return {
    requestId,
    selectionId,
    controlId,
    ...(valueField !== undefined ? { value: valueField } : {}),
  };
}

export function selectionRequestId(): string {
  return `sel-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
