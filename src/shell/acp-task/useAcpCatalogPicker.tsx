"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { acpErrorText, getCatalog, type AcpSessionChoices } from "../../lib/acp-frames-api";
import { putProgramChoice, type ProgramChoice } from "../../lib/program-choice-api";
import { isWsProgram } from "../cloud-computer/agent-dialog/parse";
import { useProgramAccess } from "../cloud-computer/native-surface/useProgramAccess";
import { readProgramChoice } from "../cloud-computer/agent-dialog/model-param-memory";
import { NativeModelPicker, nativeModelPickerFor, type NativePickerDialog } from "../native-thread/NativeModelPicker";
import {
  applyTaskSetting, changedChoices, offeredChoices, reportedChoices, settingNotLive, settingsLists, settingsModel,
  type AcpModelCatalog, type AcpSettingChange, type AcpSettingsState,
} from "./acp-settings";

export { changedChoices } from "./acp-settings";

export type AcpCatalogPickerInput = {
  computerId: string | null | undefined;
  program: string | null | undefined;
  disabled?: boolean;
  reloadKey?: unknown;
  taskId?: string | null;
  sessionLive?: boolean;
  live?: AcpSettingsState | null;
};

export type AcpCatalogPicker = {
  picker: ReactNode;
  choice: AcpSessionChoices;
  /** Revalidate retries too, then omit settings already applied to this session. */
  forSend: (next?: AcpSessionChoices) => AcpSessionChoices;
};

type Memory = {
  key: string; stored: ProgramChoice; picked: ProgramChoice; optimistic: ProgramChoice; error: string;
  values: Record<string, ProgramChoice["config"]>; pending: Record<string, ProgramChoice["config"]>;
};
const memoryFor = (key: string): Memory => ({ key, stored: {}, picked: {}, optimistic: {}, error: "", values: {}, pending: {} });
const NO_MEMORY = memoryFor("");
// Only a warm cache: each mount still reads the owner's server-side memory.
const cached = new Map<string, { catalog?: AcpModelCatalog; stored?: ProgramChoice }>();

function mergeChoice(base: ProgramChoice, patch: ProgramChoice): ProgramChoice {
  return { ...base, ...patch, config: { ...base.config, ...patch.config } };
}

function changePatch(change: AcpSettingChange): ProgramChoice {
  return change.kind === "config" ? { config: { [change.id!]: change.value } } : { [change.kind]: String(change.value) };
}

