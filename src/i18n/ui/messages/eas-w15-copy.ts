// 2026-09-24 editors-and-shell 波 W15 的分表。只由 W15 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W15_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 「应用」是基础词典里 Apps 的键，这里不许再用。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "已恢复上次未应用的草稿": "已恢复上次未应用的草稿",
  "应用草稿": "应用草稿",
} as const;

export const EAS_W15_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "已恢复上次未应用的草稿": "Restored the last unapplied draft",
    "应用草稿": "Apply draft",
  },
  de: {
    "已恢复上次未应用的草稿": "Letzter nicht übernommener Entwurf wiederhergestellt",
    "应用草稿": "Entwurf übernehmen",
  },
  es: {
    "已恢复上次未应用的草稿": "Se restauró el último borrador sin aplicar",
    "应用草稿": "Aplicar borrador",
  },
  "es-419": {
    "已恢复上次未应用的草稿": "Se restauró el último borrador sin aplicar",
    "应用草稿": "Aplicar borrador",
  },
  fr: {
    "已恢复上次未应用的草稿": "Dernier brouillon non appliqué restauré",
    "应用草稿": "Appliquer le brouillon",
  },
  it: {
    "已恢复上次未应用的草稿": "Ripristinata l’ultima bozza non applicata",
    "应用草稿": "Applica bozza",
  },
  "pt-BR": {
    "已恢复上次未应用的草稿": "Rascunho não aplicado anterior restaurado",
    "应用草稿": "Aplicar rascunho",
  },
  "pt-PT": {
    "已恢复上次未应用的草稿": "Rascunho não aplicado anterior restaurado",
    "应用草稿": "Aplicar rascunho",
  },
  vi: {
    "已恢复上次未应用的草稿": "Đã khôi phục bản nháp chưa áp dụng gần nhất",
    "应用草稿": "Áp dụng bản nháp",
  },
  tr: {
    "已恢复上次未应用的草稿": "Son uygulanmamış taslak geri yüklendi",
    "应用草稿": "Taslağı uygula",
  },
  "zh-TW": {
    "已恢复上次未应用的草稿": "已恢復上次未套用的草稿",
    "应用草稿": "套用草稿",
  },
  ja: {
    "已恢复上次未应用的草稿": "未適用の下書きを復元しました",
    "应用草稿": "下書きを適用",
  },
  ko: {
    "已恢复上次未应用的草稿": "적용하지 않은 마지막 초안을 복원했습니다",
    "应用草稿": "초안 적용",
  },
  ar: {
    "已恢复上次未应用的草稿": "تمت استعادة آخر مسودة غير مطبّقة",
    "应用草稿": "تطبيق المسودة",
  },
  th: {
    "已恢复上次未应用的草稿": "กู้คืนฉบับร่างล่าสุดที่ยังไม่ได้ใช้",
    "应用草稿": "ใช้ฉบับร่าง",
  },
  hi: {
    "已恢复上次未应用的草稿": "पिछला अनलागू ड्राफ्ट वापस लाया गया",
    "应用草稿": "ड्राफ्ट लागू करें",
  },
});
