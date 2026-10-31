"use client";

// The native program's composer control, placed where ModelGroupPicker sits in
// LeoComposer. W7 (2026-10-31 evening): the pill shows the model name only
// ("Opus 4.x"); it opens the shared settings menu (composer-settings-menu) with
// one row per thing the program reports — model, reasoning effort, its other
// options, its modes, fast mode — and a row opens a card of choices beside it.
// 2026-10-31 night: the gear + right-pane settings are gone; this menu also
// carries 「这台电脑上的 <程序>」 (account: sign in / out, install, Key) and
// 「整台电脑」 (two switches) under headed sections, read-only while offline.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useUI, type UITranslate } from "../../i18n/ui/useUI";
import { ComposerSettingsMenu, type ComposerSettingRow, type ComposerSettingsOpenRequest } from "../composer-settings-menu";
import { cloudComputerApi, type CloudComputerClient } from "../../lib/cloud-computer-api";
import {
  machineSettingRows,
  offlineSettingRows,
  programAccountRow,
  useMachineSettings,
} from "../cloud-computer/native-surface/computer-settings-rows";
import type { NativeDialog } from "../cloud-computer/native-surface/ProgramAccess";
import { isWsProgram } from "../cloud-computer/agent-dialog/parse";
import { PROGRAM_LABEL } from "../cloud-computer/agent-dialog/types";
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
  /** The host's extra sections (account, whole computer, offline lock) around this conversation's rows. */
  decorateRows?: (rows: ComposerSettingRow[]) => ComposerSettingRow[];
  /** Pill text when the program reports no model or mode (its name). */
  fallbackSummary?: string;
  onOpenChange?: (open: boolean) => void;
  openRequest?: ComposerSettingsOpenRequest;
};

/**
 * A send held back by install / sign-in bumps this (AgentChat): the pill
 * opens on its 账号 card. 0 = never asked.
 */
export const NativeSetupRequest = createContext(0);

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

function modelGroupLabel(model: DialogModel): string {
  return model.provider_label || (model.provider ? providerLabel(model.provider) : "");
}

/** Claude Code / Codex modes are permission modes; other programs' modes keep the plain name. */
function modeRowLabel(program: string | undefined, tt: UITranslate): string {
  return program === "claude" || program === "codex" ? tt("权限模式") : tt("模式");
}

/**
 * The program's settings as menu rows: only what it reports now (models,
 * effort, other config options, its modes, fast). Nothing is hard-coded.
 */
