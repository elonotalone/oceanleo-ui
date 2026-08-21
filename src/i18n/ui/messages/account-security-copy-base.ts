// @oceanleo/ui — 账号安全（找回密码 / 两步验证 / 账号安全中心）的文案词典。
//
// 为什么单独一份而不是往 17 份平表末尾各追加一段：这一批是**用户被盗号时唯一
// 的自救界面**。少一条译文，非中文用户在最需要看懂的那一屏上看到的是中文。
// 走 `assembleAccountSecurityCopy` 之后，少一个语种或少一条 key 就编不过
// （入参类型是 `Record<Exclude<Locale,"zh">, AccountSecurityCopyMessages>`），
// 不必靠人记得补齐。
//
// **这里只放本波新增的句子。** 已经在词典里的 19 条（「登录」「密码」「至少 6 位」
// 「验证并登录」「登录成功」「验证码」「重发」「退出登录」「加载中…」「加载更多」
// 「重试」「关闭」「邮箱」「处理中...」「移除」「取消」「保存」
// 「验证码不正确或已过期，请重新获取。」「这一步没有完成，请稍后重试。」）
// 一律在渲染处直接 `tt()` 复用，不在这里抄第二份译文——同一句话有两处来源迟早漂移。
//
// 插值占位符（{date} {yuan} {count}）在每个语种里都必须原样保留。

import { LOCALES, type Locale } from "../../config";

