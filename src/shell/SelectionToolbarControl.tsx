"use client";

import type { WorkbenchIconName } from "./AdvancedEditorIcon";
import { EditBarIcon } from "./EditBarIcon";
import {
  EDIT_BAR_CANON_OPTIONS,
  type CanonicalSelectionControl,
  type EditBarCanonId,
} from "./edit-bar-canon";
import { SelectionToolbarFontFamilyButton } from "./selection-toolbar-canon-controls";
import { SelectionAnimationGallery } from "./SelectionAnimationGallery";
import { SelectionToolbarButtonControl } from "./SelectionToolbarButtonControl";
import { SelectionToolbarNumberControl } from "./SelectionToolbarNumberControl";
import {
  selectionRequestId,
  type SelectionPanelAction,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";
import { selectionControlUsesIconOnly } from "./selection-toolbar-layout";
import { editBarControlClass } from "./edit-bar-surface";
import { SelectionToolbarSelectControl } from "./SelectionToolbarSelectControl";

/** 下拉规范项：栏上只画随值变化的图标（§4：对齐图标随当前值）。 */
function canonTriggerIcon(
  canonId: EditBarCanonId | undefined,
  value: SelectionControl["value"],
): WorkbenchIconName | undefined {
  if (canonId === "align") {
    return value === "center"
      ? "align-center"
      : value === "right"
        ? "align-right"
        : value === "justify"
          ? "align-justify"
          : "align-left";
  }
  if (canonId === "list") return value === "ordered" ? "list-ordered" : "list";
  if (canonId === "arrange") return "arrange";
  return undefined;
}

function canonOptionIcon(canonId: EditBarCanonId | undefined) {
  const table =
    canonId === "align" || canonId === "list"
      ? EDIT_BAR_CANON_OPTIONS[canonId]
      : null;
  if (!table) return undefined;
  return (value: string) =>
    table.find((option) => option.value === value)?.icon as
      | WorkbenchIconName
      | undefined;
}

export function SelectionToolbarControl({
  control,
  selectionId,
  selectionRevision,
  selectionEpoch,
  onCommand,
  onOpenPanel,
  accent,
  activePanel = false,
  presentation = "compact",
  onActivated,
  forMeasurement = false,
}: {
  control: SelectionControl;
  selectionId: string;
  selectionRevision?: SelectionContext["revision"];
  selectionEpoch?: SelectionContext["epoch"];
  onCommand: (command: SelectionCommand) => void;
  onOpenPanel?: (panelId: string, panelAction?: SelectionPanelAction, anchor?: HTMLElement) => void;
  accent: string;
  activePanel?: boolean;
  presentation?: "compact" | "menu";
  onActivated?: () => void;
  forMeasurement?: boolean;
}) {
  const menu = presentation === "menu";
  const iconOnly = !menu && selectionControlUsesIconOnly(control);
  const emit = (
    value?: SelectionControlValue,
    controlId = control.id,
    history?: SelectionCommand["history"],
  ) =>
    onCommand({
      requestId: selectionRequestId(),
      selectionId,
      controlId,
      ...(value !== undefined ? { value } : {}),
      ...(selectionRevision !== undefined ? { selectionRevision } : {}),
      ...(selectionEpoch !== undefined ? { selectionEpoch } : {}),
      ...(history ? { history } : {}),
    });
  const icon = control.icon
    ? <EditBarIcon name={control.icon} />
    : null;
  const buttonClass = editBarControlClass(menu);

  if (control.kind === "animation-gallery") {
    return (
      <SelectionAnimationGallery
        control={control}
        selection={{
          id: selectionId,
          revision: selectionRevision,
          epoch: selectionEpoch,
        }}
        onCommand={onCommand}
        accent={accent}
      />
    );
  }

  const canonId = (control as CanonicalSelectionControl).canonId;
  if ((canonId === "font-size" || control.semantic === "font-size" || control.id === "font-size") &&
      (control.kind === "number" || control.kind === "select")) {
    return (
      <SelectionToolbarNumberControl
        control={control}
        fontSize
        menu={menu}
        iconOnly={!menu}
        icon={menu ? icon : null}
        emit={emit}
        accent={accent}
        forMeasurement={forMeasurement}
      />
    );
  }
  if (canonId === "font-family" && control.kind === "panel") {
    return (
      <SelectionToolbarFontFamilyButton
        control={control as CanonicalSelectionControl}
        buttonClass={buttonClass}
        activePanel={activePanel}
        onOpenPanel={onOpenPanel}
        onActivated={onActivated}
        forMeasurement={forMeasurement}
      />
    );
  }
  if (
    control.kind === "action" ||
    control.kind === "panel" ||
    control.kind === "toggle" ||
    control.kind === "color"
  ) {
    return (
      <SelectionToolbarButtonControl
        control={control}
        buttonClass={buttonClass}
        menu={menu}
        iconOnly={iconOnly}
        icon={icon}
        accent={accent}
        activePanel={activePanel}
        onOpenPanel={onOpenPanel}
        onActivated={onActivated}
        emit={emit}
        forMeasurement={forMeasurement}
      />
    );
  }
  if (control.kind === "select") {
    return (
      <SelectionToolbarSelectControl
        control={control}
        selectionId={selectionId}
        selectionRevision={selectionRevision}
        selectionEpoch={selectionEpoch}
        onCommand={onCommand}
        accent={accent}
        presentation={presentation}
        onActivated={onActivated}
        forMeasurement={forMeasurement}
        triggerIcon={canonTriggerIcon(canonId, control.value)}
        optionIcon={canonOptionIcon(canonId)}
        compactValue={
          canonId === "arrange"
            ? "hidden"
            : canonId === "align" || canonId === "list"
              ? "none"
              : "label"
        }
        showIcon={canonId !== "font-family" && canonId !== "font-size"}
      />
    );
  }
  if (control.kind === "number") {
    return (
      <SelectionToolbarNumberControl
        control={control}
        menu={menu}
        iconOnly={iconOnly}
        icon={icon}
        emit={emit}
        forMeasurement={forMeasurement}
      />
    );
  }
  // Continuous values and long text are rendered only in a child inspector.
  // Keeping this guard fail-closed prevents a future route from reintroducing
  // sliders or content fields into the compact edit bar.
  return null;
}
