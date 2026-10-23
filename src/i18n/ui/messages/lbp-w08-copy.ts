// 2026-10-23 leobay-projects 波 W08 的分表。只由 W08 改；注册在 shell-overhaul-copy.ts（父改）。
// 平台通知进 LeoChat（收件箱最上方的「通知」行、通知视图）的新文案。其余用到的词条（通知 / 还没有通知 / 全部标记已读 /
// 正在加载… / 加载更多 / 返回 / 重试 / 昨天 / 未读）基础词典里已有，不在这里重复。
// 「未读 {count} 条」会话行早就在用、却一直没有译文（全仓 tt() 闸的历史缺口）；通知行也用同一句，所以在这里补齐。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  noticesError: "通知暂时打不开",
  noticesEmptyHint: "订单、任务、账单和内容处置等平台消息会出现在这里。",
  unreadCount: "未读 {count} 条",
} as const;

export const LBP_W08_MESSAGES = assembleCopy(SOURCE, {
  "zh-TW": {
    noticesError: "通知暫時打不開",
    noticesEmptyHint: "訂單、任務、帳單和內容處置等平台訊息會出現在這裡。",
    unreadCount: "未讀 {count} 則",
  },
  en: {
    noticesError: "Couldn't open your notifications right now",
    noticesEmptyHint: "Platform messages about orders, tasks, billing and content actions appear here.",
    unreadCount: "{count} unread",
  },
  ja: {
    noticesError: "通知をいま開けません",
    noticesEmptyHint: "注文、タスク、請求、コンテンツ対応などのプラットフォームからのお知らせがここに表示されます。",
    unreadCount: "未読 {count} 件",
  },
  ko: {
    noticesError: "지금은 알림을 열 수 없습니다",
    noticesEmptyHint: "주문, 작업, 청구, 콘텐츠 조치 등 플랫폼 메시지가 여기에 표시됩니다.",
    unreadCount: "읽지 않음 {count}",
  },
  fr: {
    noticesError: "Impossible d'ouvrir vos notifications pour le moment",
    noticesEmptyHint:
      "Les messages de la plateforme (commandes, tâches, facturation, mesures sur le contenu…) apparaissent ici.",
    unreadCount: "{count} non lus",
  },
  de: {
    noticesError: "Deine Benachrichtigungen lassen sich gerade nicht öffnen",
    noticesEmptyHint:
      "Hier erscheinen Plattformmeldungen zu Bestellungen, Aufgaben, Abrechnung und Inhaltsmassnahmen.",
    unreadCount: "{count} ungelesen",
  },
  it: {
    noticesError: "Al momento non è possibile aprire le tue notifiche",
    noticesEmptyHint:
      "Qui compaiono i messaggi della piattaforma su ordini, attività, fatturazione e provvedimenti sul contenuto.",
    unreadCount: "{count} non letti",
  },
  es: {
    noticesError: "No se pueden abrir tus notificaciones ahora mismo",
    noticesEmptyHint:
      "Aquí aparecerán los mensajes de la plataforma sobre pedidos, tareas, facturación y medidas sobre el contenido.",
    unreadCount: "{count} sin leer",
  },
  "es-419": {
    noticesError: "No se pueden abrir tus notificaciones por ahora",
    noticesEmptyHint:
      "Aquí aparecerán los mensajes de la plataforma sobre pedidos, tareas, facturación y medidas sobre el contenido.",
    unreadCount: "{count} sin leer",
  },
  "pt-BR": {
    noticesError: "Não foi possível abrir suas notificações agora",
    noticesEmptyHint:
      "As mensagens da plataforma sobre pedidos, tarefas, cobrança e medidas sobre o conteúdo aparecem aqui.",
    unreadCount: "{count} não lidas",
  },
  "pt-PT": {
    noticesError: "Não foi possível abrir as suas notificações neste momento",
    noticesEmptyHint:
      "As mensagens da plataforma sobre pedidos, tarefas, faturação e medidas sobre o conteúdo aparecem aqui.",
    unreadCount: "{count} por ler",
  },
  ar: {
    noticesError: "تعذّر فتح الإشعارات الآن",
    noticesEmptyHint: "ستظهر هنا رسائل المنصة المتعلقة بالطلبات والمهام والفوترة وإجراءات المحتوى.",
    unreadCount: "{count} غير مقروءة",
  },
  hi: {
    noticesError: "अभी सूचनाएँ नहीं खुल पा रहीं",
    noticesEmptyHint: "ऑर्डर, कार्य, बिलिंग और सामग्री कार्रवाई जैसे प्लेटफ़ॉर्म संदेश यहाँ दिखाई देंगे।",
    unreadCount: "{count} अपठित",
  },
  th: {
    noticesError: "ตอนนี้ยังเปิดการแจ้งเตือนไม่ได้",
    noticesEmptyHint:
      "ข้อความจากแพลตฟอร์มเกี่ยวกับคำสั่งซื้อ งาน การเรียกเก็บเงิน และการจัดการเนื้อหาจะแสดงที่นี่",
    unreadCount: "ยังไม่อ่าน {count}",
  },
  vi: {
    noticesError: "Hiện chưa mở được thông báo",
    noticesEmptyHint:
      "Tin nhắn từ nền tảng về đơn hàng, tác vụ, thanh toán và xử lý nội dung sẽ hiện ở đây.",
    unreadCount: "{count} chưa đọc",
  },
  tr: {
    noticesError: "Bildirimleriniz şu anda açılamıyor",
    noticesEmptyHint:
      "Siparişler, görevler, faturalama ve içerik işlemleriyle ilgili platform mesajları burada görünür.",
    unreadCount: "{count} okunmamış",
  },
});
