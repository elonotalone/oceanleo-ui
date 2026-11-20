import type { Locale } from "../../config";

// UL (session / sites wave 2026-11-21): LeoChat inbox preview labels for the server's `preview_label.label_key`
// (contract §2.2). The Chinese source is the key (the messages/** convention); no other locale shows "[任务]".
export const SS_UL_COPY = {
  previewTask: "[任务]",
  previewQuote: "[聊天记录]",
  previewOrder: "[订单]",
} as const;
type Copy = Record<keyof typeof SS_UL_COPY, string>;

const es: Copy = {
  previewTask: "[Tarea]",
  previewQuote: "[Historial de chat]",
  previewOrder: "[Pedido]",
};

const pt: Copy = {
  previewTask: "[Tarefa]",
  previewQuote: "[Histórico de conversa]",
  previewOrder: "[Pedido]",
};

const translations: Record<Exclude<Locale, "zh">, Copy> = {
  en: {
    previewTask: "[Task]",
    previewQuote: "[Chat history]",
    previewOrder: "[Order]",
  },
  "zh-TW": {
    previewTask: "[任務]",
    previewQuote: "[聊天記錄]",
    previewOrder: "[訂單]",
  },
  de: {
    previewTask: "[Aufgabe]",
    previewQuote: "[Chatverlauf]",
    previewOrder: "[Bestellung]",
  },
  es,
  "es-419": {
    ...es,
  },
  fr: {
    previewTask: "[Tâche]",
    previewQuote: "[Historique du chat]",
    previewOrder: "[Commande]",
  },
  it: {
    previewTask: "[Attività]",
    previewQuote: "[Cronologia chat]",
    previewOrder: "[Ordine]",
  },
  "pt-BR": {
    ...pt,
  },
  "pt-PT": {
    ...pt,
    previewQuote: "[Histórico de conversação]",
    previewOrder: "[Encomenda]",
  },
  vi: {
    previewTask: "[Tác vụ]",
    previewQuote: "[Lịch sử trò chuyện]",
    previewOrder: "[Đơn hàng]",
  },
  tr: {
    previewTask: "[Görev]",
    previewQuote: "[Sohbet geçmişi]",
    previewOrder: "[Sipariş]",
  },
  ja: {
    previewTask: "[タスク]",
    previewQuote: "[チャット履歴]",
    previewOrder: "[注文]",
  },
  ko: {
    previewTask: "[작업]",
    previewQuote: "[채팅 기록]",
    previewOrder: "[주문]",
  },
  ar: {
    previewTask: "[مهمة]",
    previewQuote: "[سجل الدردشة]",
    previewOrder: "[طلب]",
  },
  th: {
    previewTask: "[งาน]",
    previewQuote: "[ประวัติแชต]",
    previewOrder: "[คำสั่งซื้อ]",
  },
  hi: {
    previewTask: "[टास्क]",
    previewQuote: "[चैट इतिहास]",
    previewOrder: "[ऑर्डर]",
  },
};

export function ssUlCopy(locale: Locale): Record<string, string> {
  const table = locale === "zh" ? SS_UL_COPY : translations[locale];
  return Object.fromEntries((Object.keys(SS_UL_COPY) as (keyof Copy)[]).map(key => [SS_UL_COPY[key], table[key]]));
}
