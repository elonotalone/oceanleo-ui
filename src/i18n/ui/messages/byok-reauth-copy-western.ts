import type { ByokReauthCopyMessages } from "./byok-reauth-copy-base";

export const BYOK_REAUTH_COPY_WESTERN: Record<
  "de" | "en" | "es" | "es-419" | "fr" | "it" | "pt-BR" | "pt-PT" | "vi" | "tr",
  ByokReauthCopyMessages
> = {
  en: {
    signInAgain: "Sign in again",
    protectKey: "To protect your key, sign in again before adding it.",
  },
  de: {
    signInAgain: "Erneut anmelden",
    protectKey:
      "Zum Schutz deines Schlüssels bitte erneut anmelden, bevor du ihn hinzufügst.",
  },
  fr: {
    signInAgain: "Se reconnecter",
    protectKey: "Pour protéger votre clé, reconnectez-vous avant de l'ajouter.",
  },
  es: {
    signInAgain: "Volver a iniciar sesión",
    protectKey: "Para proteger tu clave, vuelve a iniciar sesión y luego añádela.",
  },
  "es-419": {
    signInAgain: "Volvé a iniciar sesión",
    protectKey: "Para proteger tu clave, volvé a iniciar sesión y después agregala.",
  },
  it: {
    signInAgain: "Accedi di nuovo",
    protectKey: "Per proteggere la tua chiave, accedi di nuovo prima di aggiungerla.",
  },
  "pt-BR": {
    signInAgain: "Entrar de novo",
    protectKey: "Para proteger sua chave, entre de novo e depois adicione.",
  },
  "pt-PT": {
    signInAgain: "Iniciar sessão novamente",
    protectKey: "Para proteger a sua chave, inicie sessão novamente e depois adicione-a.",
  },
  vi: {
    signInAgain: "Đăng nhập lại",
    protectKey: "Để bảo vệ khóa của bạn, hãy đăng nhập lại rồi mới thêm.",
  },
  tr: {
    signInAgain: "Yeniden giriş yap",
    protectKey: "Anahtarınızı korumak için önce yeniden giriş yapın, sonra ekleyin.",
  },
};
