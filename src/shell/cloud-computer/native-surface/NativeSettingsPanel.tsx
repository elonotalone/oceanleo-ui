"use client";

// 任务页右栏（SplitWorkspace library 槽）里的电脑对话设置，宿主样式。
// 每一组标题直接写清作用范围：本对话 / 这台电脑上的 <程序> / 整台电脑（所有程序）/
// 终端外观（命令行和终端共用）。不立即生效的项写明「下次打开时生效」。
// 标题由宿主右栏显示（nativeSettingsTitle），这里不再画标题和关闭按钮。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  cloudComputerApi,
  type AgentSettings,
  type CliProgram,
  type CloudComputerClient,
  type Computer,
} from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { hiddenModelCopy, modelGroups } from "../agent-dialog/notice";
import { PROGRAM_LABEL } from "../agent-dialog/types";
import { AppearancePanel } from "../terminal-card/AppearancePanel";
import { CliSettingsPanel, isCliToolProgram, type CliToolProgram } from "../terminal-card/CliSettingsPanel";
import type { ConversationTarget } from "../../native-thread/types";
import { HOST, HOST_PANEL_SKIN } from "./host-style";
import { ProgramAccess, type NativeDialog } from "./ProgramAccess";

type Translate = ReturnType<typeof useUI>;

export type NativeSettingsPanelProps = {
  computer: Computer | null;
  /** Native (chat or cli) or terminal conversation. */
  conversation: ConversationTarget;
  /** `thread.dialog` from useNativeThread; required for native chat settings. */
  dialog?: NativeDialog | null;
  client?: CloudComputerClient;
};

/** Right-pane title: "Codex 设置 · elon" / "终端设置 · elon". */
export function nativeSettingsTitle(conversation: ConversationTarget, tt: Translate): string {
  if (conversation.kind === "terminal") {
    return tt("终端设置 · {computer}", { computer: conversation.computerName });
  }
  if (conversation.kind === "native") {
    return tt("{program} 设置 · {computer}", {
      program: PROGRAM_LABEL[conversation.program],
      computer: conversation.computerName,
    });
  }
  return tt("设置");
}

