"use client";

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

export type MailAddress = {
  id: string;
  kind: "main" | "workflow";
  name: string;
  instructions: string;
  local_part: string;
  email: string;
  created_at?: string;
  updated_at?: string;
};

export type MailSender = { id: string; email: string; created_at?: string };

export type MailInboxItem = {
  id: string;
  subject: string;
  task_id: string | null;
  from: string;
  created_at?: string;
};

export type MailIgnored = {
  from: string;
  reason: "not_approved" | "unverified";
  at?: string;
  address?: string;
};

export type MailSnapshot = {
  domain: string;
  address: MailAddress;
  workflows: MailAddress[];
  senders: MailSender[];
  inbox: MailInboxItem[];
  ignored?: MailIgnored | null;
};

export type MailApiCode =
  | "signed_out"
  | "not_available"
  | "invalid"
  | "offline"
  | "rate_limited"
  | "rename_cooldown"
  | "address_taken";

export type MailResult<T> = { ok: true; data: T } | { ok: false; error: MailApiCode };

async function mailRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  if (!token) {
    const error = new Error("signed_out");
    error.name = "signed_out";
    throw error;
  }
  return fetch(`${GATEWAY_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
}

function codeFrom(status: number, payload: { code?: string } | null): MailApiCode {
  if (status === 401) return "signed_out";
  if (status === 404) return "not_available";
  if (status === 429) return "rate_limited";
  const code = payload?.code || "";
  if (code === "rename_cooldown" || code === "address_taken" || code === "invalid") {
    return code;
  }
  if (status === 422 || status === 400) return "invalid";
  if (status === 503) return "not_available";
  return "offline";
}

async function read<T>(path: string, init?: RequestInit): Promise<MailResult<T>> {
  try {
    const response = await mailRequest(path, init);
    const payload = (await response.json().catch(() => null)) as
      | (T & { code?: string; detail?: { code?: string } })
      | null;
    if (!response.ok) {
      const nested = payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail?: { code?: string } }).detail
        : payload;
      return { ok: false, error: codeFrom(response.status, nested || null) };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    if (error instanceof Error && error.name === "signed_out") {
      return { ok: false, error: "signed_out" };
    }
    return { ok: false, error: "offline" };
  }
}

export function getMail(): Promise<MailResult<MailSnapshot>> {
  return read<MailSnapshot>("/v1/mail");
}

export function renameMailAddress(localPart: string): Promise<MailResult<MailSnapshot>> {
  return read<MailSnapshot>("/v1/mail/address", {
    method: "PATCH",
    body: JSON.stringify({ local_part: localPart }),
  });
}

export function addMailWorkflow(input: {
  local_part: string;
  name: string;
  instructions: string;
}): Promise<MailResult<MailSnapshot>> {
  return read<MailSnapshot>("/v1/mail/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteMailWorkflow(id: string): Promise<MailResult<MailSnapshot>> {
  return read<MailSnapshot>(`/v1/mail/workflows/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function addMailSender(email: string): Promise<MailResult<MailSnapshot>> {
  return read<MailSnapshot>("/v1/mail/senders", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function deleteMailSender(id: string): Promise<MailResult<MailSnapshot>> {
  return read<MailSnapshot>(`/v1/mail/senders/${encodeURIComponent(id)}`, { method: "DELETE" });
}
