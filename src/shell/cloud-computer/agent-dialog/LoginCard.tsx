"use client";

// 登录卡五相位（合同 I3 帧由 reduce.ts 映射）：
//   opening=已发 login、等 login_url（超 20s 没拿到链接按失败展示，提示可贴 Key）；
//   waiting=链接已出、等浏览器完成（needsCode 时多一个贴码框，提交走 login_code 帧）；
//   done=探针确认已认证，亮绿一秒自动收起；failed=有明确原因，给「再试一次」。
// 取消=发 login_cancel 并本地关卡；失败后的「再试一次」=重新发 login 帧。

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
import { PROGRAM_LABEL, type AgentDialogController, type LoginPhase, type LoginState } from "./types";

// 任务书 P4：opening 超 20 s 无 login_url → 自动转 failed。
export const LOGIN_OPENING_TIMEOUT_MS = 20000;

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

// phase 缺省（老控制器/缺帧）时的运行时回退：failed > waiting > opening。
function phaseOf(login: LoginState): LoginPhase {
  if (login.phase) return login.phase;
  if (login.failed) return "failed";
  if (login.url || login.hint) return "waiting";
  return "opening";
}

function failureCopy(tt: ReturnType<typeof useUI>, code: string): string {
  if (code === "timeout") return tt("登录超时，没等到确认。");
  if (code === "connection_lost") return tt("连接断了，没拿到登录结果。");
  if (code === "not_confirmed") return tt("程序说完成了，但这边没确认到登录。");
  if (code === "cancelled") return tt("登录已取消。");
  if (code === "busy") return tt("上一个操作还没结束，稍后再试。");
  const exit = /^exit_(\d+)$/.exec(code);
  if (exit) return tt("登录程序退出了（退出码 {code}）。", { code: exit[1] });
  return tt("登录没有完成。再点一次登录。");
}

