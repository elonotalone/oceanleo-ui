// 2026-09-24 editors-and-shell 波 W14 的分表。只由 W14 改；注册在 shell-overhaul-copy.ts（父改）。
// 「重试」「已保存」与全站词典同义，写进分表是给脱离 I18nProvider 的后台提示用。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "有 {n} 份修改还没保存上": "有 {n} 份修改还没保存上",
  重试: "重试",
  已保存: "已保存",
} as const;

export const EAS_W14_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "有 {n} 份修改还没保存上": "{n} changes still not saved",
    重试: "Retry",
    已保存: "Saved",
  },
  de: {
    "有 {n} 份修改还没保存上": "{n} Änderungen wurden noch nicht gespeichert",
    重试: "Erneut versuchen",
    已保存: "Gespeichert",
  },
  es: {
    "有 {n} 份修改还没保存上": "Hay {n} cambios sin guardar",
    重试: "Reintentar",
    已保存: "Guardado",
  },
  "es-419": {
    "有 {n} 份修改还没保存上": "Hay {n} cambios sin guardar",
    重试: "Reintentar",
    已保存: "Guardado",
  },
  fr: {
    "有 {n} 份修改还没保存上": "{n} modification(s) pas encore enregistrées",
    重试: "Réessayer",
    已保存: "Enregistré",
  },
  it: {
    "有 {n} 份修改还没保存上": "{n} modifiche non ancora salvate",
    重试: "Riprova",
    已保存: "Salvato",
  },
  "pt-BR": {
    "有 {n} 份修改还没保存上": "{n} alterações ainda não foram salvas",
    重试: "Tentar novamente",
    已保存: "Salvo",
  },
  "pt-PT": {
    "有 {n} 份修改还没保存上": "{n} alterações ainda não foram guardadas",
    重试: "Tentar novamente",
    已保存: "Guardado",
  },
  vi: {
    "有 {n} 份修改还没保存上": "Còn {n} thay đổi chưa lưu",
    重试: "Thử lại",
    已保存: "Đã lưu",
  },
  tr: {
    "有 {n} 份修改还没保存上": "{n} değişiklik henüz kaydedilmedi",
    重试: "Tekrar dene",
    已保存: "Kaydedildi",
  },
  "zh-TW": {
    "有 {n} 份修改还没保存上": "有 {n} 份修改還沒儲存上",
    重试: "重試",
    已保存: "已保存",
  },
  ja: {
    "有 {n} 份修改还没保存上": "{n} 件の変更が未保存です",
    重试: "再試行",
    已保存: "保存しました",
  },
  ko: {
    "有 {n} 份修改还没保存上": "저장되지 않은 수정이 {n}개 있습니다",
    重试: "다시 시도",
    已保存: "저장됨",
  },
  ar: {
    "有 {n} 份修改还没保存上": "هناك {n} تعديلات لم يتم حفظها بعد",
    重试: "إعادة المحاولة",
    已保存: "تم الحفظ",
  },
  th: {
    "有 {n} 份修改还没保存上": "มี {n} รายการแก้ไขที่ยังไม่ได้บันทึก",
    重试: "ลองใหม่",
    已保存: "บันทึกแล้ว",
  },
  hi: {
    "有 {n} 份修改还没保存上": "{n} बदलाव अभी सहेजे नहीं गए",
    重试: "पुनः प्रयास",
    已保存: "सहेजा गया",
  },
});
