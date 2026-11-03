// Parent registers W2_CN2_MESSAGES in the shared UI message registry.
import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  k00: "模拟付款方式",
  k01: "仅用于开发测试，不会实际扣款或打款。",
  k02: "模拟付款方式已就绪",
  k03: "模拟付款方式尚未启用",
  k04: "设置模拟付款方式",
  k05: "确认模拟付款方式",
  k06: "模拟收款账户",
  k07: "模拟身份，无真实身份核验或资金流转。",
  k08: "模拟收款账户已就绪",
  k09: "模拟收款账户尚未启用",
  k10: "启用模拟收款账户",
  k11: "模拟设置失败，请重试。",
  k12: "请先在账单页启用模拟收款账户",
  k13: "正在处理…",
} as const;
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  k00: "Simulated payment method",
  k01: "For development testing only. No money is charged or paid out.",
  k02: "Simulated payment method ready",
  k03: "Simulated payment method not set up",
  k04: "Set up simulated payment method",
  k05: "Confirm simulated payment method",
  k06: "Simulated receiving account",
  k07: "Simulated identity. No real identity verification or money movement.",
  k08: "Simulated receiving account ready",
  k09: "Simulated receiving account not set up",
  k10: "Enable simulated receiving account",
  k11: "Simulation setup failed. Try again.",
  k12: "Enable a simulated receiving account on the billing page first.",
  k13: "Processing…",
};
const ZH_TW: Messages = {
  k00: "模擬付款方式",
  k01: "僅用於開發測試，不會實際扣款或撥款。",
  k02: "模擬付款方式已就緒",
  k03: "模擬付款方式尚未啟用",
  k04: "設定模擬付款方式",
  k05: "確認模擬付款方式",
  k06: "模擬收款帳戶",
  k07: "模擬身分，無真實身分驗證或資金流轉。",
  k08: "模擬收款帳戶已就緒",
  k09: "模擬收款帳戶尚未啟用",
  k10: "啟用模擬收款帳戶",
  k11: "模擬設定失敗，請重試。",
  k12: "請先在帳單頁啟用模擬收款帳戶",
  k13: "正在處理…",
};
export const W2_CN2_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
