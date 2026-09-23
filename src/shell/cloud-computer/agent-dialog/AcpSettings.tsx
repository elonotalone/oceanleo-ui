"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAgentSettings,
  patchAgentSettings,
  uninstallOceanleoAgent,
  type AgentSettings,
  type OceanleoAgentStatus,
} from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
import { PROGRAM_LABEL, type AgentProgram, type WsProgram } from "./types";
import type { AgentDialogControllerV2 } from "./useAgentDialogController";

const DEFAULT_SETTINGS: AgentSettings = {
  confirm_dangerous: true,
  oceanleo_tools: true,
  billing_paused: false,
};

type BooleanSetting = keyof AgentSettings;

function Toggle({
  checked,
  disabled,
  label,
  description,
  setting,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description?: string;
  setting: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex gap-3 rounded-xl border p-3 ${tone.border}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        data-oceanleo-acp-setting={setting}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4 accent-indigo-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description ? (
          <span className={`mt-1 block text-xs leading-5 ${tone.muted}`}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function AcpSettings({
  open,
  computerId,
  program,
  dialog,
  oceanleoStatus,
  onClose,
  onRequestInstall,
  onRequestLogin,
  onRequestKey,
  onOceanleoStatusChange,
}: {
  open: boolean;
  computerId: string;
  program: AgentProgram;
  dialog: AgentDialogControllerV2;
  oceanleoStatus: OceanleoAgentStatus | null;
  onClose: () => void;
  onRequestInstall: (program: WsProgram) => void;
  onRequestLogin: (program: WsProgram) => void;
  onRequestKey: (program: WsProgram) => void;
  onOceanleoStatusChange: (status: OceanleoAgentStatus) => void;
}) {
  const tt = useUI();
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<BooleanSetting | "uninstall" | "">("");
  const [error, setError] = useState("");
  const loadGeneration = useRef(0);

  useEffect(() => {
    if (!open) return;
    const generation = (loadGeneration.current += 1);
    setLoading(true);
    setError("");
    void getAgentSettings(computerId)
      .then((next) => {
        if (generation === loadGeneration.current) setSettings(next);
      })
      .catch(() => {
        if (generation === loadGeneration.current) setError(tt("设置保存失败，请稍后重试。"));
      })
      .finally(() => {
        if (generation === loadGeneration.current) setLoading(false);
      });
    return () => {
      loadGeneration.current += 1;
    };
  }, [computerId, open, tt]);

  const otherConfig = useMemo(
    () =>
      dialog.configOptions.filter(
        (option) => option.id !== "model" && option.id !== dialog.mode?.id && option.category !== "mode",
      ),
    [dialog.configOptions, dialog.mode?.id],
  );
  const wsProgram = program === "oceanleo" ? null : program;
  const programStatus = wsProgram
    ? dialog.programs.find((item) => item.id === wsProgram)
    : undefined;

  async function changeSetting(key: BooleanSetting, value: boolean) {
    if (saving) return;
    const previous = settings;
    const optimistic = { ...previous, [key]: value };
    setSettings(optimistic);
    setSaving(key);
    setError("");
    try {
      setSettings(await patchAgentSettings(computerId, { [key]: value }));
    } catch {
      setSettings(previous);
      setError(tt("设置保存失败，请稍后重试。"));
    } finally {
      setSaving("");
    }
  }

  async function uninstallLocalAgent() {
    if (saving || !oceanleoStatus?.installed) return;
    if (!window.confirm(tt("卸载这台服务器上的 OceanLeo agent？"))) return;
    setSaving("uninstall");
    setError("");
    try {
      await uninstallOceanleoAgent(computerId);
      onOceanleoStatusChange({ installed: false, version: null, token_active: false });
      onClose();
    } catch {
      setError(tt("卸载失败，请稍后重试。"));
    } finally {
      setSaving("");
    }
  }

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-20 flex justify-end bg-black/20 backdrop-blur-[1px]"
      data-oceanleo-acp-settings-overlay=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${PROGRAM_LABEL[program]} · ${tt("设置")}`}
        className={`h-full w-full max-w-md overflow-y-auto border-l p-4 shadow-2xl ${tone.border} ${tone.page}`}
        data-oceanleo-acp-settings={program}
      >
        <header className={`flex items-center justify-between gap-3 border-b pb-3 ${tone.border}`}>
          <div>
            <p className="font-semibold">{PROGRAM_LABEL[program]}</p>
            <p className={`text-xs ${tone.muted}`}>{tt("设置")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm ${tone.hover} ${tone.muted}`}
            data-oceanleo-acp-settings-close=""
          >
            {tt("关闭")}
          </button>
        </header>

        <div className="mt-4 space-y-5">
          {dialog.models.length > 0 ? (
            <label className={`block text-xs ${tone.muted}`}>
              {tt("模型")}
              <select
                value={dialog.selectedModel}
                onChange={(event) => dialog.setSelectedModel(event.currentTarget.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${tone.input}`}
                data-oceanleo-acp-settings-model=""
              >
                {dialog.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {dialog.mode && dialog.mode.options.length > 0 ? (
            <label className={`block text-xs ${tone.muted}`}>
              {dialog.mode.name || tt("模式")}
              <select
                value={dialog.selectedMode}
                onChange={(event) => dialog.setMode(event.currentTarget.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${tone.input}`}
                data-oceanleo-acp-settings-mode=""
              >
                {dialog.mode.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {otherConfig.map((option) => {
            if (option.type === "bool") {
              return (
                <Toggle
                  key={option.id}
                  checked={option.current === true}
                  disabled={false}
                  label={option.name}
                  setting={`config:${option.id}`}
                  onChange={(value) => dialog.setConfig(option.id, value)}
                />
              );
            }
            if (option.type === "select") {
              return (
                <label key={option.id} className={`block text-xs ${tone.muted}`}>
                  {option.name}
                  <select
                    value={String(option.current)}
                    onChange={(event) => dialog.setConfig(option.id, event.currentTarget.value)}
                    className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${tone.input}`}
                    data-oceanleo-acp-setting-config={option.id}
                  >
                    {option.options.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <label key={option.id} className={`block text-xs ${tone.muted}`}>
                {option.name}
                <input
                  value={String(option.current)}
                  onChange={(event) => dialog.setConfig(option.id, event.currentTarget.value)}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${tone.input}`}
                  data-oceanleo-acp-setting-config={option.id}
                />
              </label>
            );
          })}

          <div className="space-y-3">
            <Toggle
              checked={settings.confirm_dangerous}
              disabled={loading || Boolean(saving)}
              label={tt("危险操作先问我")}
              description={`${tt("关掉后 AI 执行删除、覆盖等操作前不再问你")} ${tt("这一项对这台服务器上所有 AI 生效。")}`}
              setting="confirm_dangerous"
              onChange={(value) => void changeSetting("confirm_dangerous", value)}
            />
            <Toggle
              checked={settings.oceanleo_tools}
              disabled={loading || Boolean(saving)}
              label={tt("让它能用 OceanLeo 的工具")}
              description={tt("这一项对这台服务器上所有 AI 生效。")}
              setting="oceanleo_tools"
              onChange={(value) => void changeSetting("oceanleo_tools", value)}
            />
            {program === "oceanleo" && oceanleoStatus?.installed ? (
              <Toggle
                checked={!settings.billing_paused}
                disabled={loading || Boolean(saving)}
                label={tt("允许从余额扣费")}
                description={tt("本地 OceanLeo agent 按实际模型用量从平台余额扣费。")}
                setting="billing_allowed"
                onChange={(value) => void changeSetting("billing_paused", !value)}
              />
            ) : null}
          </div>

          {wsProgram ? (
            <section className={`rounded-xl border p-3 ${tone.border}`}>
              <p className="text-sm font-medium">{tt("登录")}</p>
              <p className={`mt-1 text-xs ${tone.muted}`}>
                {!programStatus?.installed
                  ? tt("未安装")
                  : programStatus.logged_in === true
                    ? tt("已登录")
                    : programStatus.logged_in === false
                      ? tt("未登录")
                      : tt("未知")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!programStatus?.installed ? (
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs ${tone.primary}`}
                    onClick={() => onRequestInstall(wsProgram)}
                  >
                    {tt("安装")}
                  </button>
                ) : programStatus.logged_in === true ? (
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-xs ${tone.border} ${tone.hover}`}
                    onClick={() => dialog.logoutProgram(wsProgram)}
                    data-oceanleo-acp-settings-logout={wsProgram}
                  >
                    {tt("退出登录")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs ${tone.primary}`}
                    onClick={() => onRequestLogin(wsProgram)}
                    data-oceanleo-acp-settings-login={wsProgram}
                  >
                    {tt("登录")}
                  </button>
                )}
                {programStatus?.installed ? (
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-xs ${tone.border} ${tone.hover}`}
                    onClick={() => onRequestKey(wsProgram)}
                    data-oceanleo-acp-settings-key={wsProgram}
                  >
                    {programStatus.auth === "key" ? tt("Key ✓") : tt("Key")}
                  </button>
                ) : null}
              </div>
            </section>
          ) : oceanleoStatus?.installed ? (
            <section className={`rounded-xl border p-3 ${tone.border}`}>
              <p className="text-sm font-medium">{tt("本地 OceanLeo agent")}</p>
              {oceanleoStatus.version ? (
                <p className={`mt-1 text-xs ${tone.muted}`}>{oceanleoStatus.version}</p>
              ) : null}
              <button
                type="button"
                disabled={Boolean(saving)}
                onClick={() => void uninstallLocalAgent()}
                className={`mt-3 rounded-lg border px-3 py-1.5 text-xs ${tone.danger}`}
                data-oceanleo-acp-uninstall=""
              >
                {tt("卸载")}
              </button>
            </section>
          ) : null}

          {error ? (
            <p className={`rounded-lg border px-3 py-2 text-xs ${tone.danger}`} data-oceanleo-acp-settings-error="">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
