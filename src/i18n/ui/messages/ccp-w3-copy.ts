// W3: message list navigation.
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = { latest: "最新消息" } as const;

export const CCP_W3_MESSAGES = assembleCopy(SOURCE, {
  en: { latest: "Latest messages" },
  de: { latest: "Neueste Nachrichten" },
  es: { latest: "Últimos mensajes" },
  "es-419": { latest: "Últimos mensajes" },
  fr: { latest: "Derniers messages" },
  it: { latest: "Ultimi messaggi" },
  "pt-BR": { latest: "Mensagens recentes" },
  "pt-PT": { latest: "Mensagens recentes" },
  vi: { latest: "Tin nhắn mới nhất" },
  tr: { latest: "Son mesajlar" },
  "zh-TW": { latest: "最新訊息" },
  ja: { latest: "最新のメッセージ" },
  ko: { latest: "최신 메시지" },
  ar: { latest: "أحدث الرسائل" },
  th: { latest: "ข้อความล่าสุด" },
  hi: { latest: "नवीनतम संदेश" },
});
