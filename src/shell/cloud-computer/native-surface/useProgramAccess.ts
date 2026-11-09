"use client";

// 「这台电脑上的 <程序>」的安装 / 登录 / Key 状态（ProgramAccess 读的那一套），走网关的
// REST 程序控制（lib/program-controls-api）：发起一次操作，读到它结束。状态来自电脑自己的探针行。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelProgramLogin,
  getProgramOperation,
  getProgramOptions,
  programControlCode,
  startProgramInstall,
  startProgramLogin,
  startProgramLogout,
  submitProgramLoginCode,
  type ProgramOperation,
} from "../../../lib/program-controls-api";
import type { InstallState, LoginState, ProgramStatus, WsProgram } from "../../../native-agent-core/index";
import { DEFAULT_INSTALL_DIR, installDirPayload } from "../agent-dialog/install-dir";

export const OPERATION_POLL_MS = 1000;

const CLOSED_INSTALL: InstallState = { open: false, program: null, dir: DEFAULT_INSTALL_DIR, running: false, lines: [], donePath: "", failedText: "" };
const CLOSED_LOGIN: LoginState = { open: false, program: null, phase: "idle", url: "", code: "", needsCode: false, codeDraft: "", hint: "", failed: "", pending: false, method: "", email: "" };

export type ProgramAccess = {
  programs: ProgramStatus[];
  install: InstallState;
  openInstall: (program: WsProgram) => void;
  closeInstall: () => void;
  setInstallDir: (dir: string) => void;
  startInstall: () => void;
  login: LoginState;
  openLogin: (program: WsProgram) => void;
  openLoginMethod: (program: WsProgram, method: string, email?: string) => void;
  setLoginEmail: (email: string) => void;
  closeLogin: () => void;
  submitLoginCode: (program: WsProgram, code: string) => void;
  cancelLogin: (program: WsProgram) => void;
  logout: { pending: boolean; failed: string; confirm: boolean; switching: boolean };
  requestLogout: (switchAccount?: boolean) => void;
  confirmLogout: () => void;
  cancelLogout: () => void;
  setLoginCodeDraft: (code: string) => void;
  /** Read the program's status again (after a key change). */
  retryConnect: () => void;
};

