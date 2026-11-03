"use client";

import { accessToken } from "../../lib/auth/client";
import { gatewayBase } from "../../lib/auth/config";

export type BrowserFlowAction = "navigate" | "click" | "fill" | "select" | "press" | "credential";
export type BrowserFlowAnchor = { role?: string; name?: string; label?: string; test_id?: string };
export type BrowserFlowStep = {
  action: BrowserFlowAction;
  url?: string;
  anchor?: BrowserFlowAnchor;
  value?: string;
  key?: "Enter" | "Tab" | "Escape" | "ArrowDown" | "ArrowUp";
  vault_ref?: string;
  page_origin?: string;
};
export type BrowserFlow = {
  id: string;
  name: string;
  notes: string;
  site_origin: string;
  steps: BrowserFlowStep[];
  schema_version: 1;
  version: number;
  created_at: string;
  updated_at: string;
};
export type BrowserFlowInput = { name: string; notes: string; site_origin?: string; steps: BrowserFlowStep[] };
export type BrowserFlowSession = {
  id: string;
  task_id?: string;
  title: string;
  status: string;
  runtime_state?: string;
  runtime_id?: string;
  session_version?: number;
  incarnation?: number;
  can_watch: boolean;
  sensitive_active: boolean;
};
export type BrowserParallelCapacity = {
  capacity: {
    scope: string;
    state: "available" | "saturated" | "unknown";
    available_slots: number | null;
    browser_slots: { max: number | null; in_use: number | null; free: number | null };
    per_browser_memory_mib: number | null;
    reported_at: string | null;
  };
  cost_basis: {
    status: "known" | "partial" | "unknown";
    markup: number | null;
    billing_applied: boolean | null;
    rates: { currency: string; node_hourly_price: number; node_memory_mib: number; per_gib_hour: number | null }[];
    unknown_components: string[];
  };
};
export type BrowserFlowRun = {
  run_id: string;
  status: string;
  session_id: string;
  flow_id: string;
  completed_steps: number;
  total_steps: number;
  next_step?: number;
  code?: string;
  approval?: { status?: string; kind?: string };
};
export type BrowserFlowRunReceipt = {
  id: string;
  flow_id: string;
  session_id: string;
  status: "ready" | "running" | "awaiting_approval" | "completed" | "failed";
  next_step: number;
  total_steps: number;
  flow_version: number;
  session_version: number;
  runtime_id: string;
  incarnation: number;
  code?: string;
};
export type BrowserSessionDownload = {
  id: string;
  filename: string;
  size_bytes: number | null;
  status: "pending" | "ready" | "blocked" | "failed";
  created_at: string;
};
export type BrowserSessionDownloads = {
  session_id: string;
  runtime_id: string;
  incarnation: number;
  items: BrowserSessionDownload[];
  limits: { max_file_bytes: number | null; max_total_bytes: number | null; max_count: number | null };
};
export type BrowserLibraryDownload = {
  artifact_id: string;
  revision_id: string;
  name: string;
  media_type: string;
  size_bytes: number;
};

export class BrowserFlowsApiError extends Error {
  constructor(public code: string, public status = 0) {
    // Error responses can include page content. Only a bounded machine code reaches the UI.
    super(code);
    this.name = "BrowserFlowsApiError";
  }
}

