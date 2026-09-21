"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  CloudComputerError,
  nodeDownloadUrl,
  nodeInstallScriptUrl,
  nodeSha256SumsUrl,
  type CloudComputerClient,
  type Computer,
} from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";
import { Modal } from "../../ui";
import { computerDisplayState } from "./computer-state";

export type ConnectStep = "consent" | "name" | "command" | "confirm";

export const CONNECT_POLL_MS = 3_000;

const wizardCache = new Map<
  string,
  { installCommand: string; enrollExpiresAt: string; name: string }
>();

type WizardState = {
  step: ConnectStep;
  name: string;
  computer: Computer | null;
  installCommand: string;
  enrollExpiresAt: string | null;
  error: string | null;
  busy: boolean;
  copied: boolean;
};

type WizardAction =
  | { type: "set_name"; name: string }
  | { type: "consent_next" }
  | { type: "busy"; busy: boolean }
  | { type: "fail"; error: string }
  | { type: "copied"; copied: boolean }
  | {
      type: "show_command";
      computer: Computer;
      installCommand: string;
      enrollExpiresAt: string;
      name?: string;
    }
  | { type: "show_confirm"; computer: Computer };

function resumeConnectStep(resume: Computer | null | undefined): ConnectStep | null {
  if (!resume) return null;
  if (resume.status === "enrolled") return "confirm";
  const state = computerDisplayState(resume);
  if (state === "pending_confirm") return "confirm";
  if (state === "pending_install" || resume.status === "pending") return "command";
  return null;
}

function initialState(resume: Computer | null | undefined): WizardState {
  const step = resumeConnectStep(resume);
  if (step === "confirm" && resume) {
    return {
      step: "confirm",
      name: resume.name,
      computer: resume,
      installCommand: "",
      enrollExpiresAt: null,
      error: null,
      busy: false,
      copied: false,
    };
  }
  if (step === "command" && resume) {
    const cached = wizardCache.get(resume.id);
    return {
      step: "command",
      name: cached?.name || resume.name,
      computer: resume,
      installCommand: cached?.installCommand || "",
      enrollExpiresAt: cached?.enrollExpiresAt || null,
      error: null,
      busy: false,
      copied: false,
    };
  }
  return {
    step: "consent",
    name: "",
    computer: null,
    installCommand: "",
    enrollExpiresAt: null,
    error: null,
    busy: false,
    copied: false,
  };
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "set_name":
      return { ...state, name: action.name, error: null };
    case "consent_next":
      return { ...state, step: "name", error: null };
    case "busy":
      return { ...state, busy: action.busy };
    case "fail":
      return { ...state, error: action.error, busy: false };
    case "copied":
      return { ...state, copied: action.copied };
    case "show_command": {
      const name = action.name ?? state.name;
      wizardCache.set(action.computer.id, {
        installCommand: action.installCommand,
        enrollExpiresAt: action.enrollExpiresAt,
        name,
      });
      return {
        ...state,
        step: "command",
        computer: action.computer,
        installCommand: action.installCommand,
        enrollExpiresAt: action.enrollExpiresAt,
        name,
        error: null,
        busy: false,
        copied: false,
      };
    }
    case "show_confirm":
      return {
        ...state,
        step: "confirm",
        computer: action.computer,
        error: null,
        busy: false,
      };
    default:
      return state;
  }
}

function formatMemBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const gib = bytes / 1073741824;
  if (gib >= 1) {
    const rounded = Math.round(gib * 10) / 10;
    return `${rounded} GiB`;
  }
  const mib = bytes / 1048576;
  if (mib >= 1) return `${Math.round(mib)} MiB`;
  return `${Math.round(bytes)} B`;
}

