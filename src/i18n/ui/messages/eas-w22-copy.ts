// 2026-09-24 editors-and-shell 波 W22 的分表。只由 W22 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W22_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "第 {n} 页": "第 {n} 页",
} as const;

export const EAS_W22_MESSAGES = assembleCopy(SOURCE, {
  en: { "第 {n} 页": "Page {n}" },
  de: { "第 {n} 页": "Seite {n}" },
  es: { "第 {n} 页": "Página {n}" },
  "es-419": { "第 {n} 页": "Página {n}" },
  fr: { "第 {n} 页": "Page {n}" },
  it: { "第 {n} 页": "Pagina {n}" },
  "pt-BR": { "第 {n} 页": "Página {n}" },
  "pt-PT": { "第 {n} 页": "Página {n}" },
  vi: { "第 {n} 页": "Trang {n}" },
  tr: { "第 {n} 页": "Sayfa {n}" },
  "zh-TW": { "第 {n} 页": "第 {n} 頁" },
  ja: { "第 {n} 页": "{n} ページ" },
  ko: { "第 {n} 页": "{n}페이지" },
  ar: { "第 {n} 页": "الصفحة {n}" },
  th: { "第 {n} 页": "หน้า {n}" },
  hi: { "第 {n} 页": "पृष्ठ {n}" },
});