export function useProgramAccess(computerId: string, program: WsProgram | null): ProgramAccess {
  const [programs, setPrograms] = useState<ProgramStatus[]>([]);
  const [install, setInstall] = useState<InstallState>(CLOSED_INSTALL);
  const [login, setLogin] = useState<LoginState>(CLOSED_LOGIN);
  const [running, setRunning] = useState<{ id: string; kind: "install" | "login" | "logout"; program: WsProgram } | null>(null);
  const [logout, setLogout] = useState({ pending: false, failed: "", confirm: false, switching: false });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(() => {
    if (!computerId || !program) return;
    getProgramOptions(computerId, program).then((options) => {
      if (alive.current) setPrograms(options.status ? [{ ...options.status, ...(options.login ? { login: options.login, account: options.login.account, plan: options.login.plan, mode: options.login.mode, agents_running: options.login.agents_running, key_replaces_login: options.login.key_replaces_login } : {}) }] : []);
    }, () => undefined);
  }, [computerId, program]);
  useEffect(() => {
    setPrograms([]);
    refresh();
  }, [refresh]);

  // One operation at a time: read it until it ends.
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    const apply = (op: ProgramOperation) => {
      if (stopped || !alive.current) return;
      const done = op.state !== "running";
      if (running.kind === "install") {
        setInstall((state) => ({
          ...state,
          running: !done,
          lines: op.progress && state.lines.at(-1) !== op.progress ? [...state.lines, op.progress] : state.lines,
          donePath: op.state === "succeeded" ? op.message || "" : state.donePath,
          failedText: op.state === "failed" || op.state === "cancelled" ? op.message || op.state : state.failedText,
        }));
      } else if (running.kind === "login") {
        setLogin((state) => ({
          ...state,
          url: op.url || state.url,
          needsCode: Boolean(op.needs_code) || state.needsCode,
          pending: !done,
          phase: op.state === "succeeded" ? "done" : done ? "failed" : op.url ? "waiting" : state.phase,
          failed: done && op.state !== "succeeded" ? op.message || op.state : "",
        }));
      } else if (running.kind === "logout") {
        setLogout((state) => ({ ...state, pending: !done, failed: done && op.state !== "succeeded" ? op.message || op.state : "" }));
        if (done && op.state === "succeeded") setLogin(CLOSED_LOGIN);
      }
      if (done) {
        setRunning(null);
        refresh();
      }
    };
    const timer = setInterval(() => {
      getProgramOperation(computerId, running.id).then(apply, (reason) => apply({
        operation_id: running.id, kind: running.kind, state: "failed", message: programControlCode(reason),
      }));
    }, OPERATION_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [running, computerId, refresh]);

  const startInstall = useCallback(() => {
    const target = install.program;
    if (!target || install.running) return;
    const capability = programs.find((row) => row.id === target)?.dir_capability ?? "full";
    setInstall((state) => ({ ...state, running: true, lines: [], donePath: "", failedText: "" }));
    startProgramInstall(computerId, target, installDirPayload(install.dir, capability)).then(
      ({ operation_id }) => setRunning({ id: operation_id, kind: "install", program: target }),
      (reason) => setInstall((state) => ({ ...state, running: false, failedText: programControlCode(reason) })),
    );
  }, [computerId, install.dir, install.program, install.running, programs]);

  const openLogin = useCallback((target: WsProgram) => {
    openLoginMethod(target, "device");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computerId]);
  const openLoginMethod = useCallback((target: WsProgram, method: string, email?: string) => {
    if (method === "sso" && email === undefined) {
      setLogin({ ...CLOSED_LOGIN, open: true, program: target, phase: "waiting", pending: false, method, email: "" });
      return;
    }
    setLogin({ ...CLOSED_LOGIN, open: true, program: target, phase: "opening", pending: true, method, email: email || "" });
    startProgramLogin(computerId, target, method, email).then(({ operation_id, url, needs_code }) => {
      setLogin((state) => ({ ...state, url: url || "", needsCode: Boolean(needs_code), phase: url ? "waiting" : "opening" }));
      setRunning({ id: operation_id, kind: "login", program: target });
    }, (reason) => setLogin((state) => ({ ...state, pending: false, phase: "failed", failed: programControlCode(reason) })));
  }, [computerId]);

  const setLoginEmail = useCallback((email: string) => setLogin((state) => ({ ...state, email })), []);

  const requestLogout = useCallback((switchAccount = false) => setLogout((state) => ({ ...state, confirm: true, failed: "", switching: switchAccount })), []);
  const cancelLogout = useCallback(() => setLogout((state) => ({ ...state, confirm: false })), []);
  const confirmLogout = useCallback(() => {
    if (!program || logout.pending) return;
    setLogout((state) => ({ ...state, pending: true, failed: "", confirm: false }));
    startProgramLogout(computerId, program, true).then(({ operation_id }) => {
      setRunning({ id: operation_id, kind: "logout", program });
      setLogin((state) => ({ ...state, pending: true }));
    }, (reason) => setLogout((state) => ({ ...state, pending: false, failed: programControlCode(reason), confirm: false })));
  }, [computerId, logout.pending, program]);

  const cancelLogin = useCallback((target: WsProgram) => {
    if (running?.kind === "login" && running.program === target) {
      void cancelProgramLogin(computerId, target, running.id).catch(() => undefined);
    }
    setRunning(null);
    setLogin(CLOSED_LOGIN);
  }, [computerId, running]);

  const submitLoginCode = useCallback((target: WsProgram, code: string) => {
    if (running?.kind !== "login" || running.program !== target || !code.trim()) return;
    setLogin((state) => ({ ...state, codeDraft: "" }));
    submitProgramLoginCode(computerId, target, running.id, code.trim()).catch((reason) =>
      setLogin((state) => ({ ...state, phase: "failed", failed: programControlCode(reason) })));
  }, [computerId, running]);

  return {
    programs,
    install,
    openInstall: (target) => setInstall({ ...CLOSED_INSTALL, open: true, program: target }),
    closeInstall: () => setInstall(CLOSED_INSTALL),
    setInstallDir: (dir) => setInstall((state) => ({ ...state, dir })),
    startInstall,
    login,
    openLogin,
    openLoginMethod,
    setLoginEmail,
    closeLogin: () => setLogin(CLOSED_LOGIN),
    submitLoginCode,
    cancelLogin,
    logout,
    requestLogout,
    confirmLogout,
    cancelLogout,
    setLoginCodeDraft: (codeDraft) => setLogin((state) => ({ ...state, codeDraft })),
    retryConnect: refresh,
  };
}
