"use client";

// 电脑对话的设置，作为输入框模型药丸菜单（composer-settings-menu）里的行。
// 2026-10-31 夜：输入框下的齿轮「设置」和任务页右栏设置面板删除，全部设置并进药丸：
//   本对话（模型 / 推理强度 / 权限模式 / 快速模式，NativeModelPicker 自己的行）
//   这台电脑上的 <程序>：账号一行，卡片里是登录 / 退出登录 / 安装 / Key 和对应流程
//   整台电脑（所有程序）：让它能用 OceanLeo 的工具（直接开关）
//   权限只用程序自己的模式（本对话的「权限模式」行），整台电脑没有权限开关。
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
import { HOST, HOST_PANEL_SKIN } from "./host-style";
import { InstallFlow, KeyForm, LoginFlow, programAccessState } from "./ProgramAccess";
import type { ProgramAccess } from "./useProgramAccess";

const DEFAULT_SETTINGS: AgentSettings = { oceanleo_tools: true, billing_paused: false };
const SETTINGS_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 15_000] as const;

export function programModeCopy(mode?: string | null): string {
  if (!mode) return "";
  const words: Record<string, string> = { chatgpt: "ChatGPT", apikey: "API Key", api_key: "API Key", access_token: "Access Token", subscription: "订阅", console: "Console", oauth_token: "长期令牌", login: "已登录" };
  return words[mode] || (mode.startsWith("oauth:") ? `用 ${mode.slice(6)} 账号登录` : "");
}

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
    let disposed = false;
    let active = false;
    let retryTimer: number | null = null;
    let retryAttempt = 0;
    const clearRetry = () => {
      if (retryTimer === null) return;
      window.clearTimeout(retryTimer);
      retryTimer = null;
    };
    const scheduleRetry = () => {
      if (disposed || retryTimer !== null || retryAttempt >= SETTINGS_RETRY_DELAYS_MS.length) return;
      const delay = SETTINGS_RETRY_DELAYS_MS[retryAttempt++];
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void load();
      }, delay);
    };
    const load = async () => {
      if (disposed || active) return;
      active = true;
      setLoaded(false);
      try {
        const next = await client.getAgentSettings(computerId);
        if (disposed || current !== generation.current) return;
        setSettings(next);
        setError("");
        setLoaded(true);
        retryAttempt = 0;
        clearRetry();
      } catch {
        if (disposed || current !== generation.current) return;
        setError(tt("设置读取失败，请稍后重试。"));
        setLoaded(false);
        scheduleRetry();
      } finally {
        active = false;
      }
    };
    const retryNow = () => {
      if (disposed || active) return;
      clearRetry();
      retryAttempt = 0;
      void load();
    };
    const onOnline = () => retryNow();
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") retryNow();
    };
    void load();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      generation.current += 1;
      clearRetry();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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

/** 「整台电脑（所有程序）」: the OceanLeo tools switch and the save error, if any. */
export function machineSettingRows(machine: MachineSettings, tt: UITranslate): ComposerSettingRow[] {
  const section = tt("整台电脑（所有程序）");
  const busy = !machine.loaded || machine.saving;
  return [
    {
      id: "computer:oceanleo_tools",
      section,
      kind: "toggle",
      label: tt("让它能用 OceanLeo 的工具"),
      hint: tt("下次打开时生效"),
      checked: machine.settings.oceanleo_tools,
      onToggle: busy ? undefined : (next) => void machine.change("oceanleo_tools", next),
      attrs: { "data-oceanleo-native-setting": "oceanleo_tools" },
    },
    ...(machine.error ? [{ id: "computer:error", section, kind: "note" as const, label: machine.error, attrs: { role: "alert" } }] : []),
  ];
}

/**
 * 「这台电脑上的 <程序>」: one 账号 row (status · version). Its card lists what
 * can be done now (安装 / 登录 / Key) and shows the running flow
 * (InstallFlow / LoginFlow / KeyForm) under those choices.
 */
