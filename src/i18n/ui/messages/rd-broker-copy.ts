// W4-RDVIEWBROKER: parent registers RD_BROKER_MESSAGES in the shared dictionary.
import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";
import type { RemoteDesktopBrokerStatus } from "../../../api/remote-desktop";

const SOURCE = {
  loggedIn: "这台电脑已登录。",
  locked: "这台电脑已锁屏，正在确认能否显示画面和接收输入。",
  lockedReady: "这台电脑已锁屏，已确认可以显示画面和接收输入；你可以尝试解锁。",
  loggedOut: "这台电脑停在登录界面，正在确认能否显示画面和接收输入。",
  loggedOutReady: "这台电脑停在登录界面，已确认可以显示画面和接收输入；你可以尝试登录。",
  preBoot: "这台电脑还未进入操作系统，无法通过 OceanLeo 远程控制。",
  unknown: "尚未收到这台电脑当前的登录或锁屏状态。",
  unavailable: "暂时联系不上这台电脑的锁屏服务，请稍后重新连接。",
  unsupported: "这台电脑当前无法通过锁屏服务显示画面或接收输入。",
  macUnsupported: "这台 Mac 的登录界面暂不支持远程画面和输入。",
  disabled: "这台电脑的锁屏远程访问已关闭。",
  changed: "这台电脑的登录状态已变化，请重新连接当前桌面。",
  expired: "锁屏控制权限已过期，请重新连接。",
  refused: "锁屏控制授权已失效，请重新连接并确认远程访问设置。",
  inputDenied: "锁屏画面仍可查看，这台电脑暂未允许远程输入。",
  unsupportedInput: "锁屏界面仅支持实体键盘按键和鼠标，不支持粘贴、输入法或滚轮。",
  limits: "锁屏界面仅支持实体键盘和鼠标；不支持粘贴、输入法、滚轮或 Ctrl+Alt+Delete。",
  idleInput: "请在远程画面中移动鼠标或按一个实体键盘按键，确认仍在使用。",
  idleViewOnly: "仅查看模式无法确认远程输入；会话结束后可重新连接。",
} as const;
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  loggedIn: "This computer is signed in.",
  locked: "This computer is locked. Checking whether it can show the screen and receive input.",
  lockedReady: "This computer is locked. Screen capture and input are verified; you can try to unlock it.",
  loggedOut: "This computer is at the sign-in screen. Checking screen capture and input.",
  loggedOutReady: "This computer is at the sign-in screen. Screen capture and input are verified; you can try to sign in.",
  preBoot: "This computer has not reached its operating system. OceanLeo cannot control it remotely.",
  unknown: "This computer has not reported its current sign-in or lock state.",
  unavailable: "Cannot reach this computer's lock-screen service. Try connecting again later.",
  unsupported: "This computer cannot currently show its screen or receive input through the lock-screen service.",
  macUnsupported: "Remote screen capture and input are not yet supported at this Mac's sign-in screen.",
  disabled: "Lock-screen remote access is turned off on this computer.",
  changed: "This computer's sign-in state changed. Reconnect to its current desktop.",
  expired: "Lock-screen control permission expired. Reconnect to continue.",
  refused: "Lock-screen authorization is no longer valid. Reconnect and check remote access settings.",
  inputDenied: "You can still view the lock screen. This computer has not allowed remote input.",
  unsupportedInput: "The lock screen supports physical keyboard keys and the mouse only, without paste, input methods or scrolling.",
  limits: "The lock screen supports physical keyboard keys and the mouse, without paste, input methods, scrolling or Ctrl+Alt+Delete.",
  idleInput: "Move the mouse in the remote picture or press a physical keyboard key to confirm you are still using it.",
  idleViewOnly: "View-only mode cannot confirm remote input. You can reconnect after this session ends.",
};
const ZH_TW: Messages = {
  loggedIn: "這台電腦已登入。",
  locked: "這台電腦已鎖定，正在確認能否顯示畫面和接收輸入。",
  lockedReady: "這台電腦已鎖定，已確認可以顯示畫面和接收輸入；你可以嘗試解鎖。",
  loggedOut: "這台電腦停在登入畫面，正在確認能否顯示畫面和接收輸入。",
  loggedOutReady: "這台電腦停在登入畫面，已確認可以顯示畫面和接收輸入；你可以嘗試登入。",
  preBoot: "這台電腦尚未進入作業系統，無法透過 OceanLeo 遠端控制。",
  unknown: "尚未收到這台電腦目前的登入或鎖定狀態。",
  unavailable: "暫時聯絡不上這台電腦的鎖定服務，請稍後重新連線。",
  unsupported: "這台電腦目前無法透過鎖定服務顯示畫面或接收輸入。",
  macUnsupported: "這台 Mac 的登入畫面暫不支援遠端畫面和輸入。",
  disabled: "這台電腦的鎖定遠端存取已關閉。",
  changed: "這台電腦的登入狀態已變化，請重新連線目前桌面。",
  expired: "鎖定控制權限已過期，請重新連線。",
  refused: "鎖定控制授權已失效，請重新連線並確認遠端存取設定。",
  inputDenied: "鎖定畫面仍可檢視，這台電腦暫未允許遠端輸入。",
  unsupportedInput: "鎖定畫面僅支援實體鍵盤按鍵和滑鼠，不支援貼上、輸入法或滾輪。",
  limits: "鎖定畫面僅支援實體鍵盤和滑鼠；不支援貼上、輸入法、滾輪或 Ctrl+Alt+Delete。",
  idleInput: "請在遠端畫面中移動滑鼠或按一個實體鍵盤按鍵，確認仍在使用。",
  idleViewOnly: "僅檢視模式無法確認遠端輸入；工作階段結束後可重新連線。",
};
export const RD_BROKER_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map(locale => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
export const RD_BROKER_COPY = SOURCE;

export function rdBrokerStatusCopy(status: RemoteDesktopBrokerStatus): string {
  if (!status.online) return SOURCE.unknown;
  if (status.state === "preBoot") return SOURCE.preBoot;
  if (status.state === "unknown") return SOURCE.unknown;
  if (status.state === "loggedIn") return SOURCE.loggedIn;
  if (!status.enabled) return SOURCE.disabled;
  if (!status.controlSupported) return status.reason === "macos_loginwindow_not_supported" ? SOURCE.macUnsupported : SOURCE.unsupported;
  const verified = status.captureVerified && status.inputVerified;
  return status.state === "locked" ? verified ? SOURCE.lockedReady : SOURCE.locked : verified ? SOURCE.loggedOutReady : SOURCE.loggedOut;
}
export function rdBrokerErrorCopy(code?: string): string | null {
  if (code === "broker_input_unsupported") return SOURCE.unsupportedInput;
  if (code === "broker_input_not_allowed") return SOURCE.inputDenied;
  if (code === "broker_disabled") return SOURCE.disabled;
  if (code === "broker_unavailable") return SOURCE.unavailable;
  if (["broker_handoff", "broker_handoff_pending", "broker_console_changed", "broker_state_unavailable"].includes(code ?? "")) return SOURCE.changed;
  if (["broker_lease_expired", "broker_lease_revoked", "broker_presence_expired", "broker_disconnected"].includes(code ?? "")) return SOURCE.expired;
  if (code?.startsWith("broker_")) return SOURCE.refused;
  return null;
}
