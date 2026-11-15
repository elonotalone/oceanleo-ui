import { ADVANCED_EDITOR_FONTS } from "./AdvancedFontPicker";
import { EDIT_BAR_CANON, EDIT_BAR_CANON_OPTIONS, isEditBarCanonId } from "./edit-bar-canon-table";
import type { CanonSelectionControlInput, SelectionAdapterContext, SelectionContext, SelectionControl, SelectionControlInput, SelectionControlKind } from "./selection-context-types";
import { EDIT_BAR_CANON_ENGINE_SCOPES } from "./edit-bar-canon-table";

/** Extra canon metadata survives the projection without changing any existing label or id. */
export function selectionControlEngineScope(kind: string, id: string): { engineScope?: string; engineScopeLabel?: string } {
  const scope = kind === "grid-cell" && id === "highlight" ? EDIT_BAR_CANON_ENGINE_SCOPES["grid-cell"].highlight : null;
  return scope ? { engineScope: scope.scope, engineScopeLabel: scope.label } : {};
}

/** Convert engine data into the route contract, never carrying canon labels/icons. */
export function selectionControlInputs(controls: readonly (SelectionControl | SelectionControlInput)[]): SelectionControlInput[] {
  return controls.map((control): SelectionControlInput => {
    if (!isEditBarCanonId(control.id) || control.domain === "specific") {
      return { ...control, domain: "specific" } as SelectionControlInput;
    }
    const legacy = control as SelectionControl;
    const { kind, label: _label, icon: _icon, iconOnly: _iconOnly, group: _group,
      semantic: _semantic, suffix: _suffix, placement: _placement,
      domain: _domain, creationTool: _tool, ...state } = legacy;
    const input = control as CanonSelectionControlInput;
    return {
      ...state,
      id: control.id,
      ...(input.capabilities ? { capabilities: input.capabilities } :
        kind === "panel" ? { capabilities: { panel: true } } :
        kind === "action" && EDIT_BAR_CANON[control.id].kinds[0] !== "action" ? { capabilities: { action: true } } :
        kind === "toggle" && EDIT_BAR_CANON[control.id].kinds[0] !== "toggle" ? { capabilities: { toggle: true } } : {}),
    };
  });
}

export function selectionAdapterContext(context: SelectionContext | SelectionAdapterContext | null): SelectionAdapterContext | null {
  return context ? { ...context, controls: selectionControlInputs(context.controls) } : null;
}

function canonKind(control: CanonSelectionControlInput): SelectionControlKind {
  if (control.animationGallery) return "animation-gallery";
  if (control.panelId || control.capabilities?.panel) return "panel";
  if (control.capabilities?.action) return "action";
  if (control.capabilities?.toggle) return "toggle";
  // Scalar controls use the same numeric form in every engine.
  if (["font-size", "line-height", "letter-spacing", "opacity", "radius"].includes(control.id)) return "number";
  if (["border", "stroke"].includes(control.id) && typeof control.value === "string") return "color";
  return EDIT_BAR_CANON[control.id].kinds[0];
}

/** This is the only boundary that fills the shell's rendered control model. */
export function resolveSelectionAdapterContext(context: SelectionAdapterContext | null, tt: (label: string) => string = (label) => label): SelectionContext | null {
  if (!context) return null;
  return {
    ...context,
    controls: context.controls.map((input): SelectionControl => {
      if (input.domain === "specific") return input;
      const { capabilities: _capabilities, ...state } = input;
      const entry = EDIT_BAR_CANON[input.id];
      const kind = canonKind(input);
      const defaultOptions = (EDIT_BAR_CANON_OPTIONS as Partial<Record<string, readonly {value: string; label: string}[]>>)[input.id];
      const options = input.options ?? (input.id === "font-family"
        ? ADVANCED_EDITOR_FONTS.map((font) => ({ value: font.family, label: font.label }))
        : defaultOptions?.map((option) => ({ value: option.value, label: tt(option.label) })));
      const pixels = ["font-size", "line-height", "letter-spacing"].includes(input.id);
      return {
        ...selectionControlEngineScope(context.kind, input.id),
        ...state, kind, label: tt(entry.label), icon: entry.icon,
        domain: "selection", iconOnly: true,
        ...(kind === "select" && options ? { options } : {}),
        ...(pixels ? { unit: "px", suffix: "px", step: input.step ?? 1 } : {}),
        ...(input.id === "opacity" ? { unit: "percent", suffix: "%", step: 1 } : {}),
      };
    }),
  };
}
