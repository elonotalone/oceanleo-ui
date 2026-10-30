"use client";

import { useUI } from "../../../i18n/ui/useUI";
import { SERVER_PANEL_SKIN, type PanelSkin } from "./panel-skin";
import {
  useTerminalAppearance,
  type TerminalAppearance,
  type TerminalCursorStyle,
  type TerminalFontWeight,
  type TerminalThemePreference,
} from "./appearance";

const FONT_WEIGHTS: readonly TerminalFontWeight[] = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
];

function NumericField({
  skin,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  skin: PanelSkin;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span className={skin.muted}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        className={`w-full rounded-lg border px-2 py-1.5 ${skin.input}`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ToggleField({
  skin,
  label,
  checked,
  onChange,
}: {
  skin: PanelSkin;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-xs">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className={skin.check}
      />
    </label>
  );
}

export function AppearancePanel({
  className = "",
  framed = true,
  skin = SERVER_PANEL_SKIN,
  showHeading = true,
}: {
  className?: string;
  framed?: boolean;
  skin?: PanelSkin;
  /** The task page labels the group itself; it hides this inner heading. */
  showHeading?: boolean;
}) {
  const tt = useUI();
  const [appearance, setAppearance] = useTerminalAppearance();
  const update = <K extends keyof TerminalAppearance,>(
    key: K,
    value: TerminalAppearance[K],
  ) => setAppearance((current) => ({ ...current, [key]: value }));

  return (
    <div
      className={`grid gap-3 ${framed ? skin.frame : ""} ${className}`}
      data-oceanleo-terminal-appearance=""
    >
      {showHeading ? <h3 className={skin.heading}>{tt("外观设置")}</h3> : null}
      <label className="grid gap-1 text-xs">
        <span className={skin.muted}>{tt("终端主题")}</span>
        <select
          value={appearance.theme}
          className={`rounded-lg border px-2 py-1.5 ${skin.input}`}
          onChange={(event) =>
            update("theme", event.currentTarget.value as TerminalThemePreference)
          }
        >
          <option value="light">{tt("白色")}</option>
          <option value="dark">{tt("黑色")}</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        <span className={skin.muted}>{tt("字体")}</span>
        <input
          value={appearance.fontFamily}
          className={`rounded-lg border px-2 py-1.5 ${skin.input}`}
          onChange={(event) => update("fontFamily", event.currentTarget.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <NumericField
          skin={skin}
          label={tt("字号")}
          value={appearance.fontSize}
          min={9}
          max={32}
          step={1}
          onChange={(value) => update("fontSize", value)}
        />
        <NumericField
          skin={skin}
          label={tt("字间距")}
          value={appearance.letterSpacing}
          min={-2}
          max={10}
          step={1}
          onChange={(value) => update("letterSpacing", value)}
        />
        <NumericField
          skin={skin}
          label={tt("行高")}
          value={appearance.lineHeight}
          min={1}
          max={2}
          step={0.1}
          onChange={(value) => update("lineHeight", value)}
        />
        <NumericField
          skin={skin}
          label={tt("回滚行数")}
          value={appearance.scrollback}
          min={100}
          max={100_000}
          step={100}
          onChange={(value) => update("scrollback", value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["fontWeight", "fontWeightBold"] as const).map((key) => (
          <label key={key} className="grid gap-1 text-xs">
            <span className={skin.muted}>
              {tt(key === "fontWeight" ? "常规字重" : "粗体字重")}
            </span>
            <select
              value={appearance[key]}
              className={`rounded-lg border px-2 py-1.5 ${skin.input}`}
              onChange={(event) =>
                update(key, event.currentTarget.value as TerminalFontWeight)
              }
            >
              {FONT_WEIGHTS.map((weight) => (
                <option key={weight} value={weight}>
                  {weight}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="grid gap-1 text-xs">
        <span className={skin.muted}>{tt("光标样式")}</span>
        <select
          value={appearance.cursorStyle}
          className={`rounded-lg border px-2 py-1.5 ${skin.input}`}
          onChange={(event) =>
            update("cursorStyle", event.currentTarget.value as TerminalCursorStyle)
          }
        >
          <option value="block">{tt("方块")}</option>
          <option value="underline">{tt("下划线")}</option>
          <option value="bar">{tt("竖线")}</option>
        </select>
      </label>
      <div className={`divide-y ${skin.divide}`}>
        <ToggleField
          skin={skin}
          label={tt("选中即复制")}
          checked={appearance.copyOnSelect}
          onChange={(value) => update("copyOnSelect", value)}
        />
        <ToggleField
          skin={skin}
          label={tt("光标闪烁")}
          checked={appearance.cursorBlink}
          onChange={(value) => update("cursorBlink", value)}
        />
      </div>
    </div>
  );
}
