import { request, type AcpCatalog, type AcpSessionChoices } from "../../lib/acp-frames-api";
import { listedConfigValue } from "../cloud-computer/agent-dialog/model-param-memory";
import { parseConfigOptions } from "../cloud-computer/agent-dialog/parse";
import type { DialogConfigOption, DialogModel, ModeOption } from "../cloud-computer/agent-dialog/types";

/** Lists are scoped to the model that reported them, never inferred from its name. */
export type AcpSettingsState = Omit<AcpCatalog, "configOptions"> & { configOptions?: unknown[] | null };
export type AcpModelCatalog = AcpSettingsState & {
  byModel?: Record<string, { configOptions?: unknown[] | null; modes?: AcpCatalog["modes"]; seenAt?: string }>;
};
export type AcpSettingChange = { kind: "model" | "mode" | "config"; id?: string; value: string | boolean };
export type AcpSettingsLists = { models: DialogModel[]; configOptions: DialogConfigOption[]; mode: ModeOption | null };

export function settingsModel(state: AcpSettingsState | null | undefined): string {
  const model = parseConfigOptions(state?.configOptions).find((option) => option.category === "model" || option.id === "model");
  return String(model?.current || state?.models?.currentModelId || "");
}

function settingsMode(raw: unknown): ModeOption | null {
  const options = parseConfigOptions(raw);
  // Another parameter can also use the mode category (e.g. collaboration_mode).
  const mode = options.find((option) => option.id === "mode") ?? options.find((option) => option.category === "mode");
  return mode ? { id: mode.id, name: mode.name, current: String(mode.current), options: mode.options } : null;
}

function independent(option: DialogConfigOption): boolean {
  return option.id === "model" || option.category === "model" || option.id === "mode" || option.category === "mode";
}

export function settingsLists(catalog: AcpModelCatalog | null, model: string, live?: AcpSettingsState | null): AcpSettingsLists {
  const matches = live && settingsModel(live) === model;
  const saved = catalog?.byModel?.[model];
  const source = matches ? live : saved;
  const raw = source?.configOptions ?? null;
  const hasLiveLists = live && (live.configOptions != null || live.models?.availableModels?.length || live.modes?.availableModes?.length);
  const base = hasLiveLists ? live : catalog;
  const configOptions = raw !== null ? parseConfigOptions(raw) : parseConfigOptions(base?.configOptions).filter(independent);
  const modelsState = (matches ? live?.models : null) ?? catalog?.models;
  const models = (modelsState?.availableModels ?? []).map((item) => ({
    id: item.modelId, name: item.name || item.modelId, default: item.modelId === modelsState?.currentModelId,
  }));
  const modesState = source?.modes ?? (source ? null : base?.modes);
  // A config mode list is model-specific too (Claude's Auto mode can disappear).
  const mode = settingsMode(raw) ?? (modesState?.availableModes?.length ? {
    id: "mode", name: "", current: modesState.currentModeId || "",
    options: modesState.availableModes.map((item) => ({ value: item.id, name: item.name || item.id })),
  } : raw === null ? settingsMode(base?.configOptions) : null);
  return { models, configOptions, mode };
}

/** Invalid remembered values and model/mode config duplicates never reach the gateway. */
export function offeredChoices(next: AcpSessionChoices, lists: AcpSettingsLists): AcpSessionChoices {
  const modelOption = lists.configOptions.find((option) => option.category === "model" || option.id === "model");
  const modelIds = modelOption?.options.map((option) => option.value) ?? lists.models.map((model) => model.id);
  const config = Object.fromEntries(lists.configOptions.flatMap((option) => {
    if (option.id === "model" || option.category === "model" || option.id === lists.mode?.id) return [];
    const value = listedConfigValue(option, next.config?.[option.id]);
    return value === undefined ? [] : [[option.id, value] as const];
  }));
  return {
    ...(next.model && modelIds.includes(next.model) ? { model: next.model } : {}),
    ...(next.mode && lists.mode?.options.some((option) => option.value === next.mode) ? { mode: next.mode } : {}),
    ...(Object.keys(config).length ? { config } : {}),
  };
}

export function reportedChoices(state: AcpSettingsState | null | undefined): AcpSessionChoices {
  const options = parseConfigOptions(state?.configOptions);
  const modeOption = settingsMode(state?.configOptions);
  const mode = modeOption?.current || state?.modes?.currentModeId;
  return {
    ...(settingsModel(state) ? { model: settingsModel(state) } : {}),
    ...(mode ? { mode } : {}),
    config: Object.fromEntries(options.filter((option) => option.id !== "model" && option.category !== "model" && option.id !== modeOption?.id).map((option) => [option.id, option.current])),
  };
}

/** Choices applied to this live session need not be repeated before each prompt. */
export function changedChoices(next: AcpSessionChoices, sent: AcpSessionChoices | null): AcpSessionChoices {
  if (!sent) return next;
  const config = Object.fromEntries(Object.entries(next.config ?? {}).filter(([id, value]) => sent.config?.[id] !== value));
  return {
    ...(next.model && next.model !== sent.model ? { model: next.model } : {}),
    ...(next.mode && next.mode !== sent.mode ? { mode: next.mode } : {}),
    ...(Object.keys(config).length ? { config } : {}),
  };
}

export function applyTaskSetting(taskId: string, change: AcpSettingChange): Promise<AcpSettingsState> {
  return request<AcpSettingsState>(`/v1/tasks/${encodeURIComponent(taskId)}/settings`, {
    method: "POST", body: JSON.stringify(change),
  });
}

/** `not_live` means keep the choice for the next prompt, without an error line. */
export function settingNotLive(error: unknown): boolean {
  const failure = error as { status?: number; code?: unknown; payload?: { detail?: { code?: unknown } } } | null;
  return failure?.status === 409 && (failure.code === "not_live" || failure.payload?.detail?.code === "not_live");
}
