import type { AuthLegalCopyMessages } from "./auth-legal-copy-base";

export const AUTH_LEGAL_COPY_EASTERN: Record<
  "ja" | "ko" | "zh-TW" | "ar" | "th" | "hi",
  AuthLegalCopyMessages
> = {
  ja: {
    legalFootnote: "続けることで{terms}に同意し、{privacy}を読んだことになります。",
    termsOfService: "利用規約",
    privacyPolicy: "プライバシーポリシー",
  },
  ko: {
    legalFootnote: "계속하면 {terms}에 동의하고 {privacy}를 읽은 것으로 간주됩니다.",
    termsOfService: "서비스 약관",
    privacyPolicy: "개인정보 처리방침",
  },
  "zh-TW": {
    legalFootnote: "繼續即表示你同意我們的{terms}，並已閱讀{privacy}。",
    termsOfService: "服務條款",
    privacyPolicy: "隱私政策",
  },
  ar: {
    legalFootnote: "بالمتابعة، فإنك توافق على {terms} وقد قرأت {privacy}.",
    termsOfService: "شروط الخدمة",
    privacyPolicy: "سياسة الخصوصية",
  },
  th: {
    legalFootnote: "การดำเนินการต่อหมายความว่าคุณยอมรับ{terms}และได้อ่าน{privacy}แล้ว",
    termsOfService: "ข้อกำหนดการให้บริการ",
    privacyPolicy: "นโยบายความเป็นส่วนตัว",
  },
  hi: {
    legalFootnote: "जारी रखकर आप हमारे {terms} से सहमत हैं और {privacy} पढ़ चुके हैं।",
    termsOfService: "सेवा की शर्तें",
    privacyPolicy: "गोपनीयता नीति",
  },
};
