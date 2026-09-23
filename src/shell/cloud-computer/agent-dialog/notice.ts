import type { DialogModel } from "./types";
// 错误帧按 code 换成用户能照着做的一句话。原文不进日志，这里也不拼用户说过的字。

export type Translate = (zh: string, vars?: Record<string, string | number>) => string;

const DIALOG_DID_NOT_START = "对话没有启动。";

export function noticeCopy(tt: Translate, code: string, installed: boolean | null = null, provider = "nous"): string {
  switch (code) {
    case "provider_needs_credits":
      return tt("这个模型需要 {provider} 账户余额。请换一个可用模型，或前往该供应商充值。", { provider: providerLabel(provider) });
    case "not_logged_in":
      return tt("还没登录。点登录，在浏览器里完成后这里会变绿。");
    case "program_missing":
    case "missing_program":
      return tt("这台电脑上没有这个程序。");
    case "agent_busy":
      return tt("上一轮还在跑，等它结束或先停止。");
    case "computer_offline":
      return tt("机器离线");
    case "computer_not_confirmed":
      return tt("这台电脑还没确认。");
    case "not_owner":
      return tt("这不是你的电脑。");
    case "computer_not_found":
      return tt("找不到这台电脑。");
    case "session_not_found":
      return tt("找不到这个 Shell 会话。");
    case "invalid_argument":
      return tt("这句话发不出去。");
    case "node_error":
      return tt("这台电脑上的程序出错了。");
    case "feature_disabled":
      return tt("这个功能在当前站点不可用。");
    case "acp_start_failed":
      return tt(DIALOG_DID_NOT_START);
    case "acp_exited":
      return tt("这个程序的对话进程退出了，重新发一句会再启动。");
    case "acp_unavailable":
      if (installed === true) return tt(DIALOG_DID_NOT_START);
      return tt("这个程序的对话组件还没就绪。安装会一并补齐。");
    case "runtime_missing":
      return tt("运行这个程序还缺运行时。安装会一并补齐。");
    case "invalid_dir":
      return tt("这个目录不能用。换一个绝对路径后再试。");
    case "install_failed":
      return tt("安装没有完成。看说明后重试。");
    case "login_failed":
      return tt("登录没有完成。再点一次登录。");
    case "permission_timeout":
      return tt("没有人批准，已按取消处理。");
    default:
      return tt("对话连不上这台电脑。");
  }
}

export function noticeAction(
  code: string,
  installed: boolean | null = null,
): "login" | "install" | "retry" | null {
  if (code === "acp_start_failed") return null;
  if (code === "acp_exited") return null;
  if (code === "acp_unavailable") return installed === false ? "install" : null;
  if (code === "not_logged_in") return "login";
  if (code === "program_missing" || code === "missing_program" || code === "runtime_missing") {
    return "install";
  }
  if (code === "computer_offline") return "retry";
  return null;
}

// Key 卡的错误文案也走这里：认识的后端码用同一句 notice 文案；
// invalid_argument 带后端自己的说明（固定句，不是用户输入）；其余按存/取给一句实话。
export function keyErrorCopy(
  tt: Translate,
  code: string,
  op: "save" | "remove",
  serverMessage = "",
): string {
  if (code === "invalid_argument" && serverMessage) return serverMessage;
  if (
    code === "computer_offline" ||
    code === "not_owner" ||
    code === "computer_not_found" ||
    code === "feature_disabled"
  ) {
    return noticeCopy(tt, code);
  }
  if (op === "save") return tt("Key 没存上。稍后再试。");
  return tt("移除没成功。稍后再试。");
}

export function providerLabel(id: string): string {
  const labels: Record<string, string> = { nous: "Nous Portal", deepseek: "DeepSeek", openrouter: "OpenRouter", anthropic: "Anthropic", openai: "OpenAI", xai: "xAI", cursor: "Cursor" };
  return labels[id] || id;
}

export function modelGroups(models: DialogModel[]): { label: string; models: DialogModel[] }[] {
  const groups = new Map<string, DialogModel[]>();
  for (const model of models) {
    if (model.usable === false) continue;
    const label = model.provider_label || providerLabel(model.provider || "");
    groups.set(label, [...(groups.get(label) || []), model]);
  }
  return Array.from(groups, ([label, models]) => ({ label, models }));
}

export function hiddenModelCopy(tt: Translate, models: DialogModel[]): string[] {
  return [...new Set(models.filter((m) => m.usable === false).map((model) => {
    const provider = model.provider_label || providerLabel(model.provider || "") || tt("供应商");
    if (model.reason === "needs_credits") return tt("{provider} 的付费模型需要账户余额，已隐藏。", { provider });
    if (model.reason === "no_credentials") return tt("{provider} 尚未认证，相关模型已隐藏。", { provider });
    return tt("当前不可用的模型已隐藏。");
  }))];
}
