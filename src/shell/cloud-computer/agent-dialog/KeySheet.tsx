"use client";

// 四个程序共用的 Key 卡。key 只进请求体发到网关，由网关写进用户电脑；
// 这里不落地、不缓存、不进日志。hermes 多一个供应商下拉（合同 I3 的五家）。

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
import { keyErrorCopy, providerLabel } from "./notice";
import { ProgramKeyError, removeProgramKey, saveProgramKey } from "./program-key-api";
import { PROGRAM_LABEL, type ProgramStatus, type WsProgram } from "./types";

// W2-interface.md 未出前按任务书写死五家（合同 I3 与 W2 后端 HERMES_PROVIDERS 一致）。
export const HERMES_PROVIDERS = ["openrouter", "anthropic", "openai", "deepseek", "xai"] as const;

function whereCopy(tt: ReturnType<typeof useUI>, program: WsProgram): string {
  if (program === "cursor") return tt("Cursor 的 key 在 cursor.com 的 Settings → API Keys 里生成。");
  if (program === "claude") return tt("Claude Code 用 Anthropic 控制台的 API key（console.anthropic.com）。");
  if (program === "codex") return tt("Codex 用 OpenAI 账号的 API key（platform.openai.com）。");
  return tt("Hermes 用所选供应商的 API key，写进它自己的配置。");
}

