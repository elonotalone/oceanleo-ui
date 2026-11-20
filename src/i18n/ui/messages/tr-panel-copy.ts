import type { Locale } from "../../config";

// TU2 (wave 2026-11-20 task rooms): the right panel's task stack, the task page beside its parent task, and
// "Discuss with people" in a sub task's header.
export const TR_PANEL_COPY = {
  trail: "任务路径",
  discuss: "和大家讨论",
  discussNote: "大家在任务里交流；这项智能体工作留在旁边继续。",
  discussStart: "开始讨论",
  discussFailed: "没能开始讨论，请重试。",
  inviteDiscuss: "邀请大家讨论",
} as const;
type Copy = Record<keyof typeof TR_PANEL_COPY, string>;

const es: Copy = {
  trail: "Ruta de la tarea",
  discuss: "Hablar con personas",
  discussNote: "Las personas hablan en la tarea; este trabajo del agente sigue abierto al lado.",
  discussStart: "Empezar a hablar",
  discussFailed: "No se pudo empezar la conversación. Inténtalo de nuevo.",
  inviteDiscuss: "Invitar a hablar",
};

const pt: Copy = {
  trail: "Caminho da tarefa",
  discuss: "Conversar com pessoas",
  discussNote: "As pessoas conversam na tarefa; este trabalho do agente continua aberto ao lado.",
  discussStart: "Começar conversa",
  discussFailed: "Não foi possível começar a conversa. Tente novamente.",
  inviteDiscuss: "Convidar para conversar",
};

const translations: Record<Exclude<Locale, "zh">, Copy> = {
  en: {
    trail: "Task path",
    discuss: "Discuss with people",
    discussNote: "People talk in the task; this agent work stays open beside it.",
    discussStart: "Start discussion",
    discussFailed: "Couldn't start the discussion. Try again.",
    inviteDiscuss: "Invite people to discuss",
  },
  "zh-TW": {
    trail: "任務路徑",
    discuss: "和大家討論",
    discussNote: "大家在任務裡交流；這項智慧體工作留在旁邊繼續。",
    discussStart: "開始討論",
    discussFailed: "沒能開始討論，請重試。",
    inviteDiscuss: "邀請大家討論",
  },
  de: {
    trail: "Aufgabenpfad",
    discuss: "Mit Personen besprechen",
    discussNote: "Personen sprechen in der Aufgabe; diese Agentenarbeit bleibt daneben offen.",
    discussStart: "Besprechung starten",
    discussFailed: "Die Besprechung konnte nicht gestartet werden. Versuche es erneut.",
    inviteDiscuss: "Personen zur Besprechung einladen",
  },
  es,
  "es-419": {
    ...es,
  },
  fr: {
    trail: "Chemin de la tâche",
    discuss: "Discuter avec des personnes",
    discussNote: "Les personnes échangent dans la tâche ; ce travail de l’agent reste ouvert à côté.",
    discussStart: "Lancer la discussion",
    discussFailed: "Impossible de lancer la discussion. Réessayez.",
    inviteDiscuss: "Inviter des personnes à discuter",
  },
  it: {
    trail: "Percorso dell’attività",
    discuss: "Discuti con le persone",
    discussNote: "Le persone parlano nell’attività; questo lavoro dell’agente resta aperto accanto.",
    discussStart: "Avvia la discussione",
    discussFailed: "Impossibile avviare la discussione. Riprova.",
    inviteDiscuss: "Invita le persone a discutere",
  },
  "pt-BR": {
    ...pt,
  },
  "pt-PT": {
    ...pt,
    discussFailed: "Não foi possível começar a conversa. Tente de novo.",
  },
  vi: {
    trail: "Đường dẫn nhiệm vụ",
    discuss: "Thảo luận với mọi người",
    discussNote: "Mọi người trao đổi trong nhiệm vụ; công việc của tác tử này vẫn mở bên cạnh.",
    discussStart: "Bắt đầu thảo luận",
    discussFailed: "Không thể bắt đầu thảo luận. Hãy thử lại.",
    inviteDiscuss: "Mời mọi người thảo luận",
  },
  tr: {
    trail: "Görev yolu",
    discuss: "Kişilerle konuş",
    discussNote: "Kişiler görevde konuşur; bu ajan çalışması yanında açık kalır.",
    discussStart: "Konuşmayı başlat",
    discussFailed: "Konuşma başlatılamadı. Tekrar deneyin.",
    inviteDiscuss: "Kişileri konuşmaya davet et",
  },
  ja: {
    trail: "タスクの階層",
    discuss: "みんなで話し合う",
    discussNote: "メンバーはタスクで話し合い、このエージェントの作業はその横で開いたままです。",
    discussStart: "話し合いを始める",
    discussFailed: "話し合いを始められませんでした。もう一度お試しください。",
    inviteDiscuss: "みんなを話し合いに招待",
  },
  ko: {
    trail: "작업 경로",
    discuss: "사람들과 논의",
    discussNote: "사람들은 작업에서 대화하고, 이 에이전트 작업은 옆에 계속 열려 있습니다.",
    discussStart: "논의 시작",
    discussFailed: "논의를 시작하지 못했습니다. 다시 시도하세요.",
    inviteDiscuss: "사람들을 논의에 초대",
  },
  ar: {
    trail: "مسار المهمة",
    discuss: "ناقش مع الأشخاص",
    discussNote: "يتحدث الأشخاص في المهمة، ويبقى عمل الوكيل هذا مفتوحًا بجانبها.",
    discussStart: "ابدأ النقاش",
    discussFailed: "تعذّر بدء النقاش. حاول مرة أخرى.",
    inviteDiscuss: "ادعُ أشخاصًا للنقاش",
  },
  th: {
    trail: "เส้นทางงาน",
    discuss: "พูดคุยกับผู้คน",
    discussNote: "ผู้คนพูดคุยกันในงาน ส่วนงานของเอเจนต์นี้ยังเปิดอยู่ด้านข้าง",
    discussStart: "เริ่มพูดคุย",
    discussFailed: "เริ่มการพูดคุยไม่สำเร็จ ลองอีกครั้ง",
    inviteDiscuss: "ชวนผู้คนมาพูดคุย",
  },
  hi: {
    trail: "कार्य का रास्ता",
    discuss: "लोगों से चर्चा करें",
    discussNote: "लोग कार्य में बात करते हैं; यह एजेंट का काम उसके बगल में खुला रहता है।",
    discussStart: "चर्चा शुरू करें",
    discussFailed: "चर्चा शुरू नहीं हो सकी। फिर कोशिश करें।",
    inviteDiscuss: "लोगों को चर्चा के लिए बुलाएँ",
  },
};

export function trPanelCopy(locale: Locale): Record<string, string> {
  const table = locale === "zh" ? TR_PANEL_COPY : translations[locale];
  return Object.fromEntries((Object.keys(TR_PANEL_COPY) as (keyof Copy)[]).map(key => [TR_PANEL_COPY[key], table[key]]));
}
