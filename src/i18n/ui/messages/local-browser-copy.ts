import type { Locale } from "../../config";

export const LOCAL_BROWSER_EN: Record<string, string> = {
  "我的浏览器": "My Browser",
  "网关地址": "Gateway address",
  "正在读取任务记录…": "Loading task activity…",
  "可选的本机浏览器连接，独立于 MCP。每次任务都需要在 Chrome 或 Edge 扩展中本地授权；授权后，网页内容会发送给服务器和模型。": "An optional local browser connection, separate from MCP. Approve each task locally in the Chrome or Edge extension. After approval, page content is sent to the server and model.",
  "下载浏览器扩展 ZIP": "Download extension ZIP",
  "创建配对码": "Create pairing code",
  "刷新状态": "Refresh status",
  "解压 ZIP，在 chrome://extensions 或 edge://extensions 打开开发者模式，选择“加载已解压的扩展程序”。": "Unzip the download, enable Developer mode at chrome://extensions or edge://extensions, and choose Load unpacked.",
  "在扩展中填写当前网关地址，再粘贴此处创建的配对码。配对码十分钟后失效且只能使用一次。": "Enter this gateway address in the extension and paste a code created here. Codes expire after ten minutes and can only be used once.",
  "保持浏览器在线；在扩展中确认任务及网站范围。敏感操作需要再次本地确认；验证码可能需要你手动完成。": "Keep the browser online and approve the task and websites in the extension. Sensitive actions need another local confirmation. You may need to complete CAPTCHAs yourself.",
  "配对码": "Pairing code",
  "到期时间：{time}": "Expires: {time}",
  "配对码已过期，请重新创建": "Pairing code expired. Create a new code.",
  "复制配对码": "Copy pairing code",
  "已复制配对码": "Pairing code copied",
  "浏览器连接暂不可用，请检查登录、网络或网关后重试。": "Browser connection is unavailable. Check your sign-in, network or gateway and retry.",
  "正在读取浏览器连接…": "Loading browser connections…",
  "首选浏览器": "Preferred browser",
  "自动选择在线浏览器": "Automatically select an online browser",
  "首选浏览器离线时，允许选择其他已配对的在线浏览器（仍需本地授权）": "Allow another paired online browser when the preferred browser is offline (local approval still required)",
  "尚未配对浏览器。安装扩展并使用配对码连接。": "No browser paired yet. Install the extension and connect with a pairing code.",
  "已撤销": "Revoked",
  "离线：打开浏览器和扩展后重试，不会自动改用云浏览器": "Offline: open the browser and extension, then retry. There is no automatic cloud browser fallback.",
  "连接已撤销；设备收到通知后会停止。离线时请在扩展中立即断开。": "Connection revoked. The device will stop when notified. If offline, disconnect immediately in the extension.",
  "撤销连接": "Revoke connection",
  "浏览器任务与记录": "Browser tasks and activity",
  "还没有浏览器任务。可在聊天中要求 Agent 使用我的浏览器。": "No browser tasks yet. Ask the agent in chat to use My Browser.",
  "查看记录": "View activity",
  "请求已送达服务器，等待扩展同步；需要立即停止时请使用扩展中的停止或接管按钮。": "The server received your request; waiting for the extension to sync. To stop immediately, use Stop or Take over in the extension.",
  "请求停止": "Request stop",
  "请求接管": "Request takeover",
  "任务记录": "Task activity",
  "暂无记录": "No activity yet",
  "等待扩展本地授权": "Waiting for local approval in the extension",
  "运行中": "Running",
  "已暂停，继续需要本地重新授权": "Paused; fresh local approval required to resume",
  "已停止": "Stopped",
  "本地授权已拒绝": "Local approval denied",
  "授权已过期": "Approval expired",
  "连接本机 Chrome / Edge，每次任务由扩展本地授权": "Connect local Chrome / Edge; approve each task in the extension",
};

/** New copy uses English fallback for untranslated locales, as other shared feature dictionaries do. */
export function localBrowserCopy(locale: Locale): Record<string, string> {
  return locale === "zh" ? Object.fromEntries(Object.keys(LOCAL_BROWSER_EN).map(key => [key, key])) : LOCAL_BROWSER_EN;
}