export function useAcpCatalogPicker({ computerId, program, disabled = false, reloadKey, taskId, sessionLive = false, live = null }: AcpCatalogPickerInput): AcpCatalogPicker {
  const tt = useUI();
  const access = useProgramAccess(computerId || "", isWsProgram(program) ? program : null);
  const key = computerId && program ? `${computerId}\u0000${program}` : "";
  const scope = `${key}\u0000${taskId || ""}`;
  const activeScope = useRef(scope);
  useEffect(() => { activeScope.current = scope; }, [scope]);
  const accessKey = access.programs.map((row) => `${row.id}:${row.installed}:${row.logged_in}:${row.version}`).join(",");
  const [openedEmpty, setOpenedEmpty] = useState("");
  const reread = openedEmpty === key;
  const [read, setRead] = useState<{ key: string; catalog: AcpModelCatalog }>({ key: "", catalog: {} });
  useEffect(() => {
    if (!key || !computerId || !program) return;
    let alive = true;
    void getCatalog(computerId, program).then(
      (value) => {
        const catalog: AcpModelCatalog = value && typeof value === "object" ? value : {};
        cached.set(key, { ...cached.get(key), catalog });
        if (alive) setRead({ key, catalog });
      },
      () => { if (alive) setRead({ key, catalog: cached.get(key)?.catalog ?? {} }); },
    );
    return () => { alive = false; };
  }, [key, computerId, program, reloadKey, accessKey, reread]);
  const catalog = read.key === key ? read.catalog : cached.get(key)?.catalog ?? null;
  const [memory, setMemory] = useState<Memory>(NO_MEMORY);
  useEffect(() => {
    if (!key || !computerId || !program) return;
    let alive = true;
    void readProgramChoice(computerId, program).then((stored) => {
      cached.set(key, { ...cached.get(key), stored });
      if (alive) setMemory((current) => ({ ...(current.key === scope ? current : memoryFor(scope)), stored }));
    }, () => {
      if (alive) setMemory((before) => ({ ...(before.key === scope ? before : memoryFor(scope)), stored: {} }));
    });
    return () => { alive = false; };
  }, [key, computerId, program, scope]);
  const current = memory.key === scope ? memory : { ...NO_MEMORY, stored: cached.get(key)?.stored ?? {} };
  // A direct reply wins until a newer transcript list arrives. Replies from another task never leak in.
  const [answer, setAnswer] = useState<{ scope: string; source: AcpSettingsState | null; state: AcpSettingsState } | null>(null);
  const latest = answer?.scope === scope && answer.source === live ? answer.state : live;
  const [notLive, setNotLive] = useState<string | null>(null);
  const effectiveLive = sessionLive && notLive !== scope;
  useEffect(() => { setNotLive(null); }, [scope, reloadKey]);
  useEffect(() => {
    const model = settingsModel(live);
    if (!key || !model || !Array.isArray(live?.configOptions)) return;
    setRead((before) => {
      const base = before.key === key ? before.catalog : cached.get(key)?.catalog ?? {};
      return { key, catalog: { ...base, byModel: { ...base.byModel, [model]: { configOptions: live.configOptions, modes: live.modes } } } };
    });
  }, [key, live]);
  const chosen = useMemo(() => mergeChoice(current.stored, current.picked), [current.stored, current.picked]);
  const baseLists = useMemo(() => settingsLists(catalog, settingsModel(latest) || settingsModel(catalog), latest), [catalog, latest]);
  const knownModels = baseLists.models.length || baseLists.configOptions.some((option) => option.id === "model" || option.category === "model");
  const rememberedModel = !knownModels ? chosen.model : offeredChoices({ model: chosen.model }, baseLists).model;
  const selectedModel = current.picked.model || settingsModel(latest) || rememberedModel || settingsModel(catalog);
  const lists = useMemo(() => settingsLists(catalog, selectedModel, latest), [catalog, selectedModel, latest]);
  const liveModel = settingsModel(latest);
  const liveChoices = useMemo(() => reportedChoices(latest), [latest]);
  useEffect(() => {
    if (!liveModel) return;
    setMemory((before) => {
      if (before.key !== scope) return before;
      const picked = { ...before.picked };
      if (picked.model === liveChoices.model) delete picked.model;
      if (picked.mode === liveChoices.mode) delete picked.mode;
      const pending = Object.fromEntries(Object.entries(before.pending[liveModel] ?? {}).filter(([id, value]) => liveChoices.config?.[id] !== value));
      if (picked.model === before.picked.model && picked.mode === before.picked.mode
        && Object.keys(pending).length === Object.keys(before.pending[liveModel] ?? {}).length) return before;
      return { ...before, picked, pending: { ...before.pending, [liveModel]: pending } };
    });
  }, [scope, liveModel, liveChoices]);
  const choice = useMemo(() => offeredChoices({
    ...chosen,
    model: current.picked.model || (effectiveLive ? liveChoices.model : chosen.model),
    mode: current.picked.mode || (effectiveLive ? liveChoices.mode : chosen.mode),
    config: {
      ...(!current.stored.model || current.stored.model === selectedModel ? current.stored.config : {}),
      ...current.values[selectedModel],
      ...(effectiveLive && liveModel === selectedModel ? liveChoices.config : {}),
      ...current.pending[selectedModel], ...current.optimistic.config,
    },
  }, lists), [chosen, selectedModel, current.picked, current.optimistic, current.values, current.pending, current.stored, liveModel, liveChoices, lists, effectiveLive]);
  const empty = !lists.models.length && !lists.configOptions.length && !lists.mode?.options.length;
  const onOpen = useCallback(() => { if (empty && key) setOpenedEmpty(key); }, [empty, key]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const versions = useRef(new Map<string, number>());

  const pick = useCallback((change: AcpSettingChange) => {
    if (!key || !computerId || !program) return;
    const patch = changePatch(change);
    const field = change.kind === "config" ? `config:${change.id}` : change.kind;
    const modelVersion = versions.current.get("model");
    const version = (versions.current.get(field) ?? 0) + 1;
    versions.current.set(field, version);
    const previous = change.kind === "config" ? choice.config?.[change.id!] : choice[change.kind];
    setMemory((before) => {
      const base = before.key === scope ? before : { ...memoryFor(scope), stored: current.stored };
      return { ...base, picked: mergeChoice(base.picked, patch), optimistic: mergeChoice(base.optimistic, patch), error: "" };
    });
    // Model/provider changes finish before dependent picks. A refusal never poisons the queue.
    queue.current = queue.current.then(async () => {
      if (activeScope.current !== scope) return;
      let result: AcpSettingsState | null = null;
      try {
        if (taskId && effectiveLive) result = await applyTaskSetting(taskId, change);
      } catch (error) {
        if (!settingNotLive(error)) {
          if (activeScope.current !== scope) return;
          setMemory((before) => {
            if (before.key !== scope || versions.current.get(field) !== version) return before;
            const picked = { ...before.picked, config: { ...before.picked.config } };
            const optimistic = { ...before.optimistic, config: { ...before.optimistic.config } };
            if (change.kind === "config") {
              if (previous === undefined) delete picked.config![change.id!];
              else picked.config![change.id!] = previous;
              delete optimistic.config![change.id!];
            } else {
              if (typeof previous === "string" && previous !== liveChoices[change.kind]) picked[change.kind] = previous;
              else delete picked[change.kind];
              delete optimistic[change.kind];
            }
            return { ...before, picked, optimistic, error: tt("设置没有生效：{message}", { message: acpErrorText(error).replace(/\s+/g, " ") }) };
          });
          return;
        }
        setNotLive(scope);
      }
      if (activeScope.current !== scope) return;
      if (result) {
        setAnswer({ scope, source: live, state: result });
        const model = settingsModel(result);
        if (model && Array.isArray(result.configOptions)) setRead((before) => ({
          key, catalog: { ...(before.key === key ? before.catalog : catalog), byModel: {
            ...(before.key === key ? before.catalog.byModel : catalog?.byModel),
            [model]: { configOptions: result.configOptions, modes: result.modes },
          } },
        }));
      }
      setMemory((before) => {
        if (before.key !== scope) return before;
        const optimistic = { ...before.optimistic, config: { ...before.optimistic.config } };
        if (versions.current.get(field) === version) {
          if (change.kind === "config") delete optimistic.config![change.id!];
          else delete optimistic[change.kind];
        }
        const picked = { ...before.picked, config: { ...before.picked.config } };
        if (result && versions.current.get("model") === modelVersion) delete picked.model;
        if (result && versions.current.get(field) === version) {
          if (change.kind === "config") delete picked.config![change.id!];
          else delete picked[change.kind];
        }
        return {
          ...before, picked, optimistic,
          pending: result ? before.pending : { ...before.pending, [selectedModel]: { ...before.pending[selectedModel], ...patch.config } },
          values: { ...before.values, [selectedModel]: { ...choice.config, ...before.values[selectedModel], ...patch.config } },
        };
      });
      try {
        const stored = await putProgramChoice(computerId, program, patch);
        cached.set(key, { ...cached.get(key), stored });
      } catch (error) {
        if (activeScope.current === scope) setMemory((before) => before.key === scope ? { ...before, error: acpErrorText(error) } : before);
      }
    });
  }, [key, computerId, program, scope, taskId, effectiveLive, choice, current.stored, selectedModel, live, liveChoices, catalog, tt]);
  const setModel = useCallback((value: string) => pick({ kind: "model", value }), [pick]);
  const setMode = useCallback((value: string) => pick({ kind: "mode", value }), [pick]);
  const setConfig = useCallback((id: string, value: string | boolean) => pick({ kind: "config", id, value }), [pick]);
  const forSend = useCallback((next: AcpSessionChoices = choice) => {
    const offered = offeredChoices(next, settingsLists(catalog, next.model || selectedModel, latest));
    return changedChoices(offered, effectiveLive ? liveChoices : null);
  }, [choice, catalog, selectedModel, latest, effectiveLive, liveChoices]);

  let picker: ReactNode = null;
  if (key && program && computerId) {
    const configOptions = lists.configOptions.map((option) => {
      const value = option.id === "model" || option.category === "model" ? selectedModel : choice.config?.[option.id];
      return value === undefined ? option : { ...option, current: value };
    });
    const dialog: NativePickerDialog = {
      ...access, models: lists.models, configOptions,
      selectedModel, setSelectedModel: setModel,
      mode: lists.mode, selectedMode: choice.mode || lists.mode?.current || "", setMode, setConfig,
    };
    picker = nativeModelPickerFor({ program, computerId, dialog, waiting: false, disabled, notice: current.error, onOpen })
      ?? <NativeModelPicker models={[]} selected="" onSelect={() => undefined} disabled fallbackSummary={selectedModel || program} />;
  }
  return { picker, choice, forSend };
}
