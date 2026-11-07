"use client";

// The model / mode / option pill for a computer program, fed by the gateway's
// catalog (`GET /v1/computers/{cid}/programs/{program}/catalog`: what that
// program's last session/new or session/load reported) and the user's own
// remembered choice (model-param-memory). Same pill as before
// (`nativeModelPickerFor`); a choice is only collected here and goes out with
// the next message (`send` applies it with session/set_* before the prompt).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { getCatalog, type AcpCatalog, type AcpSessionChoices } from "../../lib/acp-frames-api";
import { parseConfigOptions, parseMode } from "../cloud-computer/agent-dialog/parse";
import { readProgramSelection, rememberProgramSelection } from "../cloud-computer/agent-dialog/model-param-memory";
import type { DialogConfigOption, DialogModel, ModeOption } from "../cloud-computer/agent-dialog/types";
import { NativeModelPicker, nativeModelPickerFor, type NativePickerDialog } from "../native-thread/NativeModelPicker";

export type AcpCatalogPickerInput = {
  computerId: string | null | undefined;
  program: string | null | undefined;
  disabled?: boolean;
  /** Changing it reads the catalog again (the task page: when the agent link attaches). */
  reloadKey?: unknown;
};

export type AcpCatalogPicker = {
  picker: ReactNode;
  /** What the user picked (or remembered) and the program lists; empty fields are not sent. */
  choice: AcpSessionChoices;
};

type Selection = { model?: string; mode?: string; config: Record<string, string | boolean> };

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
  const key = computerId && program ? `${computerId}\u0000${program}` : "";
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
  }, [key, computerId, program, reloadKey]);
  const catalog = read.key === key ? read.catalog : null;

  const [selection, setSelection] = useState<{ key: string; value: Selection }>({ key: "", value: { config: {} } });
  useEffect(() => {
    if (!key || !computerId || !program) return;
    setSelection({ key, value: { ...readProgramSelection(computerId, program), config: {} } });
  }, [key, computerId, program]);
  const chosen = selection.key === key ? selection.value : { config: {} };

  const lists = useMemo(() => {
    if (!catalog) return null;
    const raw = Array.isArray(catalog.configOptions) ? catalog.configOptions : [];
    const parsed = parseConfigOptions(raw);
    return { models: catalogModels(catalog), configOptions: parsed, mode: catalogMode(catalog, raw) };
  }, [catalog]);

  const setModel = useCallback((id: string) => {
    if (!computerId || !program) return;
    rememberProgramSelection(computerId, program, { model: id });
    setSelection((current) => ({ key, value: { ...(current.key === key ? current.value : { config: {} }), model: id } }));
  }, [computerId, program, key]);
  const setMode = useCallback((value: string) => {
    if (!computerId || !program) return;
    rememberProgramSelection(computerId, program, { mode: value });
    setSelection((current) => ({ key, value: { ...(current.key === key ? current.value : { config: {} }), mode: value } }));
  }, [computerId, program, key]);
  const setConfig = useCallback((id: string, value: string | boolean) => {
    setSelection((current) => {
      const base = current.key === key ? current.value : { config: {} };
      return { key, value: { ...base, config: { ...base.config, [id]: value } } };
    });
  }, [key]);

  // Only choices the program lists go out (a remembered model it no longer offers is not sent).
  const choice = useMemo<AcpSessionChoices>(() => {
    if (!lists) return {};
    const modelIds = new Set([
      ...lists.models.map((model) => model.id),
      ...(lists.configOptions.find((option) => option.category === "model" || option.id === "model")?.options.map((option) => option.value) ?? []),
    ]);
    const model = chosen.model && modelIds.has(chosen.model) ? chosen.model : undefined;
    const mode = chosen.mode && lists.mode?.options.some((option) => option.value === chosen.mode) ? chosen.mode : undefined;
    const config = Object.fromEntries(Object.entries(chosen.config)
      .filter(([id]) => lists.configOptions.some((option) => option.id === id)));
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
      // The pill shows the user's choice over what the program reported.
      const configOptions: DialogConfigOption[] = lists.configOptions.map((option) =>
        chosen.config[option.id] !== undefined ? { ...option, current: chosen.config[option.id] } : option);
      const dialog: NativePickerDialog = {
        models: lists.models,
        configOptions,
        selectedModel: chosen.model || lists.models.find((model) => model.default)?.id || "",
        setSelectedModel: setModel,
        mode: lists.mode,
        selectedMode: chosen.mode || lists.mode?.current || "",
        setMode,
        setConfig,
        // No session is bound to the pill: remembered options are applied once per catalog.
        activeSession: "",
      };
      picker = nativeModelPickerFor({ program, computerId, dialog, waiting: false, disabled })
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