export function KeySheet({
  open,
  computerId,
  program,
  hasKey,
  status,
  onLogout,
  onClose,
  onChanged,
}: {
  open: boolean;
  computerId: string;
  program: WsProgram | null;
  hasKey: boolean;
  onClose: () => void;
  onChanged: () => void;
  status?: ProgramStatus | null;
  /** Signs the program out of one login-type provider; hidden when absent. */
  onLogout?: (provider: string) => void;
}) {
  const tt = useUI();
  const busyRef = useRef(false);
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState<string>(HERMES_PROVIDERS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const savedProviders = status?.providers;
  const firstUnsaved = HERMES_PROVIDERS.find((id) => !savedProviders?.some((p) => p.id === id && p.auth === "key")) || HERMES_PROVIDERS[0];
  useEffect(() => {
    setProvider(firstUnsaved);
    setKey("");
  }, [open, program, firstUnsaved]);

  useEffect(() => {
    if (open) return;
    busyRef.current = false;
    setKey("");
    setProvider(HERMES_PROVIDERS[0]);
    setError("");
    setBusy(false);
  }, [open, program]);

  if (!open || !program) return null;

  async function run(op: "save" | "remove", removeProvider = provider) {
    if (busyRef.current || !program) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (op === "save") {
        await saveProgramKey(computerId, program, key, program === "hermes" ? provider : "");
      } else {
        await removeProgramKey(computerId, program, program === "hermes" ? removeProvider : "");
      }
      busyRef.current = false;
      setBusy(false);
      setKey("");
      onChanged();
      onClose();
    } catch (err) {
      const code = err instanceof ProgramKeyError ? err.code : "";
      const message = err instanceof ProgramKeyError ? err.message : "";
      setError(keyErrorCopy(tt, code, op, message));
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      data-oceanleo-cc-key-sheet=""
      data-oceanleo-cc-key-sheet-program={program}
      className={`absolute inset-x-0 bottom-0 z-10 max-h-[80%] overflow-y-auto border-t px-3 py-3 ${tone.border} ${tone.page}`}
      onSubmit={(event) => {
        event.preventDefault();
        if ((program === "hermes" || !hasKey) && key.trim()) void run("save");
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px]">
          {tt("Key")} · {PROGRAM_LABEL[program]}
        </p>
        <button
          type="button"
          data-oceanleo-cc-key-close=""
          disabled={busy}
          onClick={onClose}
          className={`h-11 rounded-lg px-2 py-1 text-[13px] disabled:opacity-50 ${tone.muted} ${tone.hover}`}
        >
          {tt("关闭")}
        </button>
      </div>
      <p className={`text-[12px] leading-relaxed ${tone.muted}`} data-oceanleo-cc-key-where="">
        {whereCopy(tt, program)}
      </p>
      {program === "hermes" ? (
        <>
          <ul className="mt-2 text-[13px]" data-oceanleo-cc-provider-credentials="">
            {savedProviders?.map((row) => (
              <li key={row.id} className={`flex min-h-11 flex-wrap items-center justify-between gap-2 border-b py-2 ${tone.border}`} data-oceanleo-cc-provider={row.id}>
                <span>{row.label || providerLabel(row.id)} · {row.auth === "key" ? tt("已存 Key") : tt("已登录")}
                  {row.tier === "free" ? ` · ${tt("免费账户（没有余额时付费模型用不了）")}` : row.tier === "paid" ? ` · ${tt("付费账户")}` : ""}
                </span>
                {row.auth === "key" ? (
                  <button type="button" disabled={busy} data-oceanleo-cc-key-remove={row.id} onClick={() => void run("remove", row.id)} className={`h-11 rounded-lg px-2 text-[13px] ${tone.hover}`}>{tt("移除")}</button>
                ) : onLogout ? (
                  <button type="button" disabled={busy} onClick={() => onLogout(row.id)} className={`h-11 rounded-lg px-2 text-[13px] ${tone.hover}`}>{tt("退出登录")}</button>
                ) : null}
              </li>
            ))}
          </ul>
          {!savedProviders && hasKey ? <p className={`mt-2 text-[12px] ${tone.muted}`}>{tt("已存 Key，供应商信息暂不可用。请选择供应商后管理。")}</p> : null}
          <p className="mt-3 text-[13px] font-medium">{tt("添加 Key")}</p>
          <label className={`mt-2 block text-[12px] ${tone.muted}`}>
            {tt("供应商")}
            <select data-oceanleo-cc-key-provider="" value={provider} disabled={busy} onChange={(event) => setProvider(event.target.value)} className={`mt-1 h-11 w-full h-11 rounded-lg border px-2 text-[13px] ${tone.input}`}>
              {HERMES_PROVIDERS.map((name) => (
                <option key={name} value={name}>{providerLabel(name)}{savedProviders?.some((row) => row.id === name && row.auth === "key") ? ` · ${tt("已存 Key")}` : ""}</option>
              ))}
            </select>
          </label>
          {!savedProviders && hasKey ? <button type="button" disabled={busy} onClick={() => void run("remove")} className={`mt-2 h-11 rounded-lg px-2 text-[13px] ${tone.hover}`}>{tt("移除")}</button> : null}
        </>
      ) : <p className={`mt-2 text-[12px] ${tone.muted}`}>{program === "claude" ? "Anthropic API Key" : program === "codex" ? "OpenAI API Key" : "Cursor API Key"} · {hasKey ? tt("已存 Key") : tt("未存 Key")}</p>}
      {hasKey && program !== "hermes" ? (
        <div className="mt-3 flex items-center gap-2">
          <span data-oceanleo-cc-key-saved-badge="" className="text-[12px] text-emerald-700 dark:text-emerald-300">
            {tt("已存 Key")}
          </span>
          <button
            type="button"
            data-oceanleo-cc-key-remove=""
            disabled={busy}
            onClick={() => void run("remove")}
            className={`h-11 rounded-lg border px-2 py-1 text-[13px] disabled:opacity-50 ${tone.border} ${tone.hover}`}
          >
            {tt("移除")}
          </button>
        </div>
      ) : (
        <>
          <label className={`mt-2 block text-[11px] ${tone.muted}`}>
            {tt("Key")}
            <input
              type="password"
              autoComplete="off"
              data-oceanleo-cc-key-input=""
              value={key}
              disabled={busy}
              onChange={(event) => setKey(event.target.value)}
              className={`mt-1 w-full h-11 rounded-lg border px-2 py-1.5 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 disabled:opacity-50 ${tone.input}`}
            />
          </label>
          <div className="mt-3">
            <button
              type="submit"
              data-oceanleo-cc-key-save=""
              disabled={busy || !key.trim()}
              className={`h-11 rounded-lg px-3 py-1.5 text-[13px] font-medium disabled:opacity-50 ${tone.primary}`}
            >
              {tt("保存")}
            </button>
          </div>
        </>
      )}
      {error ? (
        <p data-oceanleo-cc-key-error="" className="mt-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
