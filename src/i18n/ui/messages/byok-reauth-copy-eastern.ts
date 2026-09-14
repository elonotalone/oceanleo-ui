import type { ByokReauthCopyMessages } from "./byok-reauth-copy-base";

export const BYOK_REAUTH_COPY_EASTERN: Record<
  "ja" | "ko" | "zh-TW" | "ar" | "th" | "hi",
  ByokReauthCopyMessages
> = {
  ja: {
    signInAgain: "再ログイン",
    protectKey: "キーを守るため、再ログインしてから追加してください。",
  },
  ko: {
    signInAgain: "다시 로그인",
    protectKey: "키를 보호하려면 다시 로그인한 뒤 추가해 주세요.",
  },
  "zh-TW": {
    signInAgain: "重新登入",
    protectKey: "為了保護你的鑰匙，請重新登入後再新增",
  },
  ar: {
    signInAgain: "إعادة تسجيل الدخول",
    protectKey: "لحماية مفتاحك، يرجى تسجيل الدخول مرة أخرى ثم إضافته.",
  },
  th: {
    signInAgain: "เข้าสู่ระบบอีกครั้ง",
    protectKey: "เพื่อปกป้องคีย์ของคุณ กรุณาเข้าสู่ระบบอีกครั้งแล้วค่อยเพิ่ม",
  },
  hi: {
    signInAgain: "फिर साइन इन करें",
    protectKey: "आपकी कुंजी की सुरक्षा के लिए, कृपया फिर साइन इन करके जोड़ें।",
  },
};
