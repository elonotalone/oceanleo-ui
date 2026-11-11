// 2026-10-24 skills-overhaul 波 W14 的分表。只由 W14 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const SKO_W14_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 门户项目页任务区（P/components/project/ProjectTasksTab.tsx）的新文案。
// 其余文字（「任务」「全部任务」「已共享」「仅自己可见」「任务菜单」「打开」…）已在词典里，直接复用。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  searchTasks: "搜索任务",
  // Family merge P9 removed the task-type filter; only the search remains.
  adjustFilters: "请调整搜索词。",
  taskCount: "{count} 个任务",
} as const;

export const SKO_W14_MESSAGES = assembleCopy(SOURCE, {
  de: {
    searchTasks: "Aufgaben suchen",
    adjustFilters: "Passe den Suchbegriff an.",
    taskCount: "{count} Aufgaben",
  },
  en: {
    searchTasks: "Search tasks",
    adjustFilters: "Adjust the search term.",
    taskCount: "{count} tasks",
  },
  es: {
    searchTasks: "Buscar tareas",
    adjustFilters: "Ajusta el término de búsqueda.",
    taskCount: "{count} tareas",
  },
  "es-419": {
    searchTasks: "Buscar tareas",
    adjustFilters: "Ajusta el término de búsqueda.",
    taskCount: "{count} tareas",
  },
  fr: {
    searchTasks: "Rechercher des tâches",
    adjustFilters: "Modifiez le terme de recherche.",
    taskCount: "{count} tâches",
  },
  it: {
    searchTasks: "Cerca attività",
    adjustFilters: "Modifica il termine di ricerca.",
    taskCount: "{count} attività",
  },
  "pt-BR": {
    searchTasks: "Buscar tarefas",
    adjustFilters: "Ajuste o termo de busca.",
    taskCount: "{count} tarefas",
  },
  "pt-PT": {
    searchTasks: "Pesquisar tarefas",
    adjustFilters: "Ajuste o termo de pesquisa.",
    taskCount: "{count} tarefas",
  },
  vi: {
    searchTasks: "Tìm nhiệm vụ",
    adjustFilters: "Hãy điều chỉnh từ khóa tìm kiếm.",
    taskCount: "{count} nhiệm vụ",
  },
  tr: {
    searchTasks: "Görev ara",
    adjustFilters: "Arama terimini değiştirin.",
    taskCount: "{count} görev",
  },
  "zh-TW": {
    searchTasks: "搜尋任務",
    adjustFilters: "請調整搜尋詞。",
    taskCount: "{count} 個任務",
  },
  ja: {
    searchTasks: "タスクを検索",
    adjustFilters: "検索語を変更してください。",
    taskCount: "{count} 件のタスク",
  },
  ko: {
    searchTasks: "작업 검색",
    adjustFilters: "검색어를 바꿔 보세요.",
    taskCount: "작업 {count}개",
  },
  ar: {
    searchTasks: "البحث في المهام",
    adjustFilters: "عدّل كلمة البحث.",
    taskCount: "{count} مهام",
  },
  th: {
    searchTasks: "ค้นหางาน",
    adjustFilters: "ลองปรับคำค้นหา",
    taskCount: "{count} งาน",
  },
  hi: {
    searchTasks: "कार्य खोजें",
    adjustFilters: "खोज शब्द बदलें।",
    taskCount: "{count} कार्य",
  },
});
