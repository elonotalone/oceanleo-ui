"use client";

import { useEffect, useRef, useState } from "react";
import type { NativeProgram } from "../../lib/native-programs";
import {
  cancelProgramOperation,
  getProgramOptions,
  startProgramInstall,
  startProgramLogin,
  submitProgramLoginCode,
  waitProgramOperation,
  type ProgramOperation,
  type ProgramOption,
  type ProgramOptions,
} from "./program-controls";
import {
  rememberProgramPreferences,
  restoreProgramPreferences,
} from "./program-memory";

export type TaskProgramPreferences = { model?: string; mode?: string; effort?: string; fast?: boolean };
export function TaskProgramPicker({ computerId, program, value, onChange }: {
  computerId: string;
  program: NativeProgram;
  value: TaskProgramPreferences;
  onChange: (value: TaskProgramPreferences) => void;
}) {
  const [options, setOptions] = useState<ProgramOptions | null>(null);
  const [operation, setOperation] = useState<ProgramOperation | null>(null);
  const [loginCode, setLoginCode] = useState("");
  const [busy, setBusy] = useState(false);
  const operationAbort = useRef<AbortController | null>(null);
  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    setOptions(null);
    void getProgramOptions(computerId, program).then((next) => { if (alive) setOptions(next); }).catch(() => { if (alive) setOptions(null); });
    return () => { alive = false; operationAbort.current?.abort(); };
  }, [computerId, program]);
  useEffect(() => {
    if (!options) return;
    const key = `${computerId}:${program}`;
    if (hydratedKey.current === key) return;
    hydratedKey.current = key;
    const restored = restoreProgramPreferences(computerId, program, options);
    rememberProgramPreferences(computerId, program, restored);
    onChange(restored);
  }, [computerId, onChange, options, program]);
  if (!options) return null;
  const refreshOptions = async () => {
    const next = await getProgramOptions(computerId, program);
    setOptions(next);
  };
  const waitForTerminal = async (started: ProgramOperation) => {
    operationAbort.current?.abort();
    const controller = new AbortController();
    operationAbort.current = controller;
    setOperation(started);
    const done = await waitProgramOperation(computerId, program, started.operation_id, controller.signal);
    setOperation(done);
    if (done.state === "succeeded") await refreshOptions();
    return done;
  };
  const run = async (kind: "install" | "login") => {
    setLoginCode("");
    setBusy(true);
    try {
      const started = kind === "install" ? await startProgramInstall(computerId, program) : await startProgramLogin(computerId, program);
      await waitForTerminal(started);
    } catch (error) {
      setOperation((current) => current ? { ...current, state: "failed", message: error instanceof Error ? error.message : String(error) } : null);
    } finally {
      setBusy(false);
    }
  };
  const submitCode = async () => {
    if (!operation || operation.state !== "needs_code" || !loginCode.trim()) return;
    setBusy(true);
    try {
      await submitProgramLoginCode(computerId, program, operation.operation_id, loginCode.trim());
      setLoginCode("");
      await waitForTerminal({ ...operation, state: "running", message: undefined });
    } catch (error) {
      setOperation((current) => current ? { ...current, state: "failed", message: error instanceof Error ? error.message : String(error) } : null);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!operation || operation.kind !== "login" || (operation.state !== "running" && operation.state !== "needs_code")) return;
    setBusy(true);
    try {
      await cancelProgramOperation(computerId, program, operation.operation_id);
      await waitForTerminal({ ...operation, state: "running", message: undefined });
    } catch (error) {
      setOperation((current) => current ? { ...current, state: "failed", message: error instanceof Error ? error.message : String(error) } : null);
    } finally {
      setBusy(false);
    }
  };
  const operationText = operation ? operation.message || operation.url || operation.state : "";
  const apply = (patch: TaskProgramPreferences) => {
    const next = {...value, ...patch};
    rememberProgramPreferences(computerId, program, next);
    onChange(next);
  };
  const select = (key: "model" | "mode" | "effort", values: ProgramOption[] | undefined) => values?.length ? (
    <select aria-label={key} value={value[key] || values.find((item) => item.default)?.id || values[0].id} onChange={(event) => apply({ [key]: event.target.value })} className="max-w-32 rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[11px] text-stone-600">
      {values.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  ) : null;
  return <span className="inline-flex flex-wrap items-center gap-1" data-task-program-picker="rest">
    {!options.installed && <button type="button" disabled={busy} onClick={() => void run("install")} className="rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-600">install</button>}
    {options.installed && options.login?.state !== "logged_in" && <button type="button" disabled={busy} onClick={() => void run("login")} className="rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-600">login</button>}
    {operation?.state === "needs_code" && <span className="inline-flex items-center gap-1"><input aria-label="login code" value={loginCode} onChange={(event) => setLoginCode(event.target.value)} className="w-24 rounded-md border border-stone-200 px-1.5 py-1 text-[11px]" placeholder="code" /><button type="button" disabled={busy || !loginCode.trim()} onClick={() => void submitCode()} className="rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-600">submit code</button></span>}
    {operation?.kind === "login" && (operation.state === "running" || operation.state === "needs_code") && <button type="button" disabled={busy} onClick={() => void cancel()} className="rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-600">cancel login</button>}
    {select("model", options.models)}{select("mode", options.modes)}{select("effort", options.efforts)}
    {options.fast !== undefined && <label className="inline-flex items-center gap-1 text-[11px] text-stone-500"><input type="checkbox" checked={value.fast ?? (typeof options.fast === "object" ? options.fast.available : options.fast)} onChange={(event) => apply({ fast: event.target.checked })} /> fast</label>}
    {operationText && <span role="status" data-program-operation-state={operation?.state} className="max-w-40 truncate text-[11px] text-stone-500">{operationText}</span>}
  </span>;
}
