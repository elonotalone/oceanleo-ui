import type { Locale } from "../../config";

// W11 server purchase copy. Chinese source text remains the key so the
// existing message loader can preserve zh identity while other locales use
// the English fallback until translated rows are added.
const EN: Record<string, string> = {
  "连接你的阿里云账号": "Connect your Aliyun account",
  "中国版的服务器由你的阿里云账号购买和管理。OceanLeo 只通过一次性授权的 RAM 角色操作。":
    "China edition servers are purchased and managed in your Aliyun account through a one-time RAM role authorization.",
  "RAM 角色 ARN": "RAM role ARN",
  "External ID": "External ID",
  "默认地域（可选）": "Default region (optional)",
  "信任策略 JSON": "Trust policy JSON",
  "最小权限策略 JSON": "Minimum permission policy JSON",
  "保存并验证": "Save and verify",
  "阿里云账号已验证": "Aliyun account verified",
  "这是开发版，操作会真实扣费/真实购买。": "This is a development edition; this action makes a real charge and purchase.",
  "我确认这次操作会真实扣费并购买服务器": "I confirm this action will make a real charge and purchase a server",
  预装: "Preinstalled",
};

export function purchaseCopy(locale: Locale): Record<string, string> {
  if (locale === "zh") return Object.fromEntries(Object.keys(EN).map((key) => [key, key]));
  return { ...EN };
}

/** Stable Chinese source keys used directly by the purchase dialog. */
export const PURCHASE_COPY = {
  cnAccountTitle: "连接你的阿里云账号",
  cnAccountIntro: "中国版的服务器由你的阿里云账号购买和管理。OceanLeo 只通过一次性授权的 RAM 角色操作。",
  cnRoleArn: "RAM 角色 ARN",
  cnExternalId: "External ID",
  cnDefaultRegion: "默认地域（可选）",
  cnTrustPolicy: "信任策略 JSON",
  cnPermissionPolicy: "最小权限策略 JSON",
  cnSaveAndVerify: "保存并验证",
  cnVerified: "阿里云账号已验证",
  devSpendWarning: "这是开发版，操作会真实扣费/真实购买。",
  devSpendConfirm: "我确认这次操作会真实扣费并购买服务器",
  tierPreinstalled: "预装",
} as const;
