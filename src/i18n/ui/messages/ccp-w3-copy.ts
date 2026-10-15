// W3: message list navigation.
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  latest: "最新消息",
  olderHistory: "向上滑动查看更早的对话",
} as const;

export const CCP_W3_MESSAGES = assembleCopy(SOURCE, {
  en: {
    latest: "Latest messages",
    olderHistory: "Scroll up for earlier messages",
  },
  de: {
    latest: "Neueste Nachrichten",
    olderHistory: "Nach oben scrollen für frühere Nachrichten",
  },
  es: {
    latest: "Últimos mensajes",
    olderHistory: "Desplázate hacia arriba para ver mensajes anteriores",
  },
  "es-419": {
    latest: "Últimos mensajes",
    olderHistory: "Desplázate hacia arriba para ver mensajes anteriores",
  },
  fr: {
    latest: "Derniers messages",
    olderHistory: "Faites défiler vers le haut pour les messages plus anciens",
  },
  it: {
    latest: "Ultimi messaggi",
    olderHistory: "Scorri verso l'alto per i messaggi precedenti",
  },
  "pt-BR": {
    latest: "Mensagens recentes",
    olderHistory: "Role para cima para ver mensagens anteriores",
  },
  "pt-PT": {
    latest: "Mensagens recentes",
    olderHistory: "Desloque para cima para ver mensagens anteriores",
  },
  vi: {
    latest: "Tin nhắn mới nhất",
    olderHistory: "Vuốt lên để xem tin nhắn cũ hơn",
  },
  tr: {
    latest: "Son mesajlar",
    olderHistory: "Daha eski iletiler için yukarı kaydırın",
  },
  "zh-TW": {
    latest: "最新訊息",
    olderHistory: "向上滑動查看更早的對話",
  },
  ja: {
    latest: "最新のメッセージ",
    olderHistory: "上にスクロールして以前の会話を表示",
  },
  ko: {
    latest: "최신 메시지",
    olderHistory: "위로 밀어 이전 대화를 보세요",
  },
  ar: {
    latest: "أحدث الرسائل",
    olderHistory: "مرّر لأعلى لعرض المحادثات الأقدم",
  },
  th: {
    latest: "ข้อความล่าสุด",
    olderHistory: "เลื่อนขึ้นเพื่อดูข้อความก่อนหน้า",
  },
  hi: {
    latest: "नवीनतम संदेश",
    olderHistory: "पुराने संदेश देखने के लिए ऊपर स्क्रोल करें",
  },
});
