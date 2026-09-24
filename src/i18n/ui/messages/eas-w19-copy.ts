// 2026-09-24 editors-and-shell 波 W19 的分表。只由 W19 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W19_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  proSavedAsNewVersion:
    "专业编辑的改动会作为新版本保存，快速编辑显示最新版本预览",
} as const;

export const EAS_W19_MESSAGES = assembleCopy(SOURCE, {
  en: {
    proSavedAsNewVersion:
      "Changes you make in Pro are saved as a new version. Quick edit shows a preview of that latest version.",
  },
  de: {
    proSavedAsNewVersion:
      "Änderungen in der Profi-Ansicht werden als neue Version gespeichert. Die Schnellbearbeitung zeigt eine Vorschau der neuesten Version.",
  },
  es: {
    proSavedAsNewVersion:
      "Los cambios en edición profesional se guardan como una versión nueva. La edición rápida muestra una vista previa de la versión más reciente.",
  },
  "es-419": {
    proSavedAsNewVersion:
      "Los cambios en edición profesional se guardan como una versión nueva. La edición rápida muestra una vista previa de la versión más reciente.",
  },
  fr: {
    proSavedAsNewVersion:
      "Les modifications en mode Pro sont enregistrées comme une nouvelle version. L'édition rapide affiche un aperçu de la dernière version.",
  },
  it: {
    proSavedAsNewVersion:
      "Le modifiche in Pro vengono salvate come nuova versione. La modifica rapida mostra un'anteprima della versione più recente.",
  },
  "pt-BR": {
    proSavedAsNewVersion:
      "As alterações no modo profissional são salvas como uma nova versão. A edição rápida mostra uma prévia da versão mais recente.",
  },
  "pt-PT": {
    proSavedAsNewVersion:
      "As alterações no modo profissional são guardadas como uma nova versão. A edição rápida mostra uma pré-visualização da versão mais recente.",
  },
  vi: {
    proSavedAsNewVersion:
      "Thay đổi trong chế độ chuyên nghiệp được lưu thành phiên bản mới. Chỉnh sửa nhanh hiển thị bản xem trước phiên bản mới nhất.",
  },
  tr: {
    proSavedAsNewVersion:
      "Profesyonel düzenlemedeki değişiklikler yeni sürüm olarak kaydedilir. Hızlı düzenleme en son sürümün önizlemesini gösterir.",
  },
  "zh-TW": {
    proSavedAsNewVersion:
      "專業編輯的變更會存成新版本，快速編輯顯示最新版本預覽",
  },
  ja: {
    proSavedAsNewVersion:
      "プロ編集での変更は新しいバージョンとして保存されます。クイック編集には最新バージョンのプレビューが表示されます。",
  },
  ko: {
    proSavedAsNewVersion:
      "프로 편집에서 바꾼 내용은 새 버전으로 저장됩니다. 빠른 편집에는 최신 버전 미리보기가 보입니다.",
  },
  ar: {
    proSavedAsNewVersion:
      "تُحفظ التعديلات في التحرير الاحترافي كنسخة جديدة. يعرض التحرير السريع معاينة لأحدث نسخة.",
  },
  th: {
    proSavedAsNewVersion:
      "การเปลี่ยนแปลงในโหมดมืออาชีพจะบันทึกเป็นเวอร์ชันใหม่ การแก้ไขด่วนแสดงตัวอย่างเวอร์ชันล่าสุด",
  },
  hi: {
    proSavedAsNewVersion:
      "प्रो संपादन में किए बदलाव नई संस्करण के रूप में सहेजे जाते हैं। त्वरित संपादन नवीनतम संस्करण का पूर्वावलोकन दिखाता है।",
  },
});
