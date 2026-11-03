import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  loggedIn: "已登录且未锁屏", locked: "锁屏", loggedOut: "已注销或尚未登录", preBoot: "系统启动前",
  state: "电脑状态", presence: "设备连接", capture: "远程画面", input: "键鼠控制",
  available: "已验证可用", unavailable: "不可用", unverified: "尚未验证",
  deviceVerificationRequired: "需要在这台电脑上验证实际连接、画面和输入。",
  macosBrokerIntegrationRequired: "登录前连接尚未完成受保护的安装和授权。Mac 登录窗口不提供画面或键鼠控制。",
  windowsBrokerIntegrationRequired: "登录前连接需要受保护的系统服务、专用凭据和授权；尚未确认就绪。",
  platformNotSupported: "此系统不支持登录前远程访问。",
  osNotRunning: "FileVault、BitLocker 或固件启动前没有运行中的远程服务。",
  macosLoginWindowNotSupported: "Mac 登录窗口不支持画面或键鼠控制。",
  integrationRequired: "登录前远程访问尚未就绪。",
} as const;
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  loggedIn: "Signed in and unlocked", locked: "Locked", loggedOut: "Signed out or before login", preBoot: "Before the operating system starts",
  state: "Computer state", presence: "Device connection", capture: "Screen", input: "Keyboard and mouse",
  available: "Verified available", unavailable: "Unavailable", unverified: "Unverified",
  deviceVerificationRequired: "The connection, screen and input must be verified on this computer.",
  macosBrokerIntegrationRequired: "Before-login access still needs protected installation and authorization. The Mac login window does not provide screen capture or input.",
  windowsBrokerIntegrationRequired: "Before-login access requires a protected system service, a dedicated credential and authorization. Readiness is unconfirmed.",
  platformNotSupported: "Before-login remote access is unsupported on this system.",
  osNotRunning: "No remote service runs before FileVault, BitLocker or firmware startup completes.",
  macosLoginWindowNotSupported: "Screen capture and input are unavailable at the Mac login window.",
  integrationRequired: "Before-login remote access is not ready.",
};
const ZH_TW: Messages = {
  loggedIn: "已登入且未鎖定", locked: "鎖定", loggedOut: "已登出或尚未登入", preBoot: "系統啟動前",
  state: "電腦狀態", presence: "裝置連線", capture: "遠端畫面", input: "鍵鼠控制",
  available: "已驗證可用", unavailable: "無法使用", unverified: "尚未驗證",
  deviceVerificationRequired: "需要在這台電腦上驗證實際連線、畫面和輸入。",
  macosBrokerIntegrationRequired: "登入前連線尚未完成受保護的安裝和授權。Mac 登入視窗不提供畫面或鍵鼠控制。",
  windowsBrokerIntegrationRequired: "登入前連線需要受保護的系統服務、專用憑證和授權；尚未確認就緒。",
  platformNotSupported: "此系統不支援登入前遠端存取。",
  osNotRunning: "FileVault、BitLocker 或韌體啟動前沒有執行中的遠端服務。",
  macosLoginWindowNotSupported: "Mac 登入視窗不支援畫面或鍵鼠控制。",
  integrationRequired: "登入前遠端存取尚未就緒。",
};
export const RDLOGIN_SOURCE = SOURCE;
export const RDLOGIN_MESSAGES = Object.fromEntries(LOCALES.map((locale) => [locale,
  copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN),
])) as Record<Locale, Record<string, string>>;