export const ACCOUNT_SECURITY_COPY_SOURCE = {
  // —— 找回密码（登录门内的两屏）——————————————————————————————
  forgotPassword: "忘记密码？",
  resetTitle: "找回密码",
  resetIntro: "输入你注册时用的邮箱，我们发一条重置链接过去。",
  resetSend: "发送重置链接",
  resetSentTitle: "重置邮件已经发出去了",
  resetSentDetail:
    "邮件可能要几分钟才到，也可能被归进垃圾邮件。没收到就过一会儿再发一次——目前每小时最多发 2 封。",
  backToSignIn: "返回登录",
  enterEmailFirst: "请先填写邮箱地址。",

  // —— 重置密码落地页（从邮件链接进来）——————————————————————
  newPasswordTitle: "设置新密码",
  newPasswordIntro: "这条链接只能用一次。设好之后请用新密码重新登录。",
  newPassword: "新密码",
  newPasswordAgain: "再输一遍",
  savePassword: "保存新密码",
  passwordSavedTitle: "新密码已经生效",
  passwordSavedDetail: "其它设备上的登录不会自动退出。担心的话，登录后去账号安全里退出所有设备。",
  passwordMismatch: "两次输入的密码不一样。",
  passwordTooShort: "密码至少 6 位。",
  resetLinkExpired: "这条重置链接已经失效了，回登录页重新发一条。",
  resetLinkMissing: "这个页面要从邮件里的链接打开才有用。",

  // —— 改密码（账号安全中心里）—————————————————————————————
  changePassword: "修改密码",
  changePasswordDesc: "改密码要先证明你是你：填一次原密码，或者用发到邮箱的验证码。",
  currentPassword: "当前密码",
  emailCode: "邮箱验证码",
  sendEmailCode: "发送邮箱验证码",
  emailCodeSent: "验证码已经发到你的邮箱，可能要等几分钟。",
  wrongCurrentPassword: "原密码不正确。",

  // —— 两步验证 ————————————————————————————————————————
  twoStepTitle: "两步验证",
  twoStepOff: "还没开启。开启之后，别人光有你的密码也登不进来。",
  twoStepOn: "已开启。登录时除了密码，还要输一次验证器上的 6 位码。",
  turnOnTwoStep: "开启两步验证",
  addAnotherAuthenticator: "再加一个验证器",
  scanQr: "用验证器 App 扫这个二维码",
  orTypeSecret: "扫不了就手动输入这串密钥：",
  copySecret: "复制密钥",
  secretCopied: "密钥已复制。",
  enterSixDigits: "输入验证器上正在显示的 6 位码",
  sixDigits: "6 位数字",
  confirmAndEnable: "确认并开启",
  twoStepEnabled: "两步验证已开启。",
  removeAuthenticatorConfirm: "移除之后，只要有你的密码就能登进这个账号。确定要移除吗？",
  twoStepRemoved: "两步验证已移除。",
  verifyBeforeRemove: "移除前先输一次验证器上的 6 位码。",
  lostAuthenticatorTitle: "验证器丢了怎么办",
  lostAuthenticatorBody:
    "我们暂时不发备用恢复码。手机丢了或者换了机器，写信到 support@oceanleo.com，我们人工核实身份之后帮你移除，你再重新开一次。",
  unnamedAuthenticator: "未命名的验证器",
  authenticatorAddedOn: "添加于 {date}",
  badTotpCode: "验证码不对，或者已经过了它 30 秒的有效期。",
  twoStepUnavailable: "两步验证现在开不了，稍后再试。",

  // —— 登录时的第二步（aal1 → aal2）————————————————————————
  twoStepPromptTitle: "再验一步",
  twoStepPromptDetail: "这个账号开了两步验证。打开验证器 App，输入它现在显示的 6 位码。",

  // —— 账号安全中心 ——————————————————————————————————————
  securityCenter: "账号安全",
  securityCenterDesc: "最近的登录与改动、还在登录状态的设备、每天最多能花多少",
  recentActivity: "最近活动",
  recentActivityEmpty: "还没有任何记录。",
  noMoreActivity: "没有更多了。",
  activeDevices: "登录中的设备",
  activeDevicesEmpty: "现在没有别的设备登录。",
  thisDevice: "当前设备",
  signOutThisDevice: "退出这台设备",
  signOutThisDeviceConfirm: "这台设备会被立刻退出，下次要重新登录。当前设备不受影响。",
  deviceSignedOut: "那台设备已经退出。",
  unknownDevice: "未知设备",
  unknownIp: "地址未知",

  // —— 活动类型（契约 §2 的 kind 表）——————————————————————
  eventLogin: "登录",
  eventPasswordChanged: "修改了密码",
  eventMfaEnrolled: "开启了两步验证",
  eventMfaUnenrolled: "关闭了两步验证",
  eventKeyAdded: "新增了一个 API key",
  eventKeyRevoked: "撤销了一个 API key",
  eventSpendBlocked: "消费被每日上限拦下",
  eventLogoutAll: "退出了所有设备",
  eventUnknown: "其它账号操作",
  eventDenied: "被拒绝",

  // —— 每日消费上限 ——————————————————————————————————————
  dailyLimit: "每日消费上限",
  dailyLimitWhy: "这是给自己上的保险：万一账号被别人拿到，一天最多损失这么多。",
  dailyLimitNone: "现在不限。",
  dailyLimitNow: "现在是每天 {yuan} 元。",
  spentToday: "今天已经花了 {yuan} 元。",
  limitPlaceholder: "例如 50",
  limitUnitYuan: "元 / 天",
  saveLimit: "保存上限",
  removeLimit: "取消上限",
  limitSaved: "上限已保存。",
  limitInvalid: "请填一个不小于 0 的金额。",

  // —— 取数失败（account-security.ts 的码表）——————————————————
  errSignedOut: "登录状态失效了，请重新登录。",
  errOffline: "连不上服务器，检查一下网络再试。",
  errNotAvailable: "这一块还没上线，过些天再来看。",
  errNotFound: "这条记录已经不在了。",
  errRateLimited: "操作太频繁了，缓一会儿再试。",
  errServer: "服务器出了点问题，稍后再试。",
} as const;

export type AccountSecurityCopyName = keyof typeof ACCOUNT_SECURITY_COPY_SOURCE;
export type AccountSecurityCopyMessages = Record<AccountSecurityCopyName, string>;

/** 本词典覆盖的中文原文全集；测试与 `index.ts` 都从这里取，不另抄一份。 */
export const ACCOUNT_SECURITY_COPY_KEYS: readonly string[] = Object.values(
  ACCOUNT_SECURITY_COPY_SOURCE,
);

export function accountSecurityDictionaryFrom(
  messages: AccountSecurityCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(ACCOUNT_SECURITY_COPY_SOURCE) as AccountSecurityCopyName[]).map((name) => [
      ACCOUNT_SECURITY_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

/** 中文站：key 就是值，直接从原文表推，避免手抄一遍后与原文漂移。 */
export const ACCOUNT_SECURITY_COPY_ZH: AccountSecurityCopyMessages = {
  ...ACCOUNT_SECURITY_COPY_SOURCE,
};

export function assembleAccountSecurityCopy(
  translations: Record<Exclude<Locale, "zh">, AccountSecurityCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      accountSecurityDictionaryFrom(
        locale === "zh" ? ACCOUNT_SECURITY_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
