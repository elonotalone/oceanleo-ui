"use client";

// The native program's composer control, placed where ModelGroupPicker sits in
// LeoComposer. One trigger ("Opus 4.x · 计划 · 快速") opens one popover with
// everything the program offers: model, reasoning effort, fast mode and the
// program's own modes. Trigger, popover and rows reuse ModelGroupPicker's
// compact classes so a native conversation's composer looks the same.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUI, type UITranslate } from "../../i18n/ui/useUI";
import { AnchoredPopover } from "../anchored-popover";
import { IconCheck, IconChevronDown } from "../icons";
import { modelDisplayName, modelParamOptions, providerLabel } from "../cloud-computer/agent-dialog/notice";
import { modelControls } from "../cloud-computer/agent-dialog/model-controls";
import {
  coerceOptionValue,
  optionCurrentWire,
  readModelParamMemory,
  rememberModelParam,
  restoresForModel,
} from "../cloud-computer/agent-dialog/model-param-memory";
import type { AgentDialogController, DialogConfigOption, DialogModel, ModeOption } from "../cloud-computer/agent-dialog/types";

export type NativeEffortChoices = { current: string; options: { value: string; name: string }[] };

export type NativeModelPickerProps = {
  /** The program (claude / codex / cursor / hermes): picks plain-language mode names. */
  program?: string;
  models: DialogModel[];
  selected: string;
  onSelect: (id: string) => void;
  mode?: ModeOption | null;
  selectedMode?: string;
  onMode?: (value: string) => void;
  /** Model parameters the program reports right now (fast, effort, …): `modelParamOptions`. */
  params?: DialogConfigOption[];
  /** A parameter choice (wire value). The host remembers it and calls the controller's setter. */
  onParam?: (option: DialogConfigOption, wire: string) => void;
  /** Codex catalogs that encode effort in model ids (`gpt-5[high]`): picking one selects that id. */
  effort?: NativeEffortChoices | null;
  onEffort?: (wire: string) => void;
  /** The program has fast mode for some models: say so when the current model lacks it. */
  fastSupported?: boolean;
  /**
   * Remembered parameter choices for the current model. Applied through
   * `onParam` once per catalog while `fresh` (no native session open yet).
   */
  remembered?: Record<string, string>;
  fresh?: boolean;
  /** Nothing known yet: a disabled "正在读取…" trigger. */
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Programs whose adapters offer a fast mode on at least some models. */
const FAST_PROGRAMS = new Set(["claude", "codex"]);

export function programOffersFast(program: string | null | undefined): boolean {
  return Boolean(program && FAST_PROGRAMS.has(program));
}

export function isFastOption(option: DialogConfigOption): boolean {
  return /fast|speed|service.?tier/.test(`${option.id} ${option.category} ${option.name}`.toLowerCase());
}

/** On/off wires for a two-choice fast option, or null when it is not a plain toggle. */
export function fastWires(option: DialogConfigOption): { on: string; off: string } | null {
  if (option.options.length !== 2) return null;
  const on = option.options.find((choice) => /^(true|on|fast|enabled?)$/i.test(choice.value))
    || option.options.find((choice) => /fast|快速/i.test(choice.name) && !/standard|标准|off/i.test(choice.name));
  const off = option.options.find((choice) => choice !== on);
  return on && off ? { on: on.value, off: off.value } : null;
}

function isEffortOption(option: DialogConfigOption): boolean {
  return /effort|reason|thought|think/.test(`${option.id} ${option.category}`.toLowerCase());
}

/** The program's own mode ids in plain language; unknown ids keep the program's name. */
export function nativeModeLabel(program: string | undefined, choice: { value: string; name: string }, tt: UITranslate): string {
  const labels: Record<string, Record<string, string>> = {
    claude: {
      default: tt("手动确认"),
      acceptEdits: tt("自动接受改动"),
      plan: tt("计划"),
      auto: tt("自动"),
      bypassPermissions: tt("全部放行"),
    },
    codex: {
      "read-only": tt("只读"),
      agent: tt("代理"),
      "agent-full-access": tt("完全访问"),
    },
  };
  return (program && labels[program]?.[choice.value]) || choice.name || choice.value;
}

function unusableReason(model: DialogModel, tt: UITranslate): string {
  const provider = model.provider_label || providerLabel(model.provider || "") || tt("供应商");
  if (model.reason === "needs_credits") return tt("{provider} 的付费模型需要账户余额。", { provider });
  if (model.reason === "no_credentials") return tt("{provider} 还没有登录。", { provider });
  return tt("这个模型现在不可用。");
}

function groupsOf(models: DialogModel[]): { label: string; models: DialogModel[] }[] {
  const groups = new Map<string, DialogModel[]>();
  for (const model of models) {
    const label = model.provider_label || (model.provider ? providerLabel(model.provider) : "");
    groups.set(label, [...(groups.get(label) || []), model]);
  }
  return Array.from(groups, ([label, rows]) => ({ label, models: rows }));
}

/** Same cap as ModelPicker POPOVER_MAX_HEIGHT (kept local to avoid pulling the account client in). */
const POPOVER_MAX_HEIGHT = 360;

const ROW =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:cursor-default disabled:opacity-60";
const HEADER = "px-3 pb-1 pt-1.5 text-[11px] font-semibold text-neutral-800";
const SECTION = "mt-1 border-t border-neutral-100 pt-1";

function TriggerGlyph() {
  return (
    <svg className="h-3 w-3 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 7h14M5 12h14M5 17h14" strokeLinecap="round" />
      <circle cx="8" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="11" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const TRIGGER =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:scale-95 disabled:cursor-default disabled:opacity-50";

function ChoiceRow({ selected, label, detail, disabled = false, onPick, attrs }: {
  selected: boolean;
  label: string;
  detail?: string;
  disabled?: boolean;
  onPick: () => void;
  attrs: Record<string, string>;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      title={detail || label}
      onClick={onPick}
      className={`${ROW} ${selected ? "bg-neutral-50" : "hover:bg-neutral-50/70"}`}
      {...attrs}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-neutral-900">{label}</span>
        {detail ? <span className="block truncate text-[10px] text-neutral-400">{detail}</span> : null}
      </span>
      {selected ? <IconCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}
    </button>
  );
}

function FastSwitch({ checked, disabled, reason, onToggle }: {
  checked: boolean;
  disabled: boolean;
  reason?: string;
  onToggle?: () => void;
}) {
  const tt = useUI();
  return (
    <div className="flex items-center gap-2 px-3 py-1" data-native-fast-row="" data-native-fast-disabled={disabled ? "" : undefined}>
      <span className="min-w-0 flex-1">
        <span className={`block text-[12px] font-medium ${disabled ? "text-neutral-400" : "text-neutral-900"}`}>{tt("快速模式")}</span>
        {reason ? <span className="block text-[10px] text-neutral-400" data-native-fast-reason="">{reason}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={tt("快速模式")}
        title={reason || tt("快速模式")}
        disabled={disabled}
        onClick={onToggle}
        className="flex h-8 w-11 shrink-0 items-center justify-center disabled:cursor-default disabled:opacity-50"
        data-native-fast-toggle=""
      >
        <span
          aria-hidden="true"
          className={`relative block h-5 w-9 rounded-full transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
            checked ? "bg-neutral-900" : "bg-neutral-200"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
              checked ? "left-4" : "left-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
}

export function NativeModelPicker({
  program,
  models,
  selected,
  onSelect,
  mode = null,
  selectedMode = "",
  onMode,
  params = [],
  onParam,
  effort = null,
  onEffort,
  fastSupported = false,
  remembered,
  fresh = false,
  loading = false,
  disabled = false,
  className = "",
}: NativeModelPickerProps) {
  const tt = useUI();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // Remembered fast / effort for this program and computer: a fresh view
  // starts from the user's last choice for this model, sent through the same
  // setter as a click.
  const restoredFor = useRef("");
  const onParamRef = useRef(onParam);
  onParamRef.current = onParam;
  useEffect(() => {
    if (!fresh || !remembered || !onParamRef.current) return;
    const key = `${selected}|${params.map((option) => `${option.id}:${optionCurrentWire(option)}`).join(",")}|${JSON.stringify(remembered)}`;
    if (restoredFor.current === key) return;
    restoredFor.current = key;
    for (const { option, wire } of restoresForModel(params, remembered)) onParamRef.current(option, wire);
  }, [fresh, remembered, params, selected]);

  if (loading) {
    return (
      <div className={className} data-native-model-picker="" data-native-model-loading="">
        <button type="button" disabled className={`${TRIGGER} border-neutral-200/90 bg-stone-50/80 text-neutral-600`} data-native-model-trigger="">
          <TriggerGlyph />
          <span className="max-w-[140px] truncate">{tt("正在读取…")}</span>
        </button>
      </div>
    );
  }

  const active = models.find((model) => model.id === selected);
  const modeChoices = mode?.options ?? [];
  const modeChoice = modeChoices.find((choice) => choice.value === selectedMode);
  const modeName = modeChoice ? nativeModeLabel(program, modeChoice, tt) : "";
  const fastOption = params.find((option) => isFastOption(option) && fastWires(option));
  const fastPair = fastOption ? fastWires(fastOption) : null;
  const fastOn = Boolean(fastOption && fastPair && optionCurrentWire(fastOption) === fastPair.on);
  const otherParams = params.filter((option) => option !== fastOption);
  const showFastUnavailable = !fastOption && fastSupported && !params.some(isFastOption);
  const modelName = active ? modelDisplayName(active) : models.length ? tt("选择模型") : "";
  const summary = [modelName, modeName, fastOn ? tt("快速") : ""].filter(Boolean).join(" · ") || tt("模式");
  const groups = groupsOf(models);
  const grouped = groups.length > 1 || Boolean(groups[0]?.label);
  let sections = 0;
  const sectionClass = () => (sections++ ? SECTION : "");

  return (
    <div className={className} data-native-model-picker="">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${TRIGGER} ${
          open
            ? "border-neutral-300 bg-neutral-100 text-neutral-900"
            : "border-neutral-200/90 bg-stone-50/80 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900"
        }`}
        title={summary}
        data-native-model-trigger=""
      >
        <TriggerGlyph />
        <span className="max-w-[200px] truncate" data-native-model-summary="">{summary}</span>
        <span className={`shrink-0 text-neutral-400 transition-transform duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${open ? "rotate-180" : ""}`}>
          <IconChevronDown className="h-3 w-3" />
        </span>
      </button>

      <AnchoredPopover
        open={open && !disabled}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        align="end"
        preferredPlacement="above"
        maxHeight={POPOVER_MAX_HEIGHT}
        role="listbox"
        ariaLabel={tt("模型")}
        className="z-50 flex w-[min(16rem,88vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
        attributes={{ "data-native-model-popover": true }}
      >
        <div data-model-picker-list className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-width:thin]">
          {models.length ? (
            <div className={sectionClass()} data-native-section="model">
              <p className={HEADER}>{tt("模型")}</p>
              {groups.map((group) => (
                <div key={group.label || "models"}>
                  {grouped && group.label ? (
                    <p className="px-3 pb-0.5 pt-1.5 text-[10px] text-neutral-400">{group.label}</p>
                  ) : null}
                  {group.models.map((model) => {
                    const isSelected = model.id === selected;
                    const usable = model.usable !== false;
                    return (
                      <ChoiceRow
                        key={model.id}
                        selected={isSelected}
                        label={modelDisplayName(model)}
                        detail={usable ? undefined : unusableReason(model, tt)}
                        disabled={!usable}
                        onPick={() => {
                          setOpen(false);
                          if (!isSelected) onSelect(model.id);
                        }}
                        attrs={{ "data-native-model-option": model.id }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}

          {effort && effort.options.length > 1 && onEffort ? (
            <div className={sectionClass()} data-native-section="effort">
              <p className={HEADER}>{tt("推理强度")}</p>
              {effort.options.map((choice) => (
                <ChoiceRow
                  key={choice.value}
                  selected={choice.value === effort.current}
                  label={choice.name}
                  onPick={() => {
                    setOpen(false);
                    if (choice.value !== effort.current) onEffort(choice.value);
                  }}
                  attrs={{ "data-native-effort-option": choice.value }}
                />
              ))}
            </div>
          ) : null}

          {otherParams.map((option) => {
            const current = optionCurrentWire(option);
            return (
              <div key={option.id} className={sectionClass()} data-native-section={`param:${option.id}`}>
                <p className={HEADER}>{isEffortOption(option) ? tt("推理强度") : option.name || option.id}</p>
                {option.options.map((choice) => (
                  <ChoiceRow
                    key={choice.value}
                    selected={choice.value === current}
                    label={choice.name || choice.value}
                    disabled={!onParam}
                    onPick={() => {
                      setOpen(false);
                      if (choice.value !== current) onParam?.(option, choice.value);
                    }}
                    attrs={{ "data-native-param-option": `${option.id}:${choice.value}` }}
                  />
                ))}
              </div>
            );
          })}

          {fastOption && fastPair ? (
            <div className={sectionClass()} data-native-section="fast">
              <FastSwitch
                checked={fastOn}
                disabled={!onParam}
                onToggle={() => onParam?.(fastOption, fastOn ? fastPair.off : fastPair.on)}
              />
            </div>
          ) : showFastUnavailable ? (
            <div className={sectionClass()} data-native-section="fast">
              <FastSwitch checked={false} disabled reason={tt("当前模型不支持快速模式")} />
            </div>
          ) : null}

          {modeChoices.length && onMode ? (
            <div className={sectionClass()} data-native-section="mode">
              <p className={HEADER}>{tt("模式")}</p>
              {modeChoices.map((choice) => {
                const isSelected = choice.value === selectedMode;
                return (
                  <ChoiceRow
                    key={choice.value}
                    selected={isSelected}
                    label={nativeModeLabel(program, choice, tt)}
                    onPick={() => {
                      setOpen(false);
                      if (!isSelected) onMode(choice.value);
                    }}
                    attrs={{ "data-native-mode-option": choice.value }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </AnchoredPopover>
    </div>
  );
}

export type NativePickerDialog = Pick<
  AgentDialogController,
  "models" | "configOptions" | "selectedModel" | "setSelectedModel" | "mode" | "selectedMode" | "setMode" | "setConfig" | "activeSession"
>;

/**
 * The composer control for one native conversation (contract C4), built from
 * the headless controller. Shown as soon as the program reports models, modes
 * or options (a draft before the first send included). `waiting` = nothing is
 * known yet but it is on its way: a disabled "正在读取…" trigger. Choices are
 * remembered per program and computer and go out through the controller's own
 * setters (`setSelectedModel` / `setMode` / `setConfig`).
 */
export function nativeModelPickerFor({ program, computerId, dialog, waiting }: {
  /** null = no picker (no program, hidden, or the computer is offline). */
  program: string | null;
  computerId: string;
  dialog: NativePickerDialog;
  waiting: boolean;
}): ReactNode | null {
  if (!program) return null;
  const configOptions = dialog.configOptions || [];
  const memory = readModelParamMemory(computerId, program);
  const controls = modelControls(program, dialog.models, configOptions, dialog.selectedModel, memory);
  const params = modelParamOptions(configOptions, dialog.mode?.id);
  const hasModes = Boolean(dialog.mode && dialog.mode.options.length > 0);
  const known = controls.models.length > 0 || hasModes || params.length > 0 || Boolean(controls.effort);
  if (!known) return waiting ? <NativeModelPicker models={[]} selected="" onSelect={() => undefined} loading /> : null;
  const remember = (configId: string, wire: string) => {
    if (controls.memoryModel) rememberModelParam(computerId, program, controls.memoryModel, configId, wire);
  };
  return (
    <NativeModelPicker
      program={program}
      models={controls.models}
      selected={controls.selected}
      onSelect={dialog.setSelectedModel}
      mode={dialog.mode}
      selectedMode={dialog.selectedMode}
      onMode={dialog.setMode}
      params={params}
      onParam={(option, wire) => {
        remember(option.id, wire);
        dialog.setConfig(option.id, coerceOptionValue(option, wire));
      }}
      effort={controls.effort}
      onEffort={(wire) => {
        const name = controls.effort?.options.find((choice) => choice.value === wire)?.name;
        if (name) remember("reasoning_effort", name);
        dialog.setSelectedModel(wire);
      }}
      fastSupported={programOffersFast(program)}
      remembered={memory[controls.memoryModel]}
      fresh={!dialog.activeSession}
    />
  );
}
