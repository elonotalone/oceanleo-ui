"use client";

// 电脑对话的设置，作为输入框模型药丸菜单（composer-settings-menu）里的行。
// 2026-10-31 夜：输入框下的齿轮「设置」和任务页右栏设置面板删除，全部设置并进药丸：
//   本对话（模型 / 推理强度 / 权限模式 / 快速模式，NativeModelPicker 自己的行）
//   这台电脑上的 <程序>：账号一行，卡片里是登录 / 退出登录 / 安装 / Key 和对应流程
//   整台电脑（所有程序）：危险操作先问我、让它能用 OceanLeo 的工具（直接开关）
//   命令行：这个程序的启动选项；终端外观（命令行和终端共用）：一行，卡片里是外观表单。
// 离线时这些行都置灰并写明原因；终端外观只存在本机，离线也能改。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cloudComputerApi,
  type AgentSettings,
  type CliProgram,
  type CloudComputerClient,
  type Computer,
} from "../../../lib/cloud-computer-api";
import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import { ComposerSettingsMenu, type ComposerSettingChoice, type ComposerSettingRow } from "../../composer-settings-menu";
import type { ConversationTarget } from "../../native-thread/types";
import { PROGRAM_LABEL, type WsProgram } from "../agent-dialog/types";
import { AppearancePanel } from "../terminal-card/AppearancePanel";
import { useTerminalAppearance } from "../terminal-card/appearance";
import { isCliToolProgram, type CliToolProgram } from "../terminal-card/CliSettingsPanel";
import { readCliProgramSettings, writeCliProgramSettings, type CliOptionValue, type CliProgramSettings } from "../terminal-card/cli-settings";
import { HOST_PANEL_SKIN } from "./host-style";
import { InstallFlow, KeyForm, LoginFlow, programAccessState, type NativeDialog } from "./ProgramAccess";

const DEFAULT_SETTINGS: AgentSettings = { confirm_dangerous: true, oceanleo_tools: true, billing_paused: false };

/** Whole-computer agent settings; read only once `enabled` (the menu was opened, the computer is online). */
export function useMachineSettings(computerId: string, client: CloudComputerClient = cloudComputerApi, enabled = true) {
  const tt = useUI();
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    if (!enabled || !computerId) return;
    const current = (generation.current += 1);
    setLoaded(false);
    void client.getAgentSettings(computerId)
      .then((next) => { if (current === generation.current) setSettings(next); })
      .catch(() => { if (current === generation.current) setError(tt("设置读取失败，请稍后重试。")); })
      .finally(() => { if (current === generation.current) setLoaded(true); });
    return () => { generation.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, computerId, enabled]);
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

export type MachineSettings = ReturnType<typeof useMachineSettings>;

/** 「整台电脑（所有程序）」: two switches and the save error, if any. */
export function machineSettingRows(machine: MachineSettings, tt: UITranslate): ComposerSettingRow[] {
  const section = tt("整台电脑（所有程序）");
  const busy = !machine.loaded || machine.saving;
  const toggle = (key: "confirm_dangerous" | "oceanleo_tools", label: string, hint: string): ComposerSettingRow => ({
    id: `computer:${key}`,
    section,
    kind: "toggle",
    label,
    hint,
    checked: machine.settings[key],
    onToggle: busy ? undefined : (next) => void machine.change(key, next),
    attrs: { "data-oceanleo-native-setting": key },
  });
  return [
    toggle("confirm_dangerous", tt("危险操作先问我"), tt("关掉后 AI 执行删除、覆盖等操作前不再问你")),
    toggle("oceanleo_tools", tt("让它能用 OceanLeo 的工具"), tt("下次打开时生效")),
    ...(machine.error ? [{ id: "computer:error", section, kind: "note" as const, label: machine.error, attrs: { role: "alert" } }] : []),
  ];
}

/**
 * 「这台电脑上的 <程序>」: one 账号 row (status · version). Its card lists what
 * can be done now (安装 / 登录 / 退出登录 / Key) and shows the running flow
 * (InstallFlow / LoginFlow / KeyForm) under those choices.
 */
