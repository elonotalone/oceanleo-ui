import type { Locale } from "../../config";

// Wave 2026-11-20 MC: the task page's line when the task's OceanLeo tools did not connect (B5).
// Bind each translation to its source key; row order must never change its meaning.
const ZH = {
  "OceanLeo 工具暂时无法在这个任务中使用。": "OceanLeo 工具暂时无法在这个任务中使用。",
} as const;
type Copy = Record<keyof typeof ZH, string>;

const COPY: Record<Exclude<Locale, "zh">, Copy> = {
  "de": { "OceanLeo 工具暂时无法在这个任务中使用。": "OceanLeo-Tools sind in dieser Aufgabe gerade nicht verfügbar." },
  "en": { "OceanLeo 工具暂时无法在这个任务中使用。": "OceanLeo tools are not available in this task right now." },
  "es": { "OceanLeo 工具暂时无法在这个任务中使用。": "Las herramientas de OceanLeo no están disponibles en esta tarea por ahora." },
  "es-419": { "OceanLeo 工具暂时无法在这个任务中使用。": "Las herramientas de OceanLeo no están disponibles en esta tarea por ahora." },
  "fr": { "OceanLeo 工具暂时无法在这个任务中使用。": "Les outils OceanLeo ne sont pas disponibles dans cette tâche pour le moment." },
  "it": { "OceanLeo 工具暂时无法在这个任务中使用。": "Gli strumenti OceanLeo non sono disponibili in questa attività al momento." },
  "pt-BR": { "OceanLeo 工具暂时无法在这个任务中使用。": "As ferramentas do OceanLeo não estão disponíveis nesta tarefa no momento." },
  "pt-PT": { "OceanLeo 工具暂时无法在这个任务中使用。": "As ferramentas do OceanLeo não estão disponíveis nesta tarefa de momento." },
  "vi": { "OceanLeo 工具暂时无法在这个任务中使用。": "Công cụ OceanLeo hiện không dùng được trong tác vụ này." },
  "tr": { "OceanLeo 工具暂时无法在这个任务中使用。": "OceanLeo araçları şu anda bu görevde kullanılamıyor." },
  "zh-TW": { "OceanLeo 工具暂时无法在这个任务中使用。": "OceanLeo 工具暫時無法在這個任務中使用。" },
  "ja": { "OceanLeo 工具暂时无法在这个任务中使用。": "このタスクでは現在 OceanLeo のツールを使えません。" },
  "ko": { "OceanLeo 工具暂时无法在这个任务中使用。": "지금은 이 작업에서 OceanLeo 도구를 사용할 수 없습니다." },
  "ar": { "OceanLeo 工具暂时无法在这个任务中使用。": "أدوات OceanLeo غير متاحة في هذه المهمة حاليًا." },
  "th": { "OceanLeo 工具暂时无法在这个任务中使用。": "ขณะนี้ใช้เครื่องมือ OceanLeo ในงานนี้ไม่ได้" },
  "hi": { "OceanLeo 工具暂时无法在这个任务中使用。": "इस कार्य में अभी OceanLeo टूल उपलब्ध नहीं हैं।" },
};

export function rwMcCopy(locale: Locale): Record<string, string> {
  return locale === "zh" ? { ...ZH } : { ...COPY[locale] };
}
