"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import type { DeviceApiResult } from "./devices";

export type DeviceAvailability = "online" | "signed_out" | "offline";
export interface DeviceControllerGrant {
  grant_id: string;
  controller_id: string;
  label: string;
  is_current: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}
export interface DevicePreferences {
  default_task_directory: string | null;
  task_folders: string[];
}
export interface DeviceSettings {
  controller_id: string;
  controllers: DeviceControllerGrant[];
  preferences: DevicePreferences;
  roots: string[];
  availability: DeviceAvailability;
  preferences_available: boolean;
}
export interface DeviceFolderListing {
  path: string | null;
  parent: string | null;
  entries: { name: string; path: string }[];
  roots: string[];
}
export type DeviceCover = {
  state: "available";
  image: string;
  width: number;
  height: number;
  observed_at: number;
} | {
  state: "unavailable";
  reason: "wallpaper_unavailable" | "unsupported" | "headless";
  observed_at: number;
};
export interface DeviceSettingsOperation {
  operation_id?: string;
  state: "pending" | "succeeded" | "failed";
  result?: DeviceFolderListing | { preferences: DevicePreferences } | { cover: DeviceCover };
  error?: string;
}
export interface DeviceTaskSummary {
  task_id: string;
  action_kind: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  deny_reason: string | null;
}
export interface DeviceSettingsClient {
  getSettings(deviceId: string, signal?: AbortSignal): Promise<DeviceApiResult<DeviceSettings>>;
  revokeController(deviceId: string, grantId: string, signal?: AbortSignal): Promise<DeviceApiResult<unknown>>;
  shortenControllerExpiry(deviceId: string, grantId: string, expiresAt: string, signal?: AbortSignal): Promise<DeviceApiResult<unknown>>;
  startOperation(deviceId: string, operation: { kind: "cover.read" } | { kind: "folders.list"; path: string | null } | ({ kind: "preferences.update" } & DevicePreferences), signal?: AbortSignal): Promise<DeviceApiResult<DeviceSettingsOperation>>;
  getOperation(deviceId: string, operationId: string, signal?: AbortSignal): Promise<DeviceApiResult<DeviceSettingsOperation>>;
  listTasks(deviceId: string, signal?: AbortSignal): Promise<DeviceApiResult<DeviceTaskSummary[]>>;
}

const CONTROLLER_KEY = "oceanleo.controller-identity.v1";
const SECRET_PATTERN = /^[a-f0-9]{64}$/;

