// W1-CN: register CN_PARITY_MESSAGES in the parent-owned message registry.
import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  k00: "模拟支付，不会实际扣款或打款",
  k01: "请先在账单页启用模拟支付",
  k02: "付款通道与原付款记录不一致",
  k03: "境内付款通道尚未配置",
  k04: "付款引用不能为空",
  k05: "境内付款仅支持人民币",
  k06: "付款金额必须是正整数分",
  k07: "模拟付款会话已满，请稍后重试",
  k08: "模拟付款会话已过期，请重新打开",
  k09: "模拟付款方式不匹配",
  k10: "模拟付款账户不匹配",
  k11: "模拟收款账户不匹配",
  k12: "模拟付款来源不匹配",
  k13: "模拟退款付款不匹配",
} as const;

type Messages = CopyMessagesOf<typeof SOURCE>;

const EN: Messages = {
  k00: "Simulated payment. No money will be charged or paid out.",
  k01: "Enable simulated payments on the billing page first.",
  k02: "The payment channel differs from the original payment record.",
  k03: "The mainland payment channel is not configured yet.",
  k04: "A payment reference is required.",
  k05: "Mainland payments support CNY only.",
  k06: "The payment amount must be a positive whole number of fen.",
  k07: "There are too many simulated payment sessions. Try again later.",
  k08: "The simulated payment session expired. Open it again.",
  k09: "The simulated payment method does not match.",
  k10: "The simulated payment account does not match.",
  k11: "The simulated receiving account does not match.",
  k12: "The simulated payment source does not match.",
  k13: "The simulated refund does not match the payment.",
};

const ZH_TW: Messages = {
  k00: "模擬付款，不會實際扣款或撥款",
  k01: "請先在帳單頁啟用模擬付款",
  k02: "付款通道與原付款紀錄不一致",
  k03: "境內付款通道尚未設定",
  k04: "付款參照不可為空",
  k05: "境內付款僅支援人民幣",
  k06: "付款金額必須是正整數分",
  k07: "模擬付款工作階段已滿，請稍後重試",
  k08: "模擬付款工作階段已過期，請重新開啟",
  k09: "模擬付款方式不符",
  k10: "模擬付款帳戶不符",
  k11: "模擬收款帳戶不符",
  k12: "模擬付款來源不符",
  k13: "模擬退款付款不符",
};

export const CN_PARITY_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => {
    const table: Messages = locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN;
    return [locale, copyDictionaryFrom(SOURCE, table)];
  }),
) as Record<Locale, Record<string, string>>;
