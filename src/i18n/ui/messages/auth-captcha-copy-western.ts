import type { AuthCaptchaCopyMessages } from "./auth-captcha-copy-base";

export const AUTH_CAPTCHA_COPY_WESTERN: Record<
  "de" | "en" | "es" | "es-419" | "fr" | "it" | "pt-BR" | "pt-PT" | "vi" | "tr",
  AuthCaptchaCopyMessages
> = {
  en: {
    verifying: "Running a security check…",
    failed: "Security verification failed. Please try again.",
    loadFailed: "The security check failed to load. Refresh the page and try again.",
  },
  de: {
    verifying: "Sicherheitsprüfung läuft…",
    failed: "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte erneut versuchen.",
    loadFailed:
      "Die Sicherheitsprüfung konnte nicht geladen werden. Bitte die Seite aktualisieren und erneut versuchen.",
  },
  fr: {
    verifying: "Vérification de sécurité en cours…",
    failed: "La vérification de sécurité a échoué. Veuillez réessayer.",
    loadFailed:
      "Le composant de vérification n'a pas pu se charger. Actualisez la page et réessayez.",
  },
  es: {
    verifying: "Comprobación de seguridad en curso…",
    failed: "La verificación de seguridad no se ha superado. Inténtalo de nuevo.",
    loadFailed:
      "No se ha podido cargar la verificación de seguridad. Actualiza la página e inténtalo de nuevo.",
  },
  "es-419": {
    verifying: "Verificación de seguridad en curso…",
    failed: "La verificación de seguridad no pasó. Volvé a intentarlo.",
    loadFailed:
      "No se pudo cargar la verificación de seguridad. Actualizá la página y volvé a intentar.",
  },
  it: {
    verifying: "Verifica di sicurezza in corso…",
    failed: "La verifica di sicurezza non è andata a buon fine. Riprova.",
    loadFailed:
      "Il componente di verifica non si è caricato. Aggiorna la pagina e riprova.",
  },
  "pt-BR": {
    verifying: "Verificação de segurança em andamento…",
    failed: "A verificação de segurança falhou. Tente de novo.",
    loadFailed:
      "Não foi possível carregar a verificação de segurança. Atualize a página e tente de novo.",
  },
  "pt-PT": {
    verifying: "Verificação de segurança em curso…",
    failed: "A verificação de segurança falhou. Tente novamente.",
    loadFailed:
      "Não foi possível carregar a verificação de segurança. Atualize a página e tente novamente.",
  },
  vi: {
    verifying: "Đang kiểm tra bảo mật…",
    failed: "Xác minh bảo mật không thành công. Vui lòng thử lại.",
    loadFailed: "Không tải được thành phần xác minh bảo mật. Hãy làm mới trang rồi thử lại.",
  },
  tr: {
    verifying: "Güvenlik doğrulaması yapılıyor…",
    failed: "Güvenlik doğrulaması geçmedi. Lütfen yeniden deneyin.",
    loadFailed: "Güvenlik doğrulaması yüklenemedi. Sayfayı yenileyip yeniden deneyin.",
  },
};
