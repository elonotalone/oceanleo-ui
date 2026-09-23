import type { CliProgram } from "../../../lib/cloud-computer-api";

export const CLI_SETTINGS_STORAGE_KEY = "oceanleo.cli.settings.v1";

export type CliOptionValue = string | boolean;

export type CliProgramSettings = {
  options: Record<string, CliOptionValue>;
  confirmDangerous?: boolean;
};

type CliSettingsStore = Record<string, CliProgramSettings>;
type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): SettingsStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function scopeKey(computerId: string, program: string): string {
  return `${computerId}:${program}`;
}

function parseStore(raw: string | null): CliSettingsStore {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as CliSettingsStore)
      : {};
  } catch {
    return {};
  }
}

function normalizeStored(value: unknown): CliProgramSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { options: {} };
  }
  const raw = value as {
    options?: unknown;
    confirmDangerous?: unknown;
  };
  const options: Record<string, CliOptionValue> = {};
  if (raw.options && typeof raw.options === "object" && !Array.isArray(raw.options)) {
    for (const [key, option] of Object.entries(raw.options)) {
      if (typeof option === "string" || typeof option === "boolean") {
        options[key] = option;
      }
    }
  }
  return {
    options,
    ...(typeof raw.confirmDangerous === "boolean"
      ? { confirmDangerous: raw.confirmDangerous }
      : {}),
  };
}

export function readCliProgramSettings(
  computerId: string,
  program: string,
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): CliProgramSettings {
  if (!storage) return { options: {} };
  try {
    const store = parseStore(storage.getItem(CLI_SETTINGS_STORAGE_KEY));
    return normalizeStored(store[scopeKey(computerId, program)]);
  } catch {
    return { options: {} };
  }
}

export function writeCliProgramSettings(
  computerId: string,
  program: string,
  settings: CliProgramSettings,
  storage: SettingsStorage | null = browserStorage(),
): CliProgramSettings {
  const normalized = normalizeStored(settings);
  if (!storage) return normalized;
  try {
    const store = parseStore(storage.getItem(CLI_SETTINGS_STORAGE_KEY));
    store[scopeKey(computerId, program)] = normalized;
    storage.setItem(CLI_SETTINGS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    return normalized;
  }
  return normalized;
}

function validProgramOptions(
  program: CliProgram,
  stored: Readonly<Record<string, CliOptionValue>>,
): Record<string, CliOptionValue> {
  const result: Record<string, CliOptionValue> = {};
  for (const option of program.options) {
    const candidate = stored[option.key] ?? option.default;
    if (option.type === "bool") {
      result[option.key] =
        typeof candidate === "boolean"
          ? candidate
          : typeof option.default === "boolean"
            ? option.default
            : false;
      continue;
    }
    const fallback = typeof option.default === "string" ? option.default : "";
    const selected = typeof candidate === "string" ? candidate : fallback;
    const choices = option.choices ?? [];
    result[option.key] =
      choices.length === 0 || choices.some((choice) => choice.value === selected)
        ? selected
        : fallback;
  }
  return result;
}

export function cliLaunchOptions(
  program: CliProgram,
  settings: CliProgramSettings,
  serverConfirmDangerous: boolean,
): Record<string, CliOptionValue> {
  return {
    ...validProgramOptions(program, settings.options),
    confirm_dangerous:
      settings.confirmDangerous ?? serverConfirmDangerous,
  };
}