export function LoginCard({ dialog }: { dialog: AgentDialogController }) {
  const tt = useUI();
  const login = dialog.login;
  const phase = phaseOf(login);
  const [copiedWhat, setCopiedWhat] = useState("");
  const [stalled, setStalled] = useState(false);

  // opening 卡 20 s 没等到 login_url → 本地按失败展示（服务端进程仍在，取消会发 login_cancel）。
  useEffect(() => {
    if (!login.open || phase !== "opening") {
      setStalled(false);
      return;
    }
    setStalled(false);
    const timer = setTimeout(() => setStalled(true), LOGIN_OPENING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [login.open, phase, login.program]);

  // done 亮绿一秒后自己收起（closeLogin 是稳定回调，不放进依赖避免每次渲染重置计时）。
  useEffect(() => {
    if (!login.open || phase !== "done") return;
    const timer = setTimeout(() => dialog.closeLogin(), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login.open, phase]);

  if (!login.open) return null;
  const program = login.program;
  const href = httpUrl(login.url);

  function copyText(what: "url" | "code", value: string) {
    const write = navigator.clipboard?.writeText;
    if (!write) return;
    void write.call(navigator.clipboard, value).then(
      () => setCopiedWhat(what),
      () => setCopiedWhat(""),
    );
  }

  function submitCode() {
    if (!program) return;
    dialog.submitLoginCode(program, login.codeDraft);
  }

  return (
    <div
      data-oceanleo-cc-login-card=""
      data-oceanleo-cc-login-phase={stalled && phase === "opening" ? "failed" : phase}
      className={`absolute inset-x-3 bottom-3 z-20 rounded-xl border p-3 shadow-xl ${tone.border} ${tone.page}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px]">
          {tt("登录")}
          {program ? ` ${PROGRAM_LABEL[program]}` : ""}
        </p>
        {phase === "failed" || stalled ? (
          <button
            type="button"
            data-oceanleo-cc-login-close=""
            onClick={dialog.closeLogin}
            className={`h-11 rounded-lg px-2 py-1 text-[13px] ${tone.muted} ${tone.hover}`}
          >
            {tt("关闭")}
          </button>
        ) : null}
      </div>

      {phase === "done" ? (
        <p data-oceanleo-cc-login-done="" className="text-[13px] text-emerald-700 dark:text-emerald-300">
          {tt("已登录")}
        </p>
      ) : null}

      {phase === "opening" && !stalled ? (
        <p data-oceanleo-cc-login-opening="" className={`text-[12px] ${tone.muted}`}>
          {tt("正在打开登录…")}
        </p>
      ) : null}

      {phase === "opening" && stalled ? (
        <p data-oceanleo-cc-login-stalled="" className="text-[12px] text-rose-700 dark:text-rose-300">
          {tt("没拿到登录链接。可以取消后重试，也可以贴 Key 直接用。")}
        </p>
      ) : null}

      {phase === "failed" ? (
        <p data-oceanleo-cc-login-error="" className="text-[12px] text-rose-700 dark:text-rose-300">
          {failureCopy(tt, login.failed)}
        </p>
      ) : null}

      {phase === "waiting" ? (
        <>
          {href ? (
            <div className="flex items-center gap-2">
              <a
                data-oceanleo-cc-login-url=""
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block min-w-0 flex-1 break-all text-[12px] text-sky-700 underline dark:text-sky-300"
              >
                {href}
              </a>
              <button
                type="button"
                data-oceanleo-cc-login-url-copy=""
                onClick={() => copyText("url", href)}
                className={`shrink-0 h-11 rounded-lg border px-2 py-1 text-[13px] ${tone.border} ${tone.hover}`}
              >
                {copiedWhat === "url" ? tt("已复制") : tt("复制")}
              </button>
            </div>
          ) : login.url ? (
            <p className={`break-all text-[12px] ${tone.muted}`}>{login.url}</p>
          ) : null}
          {login.code ? (
            <div className="mt-2 flex items-center gap-2">
              <code data-oceanleo-cc-login-code="" className="font-mono text-[13px]">
                {login.code}
              </code>
              <button
                type="button"
                data-oceanleo-cc-login-code-copy=""
                onClick={() => copyText("code", login.code)}
                className={`h-11 rounded-lg border px-2 py-1 text-[13px] ${tone.border} ${tone.hover}`}
              >
                {copiedWhat === "code" ? tt("已复制") : tt("复制")}
              </button>
            </div>
          ) : null}
          <p className={`mt-2 text-[12px] ${tone.muted}`}>{tt("在浏览器里完成后，这里几秒内会变绿")}</p>
          {login.needsCode ? (
            <form
              className="mt-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitCode();
              }}
            >
              <label className={`block text-[11px] ${tone.muted}`}>
                {tt("把浏览器给你的代码贴到这里")}
                <input
                  type="text"
                  autoComplete="off"
                  data-oceanleo-cc-login-code-input=""
                  value={login.codeDraft}
                  onChange={(event) => dialog.setLoginCodeDraft(event.target.value)}
                  className={`mt-1 w-full h-11 rounded-lg border px-2 py-1.5 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 ${tone.input}`}
                />
              </label>
              <div className="mt-2">
                <button
                  type="submit"
                  data-oceanleo-cc-login-code-submit=""
                  disabled={!login.codeDraft.trim()}
                  className={`h-11 rounded-lg px-3 py-1.5 text-[13px] font-medium disabled:opacity-50 ${tone.primary}`}
                >
                  {tt("提交")}
                </button>
              </div>
            </form>
          ) : null}
          {login.hint ? (
            <p data-oceanleo-cc-login-hint="" className={`mt-2 text-[12px] ${tone.muted}`}>
              {login.hint}
            </p>
          ) : null}
        </>
      ) : null}

      {(phase === "opening" && !stalled) || phase === "waiting" ? (
        <div className="mt-3">
          <button
            type="button"
            data-oceanleo-cc-login-cancel=""
            onClick={() => {
              if (program) dialog.cancelLogin(program);
              else dialog.closeLogin();
            }}
            className={`h-11 rounded-lg border px-3 py-1.5 text-[13px] ${tone.border} ${tone.hover}`}
          >
            {tt("取消")}
          </button>
        </div>
      ) : null}

      {phase === "failed" || (phase === "opening" && stalled) ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            data-oceanleo-cc-login-retry=""
            onClick={() => {
              if (program) dialog.openLogin(program);
            }}
            className={`h-11 rounded-lg px-3 py-1.5 text-[13px] font-medium ${tone.primary}`}
          >
            {tt("再试一次")}
          </button>
          {phase === "opening" && stalled ? (
            <button
              type="button"
              data-oceanleo-cc-login-cancel=""
              onClick={() => {
                if (program) dialog.cancelLogin(program);
                else dialog.closeLogin();
              }}
              className={`h-11 rounded-lg border px-3 py-1.5 text-[13px] ${tone.border} ${tone.hover}`}
            >
              {tt("取消")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
