import type {
  AnimationPresetId,
  SelectionAnchorRect,
  SelectionAnimationGalleryCapability,
  SelectionAnimationParameterCapability,
  SelectionAnimationPresetCapability,
  SelectionAnimationPreviewCapability,
  SelectionCommand,
  SelectionCommandPhase,
  SelectionContext,
  SelectionControl,
  SelectionControlIcon,
  SelectionControlKind,
  SelectionControlPlacement,
  SelectionControlSemantic,
  SelectionControlSlot,
  SelectionControlValue,
  SelectionPanelAction,
  SelectionRevision,
} from "./selection-context-types";

export type {
  AnimationPresetId,
  SelectionAnchorRect,
  SelectionAnimationGalleryCapability,
  SelectionAnimationParameterCapability,
  SelectionAnimationPresetCapability,
  SelectionAnimationPreviewCapability,
  SelectionCommand,
  SelectionCommandPhase,
  SelectionContext,
  SelectionControl,
  SelectionControlIcon,
  SelectionControlKind,
  SelectionControlOption,
  SelectionControlPlacement,
  SelectionControlSemantic,
  SelectionControlSlot,
  SelectionControlValue,
  SelectionPanelAction,
  SelectionRevision,
} from "./selection-context-types";

export const SELECTION_PROTOCOL = "oceanleo.selection.v1" as const;
export const SELECTION_CONTEXT_VERSION = 1 as const;

export const ANIMATION_PRESET_IDS = [
  "typewriter",
  "ascend",
  "shift",
  "merge",
  "block",
  "burst",
  "bounce",
  "roll",
  "skate",
  "spread",
  "clarify",
  "rise",
  "pan",
  "fade",
] as const;

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
  "panel",
  "animation-gallery",
]);

const CONTROL_ICONS = new Set<SelectionControlIcon>([
  "add",
  "ai",
  "align-center",
  "align-justify",
  "align-left",
  "align-right",
  "animate",
  "background",
  "bold",
  "border",
  "bring-forward",
  "case",
  "crop",
  "color",
  "delete",
  "download",
  "draw",
  "duplicate",
  "effects",
  "elements",
  "filter",
  "flip-horizontal",
  "flip-vertical",
  "font",
  "image",
  "italic",
  "layers",
  "line",
  "link",
  "lock",
  "more",
  "materials",
  "note",
  "opacity",
  "pages",
  "position",
  "redo",
  "rotate",
  "save",
  "select",
  "send-backward",
  "shape",
  "signature",
  "spacing",
  "strike",
  "table",
  "text",
  "templates",
  "underline",
  "undo",
  "unlock",
  "vertical-text",
]);

const CONTROL_SEMANTICS = new Set<SelectionControlSemantic>([
  "font-size",
  "color",
  "bold",
  "italic",
  "underline",
  "strike",
  "case",
  "alignment",
  "spacing",
  "vertical-text",
  "opacity",
  "effects",
  "animation",
  "position",
]);

const ANIMATION_PRESETS = new Set<AnimationPresetId>(ANIMATION_PRESET_IDS);

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

function revisionValue(value: unknown): SelectionRevision | undefined {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return value;
  }
  if (typeof value !== "string") return undefined;
  const revision = value.trim();
  return revision &&
    revision.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(revision)
    ? revision
    : undefined;
}

