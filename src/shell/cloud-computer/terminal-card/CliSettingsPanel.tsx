"use client";

import { useEffect, useState } from "react";
import type { CliProgram } from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
import { AppearancePanel } from "./AppearancePanel";
import {
  readCliProgramSettings,
  writeCliProgramSettings,
  type CliOptionValue,
  type CliProgramSettings,
} from "./cli-settings";

export type CliToolProgram = "cursor" | "claude" | "codex";

export function isCliToolProgram(program: string): program is CliToolProgram {
  return program === "cursor" || program === "claude" || program === "codex";
}

export function CliSettingsPanel({
  computerId,
  program,
  serverConfirmDangerous,
  toolsEnabled,
  toolsBusy = false,
  onToolsEnabledChange,
}: {
  computerId: string;
  program: CliProgram;
  serverConfirmDangerous: boolean;
  toolsEnabled?: boolean;
  toolsBusy?: boolean;
  onToolsEnabledChange?: (enabled: boolean) => void;
}) {
  const tt = useUI();
  const [settings, setSettings] = useState<CliProgramSettings>(() =>
    readCliProgramSettings(computerId, program.id),
  );

  useEffect(() => {
    setSettings(readCliProgramSettings(computerId, program.id));
  }, [computerId, program.id]);

  function save(next: CliProgramSettings) {
    setSettings(writeCliProgramSettings(computerId, program.id, next));
  }

  function setOption(key: string, value: CliOptionValue) {
    save({
      ...settings,
      options: { ...settings.options, [key]: value },
    });
  }

  const confirmDangerous =
    settings.confirmDangerous ?? serverConfirmDangerous;

  return (
    <div className="grid gap-3" data-oceanleo-cli-settings={program.id}>
      <div className={`rounded-xl border p-3 ${tone.border} ${tone.panel}`}>
        <h3 className="text-sm font-semibold">{tt("AI 命令行设置")}</h3>
        <p className={`mt-1 text-xs ${tone.muted}`}>
          {tt("这些设置将在下一次启动时生效。")}
        </p>
        <div className={`mt-3 grid gap-3 divide-y ${tone.divide}`}>
          {program.options
            .filter((option) => option.key !== "confirm_dangerous")
            .map((option) => {
              const stored = settings.options[option.key];
              if (option.type === "bool") {
                const checked =
                  typeof stored === "boolean"
                    ? stored
                    : typeof option.default === "boolean"
                      ? option.default
                      : false;
                return (
                  <label
                    key={option.key}
                    className="flex items-center justify-between gap-3 pt-3 text-xs first:pt-0"
                  >
                    <span>{option.label}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      data-oceanleo-cli-option={option.key}
                      onChange={(event) =>
                        setOption(option.key, event.currentTarget.checked)
                      }
                    />
                  </label>
                );
              }
              const fallback =
                typeof option.default === "string" ? option.default : "";
              const value = typeof stored === "string" ? stored : fallback;
              return (
                <label key={option.key} className="grid gap-1 pt-3 text-xs first:pt-0">
                  <span className={tone.muted}>{option.label}</span>
                  <select
                    value={value}
                    className={`rounded-lg border px-2 py-1.5 ${tone.input}`}
                    data-oceanleo-cli-option={option.key}
                    onChange={(event) =>
                      setOption(option.key, event.currentTarget.value)
                    }
                  >
                    {(option.choices ?? []).map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          <label className="flex items-center justify-between gap-3 pt-3 text-xs first:pt-0">
            <span>
              <span className="block">{tt("危险操作先问")}</span>
              <span className={`mt-0.5 block text-[10px] ${tone.muted}`}>
                {tt("可以按程序覆盖服务器的默认设置。")}
              </span>
            </span>
            <input
              type="checkbox"
              checked={confirmDangerous}
              data-oceanleo-confirm-dangerous=""
              onChange={(event) =>
                save({
                  ...settings,
                  confirmDangerous: event.currentTarget.checked,
                })
              }
            />
          </label>
          {isCliToolProgram(program.id) && (
            <label className="flex items-center justify-between gap-3 pt-3 text-xs">
              <span>
                {tt("把 OceanLeo 工具装进 {program}", {
                  program: program.label,
                })}
              </span>
              <input
                type="checkbox"
                checked={toolsEnabled === true}
                disabled={toolsEnabled === undefined || toolsBusy}
                data-oceanleo-cli-tools={program.id}
                onChange={(event) =>
                  onToolsEnabledChange?.(event.currentTarget.checked)
                }
              />
            </label>
          )}
        </div>
      </div>
      <AppearancePanel />
    </div>
  );
}
