import type { SelectionControl } from "../selection-context";

/** 只能看时仍可用的控件：只动我自己的相机（不同步给别人），或只切换「看哪个材质」。 */
const VIEW_ONLY_CONTROLS: ReadonlySet<string> = new Set([
  "azimuth",
  "elevation",
  "zoom",
  "auto-rotate",
  "reset-camera",
  "material-select",
]);

export function isModel3DViewOnlyControl(id: string): boolean {
  return VIEW_ONLY_CONTROLS.has(id);
}

/** 只读时把改场景的控件置灰（附原因），相机与材质槽选择保持可用；非只读原样返回。 */
export function lockModel3DControls(
  controls: SelectionControl[],
  readOnly: boolean,
  reason: string,
): SelectionControl[] {
  if (!readOnly) return controls;
  return controls.map((control) =>
    VIEW_ONLY_CONTROLS.has(control.id)
      ? control
      : { ...control, disabled: true, unavailableReason: reason },
  );
}
