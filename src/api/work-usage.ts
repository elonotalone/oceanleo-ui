"use client";

import { accessToken } from "../lib/auth/client";
import { gatewayBase } from "../lib/auth/config";

export interface WorkMoney { amount_minor: number; currency: "CNY" | "USD" }
export interface WorkUsageLine {
  kind: string; quantity: number; unit: string; amount: WorkMoney;
  basis: "metered" | "lower_bound" | "not_attributed";
}
export interface WorkUsage { lines: WorkUsageLine[]; total: WorkMoney }
export interface WorkUsageLimit {
  monthly_limit: WorkMoney | null; on_reach: "stop" | "notify"; used: WorkMoney; reached: boolean;
}
export type WorkUsageLimitInput = Pick<WorkUsageLimit, "monthly_limit" | "on_reach">;

/** Keep error bodies out of the view; failed reads must never look like zero usage. */
export class WorkUsageError extends Error {
  constructor(readonly status: number, readonly code?: "metering_unavailable") { super("Work usage request failed"); this.name = "WorkUsageError"; }
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkUsageError(502);
  return value as Record<string, unknown>;
};
function money(value: unknown): WorkMoney {
  const row = object(value);
  if (!Number.isSafeInteger(row.amount_minor) || Number(row.amount_minor) < 0 || !["CNY", "USD"].includes(String(row.currency))) throw new WorkUsageError(502);
  return { amount_minor: row.amount_minor as number, currency: row.currency as WorkMoney["currency"] };
}
function usage(value: unknown): WorkUsage {
  const row = object(value), total = money(row.total);
  if (!Array.isArray(row.lines)) throw new WorkUsageError(502);
  const lines = row.lines.map(value => {
    const line = object(value), amount = money(line.amount);
    if (typeof line.kind !== "string" || typeof line.unit !== "string" || typeof line.quantity !== "number" ||
      !Number.isFinite(line.quantity) || line.quantity < 0 || amount.currency !== total.currency ||
      !["metered", "lower_bound", "not_attributed"].includes(String(line.basis))) throw new WorkUsageError(502);
    return { kind: line.kind, unit: line.unit, quantity: line.quantity, amount, basis: line.basis as WorkUsageLine["basis"] };
  });
  return { lines, total };
}
function limit(value: unknown): WorkUsageLimit {
  const row = object(value), used = money(row.used), monthly_limit = row.monthly_limit === null ? null : money(row.monthly_limit);
  if ((monthly_limit && monthly_limit.currency !== used.currency) || !["stop", "notify"].includes(String(row.on_reach)) || typeof row.reached !== "boolean") throw new WorkUsageError(502);
  return { monthly_limit, on_reach: row.on_reach as WorkUsageLimit["on_reach"], used, reached: row.reached };
}
async function request(id: string, suffix: string, init: RequestInit = {}): Promise<unknown> {
  const token = await accessToken();
  const response = await fetch(gatewayBase() + "/v1/works/" + encodeURIComponent(id) + suffix, {
    ...init, credentials: "include", cache: "no-store",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new WorkUsageError(response.status, body?.detail?.code === "metering_unavailable" ? "metering_unavailable" : undefined);
  }
  try { return await response.json(); } catch { throw new WorkUsageError(502); }
}
export const workUsageApi = {
  get: async (id: string, range: "day" | "month" = "month", signal?: AbortSignal) =>
    usage(await request(id, "/usage?" + new URLSearchParams({ range }), { signal })),
  limit: async (id: string, signal?: AbortSignal) => limit(await request(id, "/usage-limit", { signal })),
  setLimit: async (id: string, input: WorkUsageLimitInput, signal?: AbortSignal) =>
    limit(await request(id, "/usage-limit", { method: "PUT", body: JSON.stringify(input), signal })),
};
export type WorkUsageApi = typeof workUsageApi;
