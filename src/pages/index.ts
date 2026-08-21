export { ApiPage } from "./ApiPage";
export type { ApiPageProps } from "./ApiPage";
export { ApiGuidePage } from "./ApiGuidePage";
export { UsageHistory } from "./UsageHistory";
export { CostPage } from "./CostPage";
export { PageHeader } from "./PageHeader";
export { ByokKeys } from "./ByokKeys";
// 共享登录 UI（W10 owner）：邮箱密码 / 中国手机号 OTP / 微信扫码三方式，全家桶
// 唯一实现。AccountPage 未传 onSignInClick 时就地弹的就是它；AuthPanel 是同一份
// 表单的无外壳版本，供已有自己浮层/抽屉的站内嵌。
export { AuthDialog, AuthPanel } from "./AuthDialog";
export type { AuthDialogProps, AuthPanelProps, AuthMethod } from "./AuthDialog";
export { AUTH_METHODS, authErrorCopy, totpErrorCopy, wechatRedirectTarget } from "./AuthDialog";
// 找回密码的落地页（W4）：用户从重置邮件的链接进来落在这里。路径由
// `lib/auth/client.ts` 的 `PASSWORD_RESET_PATH` 定死，两边共用同一个常量。
export { PasswordResetPage, hasRecoveryParams } from "./PasswordResetPage";
export type { PasswordResetPageProps } from "./PasswordResetPage";
export { AccountPage } from "./AccountPage";
export type { AccountPageProps, AccountMenuItem } from "./AccountPage";
// 账号安全中心（W4）：最近活动 / 登录中的设备 / 两步验证 / 每日消费上限。
// 消费契约 §2 的四个网关端点；端点没上线时那一块显示「还没上线」，不白屏。
export { AccountSecurityPage, securityErrorCopy, securityEventCopy } from "./AccountSecurityPage";
export type { AccountSecurityPageProps } from "./AccountSecurityPage";
export { SettingsPage } from "./SettingsPage";
export type { SettingsPageProps } from "./SettingsPage";
export { GeneralPage } from "./GeneralPage";
export type { GeneralPageProps } from "./GeneralPage";
export { MyDatabasePage, MyDatabasePanel } from "./MyDatabasePage";
export type { MyDatabasePageProps, MyDatabasePanelProps } from "./MyDatabasePage";
export { PluginsPage } from "./PluginsPage";
export type { PluginsPageProps } from "./PluginsPage";
export { DevicesPage, type DevicesPageProps } from "./DevicesPage";
