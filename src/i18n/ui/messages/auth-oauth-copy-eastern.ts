import type { AuthOauthCopyMessages } from "./auth-oauth-copy-base";

export const AUTH_OAUTH_COPY_EASTERN: Record<
  "ja" | "ko" | "zh-TW" | "ar" | "th" | "hi",
  AuthOauthCopyMessages
> = {
  ja: {
    google: "Google",
    apple: "Apple",
    googleContinue: "Google で続ける",
    appleContinue: "Apple で続ける",
    googleUnconfigured: "Google ログインはまだ利用できません。メールでログインしてください。",
    appleUnconfigured: "Apple ログインはまだ利用できません。メールでログインしてください。",
  },
  ko: {
    google: "Google",
    apple: "Apple",
    googleContinue: "Google로 계속",
    appleContinue: "Apple로 계속",
    googleUnconfigured: "Google 로그인은 아직 사용할 수 없습니다. 이메일로 로그인하세요.",
    appleUnconfigured: "Apple 로그인은 아직 사용할 수 없습니다. 이메일로 로그인하세요.",
  },
  "zh-TW": {
    google: "Google",
    apple: "Apple",
    googleContinue: "使用 Google 繼續",
    appleContinue: "使用 Apple 繼續",
    googleUnconfigured: "Google 登入暫未開放：尚未設定，請改用電子郵件登入。",
    appleUnconfigured: "Apple 登入暫未開放：尚未設定，請改用電子郵件登入。",
  },
  ar: {
    google: "Google",
    apple: "Apple",
    googleContinue: "المتابعة باستخدام Google",
    appleContinue: "المتابعة باستخدام Apple",
    googleUnconfigured: "تسجيل الدخول عبر Google غير متاح بعد. يرجى تسجيل الدخول بالبريد الإلكتروني.",
    appleUnconfigured: "تسجيل الدخول عبر Apple غير متاح بعد. يرجى تسجيل الدخول بالبريد الإلكتروني.",
  },
  th: {
    google: "Google",
    apple: "Apple",
    googleContinue: "ดำเนินการต่อด้วย Google",
    appleContinue: "ดำเนินการต่อด้วย Apple",
    googleUnconfigured: "ยังไม่เปิดให้เข้าสู่ระบบด้วย Google โปรดเข้าสู่ระบบด้วยอีเมล",
    appleUnconfigured: "ยังไม่เปิดให้เข้าสู่ระบบด้วย Apple โปรดเข้าสู่ระบบด้วยอีเมล",
  },
  hi: {
    google: "Google",
    apple: "Apple",
    googleContinue: "Google से जारी रखें",
    appleContinue: "Apple से जारी रखें",
    googleUnconfigured: "Google साइन-इन अभी उपलब्ध नहीं है। कृपया ईमेल से साइन इन करें।",
    appleUnconfigured: "Apple साइन-इन अभी उपलब्ध नहीं है। कृपया ईमेल से साइन इन करें।",
  },
};