export function programAccountRow({ computerId, program, dialog, keyOpen, onKeyOpen, tt }: {
  computerId: string;
  program: WsProgram;
  dialog: NativeDialog;
  keyOpen: boolean;
  onKeyOpen: (open: boolean) => void;
  tt: UITranslate;
}): ComposerSettingRow {
  const status = dialog.programs.find((item) => item.id === program);
  const { state, copy } = programAccessState(status, tt);
  const choices: ComposerSettingChoice[] = [];
  if (state === "not_installed") {
    choices.push({ value: "install", label: tt("安装"), attrs: { "data-oceanleo-native-program-install": "" } });
  } else if (state === "signed_in" && program !== "hermes" && status?.logged_in === true) {
    choices.push({ value: "logout", label: tt("退出登录"), attrs: { "data-oceanleo-native-program-logout": "" } });
  } else if (state === "signed_out" || state === "unknown") {
    choices.push({ value: "login", label: tt("登录"), attrs: { "data-oceanleo-native-program-login": "" } });
  }
  if (status?.installed) {
    choices.push({ value: "key", label: program === "hermes" ? tt("管理凭据") : tt("Key"), attrs: { "data-oceanleo-native-program-key": "" } });
  }
  const loginOpen = dialog.login.open && dialog.login.program === program;
  const installOpen = dialog.install.open && dialog.install.program === program;
  const card = installOpen || loginOpen || keyOpen ? (
    <div className="grid gap-2">
      {installOpen ? <InstallFlow dialog={dialog} program={program} /> : null}
      {loginOpen ? <LoginFlow dialog={dialog} program={program} /> : null}
      {keyOpen ? <KeyForm computerId={computerId} program={program} status={status} dialog={dialog} onClose={() => onKeyOpen(false)} /> : null}
    </div>
  ) : null;
  return {
    id: "account",
    section: tt("这台电脑上的 {program}", { program: PROGRAM_LABEL[program] }),
    label: tt("账号"),
    value: status?.installed && status.version ? `${copy} · ${status.version}` : copy,
    selected: "",
    choices,
    keepOpen: true,
    card,
    onPick: choices.length || card ? (value) => {
      if (value === "install") dialog.openInstall(program);
      else if (value === "logout") dialog.logoutProgram(program);
      else if (value === "login") dialog.openLogin(program);
      else if (value === "key") onKeyOpen(!keyOpen);
    } : undefined,
    attrs: { "data-oceanleo-native-program": program, "data-state": state },
  };
}

/**
 * Offline: every row stays visible but read-only, with the reason under its
 * name, after one line saying so. Rows listed in `keep` (local-only settings
 * such as the terminal appearance) stay usable.
 */
export function offlineSettingRows(rows: ComposerSettingRow[], tt: UITranslate, keep: string[] = []): ComposerSettingRow[] {
  const reason = tt("这台电脑联网后可以修改。");
  return [
    { id: "offline", kind: "note", label: tt("这台电脑离线。联网后可以修改这台电脑上的设置。"), attrs: { "data-oceanleo-native-settings-offline": "" } },
    ...rows.map((row) => row.kind === "note" || keep.includes(row.id)
      ? row
      : { ...row, onPick: undefined, onToggle: undefined, card: undefined, reason }),
  ];
}

/** 「终端外观（命令行和终端共用）」: one row; its card is the shared appearance form. */
export function useAppearanceRow(): ComposerSettingRow {
  const tt = useUI();
  const [appearance] = useTerminalAppearance();
  return {
    id: "appearance",
    section: tt("终端外观（命令行和终端共用）"),
    label: tt("外观设置"),
    value: appearance.theme === "light" ? tt("白色") : tt("黑色"),
    card: <AppearancePanel framed={false} showHeading={false} skin={HOST_PANEL_SKIN} className="[&_label]:text-[13px]" />,
  };
}

/**
 * A command-line program's launch options on this computer (same storage as
 * CliSettingsPanel), its per-program "ask before dangerous actions" override
 * and the OceanLeo tools switch. Read once `enabled`.
 */