export function nativeSettingRows({
  program, models, selected, onSelect, mode, selectedMode, onMode, params, onParam, effort, onEffort, fastSupported,
}: Required<Pick<NativeModelPickerProps, "models" | "selected" | "onSelect">> & Omit<NativeModelPickerProps, "models" | "selected" | "onSelect">, tt: UITranslate): ComposerSettingRow[] {
  const rows: ComposerSettingRow[] = [];
  const list = params ?? [];
  if (models.length) {
    const active = models.find((model) => model.id === selected);
    const providers = new Set(models.map(modelGroupLabel));
    const grouped = providers.size > 1;
    rows.push({
      id: "model",
      label: tt("模型"),
      value: active ? modelDisplayName(active) : tt("选择模型"),
      selected,
      choices: models.map((model) => {
        const usable = model.usable !== false;
        return {
          value: model.id,
          label: modelDisplayName(model),
          detail: usable ? (grouped ? modelGroupLabel(model) || undefined : undefined) : unusableReason(model, tt),
          disabled: !usable,
          attrs: { "data-native-model-option": model.id },
        };
      }),
      onPick: onSelect,
    });
  }
  if (effort && effort.options.length > 1 && onEffort) {
    rows.push({
      id: "effort",
      label: tt("推理强度"),
      value: effort.options.find((choice) => choice.value === effort.current)?.name ?? effort.current,
      selected: effort.current,
      choices: effort.options.map((choice) => ({ value: choice.value, label: choice.name, attrs: { "data-native-effort-option": choice.value } })),
      onPick: onEffort,
    });
  }
  const fastOption = list.find((option) => isFastOption(option) && fastWires(option));
  const fastPair = fastOption ? fastWires(fastOption) : null;
  for (const option of list) {
    if (option === fastOption) continue;
    const current = optionCurrentWire(option);
    rows.push({
      id: `param:${option.id}`,
      label: isEffortOption(option) ? tt("推理强度") : option.name || option.id,
      value: option.options.find((choice) => choice.value === current)?.name || current,
      selected: current,
      choices: option.options.map((choice) => ({ value: choice.value, label: choice.name || choice.value, attrs: { "data-native-param-option": `${option.id}:${choice.value}` } })),
      onPick: onParam ? (wire) => onParam(option, wire) : undefined,
    });
  }
  const modeChoices = mode?.options ?? [];
  if (modeChoices.length && onMode) {
    const current = modeChoices.find((choice) => choice.value === selectedMode);
    rows.push({
      id: "mode",
      label: modeRowLabel(program, tt),
      value: current ? nativeModeLabel(program, current, tt) : selectedMode ?? "",
      selected: selectedMode ?? "",
      choices: modeChoices.map((choice) => ({ value: choice.value, label: nativeModeLabel(program, choice, tt), attrs: { "data-native-mode-option": choice.value } })),
      onPick: onMode,
    });
  }
  if (fastOption && fastPair) {
    const on = optionCurrentWire(fastOption) === fastPair.on;
    rows.push({
      id: "fast",
      label: tt("快速模式"),
      value: on ? tt("开") : tt("关"),
      selected: on ? fastPair.on : fastPair.off,
      choices: [
        { value: fastPair.on, label: tt("开"), attrs: { "data-native-fast-option": "on" } },
        { value: fastPair.off, label: tt("关"), attrs: { "data-native-fast-option": "off" } },
      ],
      onPick: onParam ? (wire) => onParam(fastOption, wire) : undefined,
    });
  } else if (fastSupported && !list.some(isFastOption)) {
    // The program has fast mode, the current model does not: said, not hidden.
    rows.push({ id: "fast", label: tt("快速模式"), value: tt("关"), selected: "", choices: [], reason: tt("当前模型不支持快速模式") });
  }
  return rows;
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
  decorateRows,
  fallbackSummary,
  onOpenChange,
  openRequest,
}: NativeModelPickerProps) {
  const tt = useUI();

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

  const own = loading ? [] : nativeSettingRows({
    program, models, selected, onSelect, mode, selectedMode, onMode, params, onParam, effort, onEffort, fastSupported,
  }, tt);
  // The pill names the model only (operator 10-31: not `Opus 5.5 · Auto-accept edits`);
  // a program with no model list names its mode instead.
  const summary = own.find((row) => row.id === "model")?.value || own.find((row) => row.id === "mode")?.value || fallbackSummary || tt("模式");
  const rows = decorateRows && !loading ? decorateRows(own) : own;

  return (
    <ComposerSettingsMenu
      summary={summary}
      rows={rows}
      onOpenChange={onOpenChange}
      openRequest={openRequest}
      ariaLabel={tt("模型")}
      loading={loading}
      loadingLabel={tt("正在读取…")}
      disabled={disabled}
      className={className}
      rootAttrs={loading ? { "data-native-model-picker": "", "data-native-model-loading": "" } : { "data-native-model-picker": "" }}
      triggerAttrs={{ "data-native-model-trigger": "" }}
      summaryAttrs={{ "data-native-model-summary": "" }}
      popoverAttrs={{ "data-native-model-popover": true }}
    />
  );
}

export type NativePickerDialog = Pick<
  AgentDialogController,
  "models" | "configOptions" | "selectedModel" | "setSelectedModel" | "mode" | "selectedMode" | "setMode" | "setConfig" | "activeSession"
>;

/** The full controller (programs, login, install): the pill can carry the account section. */
function isNativeDialog(dialog: NativePickerDialog): dialog is NativeDialog {
  const full = dialog as Partial<NativeDialog>;
  return Array.isArray(full.programs) && Boolean(full.login) && Boolean(full.install);
}

/**
 * A native chat's pill with its computer sections: this conversation (the
 * picker's own rows), 「这台电脑上的 <程序>」 and 「整台电脑（所有程序）」.
 * The whole-computer settings are read the first time the menu opens.
 */