/** A random credential, never a device label or public controller id. Fail closed. */
export function controllerHeaders(): Record<string, string> {
  if (typeof window === "undefined" || !globalThis.crypto?.getRandomValues) throw new Error("controller_identity_unavailable");
  let secret: string | null;
  try {
    secret = window.localStorage.getItem(CONTROLLER_KEY);
    if (!secret || !SECRET_PATTERN.test(secret)) {
      secret = [...globalThis.crypto.getRandomValues(new Uint8Array(32))].map((value) => value.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(CONTROLLER_KEY, secret);
      if (window.localStorage.getItem(CONTROLLER_KEY) !== secret) throw new Error("not_persisted");
    }
  } catch {
    throw new Error("controller_identity_unavailable");
  }
  return { "X-OceanLeo-Controller": secret };
}

function controllerLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "OceanLeo";
  const platform = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Macintosh|Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return platform ? `${browser} · ${platform}` : browser;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function errorCode(data: unknown, status: number): string {
  if (record(data)) {
    if (record(data.detail) && typeof data.detail.code === "string") return data.detail.code;
    for (const candidate of [data.detail, data.code, data.error]) if (typeof candidate === "string" && candidate) return candidate;
  }
  return `HTTP ${status}`;
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal, identity?: { token: string; headers: Record<string, string> }): Promise<DeviceApiResult<T>> {
  const token = identity?.token ?? await accessToken();
  if (!token) return { ok: false, error: "unauthorized", status: 401 };
  let headers: Record<string, string>;
  try { headers = identity?.headers ?? controllerHeaders(); }
  catch { return { ok: false, error: "controller_identity_unavailable" }; }
  try {
    const response = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init, signal, cache: "no-store", credentials: "include",
      headers: { Authorization: `Bearer ${token}`, ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
    let data: unknown;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) return { ok: false, error: errorCode(data, response.status), status: response.status };
    return { ok: true, data: data as T, status: response.status };
  } catch {
    return { ok: false, error: signal?.aborted ? "aborted" : "network_error", status: 0 };
  }
}

let registered: { token: string; credential: string; data: unknown } | null = null;
let registering: { key: string; promise: Promise<DeviceApiResult<unknown>> } | null = null;
/** Cache only a successful registration for this exact account token+credential. */
export async function registerController(signal?: AbortSignal): Promise<DeviceApiResult<unknown>> {
  if (signal?.aborted) return { ok: false, error: "aborted" };
  const token = await accessToken();
  if (!token) { registered = null; return { ok: false, error: "unauthorized", status: 401 }; }
  let headers: Record<string, string>;
  try { headers = controllerHeaders(); } catch { return { ok: false, error: "controller_identity_unavailable" }; }
  const credential = headers["X-OceanLeo-Controller"];
  if (registered?.token === token && registered.credential === credential) return { ok: true, data: registered.data };
  // One registration in flight per token+credential: the devices page asks for every
  // computer's status at once and a click may follow; N parallel POSTs used to hit the
  // gateway's rate limit (429) and fail the click (twin probe 2026-10-31).
  const key = `${token}\n${credential}`;
  if (registering?.key !== key) {
    const timeout = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(10_000) : undefined;
    const promise = request("/v1/devices/controllers", { method: "POST", body: JSON.stringify({ label: controllerLabel() }) }, timeout, { token, headers })
      .then((result): DeviceApiResult<unknown> => {
        if (result.ok && (!record(result.data) || typeof result.data.controller_id !== "string" || !result.data.controller_id)) return { ok: false, error: "response_malformed", status: result.status };
        if (result.ok) registered = { token, credential, data: result.data };
        return result;
      })
      .finally(() => { if (registering?.promise === promise) registering = null; });
    registering = { key, promise };
  }
  const shared = registering.promise;
  if (!signal) return shared;
  return Promise.race([shared, new Promise<DeviceApiResult<unknown>>((resolve) => {
    if (signal.aborted) resolve({ ok: false, error: "aborted" });
    else signal.addEventListener("abort", () => resolve({ ok: false, error: "aborted" }), { once: true });
  })]);
}

export function parseDeviceSettings(value: unknown): DeviceSettings | null {
  if (!record(value) || typeof value.controller_id !== "string" || !Array.isArray(value.controllers) || !record(value.preferences) || !strings(value.roots) || typeof value.preferences_available !== "boolean") return null;
  if (!["online", "signed_out", "offline"].includes(String(value.availability))) return null;
  const preferences = value.preferences;
  if (!nullableString(preferences.default_task_directory) || !strings(preferences.task_folders)) return null;
  const controllers: DeviceControllerGrant[] = [];
  for (const item of value.controllers) {
    if (!record(item) || typeof item.grant_id !== "string" || typeof item.controller_id !== "string" || typeof item.label !== "string" || typeof item.is_current !== "boolean" || !nullableString(item.last_used_at) || !nullableString(item.expires_at) || typeof item.created_at !== "string") return null;
    controllers.push(item as unknown as DeviceControllerGrant);
  }
  return { controller_id: value.controller_id, controllers, preferences: { default_task_directory: preferences.default_task_directory, task_folders: preferences.task_folders }, roots: value.roots, availability: value.availability as DeviceAvailability, preferences_available: value.preferences_available };
}

export function parseSettingsOperation(value: unknown): DeviceSettingsOperation | null {
  if (!record(value) || !["pending", "succeeded", "failed"].includes(String(value.state))) return null;
  const operation: DeviceSettingsOperation = { state: value.state as DeviceSettingsOperation["state"] };
  if (typeof value.operation_id === "string") operation.operation_id = value.operation_id;
  if (typeof value.error === "string") operation.error = value.error;
  if (value.state === "succeeded") {
    const result = value.result;
    if (!record(result)) return null;
    if ("cover" in result) {
      const cover = parseDeviceCover(result.cover);
      if (!cover) return null;
      operation.result = { cover };
    } else if (record(result.preferences) && nullableString(result.preferences.default_task_directory) && strings(result.preferences.task_folders)) {
      operation.result = { preferences: { default_task_directory: result.preferences.default_task_directory, task_folders: result.preferences.task_folders } };
    } else if (nullableString(result.path) && nullableString(result.parent) && strings(result.roots) && Array.isArray(result.entries) && result.entries.every((item) => record(item) && typeof item.name === "string" && typeof item.path === "string")) {
      operation.result = result as unknown as DeviceFolderListing;
    } else return null;
  }
  return operation;
}

/** Only a bounded inline JPEG from this authenticated operation can be shown. */
export function parseDeviceCover(value: unknown): DeviceCover | null {
  if (!record(value) || !Number.isSafeInteger(value.observed_at) || Number(value.observed_at) <= 0 || Number(value.observed_at) > Date.now() / 1000 + 300) return null;
  const observed_at = Number(value.observed_at);
  if (value.state === "unavailable" && ["wallpaper_unavailable", "unsupported", "headless"].includes(String(value.reason))) {
    return { state: "unavailable", reason: value.reason as "wallpaper_unavailable" | "unsupported" | "headless", observed_at };
  }
  if (value.state !== "available" || typeof value.image !== "string" || value.image.length > 262_167 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value.image)) return null;
  if (![value.width, value.height].every((dimension) => Number.isInteger(dimension) && Number(dimension) >= 1 && Number(dimension) <= 960)) return null;
  return { state: "available", image: value.image, width: Number(value.width), height: Number(value.height), observed_at };
}

