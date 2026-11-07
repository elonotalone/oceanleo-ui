"use client";

// The model / mode / option pill for a computer program, fed by the gateway's
// catalog (`GET /v1/computers/{cid}/programs/{program}/catalog`: what that
// program's last session/new or session/load reported) and the user's own
// remembered choice, kept by the gateway per user + computer + program
// (`…/programs/{program}/choice`, UX wave 2026-11-07 §2.1). Same pill as before
// (`nativeModelPickerFor`); a pick is stored at once and goes out with the next
// message (`send` applies it with session/set_* before the prompt).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { acpErrorText, getCatalog, type AcpCatalog, type AcpSessionChoices } from "../../lib/acp-frames-api";
import { putProgramChoice, type ProgramChoice } from "../../lib/program-choice-api";
import { isWsProgram, parseConfigOptions, parseMode } from "../cloud-computer/agent-dialog/parse";
import { useProgramAccess } from "../cloud-computer/native-surface/useProgramAccess";
import { listedConfigValue, readProgramChoice } from "../cloud-computer/agent-dialog/model-param-memory";
import type { DialogConfigOption, DialogModel, ModeOption } from "../cloud-computer/agent-dialog/types";
import { NativeModelPicker, nativeModelPickerFor, type NativePickerDialog } from "../native-thread/NativeModelPicker";

export type AcpCatalogPickerInput = {
  computerId: string | null | undefined;
  program: string | null | undefined;
  disabled?: boolean;
  /**
   * Changing it reads the catalog again (the task page: when the agent link attaches; the home: when
   * the computer row changes). The program's access status changing and the first open of an empty
   * pill read it again too (contract §2.2: no polling).
   */
  reloadKey?: unknown;
};

export type AcpCatalogPicker = {
  picker: ReactNode;
  /** What the user picked (or remembered) and the program lists; empty fields are not sent. */
  choice: AcpSessionChoices;
};

/** The server's choice for this computer + program, the picks made since, and the last failed store. */
type Memory = { key: string; stored: ProgramChoice; picked: ProgramChoice; error: string };

function memoryFor(key: string): Memory {
  return { key, stored: {}, picked: {}, error: "" };
}

const NO_MEMORY = memoryFor("");

function mergeChoice(base: ProgramChoice, patch: ProgramChoice): ProgramChoice {
  const config = { ...base.config, ...patch.config };
  return {
    ...(patch.model || base.model ? { model: patch.model || base.model } : {}),
    ...(patch.mode || base.mode ? { mode: patch.mode || base.mode } : {}),
    ...(Object.keys(config).length ? { config } : {}),
  };
}

function catalogModels(catalog: AcpCatalog): DialogModel[] {
  const current = catalog.models?.currentModelId || "";
  return (catalog.models?.availableModels || []).flatMap((model) => model?.modelId
    ? [{ id: model.modelId, name: model.name || model.modelId, default: model.modelId === current }]
    : []);
}

function catalogMode(catalog: AcpCatalog, options: unknown[]): ModeOption | null {
  const modes = catalog.modes?.availableModes || [];
  if (modes.length) {
    return {
      id: "mode",
      name: "",
      current: catalog.modes?.currentModeId || "",
      options: modes.flatMap((mode) => mode?.id ? [{ value: mode.id, name: mode.name || mode.id }] : []),
    };
  }
  // A program that reports its modes as a config option (category "mode").
  return parseMode(options);
}