const actions: BrowserFlowAction[] = ["navigate", "click", "fill", "select", "press", "credential"];
const keys = ["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp"];
const queryKeys = new Set(["q", "search", "page", "lang", "sort", "view", "tab"]);
const sensitiveAnchor = /pass(?:word|code)?|secret|token|api.?key|authorization|credit|card.?number|cvv|cvc|payment|one.?time|otp|verification|username|login|e-?mail|密码|密钥|验证码|支付|银行卡/i;
const secretValue = /Bearer\s+|-----BEGIN |(?:sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{15,}\.|\b[0-9a-f]{32,}\b|\b(?:\d[ -]?){13,19}\b/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max && !/[\x00-\x08\x0b-\x1f]/.test(value) ? value : null;
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const code = (value: unknown, fallback: string) => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value.toUpperCase() : fallback;
const invalid = () => new BrowserFlowsApiError("INVALID_RESPONSE", 502);

function safeUrl(value: string, originOnly = false): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:\/\//i.test(value) || !["https:", "http:"].includes(url.protocol) || url.username || url.password || /\s/.test(value)) return null;
    if (originOnly) return url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
    if ([...url.searchParams].some(([key, item]) => !queryKeys.has(key) || item.length > 500 || secretValue.test(item)) || secretValue.test(decodeURIComponent(url.pathname))) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

/** The editor never receives arbitrary recorder fields, executable code, or credential plaintext. */
export function parseBrowserFlowStep(value: unknown): BrowserFlowStep | null {
  const row = record(value);
  if (!row || !actions.includes(row.action as BrowserFlowAction)) return null;
  if (Object.keys(row).some(key => !["action", "url", "anchor", "value", "key", "vault_ref", "page_origin"].includes(key))) return null;
  const step: BrowserFlowStep = { action: row.action as BrowserFlowAction };
  if (row.anchor !== undefined) {
    const anchor = record(row.anchor);
    if (!anchor || Object.keys(anchor).some(key => !["role", "name", "label", "test_id"].includes(key))) return null;
    step.anchor = {};
    for (const key of ["role", "name", "label", "test_id"] as const) {
      if (anchor[key] === undefined) continue;
      const value = text(anchor[key], 200)?.trim();
      if (value === undefined || /[\x00-\x1f]/.test(value) || secretValue.test(value)) return null;
      if (value) step.anchor[key] = value;
    }
    if (!(step.anchor.test_id || step.anchor.label || step.anchor.role && step.anchor.name)) return null;
    if (step.anchor.role && !/^[a-z]{2,30}$/.test(step.anchor.role)) return null;
  }
  if (row.url !== undefined) {
    const value = text(row.url, 4000);
    const url = value && safeUrl(value);
    if (!url) return null;
    step.url = url;
  }
  if (row.page_origin !== undefined) {
    const value = text(row.page_origin, 4000);
    const origin = value && safeUrl(value, true);
    if (!origin) return null;
    step.page_origin = origin;
  }
  if (row.value !== undefined) {
    const value = text(row.value, 1000);
    if (value === null || secretValue.test(value) || sensitiveAnchor.test(Object.values(step.anchor || {}).join(" "))) return null;
    step.value = value;
  }
  if (row.key !== undefined) {
    if (!keys.includes(row.key as string)) return null;
    step.key = row.key as BrowserFlowStep["key"];
  }
  if (row.vault_ref !== undefined) {
    const ref = text(row.vault_ref, 200);
    if (!ref || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(ref)) return null;
    step.vault_ref = ref;
  }
  if (step.action === "navigate") {
    if (!step.url || row.anchor !== undefined || row.value !== undefined || row.vault_ref !== undefined || row.key !== undefined) return null;
    step.page_origin = new URL(step.url).origin;
    return step;
  }
  if (!step.anchor || !step.page_origin) return null;
  if (step.action === "credential") return step.vault_ref && row.value === undefined && row.url === undefined && row.key === undefined ? step : null;
  if (step.vault_ref || step.url) return null;
  if (step.action === "press") return step.key && row.value === undefined ? step : null;
  if (step.action === "fill" || step.action === "select") return row.value !== undefined && row.key === undefined ? step : null;
  return row.value === undefined && row.key === undefined ? step : null;
}

export function parseBrowserFlow(value: unknown): BrowserFlow | null {
  const row = record(value);
  if (!row || !text(row.id, 300)?.trim() || !text(row.name, 160)?.trim() || row.schema_version !== 1) return null;
  const version = integer(row.version);
  const notes = text(row.notes ?? "", 4000);
  if (!version || notes === null || !Array.isArray(row.steps) || row.steps.length > 100) return null;
  const steps = row.steps.map(parseBrowserFlowStep);
  if (steps.some(step => !step)) return null;
  const site = row.site_origin ? text(row.site_origin, 4000) : "";
  const origin = site ? safeUrl(site, true) : "";
  if (site === null || origin === null) return null;
  return {
    id: row.id as string, name: row.name as string, notes, site_origin: origin,
    steps: steps as BrowserFlowStep[], schema_version: 1, version,
    created_at: text(row.created_at, 80) || "", updated_at: text(row.updated_at, 80) || "",
  };
}

export function browserFlowInput(input: BrowserFlowInput): BrowserFlowInput {
  const name = input.name.trim();
  if (!name || name.length > 160 || input.notes.length > 4000 || input.steps.length > 100) throw new BrowserFlowsApiError("INVALID_FLOW", 422);
  const steps = input.steps.map(parseBrowserFlowStep);
  if (steps.some(step => !step)) throw new BrowserFlowsApiError("UNSAFE_STEP", 422);
  const origin = input.site_origin?.trim();
  const site = origin ? safeUrl(origin, true) : undefined;
  if (site === null) throw new BrowserFlowsApiError("INVALID_SITE_ORIGIN", 422);
  return { name, notes: input.notes, steps: steps as BrowserFlowStep[], ...(input.site_origin === undefined ? {} : { site_origin: site || "" }) };
}

function parseSessions(value: unknown): BrowserFlowSession[] {
  const data = record(value);
  if (!Array.isArray(data?.items)) throw invalid();
  return data.items.map(value => {
    const row = record(value);
    if (!row || !text(row.id, 300)?.trim() || !text(row.status, 80)) throw invalid();
    return {
      id: row.id as string, title: text(row.title, 1000) || text(row.last_title, 1000) || "",
      status: row.status as string, task_id: text(row.task_id, 300) || undefined,
      runtime_state: text(row.runtime_state, 80) || undefined, runtime_id: text(row.runtime_id, 300) || undefined,
      session_version: integer(row.session_version) ?? undefined, incarnation: integer(row.incarnation) ?? undefined,
      can_watch: row.can_watch !== false, sensitive_active: row.sensitive_active === true,
    };
  });
}

function parseCapacity(value: unknown): BrowserParallelCapacity {
  const row = record(value);
  const capacity = record(row?.capacity);
  const slots = record(capacity?.browser_slots);
  const cost = record(row?.cost_basis);
  if (!capacity || !slots || !cost) throw invalid();
  const rates: BrowserParallelCapacity["cost_basis"]["rates"] = [];
  if (Array.isArray(cost.rates)) for (const value of cost.rates) {
    const rate = record(value);
    if (!rate || typeof rate.currency !== "string" || !/^[A-Z]{3}$/.test(rate.currency)) continue;
    const price = number(rate.node_hourly_price);
    const memory = number(rate.node_memory_mib);
    if (price === null || memory === null || memory === 0) continue;
    rates.push({ currency: rate.currency, node_hourly_price: price, node_memory_mib: memory, per_gib_hour: number(rate.per_gib_hour) });
  }
  return {
    capacity: {
      scope: text(capacity.scope, 80) || "global",
      state: capacity.state === "available" || capacity.state === "saturated" ? capacity.state : "unknown",
      available_slots: integer(capacity.available_slots),
      browser_slots: { max: integer(slots.max), in_use: integer(slots.in_use), free: integer(slots.free) },
      per_browser_memory_mib: number(capacity.per_browser_memory_mib), reported_at: text(capacity.reported_at, 80),
    },
    cost_basis: {
      status: cost.status === "known" || cost.status === "partial" ? cost.status : "unknown",
      markup: number(cost.markup), rates,
      billing_applied: typeof cost.billing_applied === "boolean" ? cost.billing_applied : null,
      unknown_components: Array.isArray(cost.unknown_components) ? cost.unknown_components.filter((v): v is string => typeof v === "string") : [],
    },
  };
}

async function requestResponse(path: string, method = "GET", body?: unknown, signal?: AbortSignal, timeout = 20000): Promise<Response> {
  const token = await accessToken();
  if (!token) throw new BrowserFlowsApiError("SIGNED_OUT", 401);
  signal?.throwIfAborted();
  let response: Response;
  try {
    response = await fetch(`${gatewayBase()}/v1/browser${path}`, {
      method, cache: "no-store", credentials: "include", redirect: "error",
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new BrowserFlowsApiError("NETWORK_OR_TIMEOUT");
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const row = record(data);
    const detail = record(row?.detail);
    throw new BrowserFlowsApiError(code(detail?.code ?? row?.code, `HTTP_${response.status}`), response.status);
  }
  return response;
}

async function request(path: string, method = "GET", body?: unknown, signal?: AbortSignal, timeout = 20000): Promise<unknown> {
  const response = await requestResponse(path, method, body, signal, timeout);
  return response.json().catch(() => null);
}

function requireFlow(value: unknown): BrowserFlow {
  const flow = parseBrowserFlow(value);
  if (!flow) throw invalid();
  return flow;
}

export const cloudBrowserFlowsApi = {
  async flows(signal?: AbortSignal) {
    const data = record(await request("/flows", "GET", undefined, signal));
    if (!Array.isArray(data?.items)) throw invalid();
    return data.items.map(requireFlow);
  },
  async create(input: BrowserFlowInput, signal?: AbortSignal) {
    const payload = browserFlowInput(input);
    if (!payload.site_origin) delete payload.site_origin;
    return requireFlow(await request("/flows", "POST", payload, signal));
  },
  async update(flow: BrowserFlow, input: BrowserFlowInput, signal?: AbortSignal) {
    return requireFlow(await request(`/flows/${encodeURIComponent(flow.id)}`, "PATCH", { ...browserFlowInput(input), expected_version: flow.version }, signal));
  },
  async remove(id: string, signal?: AbortSignal) {
    const data = record(await request(`/flows/${encodeURIComponent(id)}`, "DELETE", undefined, signal));
    if (data?.ok !== true) throw invalid();
  },
  async sessions(signal?: AbortSignal): Promise<{ items: BrowserFlowSession[]; source: "parallel" | "sessions"; warning?: BrowserFlowsApiError }> {
    try { return { items: parseSessions(await request("/parallel/sessions", "GET", undefined, signal)), source: "parallel" }; }
    catch (error) {
      if (signal?.aborted || !(error instanceof BrowserFlowsApiError) || [401, 403].includes(error.status)) throw error;
      const items = parseSessions(await request("/sessions?limit=50", "GET", undefined, signal));
      return { items, source: "sessions", warning: error };
    }
  },
  async capacity(signal?: AbortSignal) { return parseCapacity(await request("/parallel/capacity", "GET", undefined, signal)); },
  async downloads(sessionId: string, signal?: AbortSignal): Promise<BrowserSessionDownloads> {
    const data = record(await request(`/parallel/sessions/${encodeURIComponent(sessionId)}/downloads`, "GET", undefined, signal));
    const limits = record(data?.limits);
    const incarnation = integer(data?.incarnation);
    if (!data || data.session_id !== sessionId || !text(data.runtime_id, 300) || !incarnation || !Array.isArray(data.items) || !limits) throw invalid();
    const maxFile = integer(limits.max_file_bytes), maxTotal = integer(limits.max_total_bytes), maxCount = integer(limits.max_count);
    if (!maxFile || !maxTotal || !maxCount || maxFile > 8 * 1024 * 1024 || maxTotal > 32 * 1024 * 1024 || maxCount > 16 || data.items.length > maxCount) throw invalid();
    const items: BrowserSessionDownload[] = data.items.map(value => {
      const row = record(value);
      const filename = text(row?.filename, 255);
      if (!row || !text(row.id, 200)?.trim() || !filename?.trim() || new TextEncoder().encode(filename).length > 180 || /[\x00-\x1f/\\]/.test(filename) || !["pending", "ready", "blocked", "failed"].includes(row.status as string)) throw invalid();
      const size = integer(row.size_bytes);
      if (row.status === "ready" && size === null) throw invalid();
      return { id: row.id as string, filename, status: row.status as BrowserSessionDownload["status"], size_bytes: size, created_at: text(row.created_at, 80) || "" };
    });
    if (new Set(items.map(item => item.id)).size !== items.length) throw invalid();
    return { session_id: sessionId, runtime_id: data.runtime_id as string, incarnation, items, limits: { max_file_bytes: maxFile, max_total_bytes: maxTotal, max_count: maxCount } };
  },
  async download(sessionId: string, file: BrowserSessionDownload, maxBytes: number | null, signal?: AbortSignal): Promise<Blob> {
    if (file.status !== "ready") throw new BrowserFlowsApiError("DOWNLOAD_NOT_READY", 409);
    if (maxBytes !== null && (file.size_bytes === null || file.size_bytes > maxBytes)) throw new BrowserFlowsApiError("DOWNLOAD_TOO_LARGE", 413);
    const response = await requestResponse(`/parallel/sessions/${encodeURIComponent(sessionId)}/downloads/${encodeURIComponent(file.id)}`, "GET", undefined, signal, 120000);
    const length = response.headers.get("Content-Length");
    if (maxBytes !== null && length !== null && Number(length) > maxBytes) {
      await response.body?.cancel();
      throw new BrowserFlowsApiError("DOWNLOAD_TOO_LARGE", 413);
    }
    let blob: Blob;
    try { blob = await response.blob(); }
    catch (error) { if (signal?.aborted) throw error; throw new BrowserFlowsApiError("NETWORK_OR_TIMEOUT"); }
    if (maxBytes !== null && blob.size > maxBytes) throw new BrowserFlowsApiError("DOWNLOAD_TOO_LARGE", 413);
    if (file.size_bytes !== null && file.size_bytes !== blob.size) throw invalid();
    return blob;
  },
  async saveToLibrary(sessionId: string, file: BrowserSessionDownload, signal?: AbortSignal): Promise<BrowserLibraryDownload> {
    if (file.status !== "ready") throw new BrowserFlowsApiError("DOWNLOAD_NOT_READY", 409);
    const data = record(await request(`/parallel/sessions/${encodeURIComponent(sessionId)}/downloads/${encodeURIComponent(file.id)}/library`, "POST", undefined, signal, 120000));
    const saved = record(data?.file);
    const artifact = text(saved?.artifact_id, 300), revision = text(saved?.revision_id, 300);
    const name = text(saved?.name, 255), media = text(saved?.media_type, 200), size = integer(saved?.size_bytes);
    const safeId = (id: string | null) => id !== null && /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,299}$/.test(id);
    // Canonical Library upload sanitizes SVG; its durable size can differ from the original download.
    const sanitizedSvg = media?.toLowerCase() === "image/svg+xml";
    if (data?.ok !== true || !safeId(artifact) || !safeId(revision) || !name?.trim() || /[\x00-\x1f/\\]/.test(name) || !media || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(media) || size === null || (sanitizedSvg ? size <= 0 || size > 20 * 1024 * 1024 : size !== file.size_bytes)) throw invalid();
    return { artifact_id: artifact as string, revision_id: revision as string, name, media_type: media, size_bytes: size };
  },
  async startTeaching(sessionId: string, name: string, signal?: AbortSignal) {
    const data = record(await request(`/sessions/${encodeURIComponent(sessionId)}/teach/start`, "POST", { name: name.trim() }, signal));
    if (data?.status !== "recording" || data.session_id !== sessionId || !text(data.recording_id, 300)) throw invalid();
    return { session_id: sessionId, recording_id: data.recording_id as string };
  },
  async stopTeaching(sessionId: string, name: string, save: boolean, signal?: AbortSignal) {
    const data = record(await request(`/sessions/${encodeURIComponent(sessionId)}/teach/stop`, "POST", { ...(name.trim() ? { name: name.trim() } : {}), save }, signal));
    if (save) {
      if (data?.status !== "saved") throw invalid();
      return requireFlow(data.flow);
    }
    if (data?.status !== "discarded") throw invalid();
    return null;
  },
  async runReceipt(flowId: string, sessionId: string, runId: string, signal?: AbortSignal): Promise<BrowserFlowRunReceipt> {
    const data = record(await request(`/flows/${encodeURIComponent(flowId)}/runs/${encodeURIComponent(runId)}`, "GET", undefined, signal));
    const next = integer(data?.next_step);
    const total = integer(data?.total_steps);
    const version = integer(data?.flow_version);
    const sessionVersion = integer(data?.session_version);
    const incarnation = integer(data?.incarnation);
    if (!data || data.id !== runId || data.flow_id !== flowId || data.session_id !== sessionId || !["ready", "running", "awaiting_approval", "completed", "failed"].includes(data.status as string) || next === null || total === null || total > 100 || next > total || !version || !sessionVersion || !incarnation || !text(data.runtime_id, 300)) throw invalid();
    if (data.status === "completed" && (total === 0 || next !== total)) throw invalid();
    return { id: runId, flow_id: flowId, session_id: sessionId, status: data.status as BrowserFlowRunReceipt["status"], next_step: next, total_steps: total, flow_version: version, session_version: sessionVersion, runtime_id: data.runtime_id as string, incarnation, code: data.code ? code(data.code, "RUN_INCOMPLETE") : undefined };
  },
  async run(flowId: string, session: Pick<BrowserFlowSession, "id" | "session_version" | "incarnation">, signal?: AbortSignal, runId?: string): Promise<BrowserFlowRun> {
    const data = record(await request(`/flows/${encodeURIComponent(flowId)}/run`, "POST", {
      session_id: session.id,
      ...(session.session_version === undefined ? {} : { expected_version: session.session_version }),
      ...(session.incarnation === undefined ? {} : { incarnation: session.incarnation }),
      ...(runId ? { run_id: runId } : {}),
    }, signal, 120000));
    if (!data || !text(data.run_id, 300)?.trim() || runId && data.run_id !== runId || !text(data.status, 80) || data.session_id !== session.id || data.flow_id !== flowId) throw invalid();
    const completed = integer(data.completed_steps);
    const total = integer(data.total_steps);
    if (completed === null || total === null || total > 100 || completed > total) throw invalid();
    const approval = record(data.approval);
    return {
      run_id: data.run_id as string, status: data.status as string, session_id: session.id, flow_id: flowId,
      completed_steps: completed, total_steps: total, next_step: integer(data.next_step) ?? undefined,
      code: data.code ? code(data.code, "RUN_INCOMPLETE") : undefined,
      ...(approval ? { approval: { status: text(approval.status, 80) || undefined, kind: text(approval.kind, 80) || undefined } } : {}),
    };
  },
};

export function browserFlowRunCompleted(run: BrowserFlowRun): boolean {
  return run.status === "completed" && run.total_steps > 0 && run.completed_steps === run.total_steps;
}