export function programAccountRow({ computerId, program, dialog, keyOpen, onKeyOpen, keyKind, onKeyKind, tt }: {
  computerId: string;
  program: WsProgram;
  dialog: ProgramAccess;
  keyOpen: boolean;
  onKeyOpen: (open: boolean) => void;
  keyKind?: string;
  onKeyKind?: (kind: string) => void;
  tt: UITranslate;
}): ComposerSettingRow {
  const status = dialog.programs.find((item) => item.id === program);
  const { state, copy } = programAccessState(status, tt);
  const choices: ComposerSettingChoice[] = [];
  const methods = status?.login?.methods ?? [];
  const methodLabel = (id: string) => ({
    device: tt("用 ChatGPT 登录（设备码）"), browser: tt("在这台电脑的浏览器里登录"), api_key: tt("API Key"), access_token: tt("Access Token"),
    claudeai: tt("Claude 订阅"), console: tt("Console（按 API 计费）"), sso: tt("SSO"), oauth_token: tt("长期令牌（setup-token）"), login: tt("登录"), nous: tt("Nous Portal"),
  }[id] || (id.startsWith("oauth:") ? tt("用 {provider} 账号登录", { provider: id.slice(6) }) : id));
  const signedIn = state === "signed_in";
  const switching = dialog.logout.switching;
  if (state === "not_installed") {
    choices.push({ value: "install", label: tt("安装"), attrs: { "data-oceanleo-native-program-install": "" } });
  } else if (state === "signed_out" || state === "unknown" || switching) {
    (methods.length ? methods : [{ id: "device", kind: "link_code" as const }]).forEach((method) => choices.push({ value: `login:${method.id}`, label: methodLabel(method.id), attrs: { "data-oceanleo-native-program-login": method.id } }));
  } else if (signedIn) {
    choices.push({ value: "switch", label: tt("换账号") });
    if (status?.login?.can_logout !== false) choices.push({ value: "logout", label: tt("退出登录") });
    methods.filter((method) => method.kind === "secret").forEach((method) => choices.push({ value: `login:${method.id}`, label: methodLabel(method.id), attrs: { "data-oceanleo-native-program-login": method.id } }));
  }
  if (status?.installed) {
    choices.push({ value: "key", label: program === "hermes" ? tt("管理凭据") : tt("Key"), attrs: { "data-oceanleo-native-program-key": "" } });
  }
  const loginOpen = dialog.login.open && dialog.login.program === program;
  const installOpen = dialog.install.open && dialog.install.program === program;
  const card = installOpen || loginOpen || keyOpen || dialog.logout.confirm || dialog.logout.pending || dialog.logout.failed || switching ? (
    <div className="grid gap-2">
      {installOpen ? <InstallFlow dialog={dialog} program={program} /> : null}
      {loginOpen ? <LoginFlow dialog={dialog} program={program} /> : null}
      {keyOpen ? <KeyForm computerId={computerId} program={program} status={status} dialog={dialog} kind={keyKind || "api_key"} onClose={() => onKeyOpen(false)} /> : null}
      {dialog.logout.confirm ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900"><p>{status?.agents_running && status.agents_running > 0 ? tt("这台电脑上 {n} 个 {program} 正在运行，退出后它们都将失去登录", { n: status.agents_running, program: PROGRAM_LABEL[program] }) : tt("退出后这台电脑上的 {program} 将失去登录。", { program: PROGRAM_LABEL[program] })}</p><div className="mt-2 flex gap-2"><button type="button" className={HOST.primary} onClick={dialog.confirmLogout}>{tt("确认退出")}</button><button type="button" className={HOST.quiet} onClick={dialog.cancelLogout}>{tt("取消")}</button></div></div> : null}
      {dialog.logout.confirm ? <p className={HOST.hint}>{switching ? tt("确认后会先退出，再选择新的登录方式。") : ""}</p> : null}
      {dialog.logout.pending ? <p className={HOST.hint}>{tt("正在退出登录…")}</p> : null}
      {dialog.logout.failed ? <p className={HOST.error}>{dialog.logout.failed === "confirm_required" ? tt("请先确认退出登录。") : dialog.logout.failed === "invalid_method" ? tt("这个登录方式当前不可用。") : dialog.logout.failed === "busy" ? tt("上一个操作还没结束，稍后再试。") : dialog.logout.failed === "connection_lost" ? tt("连接断了，没拿到退出结果。") : tt("退出登录没有完成。")}</p> : null}
    </div>
  ) : null;
  return {
    id: "account",
    section: tt("这台电脑上的 {program}", { program: PROGRAM_LABEL[program] }),
    label: tt("账号"),
    value: status?.installed && status.version ? `${status.account ? `${status.account}${status.plan ? ` · ${status.plan}` : ""} · ` : ""}${copy}${programModeCopy(status.mode) ? ` · ${tt(programModeCopy(status.mode))}` : ""} · ${status.version}` : copy,
    selected: "",
    choices,
    keepOpen: true,
    card,
    onPick: choices.length || card ? (value) => {
      if (value === "install") dialog.openInstall(program);
      else if (value.startsWith("login:")) {
        const methodId = value.slice(6);
        const method = methods.find((item) => item.id === methodId);
        if (method?.kind === "secret") { onKeyKind?.(methodId === "access_token" || methodId === "oauth_token" ? methodId : "api_key"); onKeyOpen(!keyOpen); }
        else dialog.openLoginMethod(program, methodId);
      }
      else if (value === "logout") dialog.requestLogout();
      else if (value === "switch") dialog.requestLogout(true);
      else if (value === "key") { onKeyKind?.("api_key"); onKeyOpen(!keyOpen); }
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
 * CliSettingsPanel) and the OceanLeo tools switch. Read once `enabled`.
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
    let active = false;
    let retryTimer: number | null = null;
    let retryAttempt = 0;
    const clearRetry = () => {
      if (retryTimer === null) return;
      window.clearTimeout(retryTimer);
      retryTimer = null;
    };
    const scheduleRetry = () => {
      if (!alive || retryTimer !== null || retryAttempt >= SETTINGS_RETRY_DELAYS_MS.length) return;
      const delay = SETTINGS_RETRY_DELAYS_MS[retryAttempt++];
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void load();
      }, delay);
    };
    const load = async () => {
      if (!alive || active) return;
      active = true;
      setFailed(false);
      const results = await Promise.allSettled([
        client.listCliPrograms(computerId),
        client.getCliTools(computerId),
      ]);
      if (!alive) {
        active = false;
        return;
      }
      let retry = false;
      const programs = results[0];
      if (programs.status === "fulfilled") {
        setProgram((programs.value.programs || []).find((item) => item.id === programId) ?? null);
      } else {
        setFailed(true);
        retry = true;
      }
      const cliTools = results[1];
      if (cliTools.status === "fulfilled") setTools(cliTools.value.programs);
      else retry = true;
      if (retry) scheduleRetry();
      else {
        retryAttempt = 0;
        clearRetry();
      }
      active = false;
    };
    const retryNow = () => {
      if (!alive || active) return;
      clearRetry();
      retryAttempt = 0;
      void load();
    };
    const onOnline = () => retryNow();
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") retryNow();
    };
    void load();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      clearRetry();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
