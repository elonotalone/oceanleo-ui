"use client";

// 选中对象浮动工具栏（Canva 骨架 v2，2026-07-16）。
// ---------------------------------------------------------------------------
// 呈现层统一走 editor-chrome 原子组件：图标化 + tooltip + 分组竖线 + overflow，
// 自动跟随深/浅双主题。协议（selection-context）不变，所有 *ContextToolbar 无需
// 改动即获得新外观；控件可选带 icon / group / iconOnly 进一步贴近 Canva。

import { useMemo, type ReactNode } from "react";
import {
  ToolButton,
  ToolColor,
  ToolDivider,
  ToolNumber,
  ToolOverflow,
  ToolRange,
  ToolSelect,
  ToolText,
  ToolbarShell,
} from "./editor-chrome";
import { EditorIcon, hasEditorIcon } from "./editor-icons";
import {
  selectionRequestId,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";

export interface SelectionToolbarProps {
  context: SelectionContext | null;
  onCommand: (command: SelectionCommand) => void;
  className?: string;
  accent?: string;
  /**
   * Optional object-level AI entry (宗旨: 浮动 bar 上「让 AI 改这个对象」).
   * When provided the toolbar renders a highlighted AI button after the
   * controls; clicking it hands the current selection to the host's AI flow.
   */
  onAskAi?: (context: SelectionContext) => void;
  aiLabel?: string;
  aiBusy?: boolean;
}

function asNumber(value: SelectionControlValue | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ControlView({
  control,
  selectionId,
  onCommand,
  accent,
}: {
  control: SelectionControl;
  selectionId: string;
  onCommand: (command: SelectionCommand) => void;
  accent: string;
}): ReactNode {
  const emit = (value?: SelectionControlValue) =>
    onCommand({
      requestId: selectionRequestId(),
      selectionId,
      controlId: control.id,
      ...(value !== undefined ? { value } : {}),
    });
  const iconOnly = Boolean(control.iconOnly && hasEditorIcon(control.icon));

  if (control.kind === "action") {
    return (
      <ToolButton
        label={control.label}
        icon={control.icon}
        iconOnly={iconOnly}
        disabled={control.disabled}
        danger={control.danger}
        accent={accent}
        onClick={() => emit()}
      />
    );
  }
  if (control.kind === "toggle") {
    return (
      <ToolButton
        label={control.label}
        icon={control.icon}
        iconOnly={iconOnly}
        active={control.value === true}
        disabled={control.disabled}
        accent={accent}
        onClick={() => emit(control.value !== true)}
      />
    );
  }
  if (control.kind === "color") {
    return (
      <ToolColor
        label={control.label}
        value={typeof control.value === "string" ? control.value : "#000000"}
        disabled={control.disabled}
        onChange={(value) => emit(value)}
      />
    );
  }
  if (control.kind === "select") {
    return (
      <ToolSelect
        label={control.label}
        icon={control.icon}
        value={String(control.value ?? "")}
        options={control.options || []}
        disabled={control.disabled}
        onChange={(value) => emit(value)}
      />
    );
  }
  if (control.kind === "number") {
    return (
      <ToolNumber
        label={control.label}
        icon={control.icon}
        value={asNumber(control.value)}
        min={control.min}
        max={control.max}
        step={control.step}
        disabled={control.disabled}
        onChange={(value) => emit(value)}
      />
    );
  }
  if (control.kind === "range") {
    return (
      <ToolRange
        label={control.label}
        value={asNumber(control.value)}
        min={control.min}
        max={control.max}
        step={control.step}
        disabled={control.disabled}
        accent={accent}
        onChange={(value) => emit(value)}
      />
    );
  }
  return (
    <ToolText
      label={control.label}
      value={typeof control.value === "string" ? control.value : ""}
      disabled={control.disabled}
      onChange={(value) => emit(value)}
    />
  );
}

export function SelectionToolbar({
  context,
  onCommand,
  className = "",
  accent = "#4f46e5",
  onAskAi,
  aiLabel = "让 AI 改",
  aiBusy = false,
}: SelectionToolbarProps) {
  const [primary, overflow] = useMemo(() => {
    const controls = context?.controls || [];
    const visible: SelectionControl[] = [];
    const more: SelectionControl[] = [];
    controls.forEach((control, index) => {
      if (control.placement === "more" || index >= 10) more.push(control);
      else visible.push(control);
    });
    return [visible, more];
  }, [context]);

  if (!context || context.controls.length === 0) return null;

  // 相邻控件若 group 不同则插入分隔线，形成 Canva 式功能簇。
  const rendered: ReactNode[] = [];
  let lastGroup: string | undefined;
  primary.forEach((control, index) => {
    if (index > 0 && control.group && control.group !== lastGroup) {
      rendered.push(<ToolDivider key={`div-${control.id}`} />);
    }
    lastGroup = control.group;
    rendered.push(
      <ControlView
        key={control.id}
        control={control}
        selectionId={context.id}
        onCommand={onCommand}
        accent={accent}
      />,
    );
  });

  return (
    <ToolbarShell variant="floating" label={context.label || "选中对象工具"} className={className}>
      {context.label && (
        <>
          <span className="max-w-28 truncate px-1.5 text-[10px] font-semibold text-[var(--muted,#78716c)]">
            {context.label}
          </span>
          <ToolDivider />
        </>
      )}
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">{rendered}</div>
      {overflow.length > 0 && (
        <>
          <ToolDivider />
          <ToolOverflow>
            {overflow.map((control) => (
              <ControlView
                key={control.id}
                control={control}
                selectionId={context.id}
                onCommand={onCommand}
                accent={accent}
              />
            ))}
          </ToolOverflow>
        </>
      )}
      {onAskAi && (
        <>
          <ToolDivider />
          <button
            type="button"
            disabled={aiBusy}
            onClick={() => onAskAi(context)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
          >
            <EditorIcon name="ai" className="h-4 w-4" />
            <span className="max-w-[7rem] truncate">{aiBusy ? "…" : aiLabel}</span>
          </button>
        </>
      )}
    </ToolbarShell>
  );
}
