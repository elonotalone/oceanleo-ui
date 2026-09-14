import type { AuthCaptchaCopyMessages } from "./auth-captcha-copy-base";

export const AUTH_CAPTCHA_COPY_EASTERN: Record<
  "ja" | "ko" | "zh-TW" | "ar" | "th" | "hi",
  AuthCaptchaCopyMessages
> = {
  ja: {
    verifying: "セキュリティ確認を実行しています…",
    failed: "セキュリティ確認に失敗しました。もう一度お試しください。",
    loadFailed: "セキュリティ確認の読み込みに失敗しました。ページを更新して再試行してください。",
  },
  ko: {
    verifying: "보안 확인을 진행하는 중…",
    failed: "보안 확인에 실패했습니다. 다시 시도해 주세요.",
    loadFailed: "보안 확인 구성 요소를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  },
  "zh-TW": {
    verifying: "正在進行安全驗證…",
    failed: "安全驗證沒有通過，請重試",
    loadFailed: "安全驗證元件載入失敗，請重新整理頁面再試",
  },
  ar: {
    verifying: "جارٍ التحقق الأمني…",
    failed: "فشل التحقق الأمني. يرجى المحاولة مرة أخرى.",
    loadFailed: "تعذر تحميل مكون التحقق الأمني. حدّث الصفحة ثم أعد المحاولة.",
  },
  th: {
    verifying: "กำลังตรวจสอบความปลอดภัย…",
    failed: "การยืนยันความปลอดภัยไม่ผ่าน กรุณาลองอีกครั้ง",
    loadFailed: "โหลดองค์ประกอบยืนยันความปลอดภัยไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่",
  },
  hi: {
    verifying: "सुरक्षा जाँच चल रही है…",
    failed: "सुरक्षा सत्यापन पास नहीं हुआ। कृपया फिर कोशिश करें।",
    loadFailed: "सुरक्षा जाँच लोड नहीं हो सकी। पृष्ठ रीफ़्रेश करके फिर कोशिश करें।",
  },
};
