"use client";

import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
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
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span className={tone.muted}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        className={`w-full rounded-lg border px-2 py-1.5 ${tone.input}`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
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
      />
    </label>
  );
}

export function AppearancePanel({
  className = "",
  framed = true,
}: {
  className?: string;
  framed?: boolean;
}) {
  const tt = useUI();
  const [appearance, setAppearance] = useTerminalAppearance();
  const update = <K extends keyof TerminalAppearance,>(
    key: K,
    value: TerminalAppearance[K],
  ) => setAppearance((current) => ({ ...current, [key]: value }));

  return (
    <div
      className={`grid gap-3 ${framed ? `rounded-lg border p-3 ${tone.border} ${tone.panel}` : ""} ${className}`}
      data-oceanleo-terminal-appearance=""
    >
      <h3 className="text-sm font-semibold">{tt("外观设置")}</h3>
      <label className="grid gap-1 text-xs">
        <span className={tone.muted}>{tt("终端主题")}</span>
        <select
          value={appearance.theme}
          className={`rounded-lg border px-2 py-1.5 ${tone.input}`}
          onChange={(event) =>
            update("theme", event.currentTarget.value as TerminalThemePreference)
          }
        >
          <option value="system">{tt("跟随网站")}</option>
          <option value="light">{tt("白色")}</option>
          <option value="dark">{tt("黑色")}</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        <span className={tone.muted}>{tt("字体")}</span>
        <input
          value={appearance.fontFamily}
          className={`rounded-lg border px-2 py-1.5 ${tone.input}`}
          onChange={(event) => update("fontFamily", event.currentTarget.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <NumericField
          label={tt("字号")}
          value={appearance.fontSize}
          min={9}
          max={32}
          step={1}
          onChange={(value) => update("fontSize", value)}
        />
        <NumericField
          label={tt("字间距")}
          value={appearance.letterSpacing}
          min={-2}
          max={10}
          step={1}
          onChange={(value) => update("letterSpacing", value)}
        />
        <NumericField
          label={tt("行高")}
          value={appearance.lineHeight}
          min={1}
          max={2}
          step={0.1}
          onChange={(value) => update("lineHeight", value)}
        />
        <NumericField
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
            <span className={tone.muted}>
              {tt(key === "fontWeight" ? "常规字重" : "粗体字重")}
            </span>
            <select
              value={appearance[key]}
              className={`rounded-lg border px-2 py-1.5 ${tone.input}`}
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
        <span className={tone.muted}>{tt("光标样式")}</span>
        <select
          value={appearance.cursorStyle}
          className={`rounded-lg border px-2 py-1.5 ${tone.input}`}
          onChange={(event) =>
            update("cursorStyle", event.currentTarget.value as TerminalCursorStyle)
          }
        >
          <option value="block">{tt("方块")}</option>
          <option value="underline">{tt("下划线")}</option>
          <option value="bar">{tt("竖线")}</option>
        </select>
      </label>
      <div className={`divide-y ${tone.divide}`}>
        <ToggleField
          label={tt("选中即复制")}
          checked={appearance.copyOnSelect}
          onChange={(value) => update("copyOnSelect", value)}
        />
        <ToggleField
          label={tt("光标闪烁")}
          checked={appearance.cursorBlink}
          onChange={(value) => update("cursorBlink", value)}
        />
      </div>
    </div>
  );
}