function remainingLabel(expiresAt: string | null, now: number): {
  expired: boolean;
  text: string;
} {
  if (!expiresAt) return { expired: false, text: "" };
  const due = Date.parse(expiresAt);
  if (!Number.isFinite(due)) return { expired: false, text: "" };
  const remain = due - now;
  if (remain <= 0) return { expired: true, text: "0:00" };
  const total = Math.ceil(remain / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return { expired: false, text: `${minutes}:${String(seconds).padStart(2, "0")}` };
}

export function ConnectServerDialog({
  client,
  onClose,
  onCreated,
  resumeComputer,
  resumeStep,
  pollIntervalMs = CONNECT_POLL_MS,
}: {
  client: CloudComputerClient;
  onClose: () => void;
  onCreated: () => void;
  resumeComputer?: Computer | null;
  resumeStep?: ConnectStep;
  pollIntervalMs?: number;
}) {
  const tt = useUI();
  const [state, dispatch] = useReducer(
    reducer,
    resumeComputer,
    (resume) => {
      if (resumeStep === "command" || resumeStep === "confirm" || resumeStep === "consent" || resumeStep === "name") {
        const inferred = initialState(resume);
        if (resumeStep === inferred.step) return inferred;
        if (resumeStep === "confirm" && resume) {
          return { ...initialState(resume), step: "confirm", computer: resume, name: resume.name };
        }
        if (resumeStep === "command" && resume) {
          return { ...initialState(resume), step: "command", computer: resume, name: resume.name };
        }
      }
      return initialState(resume);
    },
  );
  const [now, setNow] = useState(() => Date.now());
  const nameRef = useRef<HTMLInputElement>(null);
  const resumeId = resumeComputer?.id;
  const resumeCommand =
    (resumeStep === "command" || resumeConnectStep(resumeComputer) === "command") &&
    Boolean(resumeId);
  const amd64Url = nodeDownloadUrl("linux", "amd64");
  const arm64Url = nodeDownloadUrl("linux", "arm64");
  const sumsUrl = nodeSha256SumsUrl();
  const installScriptUrl = nodeInstallScriptUrl();
  const pollMs = pollIntervalMs > 0 ? pollIntervalMs : CONNECT_POLL_MS;

  useEffect(() => {
    if (!resumeCommand || !resumeId || !resumeComputer) return;
    const resume = resumeComputer;
    let cancelled = false;
    dispatch({ type: "busy", busy: true });
    void client
      .regenerateInstallCommand(resumeId)
      .then((result) => {
        if (cancelled) return;
        dispatch({
          type: "show_command",
          computer: resume,
          installCommand: result.install_command,
          enrollExpiresAt: result.enroll_expires_at,
          name: resume.name,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "fail",
          error: err instanceof CloudComputerError ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [client, resumeComputer, resumeId, resumeCommand]);

  useEffect(() => {
    if (state.step !== "command" || !state.computer) return;
    let cancelled = false;
    const tick = async () => {
      const id = state.computer?.id;
      if (!id) return;
      try {
        const row = await client.getComputer(id);
        if (cancelled) return;
        if (row.status === "enrolled" || computerDisplayState(row) === "pending_confirm") {
          dispatch({ type: "show_confirm", computer: row });
        }
      } catch {
        /* keep waiting */
      }
    };
    const timer = setInterval(() => void tick(), pollMs);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, pollMs, state.computer, state.step]);

  useEffect(() => {
    if (state.step !== "command" || !state.enrollExpiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(timer);
  }, [state.enrollExpiresAt, state.step]);

  const countdown = remainingLabel(state.enrollExpiresAt, now);
  const commandExpired = state.step === "command" && countdown.expired;

  async function submitName() {
    const live = nameRef.current?.value ?? "";
    const trimmed = (live || state.name).trim();
    if (!trimmed) {
      dispatch({ type: "fail", error: tt("请填写电脑名字") });
      return;
    }
    dispatch({ type: "set_name", name: trimmed });
    dispatch({ type: "busy", busy: true });
    try {
      const created = await client.createByoComputer({ name: trimmed });
      dispatch({
        type: "show_command",
        computer: created.computer,
        installCommand: created.install_command,
        enrollExpiresAt: created.enroll_expires_at,
        name: trimmed,
      });
      onCreated();
    } catch (err) {
      dispatch({
        type: "fail",
        error: err instanceof CloudComputerError ? err.message : String(err),
      });
    }
  }

  async function regenerate() {
    if (!state.computer) return;
    dispatch({ type: "busy", busy: true });
    try {
      const result = await client.regenerateInstallCommand(state.computer.id);
      dispatch({
        type: "show_command",
        computer: state.computer,
        installCommand: result.install_command,
        enrollExpiresAt: result.enroll_expires_at,
      });
      setNow(Date.now());
    } catch (err) {
      dispatch({
        type: "fail",
        error: err instanceof CloudComputerError ? err.message : String(err),
      });
    }
  }

  async function copyCommand() {
    if (!state.installCommand || commandExpired) return;
    try {
      await navigator.clipboard.writeText(state.installCommand);
      dispatch({ type: "copied", copied: true });
    } catch {
      dispatch({ type: "copied", copied: false });
    }
  }

  async function confirmThis() {
    if (!state.computer) return;
    dispatch({ type: "busy", busy: true });
    try {
      await client.confirmComputer(state.computer.id);
      wizardCache.delete(state.computer.id);
      onCreated();
      onClose();
    } catch (err) {
      dispatch({
        type: "fail",
        error: err instanceof CloudComputerError ? err.message : String(err),
      });
    }
  }

  async function rejectThis() {
    if (!state.computer) return;
    dispatch({ type: "busy", busy: true });
    try {
      await client.deleteComputer(state.computer.id);
      wizardCache.delete(state.computer.id);
      onCreated();
      onClose();
    } catch (err) {
      dispatch({
        type: "fail",
        error: err instanceof CloudComputerError ? err.message : String(err),
      });
    }
  }

  const facts = state.computer;

  return (
    <Modal onClose={onClose} className="max-w-lg" labelledBy="oceanleo-cc-byo-title">
      <div
        className="p-5"
        data-oceanleo-cc-connect-dialog
        data-oceanleo-cc-connect-step={state.step}
      >
        <h2
          id="oceanleo-cc-byo-title"
          className="text-[15px] font-semibold text-neutral-900"
        >
          {tt("接入我的服务器")}
        </h2>

        {state.step === "consent" && (
          <div className="mt-4 space-y-3">
            <p className="text-[13px] leading-relaxed text-neutral-700">
              {tt("安装一个 6 MB 的节点程序。")}
            </p>
            <p className="text-[13px] leading-relaxed text-neutral-700">
              {tt("它只主动连 OceanLeo，不开端口。")}
            </p>
            <p className="text-[13px] leading-relaxed text-neutral-700">
              {tt(
                "OceanLeo 的 agent 会以 oceanleo 用户在这台机器上执行命令、读写文件（可 sudo）；每一步都记入事件时间线。",
              )}
            </p>
            <p className="text-[13px] leading-relaxed text-neutral-700">
              {tt("随时在机器上 sudo oceanleo-node revoke 断开。")}
            </p>
            {state.error && (
              <p className="text-[12px] text-rose-600">{tt(state.error)}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px]"
              >
                {tt("取消")}
              </button>
              <button
                type="button"
                data-oceanleo-cc-consent-continue
                onClick={() => dispatch({ type: "consent_next" })}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white"
              >
                {tt("我明白，继续")}
              </button>
            </div>
          </div>
        )}

        {state.step === "name" && (
          <div className="mt-4 space-y-4">
            <label className="block text-[12px] text-neutral-600">
              {tt("名字")}
              <input
                ref={nameRef}
                value={state.name}
                onChange={(event) =>
                  dispatch({ type: "set_name", name: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] outline-none"
                aria-label={tt("名字")}
                data-oceanleo-cc-name
              />
            </label>
            {state.error && (
              <p className="text-[12px] text-rose-600">{tt(state.error)}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px]"
              >
                {tt("取消")}
              </button>
              <button
                type="button"
                onClick={() => void submitName()}
                disabled={state.busy}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {state.busy ? tt("生成命令中…") : tt("生成安装命令")}
              </button>
            </div>
          </div>
        )}

        {state.step === "command" && (
          <div className="mt-4 space-y-3">
            <p className="text-[12px] text-neutral-500">
              {tt("在自己的服务器上运行下面这一行。URL 里没有秘密；一次性接入码在参数里，15 分钟内有效。")}
            </p>
            <pre
              data-oceanleo-cc-install-command
              className={`overflow-x-auto rounded-xl bg-neutral-950 px-3 py-2 text-[11px] text-neutral-100 ${
                commandExpired ? "opacity-40" : ""
              }`}
            >
              {state.installCommand}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyCommand()}
                disabled={commandExpired || !state.installCommand}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] disabled:opacity-40"
              >
                {state.copied ? tt("已复制") : tt("复制")}
              </button>
              {state.enrollExpiresAt && !commandExpired && (
                <span
                  className="text-[12px] text-neutral-500"
                  data-oceanleo-cc-countdown
                >
                  {tt("剩余")} {countdown.text}
                </span>
              )}
              {commandExpired && (
                <button
                  type="button"
                  data-oceanleo-cc-regenerate
                  onClick={() => void regenerate()}
                  disabled={state.busy}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]"
                >
                  {tt("已过期，重新生成")}
                </button>
              )}
            </div>
            <details className="rounded-xl border border-neutral-200 px-3 py-2">
              <summary className="cursor-pointer text-[12px] text-neutral-700">
                {tt("手动安装")}
              </summary>
              <div className="mt-2 space-y-2 text-[11px] text-neutral-600">
                <p>
                  {tt("下载 linux-amd64")}{" "}
                  <code className="break-all">{amd64Url}</code>
                </p>
                <p>
                  {tt("下载 linux-arm64")}{" "}
                  <code className="break-all">{arm64Url}</code>
                </p>
                <p>
                  {tt("SHA256SUMS")}{" "}
                  <code className="break-all">{sumsUrl}</code>
                </p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    <code className="break-all">
                      {`curl -fsSL ${sumsUrl} -o SHA256SUMS`}
                    </code>
                  </li>
                  <li>
                    <code className="break-all">
                      {`curl -fsSL ${amd64Url} -o oceanleo-node`}
                    </code>
                  </li>
                  <li>
                    <code>sha256sum -c SHA256SUMS</code>
                  </li>
                  <li>
                    <code className="break-all">
                      {`sudo ./oceanleo-node enroll --gateway ${installScriptUrl.replace(/\/v1\/computers\/node\/install\.sh$/, "")} --code ${tt("（从上方命令复制 --code）")}`}
                    </code>
                  </li>
                  <li>
                    <code>sudo systemctl enable --now oceanleo-node</code>
                  </li>
                </ol>
              </div>
            </details>
            {state.error && (
              <p className="text-[12px] text-rose-600">{tt(state.error)}</p>
            )}
          </div>
        )}

        {state.step === "confirm" && facts && (
          <div className="mt-4 space-y-3">
            <p className="text-[12px] text-neutral-500">
              {tt("有一台机器等待确认。核对指纹与安装脚本最后打印的一致才确认。")}
            </p>
            <dl
              className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-neutral-800"
              data-oceanleo-cc-confirm-facts
            >
              <div>
                <dt className="text-neutral-500">{tt("主机名")}</dt>
                <dd>{facts.node_hostname || tt("暂无")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">{tt("来源 IP")}</dt>
                <dd>{facts.node_public_ip || tt("暂无")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">{tt("系统 / 架构")}</dt>
                <dd>
                  {facts.node_os || "—"} / {facts.node_arch || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">{tt("内核")}</dt>
                <dd>{facts.node_kernel || tt("暂无")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">{tt("CPU / 内存")}</dt>
                <dd>
                  {facts.node_cpus != null ? facts.node_cpus : "—"} /{" "}
                  {formatMemBytes(facts.node_mem_bytes)}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">{tt("运行身份")}</dt>
                <dd data-oceanleo-cc-run-as>{facts.node_run_as || tt("暂无")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">{tt("指纹")}</dt>
                <dd
                  className="break-all font-mono text-[15px] font-semibold tracking-tight"
                  data-oceanleo-cc-fingerprint
                >
                  {facts.node_fingerprint || tt("暂无")}
                </dd>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {tt("与安装脚本最后打印的指纹一致才确认")}
                </p>
              </div>
            </dl>
            {state.error && (
              <p className="text-[12px] text-rose-600">{tt(state.error)}</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                data-oceanleo-cc-reject
                onClick={() => void rejectThis()}
                disabled={state.busy}
                className="rounded-lg border border-rose-200 px-3.5 py-1.5 text-[13px] text-rose-700 disabled:opacity-50"
              >
                {tt("不是我的，移除")}
              </button>
              <button
                type="button"
                data-oceanleo-cc-confirm
                onClick={() => void confirmThis()}
                disabled={state.busy}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {tt("确认是这台机器")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
