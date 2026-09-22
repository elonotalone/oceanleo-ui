"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { PROGRAM_LABEL, type AgentDialogController } from "./types";

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

export function LoginCard({ dialog }: { dialog: AgentDialogController }) {
  const tt = useUI();
  const login = dialog.login;
  const [copied, setCopied] = useState(false);
  if (!login.open) return null;
  const href = httpUrl(login.url);
  return (
    <div
      data-oceanleo-cc-login-card=""
      className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-neutral-700 bg-neutral-900 p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] text-neutral-100">
          {tt("登录")}
          {login.program ? ` ${PROGRAM_LABEL[login.program]}` : ""}
        </p>
        <button
          type="button"
          data-oceanleo-cc-login-close=""
          onClick={dialog.closeLogin}
          className="rounded-lg px-2 py-1 text-[12px] text-neutral-300 hover:bg-neutral-800"
        >
          {tt("关闭")}
        </button>
      </div>
      {login.pending ? <p className="text-[12px] text-neutral-400">{tt("正在打开登录")}</p> : null}
      {href ? (
        <a
          data-oceanleo-cc-login-url=""
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block break-all text-[12px] text-sky-300 underline"
        >
          {href}
        </a>
      ) : login.url ? (
        <p className="break-all text-[12px] text-neutral-300">{login.url}</p>
      ) : null}
      {login.code ? (
        <div className="mt-2 flex items-center gap-2">
          <code data-oceanleo-cc-login-code="" className="font-mono text-[13px] text-neutral-100">
            {login.code}
          </code>
          <button
            type="button"
            onClick={() => {
              const write = navigator.clipboard?.writeText;
              if (!write) return;
              void write.call(navigator.clipboard, login.code).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="rounded-lg border border-neutral-700 px-2 py-1 text-[11px] text-neutral-200"
          >
            {copied ? tt("已复制") : tt("复制")}
          </button>
        </div>
      ) : null}
      {href ? (
        <p className="mt-2 text-[12px] text-neutral-400">{tt("在浏览器里完成后这里会自动变绿")}</p>
      ) : null}
      {login.hint ? (
        <p data-oceanleo-cc-login-hint="" className="mt-2 text-[12px] text-neutral-200">
          {login.hint}
        </p>
      ) : null}
      {login.failed ? (
        <p data-oceanleo-cc-login-error="" className="mt-2 text-[12px] text-rose-300">
          {tt("登录没有完成。再点一次登录。")}
          {login.failed === "login_failed" ? "" : ` ${login.failed}`}
        </p>
      ) : null}
    </div>
  );
}
