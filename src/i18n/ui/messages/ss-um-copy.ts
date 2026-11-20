import type { Locale } from "../../config";

// LeoChat / session composer (session / sites wave 2026-11-21, unit UM): the attach menu's "Task" page that
// posts a task card into a project session, and the @leo icon button. Key = Simplified Chinese source, as in
// the rest of `shell/messages/**`.
const ZH = {
  "问 leo": "问 leo",
  "选一个任务": "选一个任务",
  "搜索我的任务": "搜索我的任务",
  "没有找到任务": "没有找到任务",
  "没能加载任务列表": "没能加载任务列表",
  "没能发出任务卡片，请重试。": "没能发出任务卡片，请重试。",
} as const;
type Copy = Record<keyof typeof ZH, string>;

const COPY: Record<Exclude<Locale, "zh">, Copy> = {
  "en": {
    "问 leo": "Ask leo",
    "选一个任务": "Choose a task",
    "搜索我的任务": "Search my tasks",
    "没有找到任务": "No tasks found",
    "没能加载任务列表": "Couldn't load your tasks",
    "没能发出任务卡片，请重试。": "Couldn't share the task. Try again.",
  },
  "zh-TW": {
    "问 leo": "問 leo",
    "选一个任务": "選一個任務",
    "搜索我的任务": "搜尋我的任務",
    "没有找到任务": "找不到任務",
    "没能加载任务列表": "無法載入任務清單",
    "没能发出任务卡片，请重试。": "無法送出任務卡片，請再試一次。",
  },
  "de": {
    "问 leo": "leo fragen",
    "选一个任务": "Aufgabe auswählen",
    "搜索我的任务": "Meine Aufgaben durchsuchen",
    "没有找到任务": "Keine Aufgaben gefunden",
    "没能加载任务列表": "Aufgaben konnten nicht geladen werden",
    "没能发出任务卡片，请重试。": "Die Aufgabe konnte nicht geteilt werden. Versuche es erneut.",
  },
  "es": {
    "问 leo": "Preguntar a leo",
    "选一个任务": "Elige una tarea",
    "搜索我的任务": "Buscar en mis tareas",
    "没有找到任务": "No se encontraron tareas",
    "没能加载任务列表": "No se pudieron cargar tus tareas",
    "没能发出任务卡片，请重试。": "No se pudo compartir la tarea. Inténtalo de nuevo.",
  },
  "es-419": {
    "问 leo": "Preguntarle a leo",
    "选一个任务": "Elige una tarea",
    "搜索我的任务": "Buscar en mis tareas",
    "没有找到任务": "No se encontraron tareas",
    "没能加载任务列表": "No se pudieron cargar tus tareas",
    "没能发出任务卡片，请重试。": "No se pudo compartir la tarea. Vuelve a intentarlo.",
  },
  "fr": {
    "问 leo": "Demander à leo",
    "选一个任务": "Choisir une tâche",
    "搜索我的任务": "Rechercher dans mes tâches",
    "没有找到任务": "Aucune tâche trouvée",
    "没能加载任务列表": "Impossible de charger vos tâches",
    "没能发出任务卡片，请重试。": "Impossible de partager la tâche. Réessayez.",
  },
  "it": {
    "问 leo": "Chiedi a leo",
    "选一个任务": "Scegli un'attività",
    "搜索我的任务": "Cerca nelle mie attività",
    "没有找到任务": "Nessuna attività trovata",
    "没能加载任务列表": "Impossibile caricare le tue attività",
    "没能发出任务卡片，请重试。": "Impossibile condividere l'attività. Riprova.",
  },
  "pt-BR": {
    "问 leo": "Perguntar ao leo",
    "选一个任务": "Escolha uma tarefa",
    "搜索我的任务": "Pesquisar minhas tarefas",
    "没有找到任务": "Nenhuma tarefa encontrada",
    "没能加载任务列表": "Não foi possível carregar suas tarefas",
    "没能发出任务卡片，请重试。": "Não foi possível compartilhar a tarefa. Tente de novo.",
  },
  "pt-PT": {
    "问 leo": "Perguntar ao leo",
    "选一个任务": "Escolha uma tarefa",
    "搜索我的任务": "Pesquisar as minhas tarefas",
    "没有找到任务": "Nenhuma tarefa encontrada",
    "没能加载任务列表": "Não foi possível carregar as suas tarefas",
    "没能发出任务卡片，请重试。": "Não foi possível partilhar a tarefa. Tente novamente.",
  },
  "vi": {
    "问 leo": "Hỏi leo",
    "选一个任务": "Chọn một tác vụ",
    "搜索我的任务": "Tìm trong tác vụ của tôi",
    "没有找到任务": "Không tìm thấy tác vụ",
    "没能加载任务列表": "Không tải được danh sách tác vụ",
    "没能发出任务卡片，请重试。": "Không chia sẻ được tác vụ. Hãy thử lại.",
  },
  "tr": {
    "问 leo": "leo’ya sor",
    "选一个任务": "Bir görev seçin",
    "搜索我的任务": "Görevlerimde ara",
    "没有找到任务": "Görev bulunamadı",
    "没能加载任务列表": "Görevleriniz yüklenemedi",
    "没能发出任务卡片，请重试。": "Görev paylaşılamadı. Tekrar deneyin.",
  },
  "ja": {
    "问 leo": "leo に聞く",
    "选一个任务": "タスクを選択",
    "搜索我的任务": "自分のタスクを検索",
    "没有找到任务": "タスクが見つかりません",
    "没能加载任务列表": "タスクを読み込めませんでした",
    "没能发出任务卡片，请重试。": "タスクを共有できませんでした。もう一度お試しください。",
  },
  "ko": {
    "问 leo": "leo에게 묻기",
    "选一个任务": "작업 선택",
    "搜索我的任务": "내 작업 검색",
    "没有找到任务": "작업을 찾을 수 없습니다",
    "没能加载任务列表": "작업을 불러오지 못했습니다",
    "没能发出任务卡片，请重试。": "작업을 공유하지 못했습니다. 다시 시도하세요.",
  },
  "ar": {
    "问 leo": "اسأل leo",
    "选一个任务": "اختر مهمة",
    "搜索我的任务": "ابحث في مهامي",
    "没有找到任务": "لم يتم العثور على مهام",
    "没能加载任务列表": "تعذّر تحميل مهامك",
    "没能发出任务卡片，请重试。": "تعذّرت مشاركة المهمة. حاول مرة أخرى.",
  },
  "th": {
    "问 leo": "ถาม leo",
    "选一个任务": "เลือกงาน",
    "搜索我的任务": "ค้นหางานของฉัน",
    "没有找到任务": "ไม่พบงาน",
    "没能加载任务列表": "โหลดงานของคุณไม่ได้",
    "没能发出任务卡片，请重试。": "แชร์งานไม่สำเร็จ ลองอีกครั้ง",
  },
  "hi": {
    "问 leo": "leo से पूछें",
    "选一个任务": "एक कार्य चुनें",
    "搜索我的任务": "मेरे कार्य खोजें",
    "没有找到任务": "कोई कार्य नहीं मिला",
    "没能加载任务列表": "आपके कार्य लोड नहीं हो सके",
    "没能发出任务卡片，请重试。": "कार्य साझा नहीं हो सका। फिर से कोशिश करें।",
  },
};

export const SS_UM_COPY_SOURCE = ZH;

export function ssUmCopy(locale: Locale): Record<string, string> {
  return locale === "zh" ? { ...ZH } : { ...COPY[locale] };
}
