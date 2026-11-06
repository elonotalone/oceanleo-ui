import { LOCALES, type Locale } from "../../config";

/** Website settings dashboard copy. The parent registers this table in messages/index.ts. */
export const WEBSITE_MANAGEMENT_SOURCE = {
  domain: "域名",
  domainDnsHint: "添加域名后，将 CNAME 和 TXT 记录复制到你的 DNS 服务商。",
  domainAdded: "域名已添加，请按记录完成 DNS 配置。",
  dnsRefreshed: "DNS 状态已刷新。",
  copied: "已复制。",
  copyFailed: "复制失败，请手动复制。",
  copy: "复制",
  loading: "加载中…",
  verifyDns: "验证 DNS",
  verifying: "验证中…",
  adding: "添加中…",
  add: "添加",
  login: "登录",
  managedAuthHint: "使用网站配置中的托管后端认证服务。",
  loginAuth: "登录与认证",
  enabled: "已启用",
  disabled: "未启用",
  enableLogin: "启用网站登录",
  enabling: "启用中…",
  registeredUsers: "注册用户",
  noRegisteredUsers: "还没有注册用户。",
  statistics: "访问统计",
} as const;

type Messages = Record<string, string>;
const zh: Messages = Object.fromEntries(Object.entries(WEBSITE_MANAGEMENT_SOURCE).map(([key, value]) => [value, value]));
const en: Messages = {
  "域名": "Domains",
  "添加域名后，将 CNAME 和 TXT 记录复制到你的 DNS 服务商。": "After adding a domain, copy the CNAME and TXT records to your DNS provider.",
  "域名已添加，请按记录完成 DNS 配置。": "Domain added. Complete the DNS setup using the records.",
  "DNS 状态已刷新。": "DNS status refreshed.",
  "已复制。": "Copied.",
  "复制失败，请手动复制。": "Copy failed. Copy it manually.",
  "复制": "Copy",
  "加载中…": "Loading…",
  "验证 DNS": "Verify DNS",
  "验证中…": "Verifying…",
  "添加中…": "Adding…",
  "添加": "Add",
  "登录": "Login",
  "使用网站配置中的托管后端认证服务。": "Use the managed backend authentication configured for this website.",
  "登录与认证": "Login and authentication",
  "已启用": "Enabled",
  "未启用": "Disabled",
  "启用网站登录": "Enable website login",
  "启用中…": "Enabling…",
  "注册用户": "Registered users",
  "还没有注册用户。": "No registered users yet.",
  "访问统计": "Visit statistics",
};

export const WEBSITE_MANAGEMENT_MESSAGES = Object.fromEntries(
  LOCALES.map((locale: Locale) => [locale, locale === "zh" ? zh : en]),
) as Record<Locale, Messages>;
