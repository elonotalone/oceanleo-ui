"use client";

// ============================================================================
// A program's model catalog, kept per user + computer + program (2026-10-31)
// ----------------------------------------------------------------------------
// The composer's model pill used to say 「正在读取…」 until the computer had
// started the program and answered `{t:"models"}` (seconds on a cold start).
// The last `models` and `config` frames a computer sent for a program are kept
// here (memory + localStorage, user-scoped, dropped on sign-out) and replayed
// into a new view's state through the same reducer the live frames go through,
// so the pill names the model at once. Fresh frames replace them as they arrive.
// Keyed by computer + program only: the homepage, every task page and every
// task session on that computer share one catalog.
// Only the catalog fields are kept (never session ids, refs or tokens).
// ============================================================================

import { cacheUser, onUserScopedClear, readUserJson, writeUserJson } from "../../../lib/user-scoped-cache";

type CatalogFrame = Record<string, unknown>;
type Catalog = { models?: CatalogFrame; config?: CatalogFrame };

const memory = new Map<string, Catalog>();
onUserScopedClear(() => memory.clear());

/** "" = nothing kept: no computer / program, or no known signed-in user. */
function key(computerId: string, program: string): string {
  return computerId && program && cacheUser() ? `${computerId}|${program}` : "";
}

function storageName(computerId: string, program: string): string {
  return `model-catalog:${computerId}:${program}`;
}

/** The catalog part of a frame (no session / ref / anything else the frame carried). */
function catalogFrame(frame: CatalogFrame, program: string): CatalogFrame | null {
  if (frame.t === "models") {
    if (!Array.isArray(frame.models) || frame.models.length === 0) return null;
    return { t: "models", program, models: frame.models, ...(typeof frame.source === "string" ? { source: frame.source } : {}) };
  }
  if (frame.t === "config") {
    if (!Array.isArray(frame.options) || frame.options.length === 0) return null;
    return { t: "config", program, options: frame.options };
  }
  return null;
}

/** Keep a live `models` / `config` frame for this computer + program (others are ignored). */
export function rememberModelCatalogFrame(computerId: string, program: string, frame: CatalogFrame): void {
  const id = key(computerId, program);
  if (!id) return;
  const kept = catalogFrame(frame, program);
  if (!kept) return;
  const current = memory.get(id) ?? readUserJson<Catalog>(storageName(computerId, program)) ?? {};
  const next: Catalog = kept.t === "models" ? { ...current, models: kept } : { ...current, config: kept };
  memory.set(id, next);
  writeUserJson(storageName(computerId, program), next);
}

/** The kept frames to replay, models first (the order the gateway sends them). */
export function modelCatalogFrames(computerId: string, program: string): CatalogFrame[] {
  const id = key(computerId, program);
  if (!id) return [];
  let catalog = memory.get(id);
  if (!catalog) {
    const saved = readUserJson<Catalog>(storageName(computerId, program));
    if (saved && typeof saved === "object") {
      catalog = saved;
      memory.set(id, saved);
    }
  }
  if (!catalog) return [];
  return [catalog.models, catalog.config].filter((frame): frame is CatalogFrame =>
    Boolean(frame && typeof frame === "object" && frame.program === program));
}

/** Test seam. */
export function clearModelCatalogMemory(): void {
  memory.clear();
}
