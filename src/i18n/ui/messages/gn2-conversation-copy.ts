import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "error": "会话选项未能加载：{message}",
  "commands": "可用命令",
  "context": "上下文用量",
  "used": "上下文已用 {percent}%",
  "fork": "复制成新任务"
} as const;

export const GN2_CONVERSATION_MESSAGES = assembleCopy(SOURCE, {
  "en": {
    "error": "Could not load session controls: {message}",
    "commands": "Available commands",
    "context": "Context usage",
    "used": "Context used {percent}%",
    "fork": "Copy to a new task"
  },
  "zh-TW": {
    "error": "無法載入會話選項：{message}",
    "commands": "可用命令",
    "context": "上下文用量",
    "used": "上下文已用 {percent}%",
    "fork": "複製成新任務"
  },
  "ja": {
    "error": "セッション設定を読み込めませんでした：{message}",
    "commands": "使用可能なコマンド",
    "context": "コンテキスト使用量",
    "used": "コンテキスト使用率 {percent}%",
    "fork": "新しいタスクにコピー"
  },
  "ko": {
    "error": "세션 옵션을 불러오지 못했습니다: {message}",
    "commands": "사용 가능한 명령",
    "context": "컨텍스트 사용량",
    "used": "컨텍스트 {percent}% 사용",
    "fork": "새 작업으로 복사"
  },
  "de": {
    "error": "Sitzungsoptionen konnten nicht geladen werden: {message}",
    "commands": "Verfügbare Befehle",
    "context": "Kontextnutzung",
    "used": "Kontext zu {percent}% genutzt",
    "fork": "In neue Aufgabe kopieren"
  },
  "fr": {
    "error": "Impossible de charger les options de session : {message}",
    "commands": "Commandes disponibles",
    "context": "Utilisation du contexte",
    "used": "Contexte utilisé à {percent}%",
    "fork": "Copier dans une nouvelle tâche"
  },
  "es": {
    "error": "No se pudieron cargar las opciones de sesión: {message}",
    "commands": "Comandos disponibles",
    "context": "Uso del contexto",
    "used": "Contexto usado: {percent}%",
    "fork": "Copiar a una tarea nueva"
  },
  "es-419": {
    "error": "No se pudieron cargar las opciones de sesión: {message}",
    "commands": "Comandos disponibles",
    "context": "Uso del contexto",
    "used": "Contexto usado: {percent}%",
    "fork": "Copiar a una tarea nueva"
  },
  "it": {
    "error": "Impossibile caricare le opzioni della sessione: {message}",
    "commands": "Comandi disponibili",
    "context": "Utilizzo del contesto",
    "used": "Contesto utilizzato al {percent}%",
    "fork": "Copia in una nuova attività"
  },
  "pt-BR": {
    "error": "Não foi possível carregar as opções da sessão: {message}",
    "commands": "Comandos disponíveis",
    "context": "Uso do contexto",
    "used": "Contexto usado: {percent}%",
    "fork": "Copiar para uma nova tarefa"
  },
  "pt-PT": {
    "error": "Não foi possível carregar as opções da sessão: {message}",
    "commands": "Comandos disponíveis",
    "context": "Utilização do contexto",
    "used": "Contexto utilizado: {percent}%",
    "fork": "Copiar para uma nova tarefa"
  },
  "vi": {
    "error": "Không tải được tùy chọn phiên: {message}",
    "commands": "Lệnh có sẵn",
    "context": "Mức dùng ngữ cảnh",
    "used": "Đã dùng {percent}% ngữ cảnh",
    "fork": "Sao chép sang tác vụ mới"
  },
  "tr": {
    "error": "Oturum seçenekleri yüklenemedi: {message}",
    "commands": "Kullanılabilir komutlar",
    "context": "Bağlam kullanımı",
    "used": "Bağlamın %{percent} kadarı kullanıldı",
    "fork": "Yeni göreve kopyala"
  },
  "ar": {
    "error": "تعذر تحميل خيارات الجلسة: {message}",
    "commands": "الأوامر المتاحة",
    "context": "استخدام السياق",
    "used": "تم استخدام {percent}% من السياق",
    "fork": "نسخ إلى مهمة جديدة"
  },
  "th": {
    "error": "โหลดตัวเลือกเซสชันไม่ได้: {message}",
    "commands": "คำสั่งที่ใช้ได้",
    "context": "การใช้บริบท",
    "used": "ใช้บริบทแล้ว {percent}%",
    "fork": "คัดลอกไปยังงานใหม่"
  },
  "hi": {
    "error": "सत्र के विकल्प लोड नहीं हो सके: {message}",
    "commands": "उपलब्ध कमांड",
    "context": "संदर्भ का उपयोग",
    "used": "संदर्भ का {percent}% उपयोग हुआ",
    "fork": "नए कार्य में कॉपी करें"
  }
});
