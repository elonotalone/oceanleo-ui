"use client";

// The user's last choice for one program on one computer (UX wave 2026-11-07,
// contract §2.1): model, permission mode and options such as effort / fast. The
// gateway keeps it per user + computer + program, so it follows the user to
// every browser and the phone. A failed call throws the gateway's answer as it
// came (`AcpSendError`).

import { request } from "./acp-frames-api";

export type ProgramChoice = {
  model?: string;
  mode?: string;
  config?: Record<string, string | boolean>;
};

/** A shallow patch: `config` is merged per id; `null` removes that key. */
export type ProgramChoicePatch = {
  model?: string | null;
  mode?: string | null;
  config?: Record<string, string | boolean | null>;
};

function choicePath(computerId: string, program: string): string {
  return `/v1/computers/${encodeURIComponent(computerId)}/programs/${encodeURIComponent(program)}/choice`;
}

/** Only the fields of §2.1 with their types; anything else in the body is not a choice. */
export function programChoiceFrom(value: unknown): ProgramChoice {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawConfig = body.config && typeof body.config === "object" && !Array.isArray(body.config)
    ? body.config as Record<string, unknown> : {};
  const config = Object.fromEntries(Object.entries(rawConfig)
    .filter((entry): entry is [string, string | boolean] => typeof entry[1] === "string" || typeof entry[1] === "boolean"));
  return {
    ...(typeof body.model === "string" && body.model ? { model: body.model } : {}),
    ...(typeof body.mode === "string" && body.mode ? { mode: body.mode } : {}),
    ...(Object.keys(config).length ? { config } : {}),
  };
}

/** `GET …/choice`: `{}` when the user has not chosen anything for this program on this computer. */
export async function getProgramChoice(
  computerId: string,
  program: string,
  options: { signal?: AbortSignal } = {},
): Promise<ProgramChoice> {
  return programChoiceFrom(await request<unknown>(choicePath(computerId, program), { signal: options.signal }));
}

/** `PUT …/choice`: merges the patch and returns the whole stored choice. */
export async function putProgramChoice(
  computerId: string,
  program: string,
  patch: ProgramChoicePatch,
): Promise<ProgramChoice> {
  return programChoiceFrom(await request<unknown>(choicePath(computerId, program), {
    method: "PUT",
    body: JSON.stringify(patch),
  }));
}
