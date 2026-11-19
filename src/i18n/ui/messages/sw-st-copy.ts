import type { Locale } from "../../config";

/** Sidebar title only; the main navigation keeps its existing name. */
const TITLES: Record<Locale, string> = {
  de: "Aufgaben", en: "Tasks", es: "Tareas", "es-419": "Tareas", fr: "Tâches", it: "Attività",
  "pt-BR": "Tarefas", "pt-PT": "Tarefas", vi: "Nhiệm vụ", tr: "Görevler", zh: "任务", "zh-TW": "任務",
  ja: "タスク", ko: "작업", ar: "المهام", th: "งาน", hi: "कार्य",
};

export function swSTCopy(locale: Locale): Record<string, string> {
  return { "侧栏任务": TITLES[locale] };
}
