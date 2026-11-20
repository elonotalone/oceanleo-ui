import type { Locale } from "../../config";

// UC (session / sites wave 2026-11-21): a conversation's Forward / Copy menu and the right-click message menu.
// Chinese source strings are the keys, as everywhere in `shell/messages/**`.
export const SS_UC_COPY = {
  forwardOrCopy: "转发或复制",
  messageActions: "消息操作",
  loadingEarlier: "正在加载更早的消息…",
  selectCap: "最多选择 {count} 条消息。",
} as const;
type Copy = Record<keyof typeof SS_UC_COPY, string>;

const es: Copy = {
  forwardOrCopy: "Reenviar o copiar",
  messageActions: "Acciones del mensaje",
  loadingEarlier: "Cargando mensajes anteriores…",
  selectCap: "Puedes seleccionar hasta {count} mensajes.",
};

const pt: Copy = {
  forwardOrCopy: "Encaminhar ou copiar",
  messageActions: "Ações da mensagem",
  loadingEarlier: "A carregar mensagens anteriores…",
  selectCap: "Pode selecionar até {count} mensagens.",
};

const translations: Record<Exclude<Locale, "zh">, Copy> = {
  en: {
    forwardOrCopy: "Forward or copy",
    messageActions: "Message actions",
    loadingEarlier: "Loading earlier messages…",
    selectCap: "You can select up to {count} messages.",
  },
  "zh-TW": {
    forwardOrCopy: "轉發或複製",
    messageActions: "訊息操作",
    loadingEarlier: "正在載入更早的訊息…",
    selectCap: "最多選擇 {count} 則訊息。",
  },
  de: {
    forwardOrCopy: "Weiterleiten oder kopieren",
    messageActions: "Nachrichtenaktionen",
    loadingEarlier: "Ältere Nachrichten werden geladen…",
    selectCap: "Du kannst bis zu {count} Nachrichten auswählen.",
  },
  es,
  "es-419": {
    ...es,
  },
  fr: {
    forwardOrCopy: "Transférer ou copier",
    messageActions: "Actions du message",
    loadingEarlier: "Chargement des messages précédents…",
    selectCap: "Vous pouvez sélectionner jusqu’à {count} messages.",
  },
  it: {
    forwardOrCopy: "Inoltra o copia",
    messageActions: "Azioni del messaggio",
    loadingEarlier: "Caricamento dei messaggi precedenti…",
    selectCap: "Puoi selezionare fino a {count} messaggi.",
  },
  "pt-BR": {
    ...pt,
    loadingEarlier: "Carregando mensagens anteriores…",
    selectCap: "Você pode selecionar até {count} mensagens.",
  },
  "pt-PT": {
    ...pt,
  },
  vi: {
    forwardOrCopy: "Chuyển tiếp hoặc sao chép",
    messageActions: "Thao tác tin nhắn",
    loadingEarlier: "Đang tải tin nhắn cũ hơn…",
    selectCap: "Bạn có thể chọn tối đa {count} tin nhắn.",
  },
  tr: {
    forwardOrCopy: "İlet veya kopyala",
    messageActions: "Mesaj işlemleri",
    loadingEarlier: "Önceki mesajlar yükleniyor…",
    selectCap: "En fazla {count} mesaj seçebilirsiniz.",
  },
  ja: {
    forwardOrCopy: "転送またはコピー",
    messageActions: "メッセージの操作",
    loadingEarlier: "以前のメッセージを読み込み中…",
    selectCap: "選択できるのは最大 {count} 件です。",
  },
  ko: {
    forwardOrCopy: "전달 또는 복사",
    messageActions: "메시지 작업",
    loadingEarlier: "이전 메시지를 불러오는 중…",
    selectCap: "최대 {count}개의 메시지를 선택할 수 있습니다.",
  },
  ar: {
    forwardOrCopy: "إعادة التوجيه أو النسخ",
    messageActions: "إجراءات الرسالة",
    loadingEarlier: "جارٍ تحميل الرسائل الأقدم…",
    selectCap: "يمكنك تحديد ما يصل إلى {count} رسالة.",
  },
  th: {
    forwardOrCopy: "ส่งต่อหรือคัดลอก",
    messageActions: "การทำงานกับข้อความ",
    loadingEarlier: "กำลังโหลดข้อความก่อนหน้า…",
    selectCap: "เลือกได้สูงสุด {count} ข้อความ",
  },
  hi: {
    forwardOrCopy: "फ़ॉरवर्ड या कॉपी करें",
    messageActions: "संदेश के विकल्प",
    loadingEarlier: "पुराने संदेश लोड हो रहे हैं…",
    selectCap: "आप अधिकतम {count} संदेश चुन सकते हैं।",
  },
};

export function ssUcCopy(locale: Locale): Record<string, string> {
  const table = locale === "zh" ? SS_UC_COPY : translations[locale];
  return Object.fromEntries((Object.keys(SS_UC_COPY) as (keyof Copy)[]).map(key => [SS_UC_COPY[key], table[key]]));
}
