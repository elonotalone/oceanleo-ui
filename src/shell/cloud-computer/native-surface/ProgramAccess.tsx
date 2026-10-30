"use client";

// 「这台电脑上的 <程序>」一组：安装 / 登录 / Key，宿主样式内联展示。
// 逻辑与 Computers 页的 LoginCard / InstallSheet / KeySheet 相同（同一个 dialog 控制器、
// 同一条 key 路由），只是换成宿主样式、放在右栏里，不浮在对话上。

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { HERMES_PROVIDERS } from "../agent-dialog/KeySheet";
import { LOGIN_OPENING_TIMEOUT_MS } from "../agent-dialog/LoginCard";
import { keyErrorCopy, providerLabel } from "../agent-dialog/notice";
import { ProgramKeyError, removeProgramKey, saveProgramKey } from "../agent-dialog/program-key-api";
import { PROGRAM_LABEL, type LoginPhase, type LoginState, type ProgramStatus, type WsProgram } from "../agent-dialog/types";
import type { useAgentDialog } from "../agent-dialog/useAgentDialogController";
import { HOST } from "./host-style";

export type NativeDialog = ReturnType<typeof useAgentDialog>;
type Translate = ReturnType<typeof useUI>;

function phaseOf(login: LoginState): LoginPhase {
  if (login.phase) return login.phase;
  if (login.failed) return "failed";
  if (login.url || login.hint) return "waiting";
  return "opening";
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

function loginFailureCopy(tt: Translate, code: string): string {
  if (code === "timeout") return tt("登录超时，没等到确认。");
  if (code === "connection_lost") return tt("连接断了，没拿到登录结果。");
  if (code === "not_confirmed") return tt("程序说完成了，但这边没确认到登录。");
  if (code === "cancelled") return tt("登录已取消。");
  if (code === "busy") return tt("上一个操作还没结束，稍后再试。");
  const exit = /^exit_(\d+)$/.exec(code);
  if (exit) return tt("登录程序退出了（退出码 {code}）。", { code: exit[1] });
  return tt("登录没有完成。再点一次登录。");
}

function copyToClipboard(value: string, done: () => void) {
  const write = navigator.clipboard?.writeText;
  if (!write) return;
  void write.call(navigator.clipboard, value).then(done, () => undefined);
}

function LoginFlow({ dialog, program }: { dialog: NativeDialog; program: WsProgram }) {
  const tt = useUI();
  const login = dialog.login;
  const phase = phaseOf(login);
  const [stalled, setStalled] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setStalled(false);
    if (phase !== "opening") return;
    const timer = setTimeout(() => setStalled(true), LOGIN_OPENING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase, program]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => dialog.closeLogin(), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const href = httpUrl(login.url);
  const failed = phase === "failed" || (phase === "opening" && stalled);
  return (
    <div className="grid gap-2 rounded-xl border border-neutral-200 p-3" data-oceanleo-native-login={program} data-phase={failed ? "failed" : phase}>
      <p className="text-[13px] font-medium text-neutral-800">{tt("登录")} {PROGRAM_LABEL[program]}</p>
      {phase === "done" ? <p className={HOST.ok}>{tt("已登录")}</p> : null}
      {phase === "opening" && !stalled ? <p className={HOST.hint}>{tt("正在打开登录…")}</p> : null}
      {phase === "opening" && stalled ? <p className={HOST.error}>{tt("没拿到登录链接。可以取消后重试，也可以贴 Key 直接用。")}</p> : null}
      {phase === "failed" ? <p className={HOST.error}>{loginFailureCopy(tt, login.failed)}</p> : null}
      {phase === "waiting" ? (
        <>
          {href ? (
            <div className="grid gap-2">
              <p className="break-all rounded-lg bg-neutral-50 px-2.5 py-1.5 font-mono text-[12px] text-neutral-700">{href}</p>
              <div className="flex flex-wrap gap-2">
                <a href={href} target="_blank" rel="noopener noreferrer" className={HOST.primary} data-oceanleo-native-login-open="">
                  {tt("打开登录页面")}
                </a>
                <button type="button" className={HOST.secondary} onClick={() => copyToClipboard(href, () => setCopied("url"))}>
                  {copied === "url" ? tt("已复制") : tt("复制")}
                </button>
              </div>
            </div>
          ) : login.url ? <p className={`break-all ${HOST.hint}`}>{login.url}</p> : null}
          {login.code ? (
            <div className="flex items-center gap-2">
              <code className="font-mono text-[13px] text-neutral-900">{login.code}</code>
              <button type="button" className={HOST.secondary} onClick={() => copyToClipboard(login.code, () => setCopied("code"))}>
                {copied === "code" ? tt("已复制") : tt("复制")}
              </button>
            </div>
          ) : null}
          <p className={HOST.hint}>{tt("在浏览器里完成后，这里几秒内会变绿")}</p>
          {login.needsCode ? (
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                dialog.submitLoginCode(program, login.codeDraft);
              }}
            >
              <label className={HOST.label}>
                <span className={HOST.hint}>{tt("把浏览器给你的代码贴到这里")}</span>
                <input
                  type="text"
                  autoComplete="off"
                  value={login.codeDraft}
                  onChange={(event) => dialog.setLoginCodeDraft(event.target.value)}
                  className={`${HOST.input} font-mono`}
                  data-oceanleo-native-login-code=""
                />
              </label>
              <div>
                <button type="submit" disabled={!login.codeDraft.trim()} className={HOST.primary}>{tt("提交")}</button>
              </div>
            </form>
          ) : null}
          {login.hint ? <p className={HOST.hint}>{login.hint}</p> : null}
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {failed ? (
          <button type="button" className={HOST.primary} onClick={() => dialog.openLogin(program)} data-oceanleo-native-login-retry="">
            {tt("再试一次")}
          </button>
        ) : null}
        {phase === "opening" || phase === "waiting" ? (
          <button type="button" className={HOST.secondary} onClick={() => dialog.cancelLogin(program)}>{tt("取消")}</button>
        ) : phase === "failed" ? (
          <button type="button" className={HOST.quiet} onClick={dialog.closeLogin}>{tt("关闭")}</button>
        ) : null}
      </div>
    </div>
  );
}

function installDirCopy(tt: Translate, row: ProgramStatus | undefined): string {
  const capability = row?.dir_capability ?? "full";
  if (capability === "link_only") return tt("程序本体装在它自己的默认位置，这里只放一个快捷方式");
  if (capability === "none") return tt("这个程序只能装在默认位置");
  return tt("整个程序装到这个目录");
}

function InstallFlow({ dialog, program }: { dialog: NativeDialog; program: WsProgram }) {
  const tt = useUI();
  const install = dialog.install;
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [install.lines]);
  const row = dialog.programs.find((item) => item.id === program);
  const componentMissing = (dialog.messages ?? []).some((message) => message.kind === "notice" && message.code === "acp_unavailable" && message.program === program);
  const alreadyInstalled = row?.installed === true && !componentMissing && !install.running && !install.failedText && !install.donePath;
  const dirLocked = row?.dir_capability === "none" || install.running || alreadyInstalled;
  return (
    <div className="grid gap-2 rounded-xl border border-neutral-200 p-3" data-oceanleo-native-install={program}>
      <p className="text-[13px] font-medium text-neutral-800">{tt("安装")} {PROGRAM_LABEL[program]}</p>
      <p className={HOST.hint}>{installDirCopy(tt, row)}</p>
      <label className={HOST.label}>
        <span className={HOST.hint}>{tt("安装位置")}</span>
        <input value={install.dir} disabled={dirLocked} onChange={(event) => dialog.setInstallDir(event.target.value)} className={`${HOST.input} font-mono disabled:opacity-50`} />
      </label>
      {install.lines.length > 0 ? (
        <pre ref={logRef} className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 font-mono text-[11px] text-neutral-600">
          {install.lines.join("\n")}
        </pre>
      ) : null}
      {install.donePath ? <p className={HOST.ok}>{tt("已装到 {path}", { path: install.donePath })}</p> : null}
      {install.failedText ? <p className={HOST.error}>{install.failedText}</p> : null}
      {alreadyInstalled ? <p className={HOST.ok}>{tt("这个程序已经装好了。")}</p> : null}
      <div className="flex flex-wrap gap-2">
        {install.running || alreadyInstalled ? null : install.failedText ? (
          <button type="button" className={HOST.primary} onClick={dialog.startInstall}>{tt("重试")}</button>
        ) : install.donePath ? (
          <button type="button" className={HOST.primary} onClick={dialog.closeInstall}>{tt("完成")}</button>
        ) : (
          <button type="button" className={HOST.primary} onClick={dialog.startInstall} data-oceanleo-native-install-start="">{tt("开始安装")}</button>
        )}
        {install.running ? null : <button type="button" className={HOST.quiet} onClick={dialog.closeInstall}>{tt("关闭")}</button>}
      </div>
    </div>
  );
}

