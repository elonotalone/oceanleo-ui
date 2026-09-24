"use client";

// ============================================================================
// leo 开关与面板位置：登录读写 /v1/personalization，未登录只走本机。
// localStorage 只做首帧缓存；旧键迁移一次之后以服务端为准。
// leo_panel ≤2KB，结构只有拖拽位：{ pos?: { left, top } }。
// ============================================================================

import {
  getPersonalization,
  updatePersonalization,
  type PersonalizationPatch,
} from "../../lib/personalization-api";
import { accessToken } from "../../lib/auth/client";

export const LEO_ENABLED_KEY = "oceanleo:leo-enabled";
export const LEO_ENABLED_EVENT = "oceanleo:leo-enabled-change";
export const LEO_POS_KEY = "oceanleo:leo-assistant-pos";
export const LEO_PREFS_MIGRATED_KEY = "oceanleo:leo-prefs-migrated";

export interface LeoPanelPos {
  left: number;
  top: number;
}

export interface LeoPanelPrefs {
  pos?: LeoPanelPos;
}

/** 用户动手写本机时 +1；进行中的服务端拉取看到世代变了就丢。 */
let prefsEpoch = 0;
let inflight: Promise<PullResult> | null = null;

export type PullResult =
  | { ok: true; enabled: boolean; panel: LeoPanelPrefs }
  | { ok: false; reason: "signed_out" | "unavailable" | "stale" };

function parsePos(value: unknown): LeoPanelPos | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as { left?: unknown; top?: unknown };
  if (typeof row.left === "number" && Number.isFinite(row.left) && typeof row.top === "number" && Number.isFinite(row.top)) {
    return { left: row.left, top: row.top };
  }
  return undefined;
}

function parsePanel(value: unknown): LeoPanelPrefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const pos = parsePos((value as { pos?: unknown }).pos);
  return pos ? { pos } : {};
}

function panelPayload(panel: LeoPanelPrefs): Record<string, unknown> {
  const raw: Record<string, unknown> = panel.pos ? { pos: panel.pos } : {};
  return JSON.stringify(raw).length <= 2048 ? raw : {};
}

function readFlag(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

export function isLeoEnabled(): boolean {
  return readFlag(LEO_ENABLED_KEY) !== "0";
}

export function readLeoPanelPos(): LeoPanelPos | null {
  const raw = readFlag(LEO_POS_KEY);
  if (!raw) return null;
  try {
    return parsePos(JSON.parse(raw)) ?? null;
  } catch {
    return null;
  }
}

function writeLeoEnabledLocal(on: boolean, bump: boolean): void {
  if (bump) prefsEpoch += 1;
  writeFlag(LEO_ENABLED_KEY, on ? "1" : "0");
}

function writeLeoPanelLocal(pos: LeoPanelPos, bump: boolean): void {
  if (bump) prefsEpoch += 1;
  writeFlag(LEO_POS_KEY, JSON.stringify(pos));
}

function announceEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LEO_ENABLED_EVENT, { detail: { enabled: on } }));
}

async function signedInPatch(patch: PersonalizationPatch): Promise<boolean> {
  try {
    const token = await accessToken();
    if (!token) return false;
    const res = await updatePersonalization(patch);
    return res.ok;
  } catch {
    return false;
  }
}

export function setLeoEnabled(on: boolean): void {
  writeLeoEnabledLocal(on, true);
  announceEnabled(on);
  void signedInPatch({ leo_enabled: on });
}

export function persistLeoPanelPos(pos: LeoPanelPos): void {
  writeLeoPanelLocal(pos, true);
  void signedInPatch({ leo_panel: panelPayload({ pos }) });
}

async function doPull(): Promise<PullResult> {
  const epoch = prefsEpoch;
  let res;
  try {
    res = await getPersonalization();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (epoch !== prefsEpoch) return { ok: false, reason: "stale" };
  if (!res.ok) {
    return { ok: false, reason: res.error === "signed_out" ? "signed_out" : "unavailable" };
  }

  let enabled = res.data.leo_enabled;
  let panel = parsePanel(res.data.leo_panel);
  const migrated = readFlag(LEO_PREFS_MIGRATED_KEY) === "1";
  if (!migrated) {
    const patch: PersonalizationPatch = {};
    const localEnabled = isLeoEnabled();
    const localPos = readLeoPanelPos();
    if (res.data.leo_enabled !== false && localEnabled === false) {
      patch.leo_enabled = false;
      enabled = false;
    }
    if (!panel.pos && localPos) {
      patch.leo_panel = panelPayload({ pos: localPos });
      panel = { pos: localPos };
    }
    if (Object.keys(patch).length > 0) {
      await signedInPatch(patch);
    }
    writeFlag(LEO_PREFS_MIGRATED_KEY, "1");
  }

  writeLeoEnabledLocal(enabled, false);
  if (panel.pos) writeLeoPanelLocal(panel.pos, false);
  return { ok: true, enabled, panel };
}

/** 同页多个挂载共用一次 GET。 */
export function pullLeoPrefsFromServer(): Promise<PullResult> {
  if (!inflight) {
    inflight = doPull().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
