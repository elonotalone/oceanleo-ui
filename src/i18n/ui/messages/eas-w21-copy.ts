// 2026-09-24 editors-and-shell 波 W21 的分表。只由 W21 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W21_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "没取到这份素材的最新版本": "没取到这份素材的最新版本",
} as const;

export const EAS_W21_MESSAGES = assembleCopy(SOURCE, {
  en: { "没取到这份素材的最新版本": "Couldn't load the latest version of this material" },
  de: { "没取到这份素材的最新版本": "Die neueste Version dieses Materials konnte nicht geladen werden" },
  es: { "没取到这份素材的最新版本": "No se pudo cargar la versión más reciente de este material" },
  "es-419": { "没取到这份素材的最新版本": "No se pudo cargar la versión más reciente de este material" },
  fr: { "没取到这份素材的最新版本": "Impossible de charger la dernière version de ce matériel" },
  it: { "没取到这份素材的最新版本": "Impossibile caricare la versione più recente di questo materiale" },
  "pt-BR": { "没取到这份素材的最新版本": "Não foi possível carregar a versão mais recente deste material" },
  "pt-PT": { "没取到这份素材的最新版本": "Não foi possível carregar a versão mais recente deste material" },
  vi: { "没取到这份素材的最新版本": "Không lấy được phiên bản mới nhất của tài liệu này" },
  tr: { "没取到这份素材的最新版本": "Bu materyalin en son sürümü alınamadı" },
  "zh-TW": { "没取到这份素材的最新版本": "沒取到這份素材的最新版本" },
  ja: { "没取到这份素材的最新版本": "この素材の最新バージョンを取得できませんでした" },
  ko: { "没取到这份素材的最新版本": "이 자료의 최신 버전을 가져오지 못했습니다" },
  ar: { "没取到这份素材的最新版本": "تعذر جلب أحدث نسخة من هذه المادة" },
  th: { "没取到这份素材的最新版本": "ดึงเวอร์ชันล่าสุดของเนื้อหานี้ไม่ได้" },
  hi: { "没取到这份素材的最新版本": "इस सामग्री का नवीनतम संस्करण नहीं मिला" },
});
