import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom } from "./shell-overhaul-copy-shared";

export const RDLOGIN_ACT_SOURCE = {
  signing: "锁屏控制签名",
  signingRequired: "此构建尚未配置受信任的签名，无法启用锁屏或退出登录后的控制。",
  signingConfigured: "已配置签名校验，连接时仍会验证实际签名。",
  elevation: "系统服务连接",
  elevationReady: "已连接受信任的系统服务。",
  elevationUnavailable: "受信任的系统服务尚未安装、未运行或无法验证。",
  approvalRequired: "需要这台电脑的所有者批准系统访问。",
  owner: "系统服务所有者",
  ownerApproved: "当前系统账号与已批准的设备所有者一致。",
  ownerUnknown: "尚未确认当前系统账号的所有者批准。",
  operationFailed: "系统服务未确认授权或清理结果，锁屏控制状态尚未验证。",
  unsupported: "此平台尚不支持该系统服务。",
} as const;
type Key = keyof typeof RDLOGIN_ACT_SOURCE;
const EN: Record<Key, string> = {
  signing: "Lock-screen control signing",
  signingRequired: "This build has no trusted signer configured. It cannot enable control while locked or signed out.",
  signingConfigured: "Signer verification is configured. The actual signature is still checked on connection.",
  elevation: "System service connection",
  elevationReady: "Connected to the trusted system service.",
  elevationUnavailable: "The trusted system service is not installed, not running, or could not be verified.",
  approvalRequired: "This computer's owner must approve system access.",
  owner: "System service owner",
  ownerApproved: "The current system account matches the approved device owner.",
  ownerUnknown: "Owner approval for the current system account has not been confirmed.",
  operationFailed: "The system service did not confirm authorization or cleanup. Lock-screen control is unverified.",
  unsupported: "This platform does not support this system service yet.",
};
const TW: Record<Key, string> = {
  signing: "鎖定畫面控制簽章",
  signingRequired: "此版本尚未設定受信任的簽章，無法啟用鎖定或登出後的控制。",
  signingConfigured: "已設定簽章驗證，連線時仍會驗證實際簽章。",
  elevation: "系統服務連線",
  elevationReady: "已連線至受信任的系統服務。",
  elevationUnavailable: "受信任的系統服務尚未安裝、未執行或無法驗證。",
  approvalRequired: "需要這台電腦的擁有者批准系統存取。",
  owner: "系統服務擁有者",
  ownerApproved: "目前系統帳號與已批准的裝置擁有者一致。",
  ownerUnknown: "尚未確認目前系統帳號的擁有者批准。",
  operationFailed: "系統服務未確認授權或清理結果，鎖定畫面控制狀態尚未驗證。",
  unsupported: "此平台尚不支援這項系統服務。",
};
export const RDLOGIN_ACT_MESSAGES = Object.fromEntries(LOCALES.map((locale) => [locale,
  copyDictionaryFrom(RDLOGIN_ACT_SOURCE, locale === "zh" ? RDLOGIN_ACT_SOURCE : locale === "zh-TW" ? TW : EN),
])) as Record<Locale, Record<string, string>>;
