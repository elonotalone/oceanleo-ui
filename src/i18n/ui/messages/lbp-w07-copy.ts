// 2026-10-23 leobay-projects 波 W07 的分表。只由 W07 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const LBP_W07_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 只放新的中文原文；已有词条不要在这里重定义（合并次序会让它覆盖别处的译文）。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  // 条款弹窗 / 条款门里的链接：到门户条款页看全文（新窗口）。
  fullTextLink: "在条款页查看全文",
} as const;

export const LBP_W07_MESSAGES = assembleCopy(SOURCE, {
  en: { fullTextLink: "Read the full text on the terms page" },
  de: { fullTextLink: "Den vollständigen Text auf der Seite mit den Bedingungen lesen" },
  es: { fullTextLink: "Leer el texto completo en la página de términos" },
  "es-419": { fullTextLink: "Leer el texto completo en la página de términos" },
  fr: { fullTextLink: "Lire le texte complet sur la page des conditions" },
  it: { fullTextLink: "Leggi il testo completo nella pagina dei termini" },
  "pt-BR": { fullTextLink: "Ler o texto completo na página de termos" },
  "pt-PT": { fullTextLink: "Ler o texto completo na página de termos" },
  vi: { fullTextLink: "Xem toàn văn trên trang điều khoản" },
  tr: { fullTextLink: "Tam metni şartlar sayfasında okuyun" },
  "zh-TW": { fullTextLink: "在條款頁查看全文" },
  ja: { fullTextLink: "規約ページで全文を読む" },
  ko: { fullTextLink: "약관 페이지에서 전문 보기" },
  ar: { fullTextLink: "اقرأ النص الكامل في صفحة الشروط" },
  th: { fullTextLink: "อ่านฉบับเต็มในหน้าข้อกำหนด" },
  hi: { fullTextLink: "शर्तों के पृष्ठ पर पूरा पाठ पढ़ें" },
});
