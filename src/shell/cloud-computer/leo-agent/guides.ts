// 四个程序的分步引导。命令只来自 2026-09-22 宿主机 --help 里出现过的子命令，
// 不把用户原话拼进命令。用户在终端里自己按 Enter。

export type LeoProgramId = "cursor" | "hermes" | "claude" | "codex";

export type GuideStep = {
  sentence: string;
  command?: string;
};

export type ProgramGuide = {
  id: LeoProgramId;
  label: string;
  steps: GuideStep[];
};

export const LEO_PROGRAMS: { id: LeoProgramId; label: string }[] = [
  { id: "cursor", label: "Cursor" },
  { id: "hermes", label: "Hermes" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
];

export const GUIDE_SENTENCES = {
  cursorInstall: "先把 Cursor Agent 更新到最新版。已经装好时，这条命令只做升级。",
  cursorLogin: "在终端登录 Cursor。这台机器没有浏览器时，命令会给出网址。",
  cursorChat: "登录后直接开始对话。想说的话由你自己打，不要写进命令。",
  cursorModels: "看这台机器上可用的模型。",
  cursorContinue: "接着上次的对话继续。",
  cursorStatus: "看现在是否已经登录。",
  hermesCheck: "先检查 Hermes 是否装好、配置是否健康。",
  hermesLogin: "Hermes 要在终端里完成设置并登录。按向导做完。",
  hermesChat: "设置好之后，用这条命令开始对话。",
  hermesAuth: "看登录是否还在。",
  hermesModel: "选择这次要用的模型。",
  hermesStatus: "看 Hermes 各部分现在是否正常。",
  claudeInstall: "安装 Claude Code 的稳定版。已经装好时，它会告诉你现状。",
  claudeLogin: "在终端登录 Claude。按它给出的网址完成。",
  claudeChat: "登录后直接开始一轮对话。",
  claudeStatus: "用一段人话看登录状态。",
  claudeContinue: "接着最近一次对话继续。",
  claudeDoctor: "检查 Claude Code 在这台机器上是否健康。",
  codexUpdate: "把 Codex 更新到最新版。",
  codexLogin: "在终端登录 Codex。",
  codexChat: "登录后直接开始对话。",
  codexStatus: "看 Codex 现在是否已登录。",
  codexDoctor: "用短报告看安装、配置和登录是否健康。",
  codexResume: "接着最近一次对话继续。",
} as const;

const S = GUIDE_SENTENCES;

export const GUIDES: Record<LeoProgramId, ProgramGuide> = {
  cursor: {
    id: "cursor",
    label: "Cursor",
    steps: [
      { sentence: S.cursorInstall, command: "cursor-agent update" },
      { sentence: S.cursorLogin, command: "cursor-agent login" },
      { sentence: S.cursorChat, command: "cursor-agent" },
      { sentence: S.cursorModels, command: "cursor-agent models" },
      { sentence: S.cursorContinue, command: "cursor-agent --continue" },
      { sentence: S.cursorStatus, command: "cursor-agent status" },
    ],
  },
  hermes: {
    id: "hermes",
    label: "Hermes",
    steps: [
      { sentence: S.hermesCheck, command: "hermes doctor" },
      { sentence: S.hermesLogin, command: "hermes setup" },
      { sentence: S.hermesChat, command: "hermes chat" },
      { sentence: S.hermesAuth, command: "hermes auth status" },
      { sentence: S.hermesModel, command: "hermes model" },
      { sentence: S.hermesStatus, command: "hermes status" },
    ],
  },
  claude: {
    id: "claude",
    label: "Claude Code",
    steps: [
      { sentence: S.claudeInstall, command: "claude install stable" },
      { sentence: S.claudeLogin, command: "claude auth login" },
      { sentence: S.claudeChat, command: "claude" },
      { sentence: S.claudeStatus, command: "claude auth status --text" },
      { sentence: S.claudeContinue, command: "claude --continue" },
      { sentence: S.claudeDoctor, command: "claude doctor" },
    ],
  },
  codex: {
    id: "codex",
    label: "Codex",
    steps: [
      { sentence: S.codexUpdate, command: "codex update" },
      { sentence: S.codexLogin, command: "codex login" },
      { sentence: S.codexChat, command: "codex" },
      { sentence: S.codexStatus, command: "codex login status" },
      { sentence: S.codexDoctor, command: "codex doctor --summary" },
      { sentence: S.codexResume, command: "codex resume --last" },
    ],
  },
};

export function isLeoProgram(value: string): value is LeoProgramId {
  return value === "cursor" || value === "hermes" || value === "claude" || value === "codex";
}

export function programLabel(id: string): string {
  return LEO_PROGRAMS.find((program) => program.id === id)?.label ?? id;
}

export function guideProgressKey(computerId: string, program: string): string {
  return `oceanleo.cc.leo.${computerId}.guide.${program}`;
}

export function readGuideStep(computerId: string, program: string, count: number): number {
  try {
    const raw = Number(localStorage.getItem(guideProgressKey(computerId, program)));
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.min(Math.floor(raw), Math.max(count - 1, 0));
  } catch {
    return 0;
  }
}

export function writeGuideStep(computerId: string, program: string, step: number): void {
  try {
    localStorage.setItem(guideProgressKey(computerId, program), String(step));
  } catch {
    /* 隐私模式写不进去时，这一轮仍可往下看 */
  }
}
