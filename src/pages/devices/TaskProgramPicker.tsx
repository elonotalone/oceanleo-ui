"use client";

import { useEffect, useState } from "react";
import type { NativeProgram } from "../../lib/native-programs";
import { getProgramOptions, startProgramInstall, startProgramLogin, type ProgramOption, type ProgramOptions } from "./program-controls";

export type TaskProgramPreferences = { model?: string; mode?: string; effort?: string; fast?: boolean };
export function TaskProgramPicker({ computerId, program, value, onChange }: {
  computerId: string;
  program: NativeProgram;
  value: TaskProgramPreferences;
  onChange: (value: TaskProgramPreferences) => void;
}) {
  const [options, setOptions] = useState<ProgramOptions | null>(null);
  useEffect(() => {
    let alive = true;
    void getProgramOptions(computerId, program).then((next) => { if (alive) setOptions(next); }).catch(() => { if (alive) setOptions(null); });
    return () => { alive = false; };
  }, [computerId, program]);
  const [operationMessage, setOperationMessage] = useState("");
  if (!options) return null;
  const run = async (kind: "install" | "login") => {
    setOperationMessage("");
    try {
      const operation = kind === "install" ? await startProgramInstall(computerId, program) : await startProgramLogin(computerId, program);
      setOperationMessage(operation.url || operation.message || operation.state);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const select = (key: "model" | "mode" | "effort", values: ProgramOption[] | undefined) => values?.length ? (
    <select aria-label={key} value={value[key] || values.find((item) => item.default)?.id || values[0].id} onChange={(event) => onChange({ ...value, [key]: event.target.value })} className="max-w-32 rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[11px] text-stone-600">
      {values.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  ) : null;
  return <span className="inline-flex flex-wrap items-center gap-1" data-task-program-picker="rest">
    {!options.installed && <button type="button" onClick={() => void run("install")} className="rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-600">install</button>}
    {options.installed && options.login?.state !== "logged_in" && options.auth !== "login" && <button type="button" onClick={() => void run("login")} className="rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-600">login</button>}
    {select("model", options.models)}{select("mode", options.modes)}{select("effort", options.efforts)}
    {options.fast !== undefined && <label className="inline-flex items-center gap-1 text-[11px] text-stone-500"><input type="checkbox" checked={value.fast ?? (typeof options.fast === "object" ? options.fast.available : options.fast)} onChange={(event) => onChange({ ...value, fast: event.target.checked })} /> fast</label>}
    {operationMessage && <span role="status" className="max-w-40 truncate text-[11px] text-stone-500">{operationMessage}</span>}
  </span>;
}
