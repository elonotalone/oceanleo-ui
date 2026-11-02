import type { WebsiteLogs, WebsiteRuntimeState } from "../../api/website-runtime";
export const RUNTIME_STATES: Record<WebsiteRuntimeState, { label: string; color: string; progress?: number; description: string }> = {
  stopped: { label: "已停止", color: "#737373", description: "启动网站后可查看预览。" },
  installing: { label: "安装中", color: "#d97706", progress: 30, description: "正在安装项目依赖，可打开日志查看进度。" },
  starting: { label: "启动中", color: "#2563eb", progress: 70, description: "正在启动网站并等待健康检查。" },
  running: { label: "运行中", color: "#16a34a", description: "网站运行中" },
  crashed: { label: "运行失败", color: "#dc2626", description: "网站运行失败，请查看日志或让 agent 修复。" },
  sleeping: { label: "休眠中", color: "#737373", progress: 10, description: "网站已休眠，唤醒后恢复预览。" },
};
/** Cursor is the identity: repeated pages must not duplicate log entries. */
export function appendRuntimeLogs(current: WebsiteLogs, next: WebsiteLogs): WebsiteLogs {
  if (current.cursor !== null && current.cursor === next.cursor) return current;
  return { lines: [...current.lines, ...next.lines].slice(-2000), cursor: next.cursor };
}
export function previewPathUrl(base: string | null | undefined, path: string): string {
  if (!base) return "";
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".oceanleo.app") || url.username || url.password || url.port) return "";
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "";
    const next = new URL(path, url);
    return next.origin === url.origin ? next.href : "";
  } catch { return ""; }
}
