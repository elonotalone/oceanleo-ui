// 2026-09-24 editors-and-shell 波 W15 的分表。只由 W15 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W15_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "已恢复上次未应用的草稿": "已恢复上次未应用的草稿",
  "应用": "应用",
  "放弃": "放弃",
} as const;

export const EAS_W15_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "已恢复上次未应用的草稿": "Restored the last unapplied draft",
    "应用": "Apply",
    "放弃": "Discard",
  },
  de: {
    "已恢复上次未应用的草稿": "Letzter nicht übernommener Entwurf wiederhergestellt",
    "应用": "Übernehmen",
    "放弃": "Verwerfen",
  },
  es: {
    "已恢复上次未应用的草稿": "Se restauró el último borrador sin aplicar",
    "应用": "Aplicar",
    "放弃": "Descartar",
  },
  "es-419": {
    "已恢复上次未应用的草稿": "Se restauró el último borrador sin aplicar",
    "应用": "Aplicar",
    "放弃": "Descartar",
  },
  fr: {
    "已恢复上次未应用的草稿": "Dernier brouillon non appliqué restauré",
    "应用": "Appliquer",
    "放弃": "Abandonner",
  },
  it: {
    "已恢复上次未应用的草稿": "Ripristinata l’ultima bozza non applicata",
    "应用": "Applica",
    "放弃": "Scarta",
  },
  "pt-BR": {
    "已恢复上次未应用的草稿": "Rascunho não aplicado anterior restaurado",
    "应用": "Aplicar",
    "放弃": "Descartar",
  },
  "pt-PT": {
    "已恢复上次未应用的草稿": "Rascunho não aplicado anterior restaurado",
    "应用": "Aplicar",
    "放弃": "Descartar",
  },
  vi: {
    "已恢复上次未应用的草稿": "Đã khôi phục bản nháp chưa áp dụng gần nhất",
    "应用": "Áp dụng",
    "放弃": "Bỏ",
  },
  tr: {
    "已恢复上次未应用的草稿": "Son uygulanmamış taslak geri yüklendi",
    "应用": "Uygula",
    "放弃": "Vazgeç",
  },
  "zh-TW": {
    "已恢复上次未应用的草稿": "已恢復上次未套用的草稿",
    "应用": "套用",
    "放弃": "放棄",
  },
  ja: {
    "已恢复上次未应用的草稿": "未適用の下書きを復元しました",
    "应用": "適用",
    "放弃": "破棄",
  },
  ko: {
    "已恢复上次未应用的草稿": "적용하지 않은 마지막 초안을 복원했습니다",
    "应用": "적용",
    "放弃": "버리기",
  },
  ar: {
    "已恢复上次未应用的草稿": "تمت استعادة آخر مسودة غير مطبّقة",
    "应用": "تطبيق",
    "放弃": "تجاهل",
  },
  th: {
    "已恢复上次未应用的草稿": "กู้คืนฉบับร่างล่าสุดที่ยังไม่ได้ใช้",
    "应用": "ใช้",
    "放弃": "ละทิ้ง",
  },
  hi: {
    "已恢复上次未应用的草稿": "पिछला अनलागू ड्राफ्ट वापस लाया गया",
    "应用": "लागू करें",
    "放弃": "छोड़ें",
  },
});
