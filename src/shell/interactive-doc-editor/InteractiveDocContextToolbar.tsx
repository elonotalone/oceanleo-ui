"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import {
  INTERACTIVE_DOC_PALETTE,
  interactiveDocSelectionControls,
  parseInteractiveDocParameterControlId,
} from "./interactive-doc-controls";
import type { InteractiveDocWorkbench } from "./use-interactive-doc-workbench";

/**
 * `toolbarOwnership: "shared"` — the host chrome renders the controls, this
 * surface only projects the parameter family plus the document-level actions
 * onto the selection protocol and routes commands back into the engine.
 */
export function InteractiveDocContextToolbar({
  editor,
  accent = INTERACTIVE_DOC_PALETTE["doc.accent"],
}: {
  editor: InteractiveDocWorkbench;
  accent?: string;
}) {
  const tt = useUI();
  const context = useMemo<SelectionContext>(() => {
    const controls: SelectionControl[] = [
      ...interactiveDocSelectionControls(editor.controls, tt),
    ];
    if (editor.recomputeMode === "on-commit") {
      controls.push({
        id: "interactive-doc-commit",
        kind: "action",
        label: tt("提交并重算"),
        icon: "redo",
        disabled: !editor.pendingParameterIds.length,
      });
    }
    controls.push({
      id: "interactive-doc-reset",
      kind: "action",
      label: tt("重置参数"),
      icon: "undo",
      placement: "more",
      disabled: !editor.sourceReady,
    });
    editor.scenarios.forEach((slot, index) => {
      controls.push({
        id: `interactive-doc-scenario-save-${index}`,
        kind: "action",
        label: tt("情景 {n} 存入", { n: index + 1 }),
        icon: "save",
        placement: "more",
      });
      controls.push({
        id: `interactive-doc-scenario-apply-${index}`,
        kind: "action",
        label: tt("情景 {n} 回放", { n: index + 1 }),
        icon: "templates",
        placement: "more",
        disabled: !slot,
      });
    });
    return {
      version: 1,
      kind: "interactive-doc",
      id: "interactive-doc",
      label: tt("可算文档参数"),
      revision: editor.editRevision,
      controls,
    };
  }, [
    editor.controls,
    editor.editRevision,
    editor.pendingParameterIds.length,
    editor.recomputeMode,
    editor.scenarios,
    editor.sourceReady,
    tt,
  ]);

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    if (
      message.selectionRevision !== undefined &&
      message.selectionRevision !== editor.editRevision
    ) {
      return;
    }
    if (message.transactionId && message.phase !== "commit") return;
    const parameterId = parseInteractiveDocParameterControlId(message.controlId);
    if (parameterId) {
      editor.setParameter(parameterId, message.value);
      return;
    }
    if (message.controlId === "interactive-doc-commit") {
      editor.commitInputs();
      return;
    }
    if (message.controlId === "interactive-doc-reset") {
      editor.reset();
      return;
    }
    const scenario = /^interactive-doc-scenario-(save|apply)-(\d+)$/.exec(
      message.controlId,
    );
    if (!scenario) return;
    const slot = Number(scenario[2]);
    if (scenario[1] === "save") editor.saveScenario(slot);
    else editor.applyScenario(slot);
  };

  return (
    <SelectionToolbar context={context} onCommand={command} accent={accent} />
  );
}
