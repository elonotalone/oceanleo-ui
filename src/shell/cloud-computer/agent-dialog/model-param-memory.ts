import type { DialogConfigOption } from "./types";

export type ModelParamMemory = Record<string, Record<string, string>>;

const PREFIX = "oceanleo.acp.modelParams.";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function modelParamMemoryKey(computerId: string, program: string): string {
  return `${PREFIX}${computerId || "local"}.${program}`;
}

export function optionCurrentWire(option: DialogConfigOption): string {
  return option.type === "bool" ? String(option.current === true) : String(option.current ?? "");
}

export function optionAllowsWire(option: DialogConfigOption, wire: string | undefined): boolean {
  return Boolean(wire) && option.options.some((choice) => choice.value === wire);
}

export function optionChoiceName(option: DialogConfigOption): string {
  const wire = optionCurrentWire(option);
  return option.options.find((choice) => choice.value === wire)?.name || wire;
}

export function coerceOptionValue(option: DialogConfigOption, wire: string): string | boolean {
  return option.type === "bool" ? wire === "true" : wire;
}

export function readModelParamMemory(computerId: string, program: string): ModelParamMemory {
  const raw = storage()?.getItem(modelParamMemoryKey(computerId, program));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ModelParamMemory = {};
    for (const [modelId, params] of Object.entries(parsed as Record<string, unknown>)) {
      if (!modelId || !params || typeof params !== "object" || Array.isArray(params)) continue;
      const row: Record<string, string> = {};
      for (const [configId, value] of Object.entries(params as Record<string, unknown>)) {
        if (configId && typeof value === "string") row[configId] = value;
        if (configId && typeof value === "boolean") row[configId] = String(value);
      }
      out[modelId] = row;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeModelParamMemory(
  computerId: string,
  program: string,
  memory: ModelParamMemory,
): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(modelParamMemoryKey(computerId, program), JSON.stringify(memory));
  } catch {
    /* Storage may be unavailable. */
  }
}

export function rememberModelParam(
  computerId: string,
  program: string,
  modelId: string,
  configId: string,
  wire: string,
): void {
  if (!modelId || !configId) return;
  const memory = readModelParamMemory(computerId, program);
  memory[modelId] = { ...memory[modelId], [configId]: wire };
  writeModelParamMemory(computerId, program, memory);
}

export function mergeLiveParams(
  remembered: Record<string, string> | undefined,
  options: DialogConfigOption[],
): Record<string, string> {
  const next = { ...remembered };
  for (const option of options) {
    const current = optionCurrentWire(option);
    const want = next[option.id];
    if (!optionAllowsWire(option, want) && current) next[option.id] = current;
  }
  return next;
}

export function restoresForModel(
  options: DialogConfigOption[],
  remembered: Record<string, string> | undefined,
): { option: DialogConfigOption; wire: string }[] {
  if (!remembered) return [];
  const out: { option: DialogConfigOption; wire: string }[] = [];
  for (const option of options) {
    const want = remembered[option.id];
    if (!optionAllowsWire(option, want)) continue;
    if (want === optionCurrentWire(option)) continue;
    out.push({ option, wire: want });
  }
  return out;
}

export function clearModelParamMemory(): void {
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) store.removeItem(key);
}

export function tuningSummary(
  params: DialogConfigOption[],
  modeName: string,
): string {
  const parts = params.map(optionChoiceName);
  if (modeName) parts.push(modeName);
  return parts.filter(Boolean).join(" · ");
}