function KeyForm({
  computerId,
  program,
  status,
  dialog,
  onClose,
}: {
  computerId: string;
  program: WsProgram;
  status: ProgramStatus | undefined;
  dialog: NativeDialog;
  onClose: () => void;
}) {
  const tt = useUI();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const saved = status?.providers;
  const [provider, setProvider] = useState<string>(
    () => HERMES_PROVIDERS.find((id) => !saved?.some((row) => row.id === id && row.auth === "key")) || HERMES_PROVIDERS[0],
  );
  const hasKey = status?.auth === "key";

  async function run(op: "save" | "remove", target = provider) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (op === "save") await saveProgramKey(computerId, program, key, program === "hermes" ? provider : "");
      else await removeProgramKey(computerId, program, program === "hermes" ? target : "");
      setKey("");
      dialog.retryConnect();
      onClose();
    } catch (reason) {
      const code = reason instanceof ProgramKeyError ? reason.code : "";
      const message = reason instanceof ProgramKeyError ? reason.message : "";
      setError(keyErrorCopy(tt, code, op, message));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-2 rounded-xl border border-neutral-200 p-3"
      data-oceanleo-native-key={program}
      onSubmit={(event) => {
        event.preventDefault();
        if (key.trim()) void run("save");
      }}
    >
      <p className="text-[13px] font-medium text-neutral-800">{tt("Key")} · {PROGRAM_LABEL[program]}</p>
      {program === "hermes" ? (
        <>
          {saved?.length ? (
            <ul className="grid gap-1">
              {saved.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 text-[13px] text-neutral-800">
                  <span>{row.label || providerLabel(row.id)} · {row.auth === "key" ? tt("已存 Key") : tt("已登录")}</span>
                  {row.auth === "key" ? (
                    <button type="button" disabled={busy} className={HOST.quiet} onClick={() => void run("remove", row.id)}>{tt("移除")}</button>
                  ) : (
                    <button type="button" disabled={busy} className={HOST.quiet} onClick={() => dialog.logoutProgram(program, row.id)}>{tt("退出登录")}</button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <label className={HOST.label}>
            <span className={HOST.hint}>{tt("供应商")}</span>
            <select value={provider} disabled={busy} onChange={(event) => setProvider(event.target.value)} className={HOST.input}>
              {HERMES_PROVIDERS.map((name) => <option key={name} value={name}>{providerLabel(name)}</option>)}
            </select>
          </label>
        </>
      ) : hasKey ? (
        <div className="flex items-center gap-2">
          <span className={HOST.ok}>{tt("已存 Key")}</span>
          <button type="button" disabled={busy} className={HOST.quiet} onClick={() => void run("remove")} data-oceanleo-native-key-remove="">{tt("移除")}</button>
        </div>
      ) : null}
      <label className={HOST.label}>
        <span className={HOST.hint}>{hasKey && program !== "hermes" ? tt("更换 Key") : tt("Key")}</span>
        <input type="password" autoComplete="off" value={key} disabled={busy} onChange={(event) => setKey(event.target.value)} className={`${HOST.input} font-mono`} data-oceanleo-native-key-input="" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !key.trim()} className={HOST.primary} data-oceanleo-native-key-save="">
          {hasKey && program !== "hermes" ? tt("更换") : tt("保存")}
        </button>
        <button type="button" disabled={busy} className={HOST.quiet} onClick={onClose}>{tt("关闭")}</button>
      </div>
      {error ? <p className={HOST.error} role="alert">{error}</p> : null}
    </form>
  );
}

/** Install / sign-in / key for one program on one computer. */
export function ProgramAccess({ computerId, program, dialog }: { computerId: string; program: WsProgram; dialog: NativeDialog }) {
  const tt = useUI();
  const [keyOpen, setKeyOpen] = useState(false);
  const status = dialog.programs.find((item) => item.id === program);
  const state = !status
    ? "reading"
    : !status.installed
      ? "not_installed"
      : status.logged_in === true || status.auth === "key"
        ? "signed_in"
        : status.logged_in === false
          ? "signed_out"
          : "unknown";
  const stateCopy = state === "reading"
    ? tt("正在读取…")
    : state === "not_installed"
      ? tt("未安装")
      : state === "signed_in"
        ? status?.auth === "key" ? tt("已存 Key") : tt("已登录")
        : state === "signed_out"
          ? tt("未登录")
          : tt("未知");
  const loginOpen = dialog.login.open && dialog.login.program === program;
  const installOpen = dialog.install.open && dialog.install.program === program;
  return (
    <div className="grid gap-3" data-oceanleo-native-program={program} data-state={state}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-neutral-800">
          {stateCopy}
          {status?.installed && status.version ? <span className={`ml-2 ${HOST.faint}`}>{status.version}</span> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {state === "not_installed" ? (
            <button type="button" className={HOST.primary} onClick={() => dialog.openInstall(program)} data-oceanleo-native-program-install="">{tt("安装")}</button>
          ) : state === "signed_in" && program !== "hermes" && status?.logged_in === true ? (
            <button type="button" className={HOST.secondary} onClick={() => dialog.logoutProgram(program)} data-oceanleo-native-program-logout="">{tt("退出登录")}</button>
          ) : state === "signed_out" || state === "unknown" ? (
            <button type="button" className={HOST.primary} onClick={() => dialog.openLogin(program)} data-oceanleo-native-program-login="">{tt("登录")}</button>
          ) : null}
          {status?.installed ? (
            <button type="button" className={HOST.secondary} onClick={() => setKeyOpen((open) => !open)} data-oceanleo-native-program-key="">
              {program === "hermes" ? tt("管理凭据") : tt("Key")}
            </button>
          ) : null}
        </div>
      </div>
      {installOpen ? <InstallFlow dialog={dialog} program={program} /> : null}
      {loginOpen ? <LoginFlow dialog={dialog} program={program} /> : null}
      {keyOpen ? <KeyForm computerId={computerId} program={program} status={status} dialog={dialog} onClose={() => setKeyOpen(false)} /> : null}
    </div>
  );
}
