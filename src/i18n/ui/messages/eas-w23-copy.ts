// 2026-09-24 editors-and-shell 波 W23 的分表。只由 W23 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W23_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "正在打开": "正在打开",
} as const;

export const EAS_W23_MESSAGES = assembleCopy(SOURCE, {
  en: { "正在打开": "Opening" },
  de: { "正在打开": "Wird geöffnet" },
  es: { "正在打开": "Abriendo" },
  "es-419": { "正在打开": "Abriendo" },
  fr: { "正在打开": "Ouverture" },
  it: { "正在打开": "Apertura" },
  "pt-BR": { "正在打开": "Abrindo" },
  "pt-PT": { "正在打开": "A abrir" },
  vi: { "正在打开": "Đang mở" },
  tr: { "正在打开": "Açılıyor" },
  "zh-TW": { "正在打开": "正在開啟" },
  ja: { "正在打开": "開いています" },
  ko: { "正在打开": "여는 중" },
  ar: { "正在打开": "جار الفتح" },
  th: { "正在打开": "กำลังเปิด" },
  hi: { "正在打开": "खोल रहे हैं" },
});