function base(deviceId: string) { return `/v1/devices/${encodeURIComponent(deviceId)}`; }
function malformed<T>(result: DeviceApiResult<unknown>): DeviceApiResult<T> { return { ok: false, error: "response_malformed", status: result.status }; }

export const deviceSettingsClient: DeviceSettingsClient = {
  async getSettings(deviceId, signal) {
    const registered = await registerController(signal);
    if (!registered.ok) return { ...registered, data: undefined };
    const response = await request<unknown>(`${base(deviceId)}/settings`, {}, signal);
    if (!response.ok) return { ...response, data: undefined };
    const data = parseDeviceSettings(response.data);
    return data ? { ...response, data } : malformed(response);
  },
  revokeController(deviceId, grantId, signal) {
    return request(`${base(deviceId)}/controllers/${encodeURIComponent(grantId)}`, { method: "DELETE" }, signal);
  },
  shortenControllerExpiry(deviceId, grantId, expiresAt, signal) {
    return request(`${base(deviceId)}/controllers/${encodeURIComponent(grantId)}`, { method: "PATCH", body: JSON.stringify({ expires_at: expiresAt }) }, signal);
  },
  async startOperation(deviceId, operation, signal) {
    const registered = await registerController(signal);
    if (!registered.ok) return { ...registered, data: undefined };
    const response = await request<unknown>(`${base(deviceId)}/settings/operations`, { method: "POST", body: JSON.stringify(operation) }, signal);
    if (!response.ok) return { ...response, data: undefined };
    const data = parseSettingsOperation(response.data);
    return data ? { ...response, data } : malformed(response);
  },
  async getOperation(deviceId, operationId, signal) {
    const response = await request<unknown>(`${base(deviceId)}/settings/operations/${encodeURIComponent(operationId)}`, {}, signal);
    if (!response.ok) return { ...response, data: undefined };
    const data = parseSettingsOperation(response.data);
    return data ? { ...response, data } : malformed(response);
  },
  async listTasks(deviceId, signal) {
    const response = await request<unknown>(`${base(deviceId)}/tasks?limit=20`, {}, signal);
    if (!response.ok) return { ...response, data: undefined };
    if (!record(response.data) || !Array.isArray(response.data.tasks)) return malformed(response);
    const tasks: DeviceTaskSummary[] = [];
    for (const item of response.data.tasks) {
      if (!record(item) || typeof item.task_id !== "string" || typeof item.action_kind !== "string" || typeof item.status !== "string" || typeof item.created_at !== "string") return malformed(response);
      tasks.push({ task_id: item.task_id, action_kind: item.action_kind, status: item.status, created_at: item.created_at, finished_at: typeof item.finished_at === "string" ? item.finished_at : null, deny_reason: typeof item.deny_reason === "string" ? item.deny_reason : null });
    }
    return { ...response, data: tasks };
  },
};