function normalizeAnimationGallery(
  value: unknown,
): SelectionAnimationGalleryCapability | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    !Array.isArray(source.presets) ||
    source.presets.length < 1 ||
    source.presets.length > ANIMATION_PRESET_IDS.length
  ) {
    return null;
  }
  const presetIds = new Set<string>();
  let currentCount = 0;
  const presets: SelectionAnimationPresetCapability[] = [];
  for (const candidate of source.presets) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const raw = candidate as Record<string, unknown>;
    const id = shortString(raw.id, 40) as AnimationPresetId;
    const label = shortString(raw.label, 120);
    const applyCommandId = shortString(raw.applyCommandId, 80);
    if (
      !ANIMATION_PRESETS.has(id) ||
      presetIds.has(id) ||
      !label ||
      !ID_RE.test(applyCommandId)
    ) {
      return null;
    }
    presetIds.add(id);
    if (raw.current === true) currentCount += 1;
    if (currentCount > 1) return null;

    const parameters: SelectionAnimationParameterCapability[] = [];
    const parameterIds = new Set<string>();
    if (raw.parameters !== undefined) {
      if (!Array.isArray(raw.parameters) || raw.parameters.length > 12) {
        return null;
      }
      for (const parameterCandidate of raw.parameters) {
        if (
          !parameterCandidate ||
          typeof parameterCandidate !== "object" ||
          Array.isArray(parameterCandidate)
        ) {
          return null;
        }
        const parameter = parameterCandidate as Record<string, unknown>;
        const parameterId = shortString(parameter.id, 80);
        const parameterLabel = shortString(parameter.label, 120);
        const commandId = shortString(parameter.commandId, 80);
        const kind = parameter.kind;
        const normalizedValue = controlValue(parameter.value);
        const options = Array.isArray(parameter.options)
          ? parameter.options.slice(0, 50).map((option) => {
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
          !ID_RE.test(parameterId) ||
          parameterIds.has(parameterId) ||
          !parameterLabel ||
          !ID_RE.test(commandId) ||
          (kind !== "number" && kind !== "select") ||
          (kind === "number" && typeof normalizedValue !== "number") ||
          (kind === "select" &&
            (typeof normalizedValue !== "string" ||
              !options?.length ||
              options.some((option) => !option.value || !option.label)))
        ) {
          return null;
        }
        parameterIds.add(parameterId);
        parameters.push({
          id: parameterId,
          label: parameterLabel,
          commandId,
          kind,
          value: normalizedValue as string | number,
          ...(options?.length ? { options } : {}),
          ...(finite(parameter.min) !== undefined
            ? { min: finite(parameter.min) }
            : {}),
          ...(finite(parameter.max) !== undefined
            ? { max: finite(parameter.max) }
            : {}),
          ...(finite(parameter.step) !== undefined
            ? { step: finite(parameter.step) }
            : {}),
        });
      }
    }

    let preview: SelectionAnimationPreviewCapability | undefined;
    if (raw.preview !== undefined) {
      if (!raw.preview || typeof raw.preview !== "object" || Array.isArray(raw.preview)) {
        return null;
      }
      const previewSource = raw.preview as Record<string, unknown>;
      const commandId = shortString(previewSource.commandId, 80);
      const durationMs = finite(previewSource.durationMs);
      const previewParameterIds = Array.isArray(previewSource.parameterIds)
        ? previewSource.parameterIds.map((entry) => shortString(entry, 80))
        : [];
      if (
        (previewSource.parameterIds !== undefined &&
          !Array.isArray(previewSource.parameterIds)) ||
        !ID_RE.test(commandId) ||
        durationMs === undefined ||
        durationMs < 100 ||
        durationMs > 60_000 ||
        new Set(previewParameterIds).size !== previewParameterIds.length ||
        previewParameterIds.some((entry) => !parameterIds.has(entry))
      ) {
        return null;
      }
      preview = {
        commandId,
        durationMs,
        ...(previewParameterIds.length
          ? { parameterIds: previewParameterIds }
          : {}),
      };
    }

    presets.push({
      id,
      label,
      applyCommandId,
      ...(raw.current === true ? { current: true } : {}),
      ...(preview ? { preview } : {}),
      ...(parameters.length ? { parameters } : {}),
    });
  }

  const removeCommandId = shortString(source.removeCommandId, 80);
  const clearCommandId = shortString(source.clearCommandId, 80);
  if (
    (source.removeCommandId !== undefined && !ID_RE.test(removeCommandId)) ||
    (source.clearCommandId !== undefined && !ID_RE.test(clearCommandId))
  ) {
    return null;
  }
  return {
    presets,
    ...(removeCommandId ? { removeCommandId } : {}),
    ...(clearCommandId ? { clearCommandId } : {}),
  };
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
    source.controls.length > 96
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
    const controlKind = shortString(raw.kind, 24) as SelectionControlKind;
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
    if (
      raw.semantic !== undefined &&
      !CONTROL_SEMANTICS.has(raw.semantic as SelectionControlSemantic)
    ) {
      return null;
    }
    const animationGallery =
      raw.animationGallery === undefined
        ? null
        : normalizeAnimationGallery(raw.animationGallery);
    if (
      (controlKind === "animation-gallery" && !animationGallery) ||
      (controlKind !== "animation-gallery" &&
        raw.animationGallery !== undefined)
    ) {
      return null;
    }
    controls.push({
      id: controlId,
      kind: controlKind,
      label,
      ...(CONTROL_ICONS.has(raw.icon as SelectionControlIcon)
        ? { icon: raw.icon as SelectionControlIcon }
        : {}),
      ...(shortString(raw.group, 40)
        ? { group: shortString(raw.group, 40) }
        : {}),
      ...(CONTROL_SEMANTICS.has(raw.semantic as SelectionControlSemantic)
        ? { semantic: raw.semantic as SelectionControlSemantic }
        : {}),
      ...(typeof raw.iconOnly === "boolean"
        ? { iconOnly: raw.iconOnly }
        : {}),
      ...(ID_RE.test(shortString(raw.panelId, 80))
        ? { panelId: shortString(raw.panelId, 80) }
        : {}),
      ...(["insert", "replace", "apply", "merge"].includes(
        String(raw.panelAction || ""),
      )
        ? { panelAction: raw.panelAction as SelectionPanelAction }
        : {}),
      ...(shortString(raw.suffix, 12)
        ? { suffix: shortString(raw.suffix, 12) }
        : {}),
      ...(["compact", "inspector", "stage", "context-menu"].includes(
        String(raw.slot || ""),
      )
        ? { slot: raw.slot as SelectionControlSlot }
        : {}),
      ...(ID_RE.test(shortString(raw.inspectorGroup, 80))
        ? { inspectorGroup: shortString(raw.inspectorGroup, 80) }
        : {}),
      ...(shortString(raw.inspectorLabel, 120)
        ? { inspectorLabel: shortString(raw.inspectorLabel, 120) }
        : {}),
      ...(CONTROL_ICONS.has(raw.inspectorIcon as SelectionControlIcon)
        ? { inspectorIcon: raw.inspectorIcon as SelectionControlIcon }
        : {}),
      ...(normalizedValue !== undefined ? { value: normalizedValue } : {}),
      ...(options?.length ? { options } : {}),
      ...(finite(raw.min) !== undefined ? { min: finite(raw.min) } : {}),
      ...(finite(raw.max) !== undefined ? { max: finite(raw.max) } : {}),
      ...(finite(raw.step) !== undefined ? { step: finite(raw.step) } : {}),
      ...(raw.disabled === true ? { disabled: true } : {}),
      ...(shortString(raw.unavailableReason, 240)
        ? { unavailableReason: shortString(raw.unavailableReason, 240) }
        : {}),
      ...(raw.danger === true ? { danger: true } : {}),
      ...(raw.tone === "danger" ? { tone: "danger" as const } : {}),
      ...(animationGallery ? { animationGallery } : {}),
      ...(["primary", "more", "tools"].includes(String(raw.placement || ""))
        ? { placement: raw.placement as SelectionControlPlacement }
        : {}),
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
  const revision = revisionValue(source.revision);
  if (source.revision !== undefined && revision === undefined) return null;
  const epoch = revisionValue(source.epoch);
  if (source.epoch !== undefined && epoch === undefined) return null;

  return {
    version: SELECTION_CONTEXT_VERSION,
    kind,
    id,
    controls,
    ...(revision !== undefined ? { revision } : {}),
    ...(epoch !== undefined ? { epoch } : {}),
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
  const transactionId =
    typeof source.transactionId === "string"
      ? shortString(source.transactionId, 128)
      : "";
  const selectionRevision = revisionValue(source.selectionRevision);
  const selectionEpoch = revisionValue(source.selectionEpoch);
  const validPhase = ["start", "update", "commit", "cancel"].includes(
    String(source.phase),
  );
  const history =
    source.history === "document" || source.history === "view"
      ? source.history
      : undefined;
  const phase = validPhase
    ? (source.phase as SelectionCommandPhase)
    : undefined;
  if (
    !requestId ||
    !ID_RE.test(selectionId) ||
    !ID_RE.test(controlId) ||
    (source.value !== undefined && valueField === undefined) ||
    (source.selectionRevision !== undefined &&
      selectionRevision === undefined) ||
    (source.selectionEpoch !== undefined && selectionEpoch === undefined) ||
    (source.history !== undefined && history === undefined) ||
    (source.transactionId !== undefined && !transactionId) ||
    (source.phase !== undefined && !validPhase) ||
    (Boolean(transactionId) !== Boolean(phase)) ||
    ((phase === "start" || phase === "update" || phase === "cancel") &&
      !transactionId)
  ) {
    return null;
  }
  return {
    requestId,
    selectionId,
    controlId,
    ...(valueField !== undefined ? { value: valueField } : {}),
    ...(selectionRevision !== undefined ? { selectionRevision } : {}),
    ...(selectionEpoch !== undefined ? { selectionEpoch } : {}),
    ...(history ? { history } : {}),
    ...(phase ? { phase } : {}),
    ...(transactionId ? { transactionId } : {}),
  };
}

export function selectionRequestId(): string {
  return `sel-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
