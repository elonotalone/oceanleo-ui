import type { AuthLegalCopyMessages } from "./auth-legal-copy-base";

export const AUTH_LEGAL_COPY_WESTERN: Record<
  "de" | "en" | "es" | "es-419" | "fr" | "it" | "pt-BR" | "pt-PT" | "vi" | "tr",
  AuthLegalCopyMessages
> = {
  en: {
    legalFootnote: "By continuing, you agree to our {terms} and have read our {privacy}.",
    termsOfService: "Terms of Service",
    privacyPolicy: "Privacy Policy",
  },
  de: {
    legalFootnote: "Wenn du fortfährst, stimmst du unseren {terms} zu und hast die {privacy} gelesen.",
    termsOfService: "Nutzungsbedingungen",
    privacyPolicy: "Datenschutzerklärung",
  },
  fr: {
    legalFootnote: "En continuant, vous acceptez nos {terms} et avez lu notre {privacy}.",
    termsOfService: "Conditions d'utilisation",
    privacyPolicy: "Politique de confidentialité",
  },
  es: {
    legalFootnote: "Al continuar, aceptas nuestros {terms} y has leído la {privacy}.",
    termsOfService: "Términos de servicio",
    privacyPolicy: "Política de privacidad",
  },
  "es-419": {
    legalFootnote: "Al continuar, aceptás nuestros {terms} y leíste la {privacy}.",
    termsOfService: "Términos de servicio",
    privacyPolicy: "Política de privacidad",
  },
  it: {
    legalFootnote: "Continuando, accetti i nostri {terms} e hai letto l'{privacy}.",
    termsOfService: "Termini di servizio",
    privacyPolicy: "Informativa sulla privacy",
  },
  "pt-BR": {
    legalFootnote: "Ao continuar, você concorda com nossos {terms} e leu a {privacy}.",
    termsOfService: "Termos de Serviço",
    privacyPolicy: "Política de Privacidade",
  },
  "pt-PT": {
    legalFootnote: "Ao continuar, concorda com os nossos {terms} e leu a {privacy}.",
    termsOfService: "Termos de Serviço",
    privacyPolicy: "Política de Privacidade",
  },
  vi: {
    legalFootnote: "Tiếp tục nghĩa là bạn đồng ý với {terms} và đã đọc {privacy}.",
    termsOfService: "Điều khoản dịch vụ",
    privacyPolicy: "Chính sách quyền riêng tư",
  },
  tr: {
    legalFootnote: "Devam ederek {terms} kabul etmiş ve {privacy} okumuş olursunuz.",
    termsOfService: "Hizmet Şartları",
    privacyPolicy: "Gizlilik Politikası",
  },
};
