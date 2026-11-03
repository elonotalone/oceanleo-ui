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
  "应用看板清单": "Site panel catalog",
  "网站看板清单格式不正确，请让 agent 修复。": "The site panel catalog is invalid. Ask the agent to fix it.",
  "读取网站看板清单超时，请重试。": "Loading the site panel catalog timed out. Try again.",
  "网站看板清单暂不可访问，请检查服务连接。": "The site panel catalog is not accessible. Check its service connection.",
  "网站看板地址未通过安全检查。": "The site panel address failed its security check.",
  "暂时无法读取网站看板清单，请重试。": "The site panel catalog is unavailable. Try again.",
  "共 {total} 条": "{total} rows", "无数据": "No data",
  "预览地址尚不可用。": "Preview URL is not available yet.",
  "路径须以 / 开头，且只能在当前网站内跳转。": "Paths must start with / and stay within this website.",
  "请求失败，请重试。": "Request failed. Please retry.",
  "任务已创建": "Task created", "打开 agent 任务": "Open agent task",
  "点选元素": "Pick element", "取消点选": "Cancel picking",
  "点击预览位置，将坐标和截图引用放入对话输入框。": "Click a preview location to add coordinates and a screenshot reference to the composer.",
  "截图引用": "Screenshot reference", "插入对话": "Insert into chat",
  "正在打开 agent 对话并等待输入框…": "Opening the agent conversation and waiting for the composer…",
  "无法打开此网站的 agent 对话，请重试。": "Could not open this website's agent conversation. Please retry.",
  "等待 agent 对话输入框超时，引用已保留，请重试插入。": "Timed out waiting for the agent composer. Your reference is kept; retry inserting it.",
  "引用插入失败，引用已保留，请重试插入。": "Could not insert the reference. Your reference is kept; retry inserting it.",
  "重试插入": "Retry insertion",
  "已插入对话输入框": "Added to the composer",
  "跨域预览仅记录点击坐标，不读取页面 DOM。": "Cross-origin previews record coordinates without reading the page DOM.",
  "截图": "Screenshot", "截图失败，可继续发送位置引用。": "Screenshot failed. You can still send a location reference.",
  "添加截图": "Add screenshot", "请使用当前标签页截图，以便坐标对应预览。": "Capture the current tab so coordinates match the preview.",
  "网站视图": "Website views", "仪表盘": "Dashboard", "配置": "Configuration",
  "网站运行": "Website runtime", "状态暂不可用": "Status unavailable", "查看仪表盘": "View dashboard",
  "预览仅用于查看，修改请交给 agent。": "Preview only. Ask the agent to make changes.",
  "访问量": "Visits", "注册用户": "Registered users", "运行与费用": "Runtime and cost", "域名": "Domain",
  "平台看板": "Platform panels", "网站看板": "Website panels", "暂无网站看板": "No website panels yet",
  "平台维护的数据看板，agent 无法修改。": "These data panels are maintained by the platform and cannot be edited by agents.",
  "由你的网站声明，可让 agent 添加或配置。": "Declared by your website. Ask the agent to add or configure panels.",
  "网站配置": "Website configuration",
  "所有服务均可单独选择。应用选择后，agent 会创建迁移或部署任务。": "Choose each service individually. Applying a choice creates an agent task for migration or deployment.",
  "连接状态来自实际服务检查，保存选择不代表已连接。费用按成本计算，不加价。": "Connection status comes from service checks. Saving a choice does not establish a connection. Services are charged at cost, without markup.",
  "配置存储尚未就绪，当前显示默认选择，暂时无法保存。": "Configuration storage is not ready. Default choices are shown; saving is unavailable.",
  "服务未返回 agent 任务，变更尚未确认。": "The service did not return an agent task. The change is not confirmed.",
  "OceanLeo 提供": "Provided by OceanLeo", "代你购买": "Purchased on your behalf", "你自己的账户": "Your own account",
  "未连接": "Not connected", "已连接": "Connected", "连接错误": "Connection error",
  "等待处理": "Pending", "已排队": "Queued", "执行中": "Running", "已完成": "Completed", "失败": "Failed",
  "已取消": "Cancelled", "等待审核": "Awaiting review", "等待批准": "Awaiting approval",
  "开发与运行服务": "Development and runtime", "代码仓库": "Code repository", "数据库": "Database",
  "登录与认证": "Login and authentication", "文件存储": "File storage", "网站托管": "Hosting",
  "访问统计": "Analytics", "定时任务": "Scheduled tasks",
  "提供方式": "Provider", "费用依据": "Cost basis", "费率来源": "Rate source", "限制": "Limits", "标准接口": "Standard interfaces",
  "尚无费用依据": "Cost basis unavailable", "尚无费率来源": "Rate source unavailable",
  "未声明额外限制": "No additional limits declared", "尚未声明接口": "No interfaces declared",
  "默认选择": "Default choice", "已保存选择": "Saved choice", "{slot}连接器": "{slot} connector",
  "应用": "Apply", "可用连接器（{count}）": "Available connectors ({count})",
  "场景方案": "Scenario presets", "选择场景方案": "Choose a preset", "应用方案": "Apply preset",
  "方案会填写各项服务，之后仍可逐项更改。": "Presets fill the service choices. Every choice remains editable.",
  "方案变更": "Preset change", "连接器变更": "Connector change", "任务状态：{state}": "Task status: {state}",
  "配置任务": "Configuration tasks", "尚无配置变更任务": "No configuration tasks yet",
  "暂不可用": "Unavailable", "此连接器暂不可用，请选择其他服务。": "This connector is unavailable. Choose another service.",
  "该方案包含暂不可用的服务，可逐项选择其他连接器。": "This preset includes unavailable services. You can choose other connectors individually.",
  "任务不存在": "Task not found", "无法创建配置任务，请重试。": "Could not create a configuration task. Please retry.",
  "暂时无法读取任务状态，请稍后重试。": "Task status is unavailable. Please try again later.",
  "配置任务不存在，请重试。": "The configuration task was not found. Please retry.",
  "配置任务执行失败，请打开任务查看原因。": "The configuration task failed. Open the task for details.",
  "配置任务已取消。": "The configuration task was cancelled.",
  "暂时无法准备配置变更，请重试。": "Could not prepare the configuration change. Try again.",
  "任务提交结果尚未确认，请在“我的任务”查看，勿重复提交。": "Task submission is unconfirmed. Check My tasks before submitting again.",
  "配置变更已提交，暂时无法读取结果，请稍后查看。": "The configuration change was submitted. Its result is unavailable; check again later.",
  "任务已创建，关联结果尚未确认，请稍后查看。": "The task was created. Its link is unconfirmed; check again later.",
  "配置变更状态尚未确认，请稍后检查。": "The configuration change status is unconfirmed. Check again later.",
  "服务操作结果尚未确认，请检查连接状态，勿重复提交。": "The service operation is unconfirmed. Check its connection before submitting again.",
  "服务操作已执行，暂时无法关联结果，请稍后检查，勿重复提交。": "The service operation ran. Its result link is unavailable; check again later before submitting again.",
};
export function useWebsiteLanguage() {
  try { return useLocale(); } catch { return "zh"; /* standalone legacy host */ }
}
export function useWebsiteUI() {
  const tt = useUI();
  const locale = useWebsiteLanguage();
  return useCallback((text: string, vars?: Record<string, string | number>) => {
    const translated = tt(text, vars);
    const fallback = !locale.startsWith("zh") && WEBSITE_PREVIEW_EN[text];
    return fallback && tt(text) === text
      ? fallback.replace(/\{(\w+)\}/g, (match, key) => String(vars?.[key] ?? match))
      : translated;
  }, [tt, locale]);
}
