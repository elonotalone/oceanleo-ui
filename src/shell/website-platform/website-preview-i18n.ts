"use client";
import { useCallback } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../i18n/ui/useUI";

// Local additions stay in the website owner's boundary; shared dictionaries take precedence.
export const WEBSITE_PREVIEW_EN: Record<string, string> = {
  "已停止": "Stopped", "安装中": "Installing", "启动中": "Starting", "运行中": "Running",
  "运行失败": "Crashed", "休眠中": "Sleeping", "网站运行中": "Website running",
  "启动网站后可查看预览。": "Start the website to preview it.",
  "正在安装项目依赖，可打开日志查看进度。": "Installing dependencies. Open logs for details.",
  "正在启动网站并等待健康检查。": "Starting the website and waiting for its health check.",
  "网站运行失败，请查看日志或让 agent 修复。": "The website crashed. Check logs or ask the agent to fix it.",
  "网站已休眠，唤醒后恢复预览。": "The website is sleeping. Wake it to resume the preview.",
  "网站预览": "Website preview", "预览": "Preview", "看板": "Panels",
  "手机": "Phone", "电脑": "Desktop", "预览路径": "Preview path", "查看运行日志": "View runtime logs",
  "运行日志": "Runtime logs", "关闭": "Close", "让 agent 修复": "Ask agent to fix",
  "让 agent 写入运行说明": "Ask agent to write the run manifest",
  "请写入 .oceanleo/run.json 运行说明。": "Please write the .oceanleo/run.json run manifest.",
  "启动": "Start", "唤醒": "Wake", "重启": "Restart", "停止": "Stop", "重试": "Retry",
  "加载中…": "Loading…", "暂无日志": "No logs yet", "暂无看板": "No panels available",
  "未接线": "Not wired", "已接线": "Wired", "错误": "Error", "返回预览": "Back to preview",
  "让 agent 配置此看板": "Ask agent to configure this panel",
  "该看板尚未接线。": "This panel is not wired yet.",
  "看板数据暂不可用。": "Panel data is unavailable.",
  "共 {total} 条": "{total} rows", "无数据": "No data",
  "预览地址尚不可用。": "Preview URL is not available yet.",
  "路径须以 / 开头，且只能在当前网站内跳转。": "Paths must start with / and stay within this website.",
  "请求失败，请重试。": "Request failed. Please retry.",
  "任务已创建": "Task created", "打开 agent 任务": "Open agent task",
  "点选元素": "Pick element", "取消点选": "Cancel picking",
  "点击预览位置，将坐标和截图引用放入对话输入框。": "Click a preview location to add coordinates and a screenshot reference to the composer.",
  "截图引用": "Screenshot reference", "插入对话": "Insert into chat",
  "对话输入框尚未就绪，请先打开 agent 对话。": "Open the agent conversation before inserting a reference.",
  "已插入对话输入框": "Added to the composer",
  "跨域预览仅记录点击坐标，不读取页面 DOM。": "Cross-origin previews record coordinates without reading the page DOM.",
  "截图": "Screenshot", "截图失败，可继续发送位置引用。": "Screenshot failed. You can still send a location reference.",
  "添加截图": "Add screenshot", "请使用当前标签页截图，以便坐标对应预览。": "Capture the current tab so coordinates match the preview.",
};
export function useWebsiteUI() {
  const tt = useUI();
  let locale = "zh";
  try { locale = useLocale(); } catch { /* standalone legacy host */ }
  return useCallback((text: string, vars?: Record<string, string | number>) => {
    const translated = tt(text, vars);
    const fallback = !locale.startsWith("zh") && WEBSITE_PREVIEW_EN[text];
    return fallback && tt(text) === text
      ? fallback.replace(/\{(\w+)\}/g, (match, key) => String(vars?.[key] ?? match))
      : translated;
  }, [tt, locale]);
}
