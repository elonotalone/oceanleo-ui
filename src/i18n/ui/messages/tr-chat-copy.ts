import type { Locale } from "../../config";

// Task rooms wave (2026-11-20) TU3 copy that is still used after the session / sites wave (2026-11-21) removed task
// rows, start-task, sub-task rows and "Send to people". Bind each translation to its source key.
const ZH = {
  "任务": "任务",
  "任务名称": "任务名称",
  "正在创建…": "正在创建…",
  "开任务": "开任务",
  "问 leo": "问 leo",
} as const;
type Copy = Record<keyof typeof ZH, string>;

const COPY: Record<Exclude<Locale, "zh">, Copy> = {
  "en": {
    "任务": "Task",
    "任务名称": "Task name",
    "正在创建…": "Creating…",
    "开任务": "Start task",
    "问 leo": "Ask leo",
  },
  "zh-TW": {
    "任务": "任務",
    "任务名称": "任務名稱",
    "正在创建…": "正在建立…",
    "开任务": "開任務",
    "问 leo": "問 leo",
  },
  "de": {
    "任务": "Aufgabe",
    "任务名称": "Name der Aufgabe",
    "正在创建…": "Wird erstellt…",
    "开任务": "Aufgabe starten",
    "问 leo": "leo fragen",
  },
  "es": {
    "任务": "Tarea",
    "任务名称": "Nombre de la tarea",
    "正在创建…": "Creando…",
    "开任务": "Iniciar tarea",
    "问 leo": "Preguntar a leo",
  },
  "es-419": {
    "任务": "Tarea",
    "任务名称": "Nombre de la tarea",
    "正在创建…": "Creando…",
    "开任务": "Iniciar tarea",
    "问 leo": "Preguntarle a leo",
  },
  "fr": {
    "任务": "Tâche",
    "任务名称": "Nom de la tâche",
    "正在创建…": "Création…",
    "开任务": "Lancer une tâche",
    "问 leo": "Demander à leo",
  },
  "it": {
    "任务": "Attività",
    "任务名称": "Nome dell’attività",
    "正在创建…": "Creazione…",
    "开任务": "Avvia attività",
    "问 leo": "Chiedi a leo",
  },
  "pt-BR": {
    "任务": "Tarefa",
    "任务名称": "Nome da tarefa",
    "正在创建…": "Criando…",
    "开任务": "Iniciar tarefa",
    "问 leo": "Perguntar ao leo",
  },
  "pt-PT": {
    "任务": "Tarefa",
    "任务名称": "Nome da tarefa",
    "正在创建…": "A criar…",
    "开任务": "Iniciar tarefa",
    "问 leo": "Perguntar ao leo",
  },
  "vi": {
    "任务": "Nhiệm vụ",
    "任务名称": "Tên tác vụ",
    "正在创建…": "Đang tạo…",
    "开任务": "Bắt đầu nhiệm vụ",
    "问 leo": "Hỏi leo",
  },
  "tr": {
    "任务": "Görev",
    "任务名称": "Görev adı",
    "正在创建…": "Oluşturuluyor…",
    "开任务": "Görev başlat",
    "问 leo": "leo’ya sor",
  },
  "ja": {
    "任务": "タスク",
    "任务名称": "タスク名",
    "正在创建…": "作成中…",
    "开任务": "タスクを始める",
    "问 leo": "leo に聞く",
  },
  "ko": {
    "任务": "작업",
    "任务名称": "작업 이름",
    "正在创建…": "만드는 중…",
    "开任务": "작업 시작",
    "问 leo": "leo에게 묻기",
  },
  "ar": {
    "任务": "مهمة",
    "任务名称": "اسم المهمة",
    "正在创建…": "جارٍ الإنشاء…",
    "开任务": "بدء مهمة",
    "问 leo": "اسأل leo",
  },
  "th": {
    "任务": "งาน",
    "任务名称": "ชื่องาน",
    "正在创建…": "กำลังสร้าง…",
    "开任务": "เริ่มงาน",
    "问 leo": "ถาม leo",
  },
  "hi": {
    "任务": "टास्क",
    "任务名称": "कार्य का नाम",
    "正在创建…": "बनाया जा रहा है…",
    "开任务": "टास्क शुरू करें",
    "问 leo": "leo से पूछें",
  }
};

export function trChatCopy(locale: Locale): Record<string, string> {
  return locale === "zh" ? { ...ZH } : { ...COPY[locale] };
}
