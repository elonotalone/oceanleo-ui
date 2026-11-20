import type { Locale } from "../../config";

export const SS_FU_COPY = {
  "allMessages": "全部消息",
  "taskLimit": "仅转发最新的 2000 条消息到任务。",
  "quoteLimit": "引用仅能容纳最新的 500 条消息。"
} as const;

const translations: Record<Locale, readonly string[]> = {
  "zh": [
    "全部消息",
    "仅转发最新的 2000 条消息到任务。",
    "引用仅能容纳最新的 500 条消息。"
  ],
  "en": [
    "All messages",
    "Only the newest 2000 messages will be forwarded to a task.",
    "Only the newest 500 messages fit in a quote."
  ],
  "zh-TW": [
    "全部訊息",
    "僅轉發最新的 2000 則訊息到任務。",
    "引用僅能容納最新的 500 則訊息。"
  ],
  "de": [
    "Alle Nachrichten",
    "Nur die neuesten 2000 Nachrichten werden an eine Aufgabe weitergeleitet.",
    "In ein Zitat passen nur die neuesten 500 Nachrichten."
  ],
  "es": [
    "Todos los mensajes",
    "Solo se reenviarán los 2000 mensajes más recientes a una tarea.",
    "Solo caben los 500 mensajes más recientes en una cita."
  ],
  "es-419": [
    "Todos los mensajes",
    "Solo se reenviarán los 2000 mensajes más recientes a una tarea.",
    "Solo caben los 500 mensajes más recientes en una cita."
  ],
  "fr": [
    "Tous les messages",
    "Seuls les 2000 messages les plus récents seront transférés vers une tâche.",
    "Seuls les 500 messages les plus récents tiennent dans une citation."
  ],
  "it": [
    "Tutti i messaggi",
    "Solo i 2000 messaggi più recenti verranno inoltrati a un’attività.",
    "Una citazione può contenere solo i 500 messaggi più recenti."
  ],
  "pt-BR": [
    "Todas as mensagens",
    "Só as 2000 mensagens mais recentes serão encaminhadas para uma tarefa.",
    "Só as 500 mensagens mais recentes cabem numa citação."
  ],
  "pt-PT": [
    "Todas as mensagens",
    "Só as 2000 mensagens mais recentes serão reencaminhadas para uma tarefa.",
    "Só as 500 mensagens mais recentes cabem numa citação."
  ],
  "vi": [
    "Tất cả tin nhắn",
    "Chỉ chuyển tiếp 2000 tin nhắn mới nhất đến tác vụ.",
    "Trích dẫn chỉ chứa được 500 tin nhắn mới nhất."
  ],
  "tr": [
    "Tüm mesajlar",
    "Bir göreve yalnızca en yeni 2000 mesaj iletilecek.",
    "Bir alıntıya yalnızca en yeni 500 mesaj sığar."
  ],
  "ja": [
    "すべてのメッセージ",
    "タスクには最新の2000件のみ転送されます。",
    "引用に含められるのは最新の500件のみです。"
  ],
  "ko": [
    "모든 메시지",
    "작업에는 최신 메시지 2000개만 전달됩니다.",
    "인용에는 최신 메시지 500개만 담을 수 있습니다."
  ],
  "ar": [
    "كل الرسائل",
    "ستتم إعادة توجيه أحدث 2000 رسالة فقط إلى المهمة.",
    "لا يتسع الاقتباس إلا لأحدث 500 رسالة."
  ],
  "th": [
    "ข้อความทั้งหมด",
    "จะส่งต่อเฉพาะ 2000 ข้อความล่าสุดไปยังงาน",
    "คำอ้างอิงใส่ได้เฉพาะ 500 ข้อความล่าสุด"
  ],
  "hi": [
    "सभी संदेश",
    "कार्य में केवल नवीनतम 2000 संदेश फ़ॉरवर्ड किए जाएँगे।",
    "उद्धरण में केवल नवीनतम 500 संदेश समा सकते हैं।"
  ]
};

export function ssFuCopy(locale: Locale): Record<string, string> {
  return Object.fromEntries(Object.values(SS_FU_COPY).map((key, index) => [key, translations[locale][index]]));
}
