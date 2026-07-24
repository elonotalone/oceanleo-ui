"use client";

import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
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
import {
  nextTextAlignment,
  selectionControlSemantic,
  selectionControlUsesIconOnly,
} from "./selection-toolbar-layout";
import { SelectionToolbarSelectControl } from "./SelectionToolbarSelectControl";

export function hasCanonicalAlignmentCapability(
  control: SelectionControl,
): boolean {
  if (control.kind !== "select") return false;
  const declaredValues = new Set(
    (control.options || []).map((option) => option.value),
  );
  return ["left", "center", "right", "justify"].every((value) =>
    declaredValues.has(value),
  );
}

export function SelectionToolbarControl({
  control,
  selectionId,
  selectionRevision,
  selectionEpoch,
  onCommand,
  onOpenPanel,
  accent,
  canonicalDesignText = false,
  activePanel = false,
  presentation = "compact",
  onActivated,
}: {
  control: SelectionControl;
  selectionId: string;
  selectionRevision?: SelectionContext["revision"];
  selectionEpoch?: SelectionContext["epoch"];
  onCommand: (command: SelectionCommand) => void;
  onOpenPanel?: (panelId: string, panelAction?: SelectionPanelAction) => void;
  accent: string;
  canonicalDesignText?: boolean;
  activePanel?: boolean;
  presentation?: "compact" | "menu";
  onActivated?: () => void;
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
    ? <AdvancedEditorIcon name={control.icon} className="h-[17px] w-[17px]" />
    : null;
  const buttonClass = menu
    ? "group/control flex min-h-11 w-full items-center justify-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35"
    : "group/control inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35";

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

  if (
    canonicalDesignText &&
    selectionControlSemantic(control) === "alignment" &&
    (control.kind === "select" || control.kind === "action")
  ) {
    if (!hasCanonicalAlignmentCapability(control)) return null;
    const current =
      typeof control.value === "string" ? control.value : undefined;
    const next = nextTextAlignment(current);
    const alignmentLabel =
      control.disabled && control.unavailableReason
        ? `${control.label}：${control.unavailableReason}`
        : control.label;
    const alignmentIcon =
      current === "center"
        ? "align-center"
        : current === "right"
          ? "align-right"
          : current === "justify"
            ? "align-justify"
            : "align-left";
    return (
      <button
        type="button"
        disabled={control.disabled}
        onClick={() => {
          emit(next);
          onActivated?.();
        }}
        className={`${buttonClass} ${iconOnly ? "w-11 px-0" : ""}`}
        title={`${alignmentLabel}: ${current || "未设置"}`}
        aria-label={`${alignmentLabel}: ${current || "未设置"}`}
        aria-pressed={current !== undefined}
        data-selection-alignment={current || "unset"}
      >
        <AdvancedEditorIcon
          name={alignmentIcon}
          className="h-[17px] w-[17px]"
        />
        {!iconOnly && (
          <span className="whitespace-nowrap">{control.label}</span>
        )}
      </button>
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
        iconOnly={iconOnly}
        icon={icon}
        accent={accent}
        activePanel={activePanel}
        onOpenPanel={onOpenPanel}
        onActivated={onActivated}
        emit={emit}
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
      />
    );
  }
  // Continuous values and long text are rendered only in a child inspector.
  // Keeping this guard fail-closed prevents a future route from reintroducing
  // sliders or content fields into the compact edit bar.
  return null;
}
