"use client";

// The one account name (contract §1.1): unique across OceanLeo regardless of letter
// case, saved through the gateway (never straight into Auth metadata), checked while
// typing, and refused in plain words when taken, invalid, reserved or changed too soon.

import { useEffect, useId, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { checkNameAvailable, getAccountName, saveAccountName, type AccountNameCode } from "../../../lib/account/name-api";
import { checkName, cleanName, nameKey } from "../../../lib/account/name-rules";

const RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45";

export type AccountNameStatus =
  | "loading"
  | "idle"
  | "checking"
  | "available"
  | "saving"
  | "saved"
  | AccountNameCode;

const MESSAGES: Partial<Record<AccountNameStatus, string>> = {
  checking: "正在检查名称…",
  available: "这个名称可以使用。",
  saved: "名称已保存。",
  name_taken: "这个名称已被别人使用。",
  name_invalid: "名称需为 2–30 个字符，不能含不可见字符。",
  name_reserved: "这个名称不能使用。",
  name_unavailable: "名称修改暂未开放。",
  network: "名称未能保存，请稍后再试。",
  signed_out: "名称未能保存，请稍后再试。",
};
const PROBLEMS: ReadonlySet<AccountNameStatus> = new Set([
  "name_taken", "name_invalid", "name_reserved", "name_change_too_soon", "name_unavailable", "network", "signed_out",
]);

function futureDate(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return null;
  return at.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function AccountNameField({
  initialName,
  onNameChange,
}: {
  initialName: string;
  /** Called with the saved name, so the avatar initial and the sidebar follow at once. */
  onNameChange?: (name: string) => void;
}) {
  const tt = useUI();
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [committed, setCommitted] = useState(initialName);
  const [canChangeAt, setCanChangeAt] = useState<string | null>(null);
  const [status, setStatus] = useState<AccountNameStatus>("loading");
  const ticket = useRef(0);
  const committedKey = nameKey(committed);

  useEffect(() => {
    let live = true;
    void getAccountName().then((result) => {
      if (!live) return;
      if (!result.ok) {
        setStatus(result.code === "name_unavailable" ? "name_unavailable" : "idle");
        return;
      }
      setName(result.state.name);
      setCommitted(result.state.name);
      setCanChangeAt(result.state.canChangeAt);
      setStatus("idle");
      if (result.state.name !== initialName) onNameChange?.(result.state.name);
    });
    return () => {
      live = false;
    };
    // Load once per mount; later saves update the state directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onInput(value: string) {
    setName(value);
    const mine = ++ticket.current;
    const local = checkName(value);
    if (local) {
      setStatus(local);
      return;
    }
    if (nameKey(cleanName(value)) === committedKey) {
      setStatus("idle");
      return;
    }
    setStatus("checking");
    window.setTimeout(() => {
      if (mine !== ticket.current) return;
      void checkNameAvailable(cleanName(value)).then((answer) => {
        if (mine !== ticket.current) return;
        if (!answer.ok) setStatus(answer.code === "name_unavailable" ? "name_unavailable" : "idle");
        else if (answer.available) setStatus("available");
        else setStatus(answer.code ?? "name_taken");
      });
    }, 300);
  }

  async function commit() {
    const next = cleanName(name);
    if (next === committed) {
      if (name !== next) setName(next);
      if (!PROBLEMS.has(status)) setStatus("idle");
      return;
    }
    const local = checkName(next);
    if (local) {
      // Keep what the person typed; the message says why it cannot be saved.
      setStatus(local);
      return;
    }
    const mine = ++ticket.current;
    setStatus("saving");
    const result = await saveAccountName(next);
    if (mine !== ticket.current) return;
    if (!result.ok) {
      if (result.code === "name_change_too_soon") setCanChangeAt(result.canChangeAt);
      setStatus(result.code);
      return;
    }
    setName(result.state.name);
    setCommitted(result.state.name);
    setCanChangeAt(result.state.canChangeAt);
    setStatus("saved");
    onNameChange?.(result.state.name);
  }

  const nextChange = futureDate(canChangeAt);
  const problem = PROBLEMS.has(status);
  const message =
    status === "name_change_too_soon"
      ? nextChange
        ? tt("{date} 之后才能再次修改名称。", { date: nextChange })
        : tt("名称修改太频繁，请稍后再试。")
      : MESSAGES[status]
        ? tt(MESSAGES[status]!)
        : null;

  return (
    <div data-account-name-field="" data-account-name-status={status}>
      <label htmlFor={inputId} className="block text-[12px] text-neutral-500">
        {tt("名称")}
      </label>
      <input
        id={inputId}
        data-account-name=""
        type="text"
        value={name}
        autoComplete="nickname"
        spellCheck={false}
        disabled={status === "loading" || (status === "name_unavailable" && name === committed)}
        aria-invalid={problem || undefined}
        onChange={(event) => onInput(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={`mt-1 w-full max-w-xs rounded-lg bg-neutral-100 px-3 py-2 text-[14px] text-neutral-900 disabled:opacity-60 ${RING}`}
      />
      {message ? (
        <p
          role={problem ? "alert" : "status"}
          data-account-name-message=""
          className={`mt-1 text-[12px] ${problem ? "text-red-600" : "text-neutral-500"}`}
        >
          {message}
        </p>
      ) : null}
      {nextChange && status !== "name_change_too_soon" ? (
        <p data-account-name-next-change="" className="mt-1 text-[12px] text-neutral-500">
          {tt("{date} 之后才能再次修改名称。", { date: nextChange })}
        </p>
      ) : null}
      <p className="mt-1 text-[12px] text-neutral-500">{tt("这是别人在 OceanLeo 看到的你的名字，不能与他人重复。")}</p>
    </div>
  );
}