function NativeChatSettings({ program, computerId, dialog, online, client = cloudComputerApi, picker }: {
  program: string;
  computerId: string;
  dialog: NativeDialog;
  online: boolean;
  client?: CloudComputerClient;
  picker: NativeModelPickerProps;
}) {
  const tt = useUI();
  const [opened, setOpened] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const machine = useMachineSettings(computerId, client, opened && online);
  const setupRequest = useContext(NativeSetupRequest);
  const decorateRows = (own: ComposerSettingRow[]) => {
    const conversation = tt("本对话");
    const rows = [
      ...own.map((row) => ({ ...row, section: conversation })),
      ...(isWsProgram(program) ? [programAccountRow({ computerId, program, dialog, keyOpen, onKeyOpen: setKeyOpen, tt })] : []),
      ...machineSettingRows(machine, tt),
    ];
    return online ? rows : offlineSettingRows(rows, tt);
  };
  return (
    <NativeModelPicker
      {...picker}
      decorateRows={decorateRows}
      fallbackSummary={isWsProgram(program) ? PROGRAM_LABEL[program] : program}
      onOpenChange={(open) => { if (open) setOpened(true); }}
      openRequest={setupRequest ? { nonce: setupRequest, row: "account" } : undefined}
    />
  );
}

/**
 * The composer control for one native conversation (contract C4), built from
 * the headless controller. Shown as soon as the program reports models, modes
 * or options (a draft before the first send included). `waiting` = nothing is
 * known yet but it is on its way: a disabled "正在读取…" trigger. Choices are
 * remembered per program and computer and go out through the controller's own
 * setters (`setSelectedModel` / `setMode` / `setConfig`).
 */
export function nativeModelPickerFor({ program, computerId, dialog, waiting, online = true }: {
  /** null = no picker (no program, or hidden). */
  program: string | null;
  computerId: string;
  /** The full controller adds the account and whole-computer sections. */
  dialog: NativePickerDialog | NativeDialog;
  waiting: boolean;
  /** false = the computer is offline: the pill stays, every row read-only with the reason. */
  online?: boolean;
}): ReactNode | null {
  if (!program) return null;
  const configOptions = dialog.configOptions || [];
  const memory = readModelParamMemory(computerId, program);
  const controls = modelControls(program, dialog.models, configOptions, dialog.selectedModel, memory);
  const params = modelParamOptions(configOptions, dialog.mode?.id);
  const hasModes = Boolean(dialog.mode && dialog.mode.options.length > 0);
  const known = controls.models.length > 0 || hasModes || params.length > 0 || Boolean(controls.effort);
  const full = computerId && isNativeDialog(dialog) ? dialog : null;
  // Nothing known yet: a waiting trigger. A blocked program (not installed / signed
  // out) or an offline computer still gets the pill: its account and computer rows.
  if (!known && ((online && waiting) || !full)) return waiting ? <NativeModelPicker models={[]} selected="" onSelect={() => undefined} loading /> : null;
  const remember = (configId: string, wire: string) => {
    if (controls.memoryModel) rememberModelParam(computerId, program, controls.memoryModel, configId, wire);
  };
  const picker: NativeModelPickerProps = {
    program,
    models: controls.models,
    selected: controls.selected,
    onSelect: dialog.setSelectedModel,
    mode: dialog.mode,
    selectedMode: dialog.selectedMode,
    onMode: dialog.setMode,
    params,
    onParam: (option, wire) => {
      remember(option.id, wire);
      dialog.setConfig(option.id, coerceOptionValue(option, wire));
    },
    effort: controls.effort,
    onEffort: (wire) => {
      const name = controls.effort?.options.find((choice) => choice.value === wire)?.name;
      if (name) remember("reasoning_effort", name);
      dialog.setSelectedModel(wire);
    },
    fastSupported: programOffersFast(program),
    remembered: memory[controls.memoryModel],
    fresh: !dialog.activeSession,
  };
  return full
    ? <NativeChatSettings program={program} computerId={computerId} dialog={full} online={online} picker={picker} />
    : <NativeModelPicker {...picker} />;
}
