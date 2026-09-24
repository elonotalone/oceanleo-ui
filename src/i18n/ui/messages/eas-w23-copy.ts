// 2026-09-24 editors-and-shell 波 W23 的分表。只由 W23 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W23_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "正在加载编辑器": "正在加载编辑器",
  "正在加载编辑器…": "正在加载编辑器…",
} as const;

export const EAS_W23_MESSAGES = assembleCopy(SOURCE, {
  en: { "正在加载编辑器": "Loading editor", "正在加载编辑器…": "Loading editor…" },
  de: { "正在加载编辑器": "Editor wird geladen", "正在加载编辑器…": "Editor wird geladen…" },
  es: { "正在加载编辑器": "Cargando el editor", "正在加载编辑器…": "Cargando el editor…" },
  "es-419": { "正在加载编辑器": "Cargando el editor", "正在加载编辑器…": "Cargando el editor…" },
  fr: { "正在加载编辑器": "Chargement de l’éditeur", "正在加载编辑器…": "Chargement de l’éditeur…" },
  it: { "正在加载编辑器": "Caricamento editor", "正在加载编辑器…": "Caricamento editor…" },
  "pt-BR": { "正在加载编辑器": "Carregando o editor", "正在加载编辑器…": "Carregando o editor…" },
  "pt-PT": { "正在加载编辑器": "A carregar o editor", "正在加载编辑器…": "A carregar o editor…" },
  vi: { "正在加载编辑器": "Đang tải trình chỉnh sửa", "正在加载编辑器…": "Đang tải trình chỉnh sửa…" },
  tr: { "正在加载编辑器": "Düzenleyici yükleniyor", "正在加载编辑器…": "Düzenleyici yükleniyor…" },
  "zh-TW": { "正在加载编辑器": "正在載入編輯器", "正在加载编辑器…": "正在載入編輯器…" },
  ja: { "正在加载编辑器": "エディターを読み込み中", "正在加载编辑器…": "エディターを読み込み中…" },
  ko: { "正在加载编辑器": "편집기를 불러오는 중", "正在加载编辑器…": "편집기를 불러오는 중…" },
  ar: { "正在加载编辑器": "جار تحميل المحرر", "正在加载编辑器…": "جار تحميل المحرر…" },
  th: { "正在加载编辑器": "กำลังโหลดตัวแก้ไข", "正在加载编辑器…": "กำลังโหลดตัวแก้ไข…" },
  hi: { "正在加载编辑器": "संपादक लोड हो रहा है", "正在加载编辑器…": "संपादक लोड हो रहा है…" },
});
