// The user's last choice for a program on a computer — model, permission mode,
// options such as effort / fast — is kept by the gateway per user + computer +
// program (UX wave 2026-11-07, contract §2.1), so it is the same in every
// browser and on the phone. Before that wave this browser kept it in
// localStorage; the first read that finds nothing on the server sends that old
// copy up once and removes it.

import { getProgramChoice, putProgramChoice, programChoiceFrom, type ProgramChoice } from "../../../lib/program-choice-api";
import type { DialogConfigOption } from "./types";

/** Before 2026-11-07: `{modelId: {configId: wire}}` in this browser. */
const PARAMS_PREFIX = "oceanleo.acp.modelParams.";
/** Before 2026-11-07: `{model?, mode?}` in this browser. */
const SELECTION_PREFIX = "oceanleo.acp.selection.";

export function optionCurrentWire(option: DialogConfigOption): string {
  return option.type === "bool" ? String(option.current === true) : String(option.current ?? "");
}

export function coerceOptionValue(option: DialogConfigOption, wire: string): string | boolean {
  return option.type === "bool" ? wire === "true" : wire;
}

/**
 * A remembered option value in the setter's type when the program lists it
 * now; `undefined` when it does not (a remembered "xhigh" the current model
 * lacks is neither shown nor sent).
 */
export function listedConfigValue(option: DialogConfigOption, value: unknown): string | boolean | undefined {
  const wire = typeof value === "boolean" ? String(value) : typeof value === "string" ? value : "";
  return wire && option.options.some((choice) => choice.value === wire) ? coerceOptionValue(option, wire) : undefined;
}

export function hasProgramChoice(choice: ProgramChoice): boolean {
  return Boolean(choice.model || choice.mode || Object.keys(choice.config ?? {}).length);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storedObject(store: Storage, key: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(store.getItem(key) || "null") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** This browser's old copy for a program on a computer, or null when it has none. */
export function localProgramChoice(computerId: string, program: string): ProgramChoice | null {
  const store = storage();
  if (!store) return null;
  const selection = storedObject(store, `${SELECTION_PREFIX}${computerId}.${program}`) ?? {};
  const params = storedObject(store, `${PARAMS_PREFIX}${computerId}.${program}`) ?? {};
  const model = typeof selection.model === "string" ? selection.model : "";
  // Options were kept per model: the remembered model's (a Codex `gpt-5[high]` under `gpt-5`), else the only model's.
  const family = model.replace(/\[[^[\]]+\]$/, "");
  const models = Object.keys(params);
  const owner = model && model in params ? model : family && family in params ? family : models.length === 1 ? models[0] : "";
  const choice = programChoiceFrom({ model, mode: selection.mode, config: owner ? params[owner] : null });
  return hasProgramChoice(choice) ? choice : null;
}

export function forgetLocalProgramChoice(computerId: string, program: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(`${SELECTION_PREFIX}${computerId}.${program}`);
    store.removeItem(`${PARAMS_PREFIX}${computerId}.${program}`);
  } catch { /* Storage may be unavailable. */ }
}

/**
 * The stored choice. When the server has none and this browser still has its
 * old copy, that copy is stored once (PUT) and removed; when the server
 * already has one, the old copy is just removed.
 */
export async function readProgramChoice(computerId: string, program: string): Promise<ProgramChoice> {
  const stored = await getProgramChoice(computerId, program);
  const local = localProgramChoice(computerId, program);
  if (!local) return stored;
  if (hasProgramChoice(stored)) {
    forgetLocalProgramChoice(computerId, program);
    return stored;
  }
  await putProgramChoice(computerId, program, local);
  forgetLocalProgramChoice(computerId, program);
  return local;
}
