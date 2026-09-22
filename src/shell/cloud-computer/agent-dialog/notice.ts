// 错误帧按 code 换成用户能照着做的一句话。原文不进日志，这里也不拼用户说过的字。

export type Translate = (zh: string, vars?: Record<string, string | number>) => string;

export function noticeCopy(tt: Translate, code: string): string {
  switch (code) {
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
    case "acp_unavailable":
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

export function noticeAction(code: string): "login" | "install" | "retry" | null {
  if (code === "not_logged_in") return "login";
  if (
    code === "program_missing" ||
    code === "missing_program" ||
    code === "runtime_missing" ||
    code === "acp_unavailable"
  ) {
    return "install";
  }
  if (code === "computer_offline") return "retry";
  return null;
}
