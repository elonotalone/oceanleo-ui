"use client";

import { AdvancedEditorIcon, type WorkbenchIconName } from "./AdvancedEditorIcon";

/** 编辑栏图标随按钮的主题前景色；选中态也继承按钮颜色。 */
export const EDIT_BAR_ICON_CLASS = "h-6 w-6 shrink-0";
export const EDIT_BAR_ICON_STROKE_WIDTH = 2.4;

export function EditBarIcon({ name, className = "" }: {
  name: WorkbenchIconName;
  className?: string;
}) {
  return <AdvancedEditorIcon name={name} className={`${EDIT_BAR_ICON_CLASS} ${className}`.trim()} strokeWidth={EDIT_BAR_ICON_STROKE_WIDTH} />;
}
