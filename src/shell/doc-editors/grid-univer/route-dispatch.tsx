import type { ComponentType, ReactElement } from "react";
import type { AdvancedContentWorkbenchProps } from "../../advanced-workbench-types";
import type { EditorCoreChoice } from "../../editor-core-flags";

/**
 * 双核分发的可调用层。`GridRoute` 必须把 next/legacy 交给这里，
 * 闸才能在「if 行还在、函数体却 return null」时当场红。
 *
 * `import()` 字面量仍留在 `GridRoute.tsx`（打包器切 chunk 的依据）。
 */
export function renderGridNextOrLegacy(
  core: EditorCoreChoice,
  NextStage: ComponentType<AdvancedContentWorkbenchProps> | null,
  LegacyStage: ComponentType<AdvancedContentWorkbenchProps>,
  props: AdvancedContentWorkbenchProps,
): ReactElement | null {
  if (core === "next") {
    if (!NextStage) return null;
    return <NextStage {...props} />;
  }
  return <LegacyStage {...props} />;
}