export function useAcpCatalogPicker({ computerId, program, disabled = false, reloadKey }: AcpCatalogPickerInput): AcpCatalogPicker {
  const tt = useUI();
  const access = useProgramAccess(computerId || "", isWsProgram(program) ? program : null);
  const key = computerId && program ? `${computerId}\u0000${program}` : "";
  // Installed / signed in / upgraded: a program that just became ready may have reported its lists.
  const accessKey = access.programs.map((row) => `${row.id}:${row.installed}:${row.logged_in}:${row.version}`).join(",");
  /** The program whose pill was opened while its catalog was empty: read once more. */
  const [openedEmpty, setOpenedEmpty] = useState("");
  const reread = openedEmpty === key;
  const [read, setRead] = useState<{ key: string; catalog: AcpCatalog | null }>({ key: "", catalog: null });
  useEffect(() => {
    if (!key || !computerId || !program) return;
    let alive = true;
    void getCatalog(computerId, program).then(
      (catalog) => { if (alive) setRead({ key, catalog: catalog && typeof catalog === "object" ? catalog : {} }); },
      // An unreadable catalog is shown like an empty one: nothing to pick until the program reports.
      () => { if (alive) setRead({ key, catalog: {} }); },
    );
    return () => { alive = false; };
  }, [key, computerId, program, reloadKey, accessKey, reread]);
  const catalog = read.key === key ? read.catalog : null;

  // The remembered choice: read once per computer + program. A pick made before it arrives wins over it.
  const [memory, setMemory] = useState<Memory>(NO_MEMORY);
  useEffect(() => {
    if (!key || !computerId || !program) return;
    let alive = true;
    void readProgramChoice(computerId, program).then(
      (stored) => { if (alive) setMemory((current) => ({ ...(current.key === key ? current : memoryFor(key)), stored })); },
      // An unreadable choice is shown like none: the program's own defaults until the user picks.
      () => undefined,
    );
    return () => { alive = false; };
  }, [key, computerId, program]);
  const current = memory.key === key ? memory : NO_MEMORY;
  const chosen = useMemo(() => mergeChoice(current.stored, current.picked), [current.stored, current.picked]);

  const lists = useMemo(() => {
    if (!catalog) return null;
    const raw = Array.isArray(catalog.configOptions) ? catalog.configOptions : [];
    const parsed = parseConfigOptions(raw);
    return { models: catalogModels(catalog), configOptions: parsed, mode: catalogMode(catalog, raw) };
  }, [catalog]);
  const empty = Boolean(lists && !lists.models.length && !lists.configOptions.length && !lists.mode?.options.length);
  const onOpen = useCallback(() => { if (empty && key) setOpenedEmpty(key); }, [empty, key]);

  /** Shown at once and stored on the server; a failed store is said in the gateway's words (the pick still goes out). */
  const pick = useCallback((patch: ProgramChoice) => {
    if (!key || !computerId || !program) return;
    setMemory((before) => {
      const base = before.key === key ? before : memoryFor(key);
      return { ...base, picked: mergeChoice(base.picked, patch), error: "" };
    });
    void putProgramChoice(computerId, program, patch).catch((error: unknown) => {
      setMemory((before) => before.key === key ? { ...before, error: acpErrorText(error) } : before);
    });
  }, [computerId, program, key]);
  const setModel = useCallback((id: string) => pick({ model: id }), [pick]);
  const setMode = useCallback((value: string) => pick({ mode: value }), [pick]);
  const setConfig = useCallback((id: string, value: string | boolean) => pick({ config: { [id]: value } }), [pick]);

  // Only choices the program lists go out (a remembered model it no longer offers is not sent).
  const choice = useMemo<AcpSessionChoices>(() => {
    if (!lists) return {};
    const modelIds = new Set([
      ...lists.models.map((model) => model.id),
      ...(lists.configOptions.find((option) => option.category === "model" || option.id === "model")?.options.map((option) => option.value) ?? []),
    ]);
    const model = chosen.model && modelIds.has(chosen.model) ? chosen.model : undefined;
    const mode = chosen.mode && lists.mode?.options.some((option) => option.value === chosen.mode) ? chosen.mode : undefined;
    const config = Object.fromEntries(lists.configOptions.flatMap((option) => {
      const value = listedConfigValue(option, chosen.config?.[option.id]);
      return value === undefined ? [] : [[option.id, value] as const];
    }));
    return {
      ...(model ? { model } : {}),
      ...(mode ? { mode } : {}),
      ...(Object.keys(config).length ? { config } : {}),
    };
  }, [lists, chosen]);

  let picker: ReactNode = null;
  if (key && program && computerId) {
    if (!lists) {
      picker = <NativeModelPicker models={[]} selected="" onSelect={() => undefined} loading />;
    } else {
      // The pill shows the user's choice over what the program reported: the same choice that goes out.
      const configOptions: DialogConfigOption[] = lists.configOptions.map((option) => {
        const value = choice.config?.[option.id];
        return value === undefined ? option : { ...option, current: value };
      });
      const dialog: NativePickerDialog = {
        ...access,
        models: lists.models,
        configOptions,
        selectedModel: choice.model || lists.models.find((model) => model.default)?.id || "",
        setSelectedModel: setModel,
        mode: lists.mode,
        selectedMode: choice.mode || lists.mode?.current || "",
        setMode,
        setConfig,
      };
      picker = nativeModelPickerFor({ program, computerId, dialog, waiting: false, disabled, notice: current.error, onOpen })
        ?? <NativeModelPicker models={[]} selected="" onSelect={() => undefined} disabled fallbackSummary={tt("选择程序后加载")} />;
    }
  }
  return { picker, choice };
}

/** The part of `next` that differs from what already went out (the task page sends a change once). */
export function changedChoices(next: AcpSessionChoices, sent: AcpSessionChoices | null): AcpSessionChoices {
  if (!sent) return next;
  const config = Object.fromEntries(Object.entries(next.config ?? {}).filter(([id, value]) => sent.config?.[id] !== value));
  return {
    ...(next.model && next.model !== sent.model ? { model: next.model } : {}),
    ...(next.mode && next.mode !== sent.mode ? { mode: next.mode } : {}),
    ...(Object.keys(config).length ? { config } : {}),
  };
}