export function useCliProgramRows({ computerId, programId, programLabel, enabled, client = cloudComputerApi }: {
  computerId: string;
  programId: string;
  programLabel: string;
  enabled: boolean;
  client?: CloudComputerClient;
}): ComposerSettingRow[] {
  const tt = useUI();
  const [program, setProgram] = useState<CliProgram | null>(null);
  const [failed, setFailed] = useState(false);
  const [serverConfirm, setServerConfirm] = useState(true);
  const [tools, setTools] = useState<Partial<Record<CliToolProgram, boolean>>>({});
  const [toolsBusy, setToolsBusy] = useState(false);
  const [toolsError, setToolsError] = useState("");
  const [settings, setSettings] = useState<CliProgramSettings>(() => readCliProgramSettings(computerId, programId));
  useEffect(() => {
    setSettings(readCliProgramSettings(computerId, programId));
  }, [computerId, programId]);
  useEffect(() => {
    if (!enabled || !programId) return;
    let alive = true;
    setFailed(false);
    void client.listCliPrograms(computerId)
      .then((result) => { if (alive) setProgram((result.programs || []).find((item) => item.id === programId) ?? null); })
      .catch(() => { if (alive) setFailed(true); });
    void client.getAgentSettings(computerId)
      .then((next) => { if (alive) setServerConfirm(next.confirm_dangerous); })
      .catch(() => undefined);
    void client.getCliTools(computerId)
      .then((result) => { if (alive) setTools(result.programs); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [client, computerId, enabled, programId]);

  const save = (next: CliProgramSettings) => setSettings(writeCliProgramSettings(computerId, programId, next));
  const setOption = (key: string, value: CliOptionValue) => save({ ...settings, options: { ...settings.options, [key]: value } });
  async function toggleTools(next: boolean) {
    if (!isCliToolProgram(programId) || toolsBusy) return;
    setToolsBusy(true);
    setToolsError("");
    try {
      const result = await client.setCliTools(computerId, programId, next);
      setTools((current) => ({ ...current, [programId]: result.enabled }));
    } catch {
      setToolsError(tt("OceanLeo 工具设置失败，请稍后重试。"));
    } finally {
      setToolsBusy(false);
    }
  }

  const label = program?.label || programLabel;
  const section = tt("这台电脑上的 {program}", { program: label });
  const note = (id: string, text: string, attrs?: Record<string, string>): ComposerSettingRow => ({ id, section, kind: "note", label: text, attrs });
  if (failed) return [note("cli:error", tt("设置读取失败，请稍后重试。"), { role: "alert" })];
  if (!program) return [note("cli:reading", tt("正在读取…"))];
  const rows: ComposerSettingRow[] = [note("cli:next-launch", tt("这些设置将在下一次启动时生效。"))];
  for (const option of program.options) {
    if (option.key === "confirm_dangerous") continue;
    const stored = settings.options[option.key];
    if (option.type === "bool") {
      rows.push({
        id: `cli:${option.key}`, section, kind: "toggle", label: option.label,
        checked: typeof stored === "boolean" ? stored : option.default === true,
        onToggle: (next) => setOption(option.key, next),
        attrs: { "data-oceanleo-cli-option": option.key },
      });
      continue;
    }
    const value = typeof stored === "string" ? stored : typeof option.default === "string" ? option.default : "";
    const choices = option.choices ?? [];
    rows.push({
      id: `cli:${option.key}`, section, label: option.label,
      value: choices.find((choice) => choice.value === value)?.label ?? value,
      selected: value,
      choices: choices.map((choice) => ({ value: choice.value, label: choice.label })),
      onPick: (next) => setOption(option.key, next),
      attrs: { "data-oceanleo-cli-option": option.key },
    });
  }
  rows.push({
    id: "cli:confirm_dangerous", section, kind: "toggle", label: tt("危险操作先问"), hint: tt("可以按程序覆盖服务器的默认设置。"),
    checked: settings.confirmDangerous ?? serverConfirm,
    onToggle: (next) => save({ ...settings, confirmDangerous: next }),
    attrs: { "data-oceanleo-confirm-dangerous": "" },
  });
  if (isCliToolProgram(programId)) {
    const enabledNow = tools[programId];
    rows.push({
      id: "cli:tools", section, kind: "toggle", label: tt("把 OceanLeo 工具装进 {program}", { program: label }),
      checked: enabledNow === true,
      onToggle: enabledNow === undefined || toolsBusy ? undefined : (next) => void toggleTools(next),
      attrs: { "data-oceanleo-cli-tools": programId },
    });
  }
  if (toolsError) rows.push(note("cli:tools-error", toolsError, { role: "alert" }));
  return rows;
}

/**
 * The settings pill under a command line or terminal (ConversationBar): the
 * same menu as a native chat's model pill. Command line: its program's
 * options + appearance; terminal: appearance.
 */
export function ComputerConversationSettings({ computer, conversation, client = cloudComputerApi, className = "" }: {
  computer: Computer | null;
  conversation: ConversationTarget;
  client?: CloudComputerClient;
  className?: string;
}) {
  const tt = useUI();
  const [opened, setOpened] = useState(false);
  const online = computer?.node_online === true;
  const cli = conversation.kind === "native" ? conversation.program : null;
  const computerId = computer?.id ?? (conversation.kind === "oceanleo" ? "" : conversation.computerId);
  const cliRows = useCliProgramRows({
    computerId,
    programId: cli ?? "",
    programLabel: cli ? PROGRAM_LABEL[cli] : "",
    enabled: Boolean(cli) && opened && online,
    client,
  });
  const appearance = useAppearanceRow();
  if (conversation.kind === "oceanleo") return null;
  // Offline: nothing of the program can be read; one line says so, appearance (local) stays.
  const rows = [...(cli && online ? cliRows : []), appearance];
  return (
    <ComposerSettingsMenu
      summary={cli ? PROGRAM_LABEL[cli] : tt("终端")}
      rows={online ? rows : offlineSettingRows(rows, tt, ["appearance"])}
      ariaLabel={tt("设置")}
      // The computer is not known yet: a waiting pill, never "offline".
      loading={!computer}
      loadingLabel={tt("正在读取…")}
      className={className}
      onOpenChange={(open) => { if (open) setOpened(true); }}
      rootAttrs={{ "data-conversation-settings-pill": cli ? "cli" : "terminal" }}
    />
  );
}
