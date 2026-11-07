"use client";

// The OceanLeo agent's 权限模式 on one computer (UX wave 2026-11-07, unit LA).
// Two choices, the same for every agent: 每次都问 (`ask`) or 不问 (`bypass`).
// The gateway stores it per user + computer + program `oceanleo` and gates every
// computer-changing tool call by it; this module only reads and writes that
// choice. `{}` (never chosen) is `ask`. Nothing is kept locally, nothing polls,
// a save is never shown before the gateway answered, and a failure is shown as
// the gateway's text.

import { useCallback, useEffect, useRef, useState } from "react";
import { acpErrorText } from "../lib/acp-frames-api";
import { getProgramChoice, putProgramChoice, type ProgramChoice } from "../lib/program-choice-api";
import type { ComposerSettingRow } from "./composer-settings-menu";

export const OCEANLEO_MODES = ["ask", "bypass"] as const;
export type OceanleoMode = typeof OCEANLEO_MODES[number];

/** `mode === null`: not read yet (or the read failed; `error` says why). */
export type OceanleoModeState = { mode: OceanleoMode | null; saving: boolean; error: string };

const PROGRAM = "oceanleo";
const UNREAD: OceanleoModeState = { mode: null, saving: false, error: "" };

/** Only an explicit `bypass` skips the question; anything else asks. */
export function oceanleoModeFrom(choice: ProgramChoice): OceanleoMode {
  return choice.mode === "bypass" ? "bypass" : "ask";
}

/** The 权限模式 row of the OceanLeo composer settings menu; read-only until read and while saving. */
export function oceanleoModeRow({ state, onPick, tt }: {
  state: OceanleoModeState;
  onPick: (mode: OceanleoMode) => void;
  tt: (zh: string) => string;
}): ComposerSettingRow {
  const labels: Record<OceanleoMode, string> = { ask: tt("每次都问"), bypass: tt("不问") };
  return {
    id: "mode",
    label: tt("权限模式"),
    value: state.mode === null ? "…" : labels[state.mode],
    selected: state.mode ?? undefined,
    choices: [
      { value: "ask", label: labels.ask, detail: tt("改动这台电脑前先问你"), attrs: { "data-oceanleo-mode-option": "ask" } },
      { value: "bypass", label: labels.bypass, detail: tt("直接改动这台电脑，不再询问"), attrs: { "data-oceanleo-mode-option": "bypass" } },
    ],
    onPick: state.saving || state.mode === null ? undefined : (value) => onPick(value as OceanleoMode),
    reason: state.error || undefined,
    attrs: { "data-oceanleo-mode-row": "" },
  };
}

/** Reads the choice once per computer and saves a pick; the row shows only what the gateway answered. */
export function useOceanleoMode(computerId: string | undefined): {
  state: OceanleoModeState;
  pick: (mode: OceanleoMode) => void;
} {
  const [state, setState] = useState<OceanleoModeState>(UNREAD);
  // The computer the answers still belong to; a save that lands after a switch or unmount is dropped.
  const liveId = useRef<string | undefined>(undefined);

  useEffect(() => {
    liveId.current = computerId;
    setState(UNREAD);
    if (!computerId) return;
    const controller = new AbortController();
    getProgramChoice(computerId, PROGRAM, { signal: controller.signal }).then(
      (choice) => {
        if (!controller.signal.aborted) setState({ mode: oceanleoModeFrom(choice), saving: false, error: "" });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ mode: null, saving: false, error: acpErrorText(error) });
      },
    );
    return () => {
      controller.abort();
      liveId.current = undefined;
    };
  }, [computerId]);

  const pick = useCallback((mode: OceanleoMode) => {
    if (!computerId) return;
    setState((current) => ({ ...current, saving: true, error: "" }));
    putProgramChoice(computerId, PROGRAM, { mode }).then(
      (choice) => {
        if (liveId.current === computerId) setState({ mode: oceanleoModeFrom(choice), saving: false, error: "" });
      },
      (error: unknown) => {
        if (liveId.current === computerId) setState((current) => ({ ...current, saving: false, error: acpErrorText(error) }));
      },
    );
  }, [computerId]);

  return { state, pick };
}
