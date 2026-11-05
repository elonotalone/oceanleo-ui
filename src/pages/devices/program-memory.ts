type StoredParams = Record<string, string>;
type StoredMemory = Record<string, StoredParams>;

export type ProgramMemoryOption = { id: string; default?: boolean };
export type ProgramMemoryOptions = {
  models?: ProgramMemoryOption[];
  modes?: ProgramMemoryOption[];
  efforts?: ProgramMemoryOption[];
  fast?: boolean | { available: boolean };
};
export type ProgramMemoryPreferences = {
  model?: string;
  mode?: string;
  effort?: string;
  fast?: boolean;
};

const MODEL_PARAMS_PREFIX = "oceanleo.acp.modelParams.";
const SELECTION_PREFIX = "oceanleo.acp.selection.";
const LAST_PROGRAM_PREFIX = "oceanleo.serverPage.lastProgram.";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be disabled or full. Picker state still works in memory.
  }
}

function storageComputerId(computerId: string): string {
  return computerId || "local";
}

export function modelParamMemoryKey(computerId: string, program: string): string {
  return `${MODEL_PARAMS_PREFIX}${storageComputerId(computerId)}.${program}`;
}

export function programSelectionKey(computerId: string, program: string): string {
  return `${SELECTION_PREFIX}${storageComputerId(computerId)}.${program}`;
}

export function lastProgramKey(computerId: string): string {
  return `${LAST_PROGRAM_PREFIX}${storageComputerId(computerId)}`;
}

export function readLastProgram(computerId: string): string | undefined {
  try {
    return storage()?.getItem(lastProgramKey(computerId)) || undefined;
  } catch {
    return undefined;
  }
}

export function rememberLastProgram(computerId: string, program: string): void {
  try {
    storage()?.setItem(lastProgramKey(computerId), program);
  } catch {
    // Storage errors are intentionally non-fatal.
  }
}

export function readProgramSelection(computerId: string, program: string): { model?: string; mode?: string } {
  const value = readJson<{ model?: unknown; mode?: unknown }>(programSelectionKey(computerId, program));
  return {
    ...(typeof value?.model === "string" ? { model: value.model } : {}),
    ...(typeof value?.mode === "string" ? { mode: value.mode } : {}),
  };
}

export function rememberProgramSelection(computerId: string, program: string, patch: { model?: string; mode?: string }): void {
  writeJson(programSelectionKey(computerId, program), {...readProgramSelection(computerId, program), ...patch});
}

export function readModelParamMemory(computerId: string, program: string): StoredMemory {
  const value = readJson<Record<string, Record<string, unknown>>>(modelParamMemoryKey(computerId, program));
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([model, params]) => [model,
    Object.fromEntries(Object.entries(params || {}).filter(([, item]) => typeof item === "string" || typeof item === "boolean").map(([key, item]) => [key, String(item)])),
  ]));
}

export function rememberModelParam(computerId: string, program: string, model: string, key: string, value: string | boolean): void {
  const memory = readModelParamMemory(computerId, program);
  memory[model] = {...memory[model], [key]: String(value)};
  writeJson(modelParamMemoryKey(computerId, program), memory);
}

function offeredValue(options: ProgramMemoryOption[] | undefined, candidate: string | undefined): string | undefined {
  if (!options?.length) return undefined;
  return (candidate && options.some((item) => item.id === candidate) ? candidate : undefined)
    || options.find((item) => item.default)?.id
    || options[0].id;
}

function fastAvailable(value: ProgramMemoryOptions["fast"]): boolean {
  return typeof value === "object" ? value.available : value === true;
}

function storedBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "true" || value === "1" || value === "on";
}

export function restoreProgramPreferences(computerId: string, program: string, options: ProgramMemoryOptions): ProgramMemoryPreferences {
  const selection = readProgramSelection(computerId, program);
  const memory = readModelParamMemory(computerId, program);
  const model = offeredValue(options.models, selection.model);
  const params = model ? memory[model] || {} : {};
  const mode = offeredValue(options.modes, params.mode ?? selection.mode);
  const effort = offeredValue(options.efforts, params.reasoning_effort ?? params.effort);
  const fast = fastAvailable(options.fast) ? (storedBoolean(params.fast_mode ?? params.fast) ?? true) : undefined;
  return { ...(model ? {model} : {}), ...(mode ? {mode} : {}), ...(effort ? {effort} : {}), ...(fast !== undefined ? {fast} : {}) };
}

export function rememberProgramPreferences(computerId: string, program: string, preferences: ProgramMemoryPreferences): void {
  rememberLastProgram(computerId, program);
  const selection: { model?: string; mode?: string } = {};
  if (preferences.model) selection.model = preferences.model;
  if (preferences.mode) selection.mode = preferences.mode;
  if (selection.model || selection.mode) rememberProgramSelection(computerId, program, selection);
  if (preferences.model) {
    if (preferences.mode) rememberModelParam(computerId, program, preferences.model, "mode", preferences.mode);
    if (preferences.effort) rememberModelParam(computerId, program, preferences.model, "reasoning_effort", preferences.effort);
    if (preferences.fast !== undefined) rememberModelParam(computerId, program, preferences.model, "fast_mode", preferences.fast);
  }
}