function Group({ scope, title, children }: { scope: string; title: string; children: ReactNode }) {
  return (
    <section className={HOST.group} data-oceanleo-native-settings-group={scope}>
      <h3 className={HOST.groupTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Toggle({
  checked,
  disabled,
  label,
  hint,
  setting,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  setting: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 text-[13px] text-neutral-800">
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint ? <span className={`mt-0.5 block ${HOST.hint}`}>{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className={`mt-0.5 ${HOST.check}`}
        checked={checked}
        disabled={disabled}
        data-oceanleo-native-setting={setting}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

const DEFAULT_SETTINGS: AgentSettings = { confirm_dangerous: true, oceanleo_tools: true, billing_paused: false };

function useMachineSettings(computerId: string, client: CloudComputerClient) {
  const tt = useUI();
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const current = (generation.current += 1);
    setLoaded(false);
    void client.getAgentSettings(computerId)
      .then((next) => { if (current === generation.current) setSettings(next); })
      .catch(() => { if (current === generation.current) setError(tt("设置读取失败，请稍后重试。")); })
      .finally(() => { if (current === generation.current) setLoaded(true); });
    return () => { generation.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, computerId]);
  const change = useCallback(async (key: keyof AgentSettings, value: boolean) => {
    if (saving) return;
    const previous = settings;
    setSettings({ ...previous, [key]: value });
    setSaving(true);
    setError("");
    try {
      setSettings(await client.patchAgentSettings(computerId, { [key]: value }));
    } catch {
      setSettings(previous);
      setError(tt("设置保存失败，请稍后重试。"));
    } finally {
      setSaving(false);
    }
  }, [client, computerId, saving, settings, tt]);
  return { settings, loaded, saving, error, change };
}

function MachineGroup({ computerId, client }: { computerId: string; client: CloudComputerClient }) {
  const tt = useUI();
  const machine = useMachineSettings(computerId, client);
  return (
    <Group scope="computer" title={tt("整台电脑（所有程序）")}>
      <Toggle
        checked={machine.settings.confirm_dangerous}
        disabled={!machine.loaded || machine.saving}
        label={tt("危险操作先问我")}
        hint={tt("关掉后 AI 执行删除、覆盖等操作前不再问你")}
        setting="confirm_dangerous"
        onChange={(value) => void machine.change("confirm_dangerous", value)}
      />
      <Toggle
        checked={machine.settings.oceanleo_tools}
        disabled={!machine.loaded || machine.saving}
        label={tt("让它能用 OceanLeo 的工具")}
        hint={tt("下次打开时生效")}
        setting="oceanleo_tools"
        onChange={(value) => void machine.change("oceanleo_tools", value)}
      />
      {machine.error ? <p className={HOST.error} role="alert">{machine.error}</p> : null}
    </Group>
  );
}

function ConversationGroup({ dialog, online }: { dialog: NativeDialog | null | undefined; online: boolean }) {
  const tt = useUI();
  const otherConfig = useMemo(
    () => (dialog?.configOptions ?? []).filter(
      (option) => option.id !== "model" && option.id !== dialog?.mode?.id && option.category !== "mode",
    ),
    [dialog?.configOptions, dialog?.mode?.id],
  );
  if (!online || !dialog) {
    return (
      <Group scope="conversation" title={tt("本对话")}>
        <p className={HOST.hint}>{tt("这台电脑联网后可以修改。")}</p>
      </Group>
    );
  }
  const usableSelected = dialog.models.some((model) => model.id === dialog.selectedModel && model.usable !== false);
  const empty = dialog.models.length === 0 && !(dialog.mode && dialog.mode.options.length) && otherConfig.length === 0;
  return (
    <Group scope="conversation" title={tt("本对话")}>
      {empty ? <p className={HOST.hint}>{tt("正在读取…")}</p> : null}
      {dialog.models.length > 0 ? (
        <label className={HOST.label}>
          <span className={HOST.hint}>{tt("模型")}</span>
          <select
            value={usableSelected ? dialog.selectedModel : ""}
            onChange={(event) => dialog.setSelectedModel(event.currentTarget.value)}
            className={HOST.input}
            data-oceanleo-native-settings-model=""
          >
            {!usableSelected ? <option value="" disabled>{tt("请选择可用模型")}</option> : null}
            {modelGroups(dialog.models).map((group) => group.label ? (
              <optgroup key={group.label} label={group.label}>
                {group.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </optgroup>
            ) : group.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>))}
          </select>
          {hiddenModelCopy(tt, dialog.models).map((copy) => <span key={copy} className={HOST.hint}>{copy}</span>)}
        </label>
      ) : null}
      {dialog.mode && dialog.mode.options.length > 0 ? (
        <label className={HOST.label}>
          <span className={HOST.hint}>{dialog.mode.name || tt("模式")}</span>
          <select
            value={dialog.selectedMode}
            onChange={(event) => dialog.setMode(event.currentTarget.value)}
            className={HOST.input}
            data-oceanleo-native-settings-mode=""
          >
            {dialog.mode.options.map((option) => <option key={option.value} value={option.value}>{option.name}</option>)}
          </select>
        </label>
      ) : null}
      {otherConfig.map((option) => option.type === "bool" ? (
        <Toggle
          key={option.id}
          checked={option.current === true}
          label={option.name}
          setting={`config:${option.id}`}
          onChange={(value) => dialog.setConfig(option.id, value)}
        />
      ) : option.type === "select" ? (
        <label key={option.id} className={HOST.label}>
          <span className={HOST.hint}>{option.name}</span>
          <select
            value={String(option.current)}
            onChange={(event) => dialog.setConfig(option.id, event.currentTarget.value)}
            className={HOST.input}
            data-oceanleo-native-settings-config={option.id}
          >
            {option.options.map((choice) => <option key={choice.value} value={choice.value}>{choice.name}</option>)}
          </select>
        </label>
      ) : (
        <label key={option.id} className={HOST.label}>
          <span className={HOST.hint}>{option.name}</span>
          <input
            value={String(option.current)}
            onChange={(event) => dialog.setConfig(option.id, event.currentTarget.value)}
            className={HOST.input}
            data-oceanleo-native-settings-config={option.id}
          />
        </label>
      ))}
    </Group>
  );
}

function CliProgramGroup({
  computerId,
  programId,
  programLabel,
  online,
  client,
}: {
  computerId: string;
  programId: string;
  programLabel: string;
  online: boolean;
  client: CloudComputerClient;
}) {
  const tt = useUI();
  const [program, setProgram] = useState<CliProgram | null>(null);
  const [failed, setFailed] = useState(false);
  const [serverConfirm, setServerConfirm] = useState(true);
  const [tools, setTools] = useState<Partial<Record<CliToolProgram, boolean>>>({});
  const [toolsBusy, setToolsBusy] = useState(false);
  const [toolsError, setToolsError] = useState("");
  useEffect(() => {
    if (!online) return;
    let alive = true;
    setFailed(false);
    void client.listCliPrograms(computerId)
      .then((result) => { if (alive) setProgram((result.programs || []).find((item) => item.id === programId) ?? null); })
      .catch(() => { if (alive) setFailed(true); });
    void client.getAgentSettings(computerId)
      .then((settings) => { if (alive) setServerConfirm(settings.confirm_dangerous); })
      .catch(() => undefined);
    void client.getCliTools(computerId)
      .then((result) => { if (alive) setTools(result.programs); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [client, computerId, online, programId]);

  async function toggleTools(enabled: boolean) {
    if (!isCliToolProgram(programId) || toolsBusy) return;
    setToolsBusy(true);
    setToolsError("");
    try {
      const result = await client.setCliTools(computerId, programId, enabled);
      setTools((current) => ({ ...current, [programId]: result.enabled }));
    } catch {
      setToolsError(tt("OceanLeo 工具设置失败，请稍后重试。"));
    } finally {
      setToolsBusy(false);
    }
  }

  return (
    <Group scope="program" title={tt("这台电脑上的 {program}", { program: program?.label || programLabel })}>
      {!online ? (
        <p className={HOST.hint}>{tt("这台电脑联网后可以修改。")}</p>
      ) : failed ? (
        <p className={HOST.error} role="alert">{tt("设置读取失败，请稍后重试。")}</p>
      ) : !program ? (
        <p className={HOST.hint}>{tt("正在读取…")}</p>
      ) : (
        <CliSettingsPanel
          computerId={computerId}
          program={program}
          serverConfirmDangerous={serverConfirm}
          toolsEnabled={isCliToolProgram(programId) ? tools[programId] : undefined}
          toolsBusy={toolsBusy}
          onToolsEnabledChange={(enabled) => void toggleTools(enabled)}
          skin={HOST_PANEL_SKIN}
          showAppearance={false}
        />
      )}
      {toolsError ? <p className={HOST.error} role="alert">{toolsError}</p> : null}
    </Group>
  );
}

function AppearanceGroup() {
  const tt = useUI();
  return (
    <Group scope="appearance" title={tt("终端外观（命令行和终端共用）")}>
      <AppearancePanel framed={false} showHeading={false} skin={HOST_PANEL_SKIN} className="[&_label]:text-[13px]" />
    </Group>
  );
}

export function NativeSettingsPanel({ computer, conversation, dialog, client = cloudComputerApi }: NativeSettingsPanelProps) {
  const tt = useUI();
  const online = computer?.node_online === true;
  if (conversation.kind === "oceanleo") return null;
  const computerId = computer?.id ?? conversation.computerId;
  const view = conversation.kind === "terminal" ? "terminal" : conversation.view;
  return (
    <div
      className="h-full min-h-0 overflow-y-auto bg-white text-neutral-900"
      data-oceanleo-native-settings={view}
    >
      {!online ? (
        <p className={`px-4 pt-4 ${HOST.hint}`} role="status" data-oceanleo-native-settings-offline="">
          {tt("这台电脑离线。联网后可以修改这台电脑上的设置。")}
        </p>
      ) : null}
      {conversation.kind === "native" && conversation.view === "chat" ? (
        <>
          <ConversationGroup dialog={dialog} online={online} />
          <Group scope="program" title={tt("这台电脑上的 {program}", { program: PROGRAM_LABEL[conversation.program] })}>
            {online && dialog ? (
              <ProgramAccess computerId={computerId} program={conversation.program} dialog={dialog} />
            ) : (
              <p className={HOST.hint}>{tt("这台电脑联网后可以修改。")}</p>
            )}
          </Group>
          <MachineGroup computerId={computerId} client={client} />
        </>
      ) : conversation.kind === "native" ? (
        <>
          <CliProgramGroup
            computerId={computerId}
            programId={conversation.program}
            programLabel={PROGRAM_LABEL[conversation.program]}
            online={online}
            client={client}
          />
          <AppearanceGroup />
        </>
      ) : (
        <AppearanceGroup />
      )}
    </div>
  );
}
