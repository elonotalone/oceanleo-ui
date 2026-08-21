// 账号安全文案 —— 西语系（拉丁字母）译文。
// key 的语义与中文原文见 ./account-security-copy-base.ts；
// 插值占位符 {date} {yuan} 必须原样保留，联系邮箱 support@oceanleo.com 一字不改。

import type { AccountSecurityCopyMessages } from "./account-security-copy-base";

export const ACCOUNT_SECURITY_COPY_WESTERN = {
  en: {
    forgotPassword: "Forgot your password?",
    resetTitle: "Reset your password",
    resetIntro: "Enter the email you signed up with and we will send a reset link.",
    resetSend: "Send reset link",
    resetSentTitle: "The reset email is on its way",
    resetSentDetail:
      "It can take a few minutes to arrive and may land in spam. If nothing shows up, wait a bit and send it again — for now we can send at most 2 emails per hour.",
    backToSignIn: "Back to sign in",
    enterEmailFirst: "Enter your email address first.",

    newPasswordTitle: "Set a new password",
    newPasswordIntro: "This link works only once. Sign in again with the new password afterwards.",
    newPassword: "New password",
    newPasswordAgain: "Type it again",
    savePassword: "Save new password",
    passwordSavedTitle: "The new password is active",
    passwordSavedDetail:
      "Other devices stay signed in. If that worries you, sign in and use Sign out everywhere in Account security.",
    passwordMismatch: "The two passwords do not match.",
    passwordTooShort: "A password needs at least 6 characters.",
    resetLinkExpired: "This reset link has expired. Go back to sign in and send a new one.",
    resetLinkMissing: "This page only works when you open it from the link in the email.",

    changePassword: "Change password",
    changePasswordDesc:
      "Changing the password takes proof that it is you: either your current password, or a code sent to your email.",
    currentPassword: "Current password",
    emailCode: "Email code",
    sendEmailCode: "Send email code",
    emailCodeSent: "The code is on its way to your inbox; it may take a few minutes.",
    wrongCurrentPassword: "That current password is not correct.",

    twoStepTitle: "Two-step verification",
    twoStepOff: "Not on yet. Once it is on, your password alone is not enough to get in.",
    twoStepOn:
      "On. Signing in takes your password plus the 6-digit code from your authenticator.",
    turnOnTwoStep: "Turn on two-step verification",
    addAnotherAuthenticator: "Add another authenticator",
    scanQr: "Scan this QR code with an authenticator app",
    orTypeSecret: "Cannot scan? Type this key by hand:",
    copySecret: "Copy key",
    secretCopied: "Key copied.",
    enterSixDigits: "Enter the 6-digit code your authenticator shows right now",
    sixDigits: "6 digits",
    confirmAndEnable: "Confirm and turn on",
    twoStepEnabled: "Two-step verification is on.",
    removeAuthenticatorConfirm:
      "Once it is removed, your password alone gets someone into this account. Remove it?",
    twoStepRemoved: "Two-step verification removed.",
    verifyBeforeRemove: "Enter the 6-digit code from your authenticator before removing it.",
    lostAuthenticatorTitle: "If you lose your authenticator",
    lostAuthenticatorBody:
      "We do not hand out backup recovery codes yet. If you lose the phone or switch devices, write to support@oceanleo.com; we verify who you are by hand, remove it for you, and you set it up again.",
    unnamedAuthenticator: "Unnamed authenticator",
    authenticatorAddedOn: "Added {date}",
    badTotpCode: "That code is wrong, or its 30 seconds are already up.",
    twoStepUnavailable: "Two-step verification cannot be set up right now. Try again later.",

    twoStepPromptTitle: "One more step",
    twoStepPromptDetail:
      "This account uses two-step verification. Open your authenticator app and enter the 6-digit code it shows now.",

    securityCenter: "Account security",
    securityCenterDesc:
      "Recent sign-ins and changes, devices still signed in, and how much can be spent per day",
    recentActivity: "Recent activity",
    recentActivityEmpty: "Nothing recorded yet.",
    noMoreActivity: "That is everything.",
    activeDevices: "Devices signed in",
    activeDevicesEmpty: "No other device is signed in right now.",
    thisDevice: "This device",
    signOutThisDevice: "Sign out this device",
    signOutThisDeviceConfirm:
      "That device is signed out immediately and has to sign in again. This device is not affected.",
    deviceSignedOut: "That device is signed out.",
    unknownDevice: "Unknown device",
    unknownIp: "Address unknown",

    eventLogin: "Signed in",
    eventPasswordChanged: "Changed the password",
    eventMfaEnrolled: "Turned on two-step verification",
    eventMfaUnenrolled: "Turned off two-step verification",
    eventKeyAdded: "Added an API key",
    eventKeyRevoked: "Revoked an API key",
    eventSpendBlocked: "Spending stopped by the daily limit",
    eventLogoutAll: "Signed out everywhere",
    eventUnknown: "Other account activity",
    eventDenied: "Denied",

    dailyLimit: "Daily spending limit",
    dailyLimitWhy:
      "This is insurance for yourself: if someone else gets into your account, this caps what a day can cost you.",
    dailyLimitNone: "No limit right now.",
    dailyLimitNow: "Currently {yuan} CNY per day.",
    spentToday: "Spent today: {yuan} CNY.",
    limitPlaceholder: "for example 50",
    limitUnitYuan: "CNY / day",
    saveLimit: "Save limit",
    removeLimit: "Remove limit",
    limitSaved: "Limit saved.",
    limitInvalid: "Enter an amount of 0 or more.",

    errSignedOut: "Your session expired. Sign in again.",
    errOffline: "Cannot reach the server. Check your connection and try again.",
    errNotAvailable: "This part is not live yet. Check back in a few days.",
    errNotFound: "That record is no longer there.",
    errRateLimited: "Too many attempts in a row. Wait a moment and try again.",
    errServer: "Something went wrong on the server. Try again later.",
  },

  de: {
    forgotPassword: "Passwort vergessen?",
    resetTitle: "Passwort zurücksetzen",
    resetIntro:
      "Gib die E-Mail-Adresse deiner Anmeldung ein, wir schicken dir einen Link zum Zurücksetzen.",
    resetSend: "Link zum Zurücksetzen senden",
    resetSentTitle: "Die E-Mail ist unterwegs",
    resetSentDetail:
      "Sie kann ein paar Minuten brauchen und im Spam landen. Kommt nichts an, warte kurz und sende sie erneut – momentan sind höchstens 2 E-Mails pro Stunde möglich.",
    backToSignIn: "Zurück zur Anmeldung",
    enterEmailFirst: "Gib zuerst deine E-Mail-Adresse ein.",

    newPasswordTitle: "Neues Passwort festlegen",
    newPasswordIntro:
      "Dieser Link funktioniert nur einmal. Melde dich danach mit dem neuen Passwort an.",
    newPassword: "Neues Passwort",
    newPasswordAgain: "Noch einmal eingeben",
    savePassword: "Neues Passwort speichern",
    passwordSavedTitle: "Das neue Passwort gilt ab sofort",
    passwordSavedDetail:
      "Andere Geräte bleiben angemeldet. Wenn dich das stört, melde dich an und nutze in der Kontosicherheit „Überall abmelden“.",
    passwordMismatch: "Die beiden Passwörter stimmen nicht überein.",
    passwordTooShort: "Ein Passwort braucht mindestens 6 Zeichen.",
    resetLinkExpired:
      "Dieser Link ist abgelaufen. Geh zurück zur Anmeldung und fordere einen neuen an.",
    resetLinkMissing: "Diese Seite funktioniert nur über den Link aus der E-Mail.",

    changePassword: "Passwort ändern",
    changePasswordDesc:
      "Für eine Passwortänderung musst du dich ausweisen: entweder mit dem aktuellen Passwort oder mit einem Code aus deiner E-Mail.",
    currentPassword: "Aktuelles Passwort",
    emailCode: "E-Mail-Code",
    sendEmailCode: "E-Mail-Code senden",
    emailCodeSent: "Der Code ist unterwegs zu deinem Postfach; das kann ein paar Minuten dauern.",
    wrongCurrentPassword: "Das aktuelle Passwort ist nicht richtig.",

    twoStepTitle: "Bestätigung in zwei Schritten",
    twoStepOff:
      "Noch nicht aktiv. Ist sie aktiv, reicht dein Passwort allein nicht mehr zum Anmelden.",
    twoStepOn:
      "Aktiv. Zum Anmelden brauchst du dein Passwort und den 6-stelligen Code aus deiner Authenticator-App.",
    turnOnTwoStep: "Bestätigung in zwei Schritten aktivieren",
    addAnotherAuthenticator: "Weitere Authenticator-App hinzufügen",
    scanQr: "Scanne diesen QR-Code mit einer Authenticator-App",
    orTypeSecret: "Geht das Scannen nicht? Tippe diesen Schlüssel ein:",
    copySecret: "Schlüssel kopieren",
    secretCopied: "Schlüssel kopiert.",
    enterSixDigits: "Gib den 6-stelligen Code ein, den deine App gerade anzeigt",
    sixDigits: "6 Ziffern",
    confirmAndEnable: "Bestätigen und aktivieren",
    twoStepEnabled: "Die Bestätigung in zwei Schritten ist aktiv.",
    removeAuthenticatorConfirm:
      "Nach dem Entfernen kommt jemand allein mit deinem Passwort in dieses Konto. Wirklich entfernen?",
    twoStepRemoved: "Bestätigung in zwei Schritten entfernt.",
    verifyBeforeRemove: "Gib vor dem Entfernen den 6-stelligen Code aus deiner App ein.",
    lostAuthenticatorTitle: "Wenn du deine Authenticator-App verlierst",
    lostAuthenticatorBody:
      "Wir geben noch keine Ersatzcodes aus. Wenn du das Handy verlierst oder wechselst, schreib an support@oceanleo.com; wir prüfen deine Identität von Hand, entfernen sie für dich, und du richtest sie neu ein.",
    unnamedAuthenticator: "Unbenannte Authenticator-App",
    authenticatorAddedOn: "Hinzugefügt am {date}",
    badTotpCode: "Der Code stimmt nicht oder seine 30 Sekunden sind schon abgelaufen.",
    twoStepUnavailable:
      "Die Bestätigung in zwei Schritten lässt sich gerade nicht einrichten. Versuch es später.",

    twoStepPromptTitle: "Noch ein Schritt",
    twoStepPromptDetail:
      "Dieses Konto nutzt die Bestätigung in zwei Schritten. Öffne deine Authenticator-App und gib den 6-stelligen Code ein, den sie gerade anzeigt.",

    securityCenter: "Kontosicherheit",
    securityCenterDesc:
      "Letzte Anmeldungen und Änderungen, noch angemeldete Geräte und wie viel pro Tag ausgegeben werden darf",
    recentActivity: "Letzte Aktivität",
    recentActivityEmpty: "Noch nichts aufgezeichnet.",
    noMoreActivity: "Das war alles.",
    activeDevices: "Angemeldete Geräte",
    activeDevicesEmpty: "Gerade ist kein anderes Gerät angemeldet.",
    thisDevice: "Dieses Gerät",
    signOutThisDevice: "Dieses Gerät abmelden",
    signOutThisDeviceConfirm:
      "Das Gerät wird sofort abgemeldet und muss sich neu anmelden. Dieses Gerät bleibt unberührt.",
    deviceSignedOut: "Das Gerät ist abgemeldet.",
    unknownDevice: "Unbekanntes Gerät",
    unknownIp: "Adresse unbekannt",

    eventLogin: "Angemeldet",
    eventPasswordChanged: "Passwort geändert",
    eventMfaEnrolled: "Bestätigung in zwei Schritten aktiviert",
    eventMfaUnenrolled: "Bestätigung in zwei Schritten deaktiviert",
    eventKeyAdded: "Einen API-Schlüssel hinzugefügt",
    eventKeyRevoked: "Einen API-Schlüssel widerrufen",
    eventSpendBlocked: "Ausgabe vom Tageslimit gestoppt",
    eventLogoutAll: "Überall abgemeldet",
    eventUnknown: "Andere Kontoaktivität",
    eventDenied: "Abgelehnt",

    dailyLimit: "Tageslimit für Ausgaben",
    dailyLimitWhy:
      "Das ist eine Versicherung für dich selbst: Wenn jemand anderes in dein Konto kommt, begrenzt es den Schaden pro Tag.",
    dailyLimitNone: "Zurzeit unbegrenzt.",
    dailyLimitNow: "Aktuell {yuan} CNY pro Tag.",
    spentToday: "Heute ausgegeben: {yuan} CNY.",
    limitPlaceholder: "zum Beispiel 50",
    limitUnitYuan: "CNY / Tag",
    saveLimit: "Limit speichern",
    removeLimit: "Limit aufheben",
    limitSaved: "Limit gespeichert.",
    limitInvalid: "Gib einen Betrag von 0 oder mehr ein.",

    errSignedOut: "Deine Sitzung ist abgelaufen. Melde dich neu an.",
    errOffline: "Der Server ist nicht erreichbar. Prüfe deine Verbindung und versuch es erneut.",
    errNotAvailable: "Dieser Teil ist noch nicht online. Schau in ein paar Tagen wieder vorbei.",
    errNotFound: "Dieser Eintrag existiert nicht mehr.",
    errRateLimited: "Zu viele Versuche hintereinander. Warte einen Moment.",
    errServer: "Auf dem Server ist etwas schiefgelaufen. Versuch es später.",
  },

  es: {
    forgotPassword: "¿Olvidaste tu contraseña?",
    resetTitle: "Recuperar la contraseña",
    resetIntro:
      "Escribe el correo con el que te registraste y te enviaremos un enlace para restablecerla.",
    resetSend: "Enviar enlace",
    resetSentTitle: "El correo ya va en camino",
    resetSentDetail:
      "Puede tardar unos minutos y acabar en spam. Si no llega nada, espera un poco y vuelve a enviarlo: por ahora podemos enviar como máximo 2 correos por hora.",
    backToSignIn: "Volver a iniciar sesión",
    enterEmailFirst: "Escribe primero tu dirección de correo.",

    newPasswordTitle: "Establecer una contraseña nueva",
    newPasswordIntro:
      "Este enlace solo sirve una vez. Después inicia sesión con la contraseña nueva.",
    newPassword: "Contraseña nueva",
    newPasswordAgain: "Escríbela otra vez",
    savePassword: "Guardar la contraseña nueva",
    passwordSavedTitle: "La contraseña nueva ya está activa",
    passwordSavedDetail:
      "Los demás dispositivos siguen con la sesión abierta. Si te preocupa, inicia sesión y usa «Cerrar sesión en todos» en seguridad de la cuenta.",
    passwordMismatch: "Las dos contraseñas no coinciden.",
    passwordTooShort: "La contraseña necesita al menos 6 caracteres.",
    resetLinkExpired: "Este enlace ya caducó. Vuelve al inicio de sesión y pide otro.",
    resetLinkMissing: "Esta página solo funciona si la abres desde el enlace del correo.",

    changePassword: "Cambiar la contraseña",
    changePasswordDesc:
      "Para cambiar la contraseña tienes que demostrar que eres tú: con la contraseña actual o con un código enviado a tu correo.",
    currentPassword: "Contraseña actual",
    emailCode: "Código del correo",
    sendEmailCode: "Enviar código al correo",
    emailCodeSent: "El código va camino de tu buzón; puede tardar unos minutos.",
    wrongCurrentPassword: "Esa contraseña actual no es correcta.",

    twoStepTitle: "Verificación en dos pasos",
    twoStepOff: "Aún no está activa. Con ella, tu contraseña sola no basta para entrar.",
    twoStepOn:
      "Activa. Para entrar hacen falta tu contraseña y el código de 6 dígitos de tu autenticador.",
    turnOnTwoStep: "Activar la verificación en dos pasos",
    addAnotherAuthenticator: "Añadir otro autenticador",
    scanQr: "Escanea este código QR con una app de autenticación",
    orTypeSecret: "¿No puedes escanear? Escribe esta clave a mano:",
    copySecret: "Copiar la clave",
    secretCopied: "Clave copiada.",
    enterSixDigits: "Escribe el código de 6 dígitos que muestra ahora tu autenticador",
    sixDigits: "6 dígitos",
    confirmAndEnable: "Confirmar y activar",
    twoStepEnabled: "La verificación en dos pasos está activa.",
    removeAuthenticatorConfirm:
      "Si lo quitas, con tu contraseña sola cualquiera entra en esta cuenta. ¿Quitarlo?",
    twoStepRemoved: "Verificación en dos pasos eliminada.",
    verifyBeforeRemove: "Escribe el código de 6 dígitos de tu autenticador antes de quitarlo.",
    lostAuthenticatorTitle: "Si pierdes el autenticador",
    lostAuthenticatorBody:
      "Todavía no entregamos códigos de recuperación. Si pierdes el teléfono o lo cambias, escribe a support@oceanleo.com; comprobamos tu identidad a mano, lo quitamos por ti y vuelves a configurarlo.",
    unnamedAuthenticator: "Autenticador sin nombre",
    authenticatorAddedOn: "Añadido el {date}",
    badTotpCode: "Ese código no es correcto, o ya pasaron sus 30 segundos.",
    twoStepUnavailable:
      "Ahora mismo no se puede activar la verificación en dos pasos. Inténtalo más tarde.",

    twoStepPromptTitle: "Un paso más",
    twoStepPromptDetail:
      "Esta cuenta usa verificación en dos pasos. Abre tu app de autenticación y escribe el código de 6 dígitos que muestra ahora.",

    securityCenter: "Seguridad de la cuenta",
    securityCenterDesc:
      "Inicios de sesión y cambios recientes, dispositivos con la sesión abierta y cuánto se puede gastar al día",
    recentActivity: "Actividad reciente",
    recentActivityEmpty: "Todavía no hay nada registrado.",
    noMoreActivity: "Esto es todo.",
    activeDevices: "Dispositivos con sesión iniciada",
    activeDevicesEmpty: "Ahora mismo no hay ningún otro dispositivo con la sesión abierta.",
    thisDevice: "Este dispositivo",
    signOutThisDevice: "Cerrar sesión en este dispositivo",
    signOutThisDeviceConfirm:
      "Ese dispositivo se cierra al instante y tendrá que volver a iniciar sesión. El dispositivo actual no se ve afectado.",
    deviceSignedOut: "Ese dispositivo ya cerró la sesión.",
    unknownDevice: "Dispositivo desconocido",
    unknownIp: "Dirección desconocida",

    eventLogin: "Inicio de sesión",
    eventPasswordChanged: "Cambió la contraseña",
    eventMfaEnrolled: "Activó la verificación en dos pasos",
    eventMfaUnenrolled: "Desactivó la verificación en dos pasos",
    eventKeyAdded: "Añadió una clave de API",
    eventKeyRevoked: "Revocó una clave de API",
    eventSpendBlocked: "Gasto detenido por el límite diario",
    eventLogoutAll: "Cerró la sesión en todos los dispositivos",
    eventUnknown: "Otra actividad de la cuenta",
    eventDenied: "Denegado",

    dailyLimit: "Límite de gasto diario",
    dailyLimitWhy:
      "Es un seguro para ti: si alguien entra en tu cuenta, esto marca cuánto puede costarte como mucho en un día.",
    dailyLimitNone: "Ahora mismo sin límite.",
    dailyLimitNow: "Ahora son {yuan} CNY al día.",
    spentToday: "Gastado hoy: {yuan} CNY.",
    limitPlaceholder: "por ejemplo 50",
    limitUnitYuan: "CNY / día",
    saveLimit: "Guardar el límite",
    removeLimit: "Quitar el límite",
    limitSaved: "Límite guardado.",
    limitInvalid: "Escribe un importe de 0 o más.",

    errSignedOut: "Tu sesión caducó. Vuelve a iniciar sesión.",
    errOffline: "No se llega al servidor. Revisa la conexión e inténtalo otra vez.",
    errNotAvailable: "Esta parte todavía no está en marcha. Vuelve dentro de unos días.",
    errNotFound: "Ese registro ya no existe.",
    errRateLimited: "Demasiados intentos seguidos. Espera un momento.",
    errServer: "Algo falló en el servidor. Inténtalo más tarde.",
  },

  "es-419": {
    forgotPassword: "¿Olvidaste tu contraseña?",
    resetTitle: "Recuperar la contraseña",
    resetIntro:
      "Escribe el correo con el que te registraste y te mandamos un enlace para restablecerla.",
    resetSend: "Mandar enlace",
    resetSentTitle: "El correo ya va en camino",
    resetSentDetail:
      "Puede demorar unos minutos y caer en spam. Si no llega nada, espera un poco y mándalo de nuevo: por ahora podemos mandar máximo 2 correos por hora.",
    backToSignIn: "Volver a iniciar sesión",
    enterEmailFirst: "Escribe primero tu dirección de correo.",

    newPasswordTitle: "Poner una contraseña nueva",
    newPasswordIntro:
      "Este enlace sirve una sola vez. Después inicia sesión con la contraseña nueva.",
    newPassword: "Contraseña nueva",
    newPasswordAgain: "Escríbela de nuevo",
    savePassword: "Guardar la contraseña nueva",
    passwordSavedTitle: "La contraseña nueva ya quedó activa",
    passwordSavedDetail:
      "Los otros dispositivos siguen con la sesión abierta. Si te preocupa, inicia sesión y usa «Cerrar sesión en todos» en seguridad de la cuenta.",
    passwordMismatch: "Las dos contraseñas no coinciden.",
    passwordTooShort: "La contraseña necesita al menos 6 caracteres.",
    resetLinkExpired: "Este enlace ya venció. Vuelve al inicio de sesión y pide otro.",
    resetLinkMissing: "Esta página solo sirve si la abres desde el enlace del correo.",

    changePassword: "Cambiar la contraseña",
    changePasswordDesc:
      "Para cambiar la contraseña tienes que probar que eres tú: con la contraseña actual o con un código que te mandamos al correo.",
    currentPassword: "Contraseña actual",
    emailCode: "Código del correo",
    sendEmailCode: "Mandar código al correo",
    emailCodeSent: "El código va en camino a tu correo; puede demorar unos minutos.",
    wrongCurrentPassword: "Esa contraseña actual no es correcta.",

    twoStepTitle: "Verificación en dos pasos",
    twoStepOff: "Todavía no está activa. Con ella, tu contraseña sola no alcanza para entrar.",
    twoStepOn:
      "Activa. Para entrar necesitas tu contraseña y el código de 6 dígitos de tu autenticador.",
    turnOnTwoStep: "Activar la verificación en dos pasos",
    addAnotherAuthenticator: "Agregar otro autenticador",
    scanQr: "Escanea este código QR con una app de autenticación",
    orTypeSecret: "¿No puedes escanear? Escribe esta clave a mano:",
    copySecret: "Copiar la clave",
    secretCopied: "Clave copiada.",
    enterSixDigits: "Escribe el código de 6 dígitos que muestra ahora tu autenticador",
    sixDigits: "6 dígitos",
    confirmAndEnable: "Confirmar y activar",
    twoStepEnabled: "La verificación en dos pasos quedó activa.",
    removeAuthenticatorConfirm:
      "Si lo quitas, con tu contraseña sola cualquiera entra a esta cuenta. ¿Lo quitamos?",
    twoStepRemoved: "Verificación en dos pasos eliminada.",
    verifyBeforeRemove: "Escribe el código de 6 dígitos de tu autenticador antes de quitarlo.",
    lostAuthenticatorTitle: "Si pierdes el autenticador",
    lostAuthenticatorBody:
      "Todavía no entregamos códigos de respaldo. Si pierdes el teléfono o lo cambias, escribe a support@oceanleo.com; verificamos tu identidad a mano, lo quitamos por ti y lo vuelves a configurar.",
    unnamedAuthenticator: "Autenticador sin nombre",
    authenticatorAddedOn: "Agregado el {date}",
    badTotpCode: "Ese código no es correcto, o ya pasaron sus 30 segundos.",
    twoStepUnavailable:
      "Ahorita no se puede activar la verificación en dos pasos. Inténtalo más tarde.",

    twoStepPromptTitle: "Un paso más",
    twoStepPromptDetail:
      "Esta cuenta usa verificación en dos pasos. Abre tu app de autenticación y escribe el código de 6 dígitos que muestra ahora.",

    securityCenter: "Seguridad de la cuenta",
    securityCenterDesc:
      "Inicios de sesión y cambios recientes, dispositivos con la sesión abierta y cuánto se puede gastar al día",
    recentActivity: "Actividad reciente",
    recentActivityEmpty: "Todavía no hay nada registrado.",
    noMoreActivity: "Eso es todo.",
    activeDevices: "Dispositivos con sesión iniciada",
    activeDevicesEmpty: "Ahorita no hay ningún otro dispositivo con la sesión abierta.",
    thisDevice: "Este dispositivo",
    signOutThisDevice: "Cerrar sesión en este dispositivo",
    signOutThisDeviceConfirm:
      "Ese dispositivo se cierra al instante y va a tener que iniciar sesión de nuevo. El dispositivo actual no se ve afectado.",
    deviceSignedOut: "Ese dispositivo ya cerró la sesión.",
    unknownDevice: "Dispositivo desconocido",
    unknownIp: "Dirección desconocida",

    eventLogin: "Inicio de sesión",
    eventPasswordChanged: "Cambió la contraseña",
    eventMfaEnrolled: "Activó la verificación en dos pasos",
    eventMfaUnenrolled: "Desactivó la verificación en dos pasos",
    eventKeyAdded: "Agregó una clave de API",
    eventKeyRevoked: "Revocó una clave de API",
    eventSpendBlocked: "Gasto detenido por el límite diario",
    eventLogoutAll: "Cerró la sesión en todos los dispositivos",
    eventUnknown: "Otra actividad de la cuenta",
    eventDenied: "Rechazado",

    dailyLimit: "Límite de gasto diario",
    dailyLimitWhy:
      "Es un seguro para ti: si alguien más entra a tu cuenta, esto marca cuánto puede costarte como máximo en un día.",
    dailyLimitNone: "Ahorita sin límite.",
    dailyLimitNow: "Ahora son {yuan} CNY al día.",
    spentToday: "Gastado hoy: {yuan} CNY.",
    limitPlaceholder: "por ejemplo 50",
    limitUnitYuan: "CNY / día",
    saveLimit: "Guardar el límite",
    removeLimit: "Quitar el límite",
    limitSaved: "Límite guardado.",
    limitInvalid: "Escribe un monto de 0 o más.",

    errSignedOut: "Tu sesión venció. Vuelve a iniciar sesión.",
    errOffline: "No se llega al servidor. Revisa tu conexión e inténtalo de nuevo.",
    errNotAvailable: "Esta parte todavía no está en marcha. Vuelve en unos días.",
    errNotFound: "Ese registro ya no existe.",
    errRateLimited: "Demasiados intentos seguidos. Espera un momento.",
    errServer: "Algo falló en el servidor. Inténtalo más tarde.",
  },

  fr: {
    forgotPassword: "Mot de passe oublié ?",
    resetTitle: "Récupérer le mot de passe",
    resetIntro:
      "Saisis l'adresse e-mail de ton inscription, nous t'envoyons un lien de réinitialisation.",
    resetSend: "Envoyer le lien",
    resetSentTitle: "L'e-mail est parti",
    resetSentDetail:
      "Il peut mettre quelques minutes et atterrir dans les spams. Si rien n'arrive, attends un peu et renvoie-le : pour l'instant, 2 e-mails par heure au maximum.",
    backToSignIn: "Retour à la connexion",
    enterEmailFirst: "Saisis d'abord ton adresse e-mail.",

    newPasswordTitle: "Définir un nouveau mot de passe",
    newPasswordIntro:
      "Ce lien ne sert qu'une fois. Reconnecte-toi ensuite avec le nouveau mot de passe.",
    newPassword: "Nouveau mot de passe",
    newPasswordAgain: "Saisis-le encore une fois",
    savePassword: "Enregistrer le nouveau mot de passe",
    passwordSavedTitle: "Le nouveau mot de passe est actif",
    passwordSavedDetail:
      "Les autres appareils restent connectés. Si cela t'inquiète, connecte-toi et utilise « Déconnecter partout » dans la sécurité du compte.",
    passwordMismatch: "Les deux mots de passe ne sont pas identiques.",
    passwordTooShort: "Un mot de passe demande au moins 6 caractères.",
    resetLinkExpired: "Ce lien a expiré. Retourne à la connexion et demandes-en un nouveau.",
    resetLinkMissing: "Cette page ne fonctionne que si tu l'ouvres depuis le lien de l'e-mail.",

    changePassword: "Changer le mot de passe",
    changePasswordDesc:
      "Changer le mot de passe demande une preuve que c'est bien toi : le mot de passe actuel, ou un code envoyé à ton e-mail.",
    currentPassword: "Mot de passe actuel",
    emailCode: "Code reçu par e-mail",
    sendEmailCode: "Envoyer le code par e-mail",
    emailCodeSent: "Le code part vers ta boîte mail ; cela peut prendre quelques minutes.",
    wrongCurrentPassword: "Ce mot de passe actuel n'est pas le bon.",

    twoStepTitle: "Validation en deux étapes",
    twoStepOff: "Pas encore active. Une fois active, ton mot de passe seul ne suffit plus.",
    twoStepOn:
      "Active. Pour te connecter, il faut ton mot de passe et le code à 6 chiffres de ton authentificateur.",
    turnOnTwoStep: "Activer la validation en deux étapes",
    addAnotherAuthenticator: "Ajouter un autre authentificateur",
    scanQr: "Scanne ce QR code avec une application d'authentification",
    orTypeSecret: "Impossible de scanner ? Saisis cette clé à la main :",
    copySecret: "Copier la clé",
    secretCopied: "Clé copiée.",
    enterSixDigits: "Saisis le code à 6 chiffres affiché en ce moment par ton authentificateur",
    sixDigits: "6 chiffres",
    confirmAndEnable: "Confirmer et activer",
    twoStepEnabled: "La validation en deux étapes est active.",
    removeAuthenticatorConfirm:
      "Une fois retiré, ton mot de passe seul suffit pour entrer dans ce compte. On le retire ?",
    twoStepRemoved: "Validation en deux étapes retirée.",
    verifyBeforeRemove: "Saisis le code à 6 chiffres de ton authentificateur avant de le retirer.",
    lostAuthenticatorTitle: "Si tu perds ton authentificateur",
    lostAuthenticatorBody:
      "Nous ne distribuons pas encore de codes de secours. Si tu perds ton téléphone ou en changes, écris à support@oceanleo.com ; nous vérifions ton identité à la main, nous le retirons pour toi, et tu le reconfigures.",
    unnamedAuthenticator: "Authentificateur sans nom",
    authenticatorAddedOn: "Ajouté le {date}",
    badTotpCode: "Ce code est faux, ou ses 30 secondes sont déjà passées.",
    twoStepUnavailable:
      "La validation en deux étapes ne peut pas être configurée pour le moment. Réessaie plus tard.",

    twoStepPromptTitle: "Encore une étape",
    twoStepPromptDetail:
      "Ce compte utilise la validation en deux étapes. Ouvre ton application d'authentification et saisis le code à 6 chiffres qu'elle affiche.",

    securityCenter: "Sécurité du compte",
    securityCenterDesc:
      "Connexions et modifications récentes, appareils encore connectés, et plafond de dépense par jour",
    recentActivity: "Activité récente",
    recentActivityEmpty: "Rien d'enregistré pour l'instant.",
    noMoreActivity: "C'est tout.",
    activeDevices: "Appareils connectés",
    activeDevicesEmpty: "Aucun autre appareil n'est connecté en ce moment.",
    thisDevice: "Cet appareil",
    signOutThisDevice: "Déconnecter cet appareil",
    signOutThisDeviceConfirm:
      "Cet appareil est déconnecté immédiatement et devra se reconnecter. L'appareil actuel n'est pas touché.",
    deviceSignedOut: "Cet appareil est déconnecté.",
    unknownDevice: "Appareil inconnu",
    unknownIp: "Adresse inconnue",

    eventLogin: "Connexion",
    eventPasswordChanged: "A changé le mot de passe",
    eventMfaEnrolled: "A activé la validation en deux étapes",
    eventMfaUnenrolled: "A désactivé la validation en deux étapes",
    eventKeyAdded: "A ajouté une clé d'API",
    eventKeyRevoked: "A révoqué une clé d'API",
    eventSpendBlocked: "Dépense bloquée par le plafond quotidien",
    eventLogoutAll: "S'est déconnecté partout",
    eventUnknown: "Autre activité du compte",
    eventDenied: "Refusé",

    dailyLimit: "Plafond de dépense quotidien",
    dailyLimitWhy:
      "C'est une assurance pour toi : si quelqu'un entre dans ton compte, cela fixe la perte maximale d'une journée.",
    dailyLimitNone: "Sans plafond pour l'instant.",
    dailyLimitNow: "Actuellement {yuan} CNY par jour.",
    spentToday: "Dépensé aujourd'hui : {yuan} CNY.",
    limitPlaceholder: "par exemple 50",
    limitUnitYuan: "CNY / jour",
    saveLimit: "Enregistrer le plafond",
    removeLimit: "Retirer le plafond",
    limitSaved: "Plafond enregistré.",
    limitInvalid: "Saisis un montant supérieur ou égal à 0.",

    errSignedOut: "Ta session a expiré. Reconnecte-toi.",
    errOffline: "Le serveur est injoignable. Vérifie ta connexion et réessaie.",
    errNotAvailable: "Cette partie n'est pas encore en ligne. Reviens dans quelques jours.",
    errNotFound: "Cet enregistrement n'existe plus.",
    errRateLimited: "Trop de tentatives d'affilée. Attends un instant.",
    errServer: "Un problème est survenu sur le serveur. Réessaie plus tard.",
  },

  it: {
    forgotPassword: "Password dimenticata?",
    resetTitle: "Recupera la password",
    resetIntro:
      "Scrivi l'email con cui ti sei registrato e ti mandiamo un link per reimpostarla.",
    resetSend: "Invia il link",
    resetSentTitle: "L'email è partita",
    resetSentDetail:
      "Può metterci qualche minuto e finire nello spam. Se non arriva niente, aspetta un po' e rimandala: per ora possiamo inviare al massimo 2 email all'ora.",
    backToSignIn: "Torna all'accesso",
    enterEmailFirst: "Scrivi prima il tuo indirizzo email.",

    newPasswordTitle: "Imposta una nuova password",
    newPasswordIntro: "Questo link vale una volta sola. Poi accedi con la nuova password.",
    newPassword: "Nuova password",
    newPasswordAgain: "Scrivila di nuovo",
    savePassword: "Salva la nuova password",
    passwordSavedTitle: "La nuova password è attiva",
    passwordSavedDetail:
      "Gli altri dispositivi restano collegati. Se ti preoccupa, accedi e usa «Esci da tutti i dispositivi» nella sicurezza dell'account.",
    passwordMismatch: "Le due password non coincidono.",
    passwordTooShort: "La password richiede almeno 6 caratteri.",
    resetLinkExpired: "Questo link è scaduto. Torna all'accesso e chiedine uno nuovo.",
    resetLinkMissing: "Questa pagina funziona solo se la apri dal link nell'email.",

    changePassword: "Cambia la password",
    changePasswordDesc:
      "Per cambiare la password devi dimostrare di essere tu: con la password attuale oppure con un codice inviato alla tua email.",
    currentPassword: "Password attuale",
    emailCode: "Codice via email",
    sendEmailCode: "Invia il codice via email",
    emailCodeSent: "Il codice sta arrivando nella tua casella; può metterci qualche minuto.",
    wrongCurrentPassword: "La password attuale non è corretta.",

    twoStepTitle: "Verifica in due passaggi",
    twoStepOff: "Non è ancora attiva. Con lei attiva, la sola password non basta per entrare.",
    twoStepOn:
      "Attiva. Per entrare servono la password e il codice a 6 cifre del tuo autenticatore.",
    turnOnTwoStep: "Attiva la verifica in due passaggi",
    addAnotherAuthenticator: "Aggiungi un altro autenticatore",
    scanQr: "Inquadra questo codice QR con un'app di autenticazione",
    orTypeSecret: "Non riesci a inquadrarlo? Scrivi questa chiave a mano:",
    copySecret: "Copia la chiave",
    secretCopied: "Chiave copiata.",
    enterSixDigits: "Scrivi il codice a 6 cifre che il tuo autenticatore mostra adesso",
    sixDigits: "6 cifre",
    confirmAndEnable: "Conferma e attiva",
    twoStepEnabled: "La verifica in due passaggi è attiva.",
    removeAuthenticatorConfirm:
      "Una volta rimosso, la sola password basta per entrare in questo account. Lo rimuoviamo?",
    twoStepRemoved: "Verifica in due passaggi rimossa.",
    verifyBeforeRemove: "Scrivi il codice a 6 cifre del tuo autenticatore prima di rimuoverlo.",
    lostAuthenticatorTitle: "Se perdi l'autenticatore",
    lostAuthenticatorBody:
      "Non distribuiamo ancora codici di recupero. Se perdi il telefono o lo cambi, scrivi a support@oceanleo.com; verifichiamo la tua identità a mano, lo rimuoviamo per te e tu lo riconfiguri.",
    unnamedAuthenticator: "Autenticatore senza nome",
    authenticatorAddedOn: "Aggiunto il {date}",
    badTotpCode: "Il codice è sbagliato, oppure i suoi 30 secondi sono già passati.",
    twoStepUnavailable:
      "Al momento la verifica in due passaggi non si può attivare. Riprova più tardi.",

    twoStepPromptTitle: "Ancora un passaggio",
    twoStepPromptDetail:
      "Questo account usa la verifica in due passaggi. Apri l'app di autenticazione e scrivi il codice a 6 cifre che mostra adesso.",

    securityCenter: "Sicurezza dell'account",
    securityCenterDesc:
      "Accessi e modifiche recenti, dispositivi ancora collegati e quanto si può spendere al giorno",
    recentActivity: "Attività recente",
    recentActivityEmpty: "Non c'è ancora niente registrato.",
    noMoreActivity: "È tutto.",
    activeDevices: "Dispositivi collegati",
    activeDevicesEmpty: "Al momento nessun altro dispositivo è collegato.",
    thisDevice: "Questo dispositivo",
    signOutThisDevice: "Disconnetti questo dispositivo",
    signOutThisDeviceConfirm:
      "Quel dispositivo viene disconnesso subito e dovrà riaccedere. Il dispositivo attuale non viene toccato.",
    deviceSignedOut: "Quel dispositivo è stato disconnesso.",
    unknownDevice: "Dispositivo sconosciuto",
    unknownIp: "Indirizzo sconosciuto",

    eventLogin: "Accesso",
    eventPasswordChanged: "Ha cambiato la password",
    eventMfaEnrolled: "Ha attivato la verifica in due passaggi",
    eventMfaUnenrolled: "Ha disattivato la verifica in due passaggi",
    eventKeyAdded: "Ha aggiunto una chiave API",
    eventKeyRevoked: "Ha revocato una chiave API",
    eventSpendBlocked: "Spesa fermata dal limite giornaliero",
    eventLogoutAll: "È uscito da tutti i dispositivi",
    eventUnknown: "Altra attività dell'account",
    eventDenied: "Rifiutato",

    dailyLimit: "Limite di spesa giornaliero",
    dailyLimitWhy:
      "È un'assicurazione per te: se qualcun altro entra nel tuo account, questo fissa la perdita massima di una giornata.",
    dailyLimitNone: "Al momento senza limite.",
    dailyLimitNow: "Adesso è {yuan} CNY al giorno.",
    spentToday: "Speso oggi: {yuan} CNY.",
    limitPlaceholder: "per esempio 50",
    limitUnitYuan: "CNY / giorno",
    saveLimit: "Salva il limite",
    removeLimit: "Togli il limite",
    limitSaved: "Limite salvato.",
    limitInvalid: "Scrivi un importo pari o superiore a 0.",

    errSignedOut: "La sessione è scaduta. Accedi di nuovo.",
    errOffline: "Il server non risponde. Controlla la connessione e riprova.",
    errNotAvailable: "Questa parte non è ancora online. Torna tra qualche giorno.",
    errNotFound: "Quel record non c'è più.",
    errRateLimited: "Troppi tentativi di fila. Aspetta un momento.",
    errServer: "Qualcosa è andato storto sul server. Riprova più tardi.",
  },

  "pt-BR": {
    forgotPassword: "Esqueceu a senha?",
    resetTitle: "Recuperar a senha",
    resetIntro: "Digite o e-mail do seu cadastro e mandamos um link para redefinir.",
    resetSend: "Enviar link",
    resetSentTitle: "O e-mail já está a caminho",
    resetSentDetail:
      "Pode demorar alguns minutos e cair no spam. Se não chegar nada, espere um pouco e envie de novo: por enquanto conseguimos mandar no máximo 2 e-mails por hora.",
    backToSignIn: "Voltar para o login",
    enterEmailFirst: "Digite primeiro o seu endereço de e-mail.",

    newPasswordTitle: "Definir uma nova senha",
    newPasswordIntro: "Este link vale só uma vez. Depois entre com a senha nova.",
    newPassword: "Nova senha",
    newPasswordAgain: "Digite de novo",
    savePassword: "Salvar a nova senha",
    passwordSavedTitle: "A nova senha já está valendo",
    passwordSavedDetail:
      "Os outros aparelhos continuam conectados. Se isso te preocupa, entre e use «Sair de todos os aparelhos» na segurança da conta.",
    passwordMismatch: "As duas senhas não são iguais.",
    passwordTooShort: "A senha precisa de pelo menos 6 caracteres.",
    resetLinkExpired: "Este link já expirou. Volte ao login e peça um novo.",
    resetLinkMissing: "Esta página só funciona se você abrir pelo link do e-mail.",

    changePassword: "Trocar a senha",
    changePasswordDesc:
      "Para trocar a senha você precisa provar que é você: com a senha atual ou com um código enviado ao seu e-mail.",
    currentPassword: "Senha atual",
    emailCode: "Código do e-mail",
    sendEmailCode: "Enviar código por e-mail",
    emailCodeSent: "O código está indo para a sua caixa de entrada; pode demorar alguns minutos.",
    wrongCurrentPassword: "Essa senha atual não está correta.",

    twoStepTitle: "Verificação em duas etapas",
    twoStepOff: "Ainda não está ligada. Com ela ligada, só a sua senha não entra mais.",
    twoStepOn:
      "Ligada. Para entrar você precisa da senha e do código de 6 dígitos do seu autenticador.",
    turnOnTwoStep: "Ligar a verificação em duas etapas",
    addAnotherAuthenticator: "Adicionar outro autenticador",
    scanQr: "Escaneie este QR code com um aplicativo autenticador",
    orTypeSecret: "Não dá para escanear? Digite esta chave na mão:",
    copySecret: "Copiar a chave",
    secretCopied: "Chave copiada.",
    enterSixDigits: "Digite o código de 6 dígitos que o seu autenticador mostra agora",
    sixDigits: "6 dígitos",
    confirmAndEnable: "Confirmar e ligar",
    twoStepEnabled: "A verificação em duas etapas está ligada.",
    removeAuthenticatorConfirm:
      "Depois de remover, só a sua senha já entra nesta conta. Remover mesmo?",
    twoStepRemoved: "Verificação em duas etapas removida.",
    verifyBeforeRemove: "Digite o código de 6 dígitos do seu autenticador antes de remover.",
    lostAuthenticatorTitle: "Se você perder o autenticador",
    lostAuthenticatorBody:
      "Ainda não entregamos códigos de recuperação. Se perder o celular ou trocar de aparelho, escreva para support@oceanleo.com; conferimos a sua identidade na mão, removemos para você e você configura de novo.",
    unnamedAuthenticator: "Autenticador sem nome",
    authenticatorAddedOn: "Adicionado em {date}",
    badTotpCode: "Esse código está errado, ou os 30 segundos dele já passaram.",
    twoStepUnavailable:
      "Agora não dá para ligar a verificação em duas etapas. Tente mais tarde.",

    twoStepPromptTitle: "Mais uma etapa",
    twoStepPromptDetail:
      "Esta conta usa verificação em duas etapas. Abra o aplicativo autenticador e digite o código de 6 dígitos que ele mostra agora.",

    securityCenter: "Segurança da conta",
    securityCenterDesc:
      "Logins e mudanças recentes, aparelhos ainda conectados e quanto dá para gastar por dia",
    recentActivity: "Atividade recente",
    recentActivityEmpty: "Ainda não há nada registrado.",
    noMoreActivity: "Isso é tudo.",
    activeDevices: "Aparelhos conectados",
    activeDevicesEmpty: "Nenhum outro aparelho está conectado agora.",
    thisDevice: "Este aparelho",
    signOutThisDevice: "Desconectar este aparelho",
    signOutThisDeviceConfirm:
      "Esse aparelho é desconectado na hora e vai ter que entrar de novo. O aparelho atual não é afetado.",
    deviceSignedOut: "Esse aparelho foi desconectado.",
    unknownDevice: "Aparelho desconhecido",
    unknownIp: "Endereço desconhecido",

    eventLogin: "Login",
    eventPasswordChanged: "Trocou a senha",
    eventMfaEnrolled: "Ligou a verificação em duas etapas",
    eventMfaUnenrolled: "Desligou a verificação em duas etapas",
    eventKeyAdded: "Adicionou uma chave de API",
    eventKeyRevoked: "Revogou uma chave de API",
    eventSpendBlocked: "Gasto barrado pelo limite diário",
    eventLogoutAll: "Saiu de todos os aparelhos",
    eventUnknown: "Outra atividade da conta",
    eventDenied: "Negado",

    dailyLimit: "Limite de gasto diário",
    dailyLimitWhy:
      "É um seguro para você mesmo: se alguém entrar na sua conta, isso define quanto no máximo um dia pode custar.",
    dailyLimitNone: "Sem limite no momento.",
    dailyLimitNow: "Agora são {yuan} CNY por dia.",
    spentToday: "Gasto hoje: {yuan} CNY.",
    limitPlaceholder: "por exemplo 50",
    limitUnitYuan: "CNY / dia",
    saveLimit: "Salvar o limite",
    removeLimit: "Tirar o limite",
    limitSaved: "Limite salvo.",
    limitInvalid: "Digite um valor de 0 ou mais.",

    errSignedOut: "Sua sessão expirou. Entre de novo.",
    errOffline: "Não dá para alcançar o servidor. Confira a conexão e tente de novo.",
    errNotAvailable: "Esta parte ainda não está no ar. Volte daqui a alguns dias.",
    errNotFound: "Esse registro não existe mais.",
    errRateLimited: "Tentativas demais seguidas. Espere um pouco.",
    errServer: "Algo deu errado no servidor. Tente mais tarde.",
  },

  "pt-PT": {
    forgotPassword: "Esqueceste-te da palavra-passe?",
    resetTitle: "Recuperar a palavra-passe",
    resetIntro: "Escreve o e-mail do teu registo e enviamos uma ligação para a redefinir.",
    resetSend: "Enviar ligação",
    resetSentTitle: "O e-mail já seguiu",
    resetSentDetail:
      "Pode demorar alguns minutos e ir parar ao spam. Se não chegar nada, espera um pouco e envia outra vez: por agora conseguimos enviar no máximo 2 e-mails por hora.",
    backToSignIn: "Voltar ao início de sessão",
    enterEmailFirst: "Escreve primeiro o teu endereço de e-mail.",

    newPasswordTitle: "Definir uma nova palavra-passe",
    newPasswordIntro:
      "Esta ligação só serve uma vez. Depois inicia sessão com a palavra-passe nova.",
    newPassword: "Nova palavra-passe",
    newPasswordAgain: "Escreve outra vez",
    savePassword: "Guardar a nova palavra-passe",
    passwordSavedTitle: "A nova palavra-passe já está activa",
    passwordSavedDetail:
      "Os outros dispositivos continuam com sessão iniciada. Se isso te preocupa, inicia sessão e usa «Terminar sessão em todos» na segurança da conta.",
    passwordMismatch: "As duas palavras-passe não são iguais.",
    passwordTooShort: "A palavra-passe precisa de pelo menos 6 caracteres.",
    resetLinkExpired: "Esta ligação expirou. Volta ao início de sessão e pede outra.",
    resetLinkMissing: "Esta página só funciona se a abrires pela ligação do e-mail.",

    changePassword: "Alterar a palavra-passe",
    changePasswordDesc:
      "Para alterar a palavra-passe tens de provar que és tu: com a palavra-passe actual ou com um código enviado para o teu e-mail.",
    currentPassword: "Palavra-passe actual",
    emailCode: "Código do e-mail",
    sendEmailCode: "Enviar código por e-mail",
    emailCodeSent: "O código vai a caminho da tua caixa de correio; pode demorar alguns minutos.",
    wrongCurrentPassword: "Essa palavra-passe actual não está correcta.",

    twoStepTitle: "Verificação em dois passos",
    twoStepOff: "Ainda não está activa. Com ela activa, só a palavra-passe já não chega.",
    twoStepOn:
      "Activa. Para entrar precisas da palavra-passe e do código de 6 dígitos do teu autenticador.",
    turnOnTwoStep: "Activar a verificação em dois passos",
    addAnotherAuthenticator: "Adicionar outro autenticador",
    scanQr: "Lê este código QR com uma aplicação de autenticação",
    orTypeSecret: "Não consegues ler? Escreve esta chave à mão:",
    copySecret: "Copiar a chave",
    secretCopied: "Chave copiada.",
    enterSixDigits: "Escreve o código de 6 dígitos que o teu autenticador mostra agora",
    sixDigits: "6 dígitos",
    confirmAndEnable: "Confirmar e activar",
    twoStepEnabled: "A verificação em dois passos está activa.",
    removeAuthenticatorConfirm:
      "Depois de removido, só a tua palavra-passe já entra nesta conta. Remover?",
    twoStepRemoved: "Verificação em dois passos removida.",
    verifyBeforeRemove: "Escreve o código de 6 dígitos do teu autenticador antes de o remover.",
    lostAuthenticatorTitle: "Se perderes o autenticador",
    lostAuthenticatorBody:
      "Ainda não distribuímos códigos de recuperação. Se perderes o telemóvel ou o trocares, escreve para support@oceanleo.com; verificamos a tua identidade à mão, removemo-lo por ti e voltas a configurá-lo.",
    unnamedAuthenticator: "Autenticador sem nome",
    authenticatorAddedOn: "Adicionado a {date}",
    badTotpCode: "Esse código está errado, ou os 30 segundos dele já passaram.",
    twoStepUnavailable:
      "Neste momento não é possível activar a verificação em dois passos. Tenta mais tarde.",

    twoStepPromptTitle: "Mais um passo",
    twoStepPromptDetail:
      "Esta conta usa verificação em dois passos. Abre a aplicação de autenticação e escreve o código de 6 dígitos que ela mostra agora.",

    securityCenter: "Segurança da conta",
    securityCenterDesc:
      "Inícios de sessão e alterações recentes, dispositivos ainda com sessão e quanto se pode gastar por dia",
    recentActivity: "Actividade recente",
    recentActivityEmpty: "Ainda não há nada registado.",
    noMoreActivity: "É tudo.",
    activeDevices: "Dispositivos com sessão iniciada",
    activeDevicesEmpty: "Neste momento não há outro dispositivo com sessão iniciada.",
    thisDevice: "Este dispositivo",
    signOutThisDevice: "Terminar sessão neste dispositivo",
    signOutThisDeviceConfirm:
      "Esse dispositivo termina a sessão de imediato e terá de entrar outra vez. O dispositivo actual não é afectado.",
    deviceSignedOut: "Esse dispositivo terminou a sessão.",
    unknownDevice: "Dispositivo desconhecido",
    unknownIp: "Endereço desconhecido",

    eventLogin: "Início de sessão",
    eventPasswordChanged: "Alterou a palavra-passe",
    eventMfaEnrolled: "Activou a verificação em dois passos",
    eventMfaUnenrolled: "Desactivou a verificação em dois passos",
    eventKeyAdded: "Adicionou uma chave de API",
    eventKeyRevoked: "Revogou uma chave de API",
    eventSpendBlocked: "Despesa travada pelo limite diário",
    eventLogoutAll: "Terminou sessão em todos os dispositivos",
    eventUnknown: "Outra actividade da conta",
    eventDenied: "Recusado",

    dailyLimit: "Limite de despesa diário",
    dailyLimitWhy:
      "É um seguro para ti: se alguém entrar na tua conta, isto fixa a perda máxima de um dia.",
    dailyLimitNone: "Neste momento sem limite.",
    dailyLimitNow: "Agora são {yuan} CNY por dia.",
    spentToday: "Gasto hoje: {yuan} CNY.",
    limitPlaceholder: "por exemplo 50",
    limitUnitYuan: "CNY / dia",
    saveLimit: "Guardar o limite",
    removeLimit: "Retirar o limite",
    limitSaved: "Limite guardado.",
    limitInvalid: "Escreve um montante de 0 ou mais.",

    errSignedOut: "A tua sessão expirou. Inicia sessão outra vez.",
    errOffline: "Não é possível chegar ao servidor. Verifica a ligação e tenta outra vez.",
    errNotAvailable: "Esta parte ainda não está no ar. Volta daqui a uns dias.",
    errNotFound: "Esse registo já não existe.",
    errRateLimited: "Demasiadas tentativas seguidas. Espera um momento.",
    errServer: "Correu algo mal no servidor. Tenta mais tarde.",
  },

  vi: {
    forgotPassword: "Quên mật khẩu?",
    resetTitle: "Lấy lại mật khẩu",
    resetIntro: "Nhập email bạn đã đăng ký, chúng tôi sẽ gửi một liên kết đặt lại.",
    resetSend: "Gửi liên kết đặt lại",
    resetSentTitle: "Email đã được gửi đi",
    resetSentDetail:
      "Email có thể mất vài phút mới tới và có thể rơi vào thư rác. Nếu không thấy gì, chờ một lát rồi gửi lại — hiện mỗi giờ chỉ gửi được tối đa 2 email.",
    backToSignIn: "Quay lại đăng nhập",
    enterEmailFirst: "Hãy nhập địa chỉ email trước.",

    newPasswordTitle: "Đặt mật khẩu mới",
    newPasswordIntro: "Liên kết này chỉ dùng được một lần. Sau đó hãy đăng nhập bằng mật khẩu mới.",
    newPassword: "Mật khẩu mới",
    newPasswordAgain: "Nhập lại lần nữa",
    savePassword: "Lưu mật khẩu mới",
    passwordSavedTitle: "Mật khẩu mới đã có hiệu lực",
    passwordSavedDetail:
      "Các thiết bị khác vẫn đang đăng nhập. Nếu bạn lo, hãy đăng nhập rồi dùng «Đăng xuất tất cả thiết bị» trong phần bảo mật tài khoản.",
    passwordMismatch: "Hai lần nhập mật khẩu không giống nhau.",
    passwordTooShort: "Mật khẩu cần ít nhất 6 ký tự.",
    resetLinkExpired: "Liên kết đặt lại này đã hết hạn. Quay lại trang đăng nhập và gửi liên kết mới.",
    resetLinkMissing: "Trang này chỉ dùng được khi bạn mở từ liên kết trong email.",

    changePassword: "Đổi mật khẩu",
    changePasswordDesc:
      "Đổi mật khẩu thì phải chứng minh đúng là bạn: bằng mật khẩu hiện tại, hoặc bằng mã gửi tới email của bạn.",
    currentPassword: "Mật khẩu hiện tại",
    emailCode: "Mã trong email",
    sendEmailCode: "Gửi mã qua email",
    emailCodeSent: "Mã đang được gửi tới hộp thư của bạn; có thể mất vài phút.",
    wrongCurrentPassword: "Mật khẩu hiện tại không đúng.",

    twoStepTitle: "Xác minh hai bước",
    twoStepOff: "Chưa bật. Bật rồi thì chỉ có mật khẩu thôi cũng không vào được.",
    twoStepOn:
      "Đã bật. Khi đăng nhập, ngoài mật khẩu còn phải nhập mã 6 số trên ứng dụng xác thực.",
    turnOnTwoStep: "Bật xác minh hai bước",
    addAnotherAuthenticator: "Thêm một ứng dụng xác thực nữa",
    scanQr: "Quét mã QR này bằng ứng dụng xác thực",
    orTypeSecret: "Không quét được thì nhập tay chuỗi khoá này:",
    copySecret: "Sao chép khoá",
    secretCopied: "Đã sao chép khoá.",
    enterSixDigits: "Nhập mã 6 số mà ứng dụng xác thực đang hiển thị",
    sixDigits: "6 chữ số",
    confirmAndEnable: "Xác nhận và bật",
    twoStepEnabled: "Xác minh hai bước đã bật.",
    removeAuthenticatorConfirm:
      "Gỡ rồi thì chỉ cần mật khẩu là vào được tài khoản này. Vẫn gỡ chứ?",
    twoStepRemoved: "Đã gỡ xác minh hai bước.",
    verifyBeforeRemove: "Nhập mã 6 số trên ứng dụng xác thực trước khi gỡ.",
    lostAuthenticatorTitle: "Mất ứng dụng xác thực thì làm sao",
    lostAuthenticatorBody:
      "Chúng tôi chưa phát mã khôi phục dự phòng. Nếu mất điện thoại hoặc đổi máy, hãy viết thư tới support@oceanleo.com; chúng tôi xác minh danh tính thủ công, gỡ giúp bạn, rồi bạn bật lại.",
    unnamedAuthenticator: "Ứng dụng xác thực chưa đặt tên",
    authenticatorAddedOn: "Thêm ngày {date}",
    badTotpCode: "Mã không đúng, hoặc đã quá hạn 30 giây của nó.",
    twoStepUnavailable: "Hiện chưa bật được xác minh hai bước. Thử lại sau.",

    twoStepPromptTitle: "Thêm một bước nữa",
    twoStepPromptDetail:
      "Tài khoản này có bật xác minh hai bước. Mở ứng dụng xác thực và nhập mã 6 số đang hiển thị.",

    securityCenter: "Bảo mật tài khoản",
    securityCenterDesc:
      "Các lần đăng nhập và thay đổi gần đây, thiết bị còn đang đăng nhập, và mỗi ngày tiêu được tối đa bao nhiêu",
    recentActivity: "Hoạt động gần đây",
    recentActivityEmpty: "Chưa có ghi nhận nào.",
    noMoreActivity: "Hết rồi.",
    activeDevices: "Thiết bị đang đăng nhập",
    activeDevicesEmpty: "Hiện không có thiết bị nào khác đang đăng nhập.",
    thisDevice: "Thiết bị hiện tại",
    signOutThisDevice: "Đăng xuất thiết bị này",
    signOutThisDeviceConfirm:
      "Thiết bị đó sẽ bị đăng xuất ngay và phải đăng nhập lại. Thiết bị bạn đang dùng không bị ảnh hưởng.",
    deviceSignedOut: "Thiết bị đó đã đăng xuất.",
    unknownDevice: "Thiết bị không rõ",
    unknownIp: "Không rõ địa chỉ",

    eventLogin: "Đăng nhập",
    eventPasswordChanged: "Đã đổi mật khẩu",
    eventMfaEnrolled: "Đã bật xác minh hai bước",
    eventMfaUnenrolled: "Đã tắt xác minh hai bước",
    eventKeyAdded: "Đã thêm một khoá API",
    eventKeyRevoked: "Đã thu hồi một khoá API",
    eventSpendBlocked: "Chi tiêu bị hạn mức mỗi ngày chặn lại",
    eventLogoutAll: "Đã đăng xuất mọi thiết bị",
    eventUnknown: "Hoạt động khác của tài khoản",
    eventDenied: "Bị từ chối",

    dailyLimit: "Hạn mức chi tiêu mỗi ngày",
    dailyLimitWhy:
      "Đây là bảo hiểm cho chính bạn: lỡ tài khoản rơi vào tay người khác thì một ngày mất nhiều nhất cũng chỉ bấy nhiêu.",
    dailyLimitNone: "Hiện không giới hạn.",
    dailyLimitNow: "Hiện là {yuan} CNY mỗi ngày.",
    spentToday: "Hôm nay đã tiêu {yuan} CNY.",
    limitPlaceholder: "ví dụ 50",
    limitUnitYuan: "CNY / ngày",
    saveLimit: "Lưu hạn mức",
    removeLimit: "Bỏ hạn mức",
    limitSaved: "Đã lưu hạn mức.",
    limitInvalid: "Hãy nhập số tiền từ 0 trở lên.",

    errSignedOut: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
    errOffline: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    errNotAvailable: "Phần này chưa lên. Vài hôm nữa quay lại xem.",
    errNotFound: "Bản ghi đó không còn nữa.",
    errRateLimited: "Thao tác quá nhiều lần liên tiếp. Chờ một lát rồi thử lại.",
    errServer: "Máy chủ gặp trục trặc. Thử lại sau.",
  },

  tr: {
    forgotPassword: "Şifreni mi unuttun?",
    resetTitle: "Şifreyi kurtar",
    resetIntro: "Kayıt olduğun e-postayı yaz, sana sıfırlama bağlantısı gönderelim.",
    resetSend: "Sıfırlama bağlantısı gönder",
    resetSentTitle: "E-posta yola çıktı",
    resetSentDetail:
      "Birkaç dakika sürebilir ve spam klasörüne düşebilir. Hiçbir şey gelmezse biraz bekleyip tekrar gönder — şimdilik saatte en fazla 2 e-posta gönderebiliyoruz.",
    backToSignIn: "Girişe dön",
    enterEmailFirst: "Önce e-posta adresini yaz.",

    newPasswordTitle: "Yeni şifre belirle",
    newPasswordIntro: "Bu bağlantı yalnızca bir kez çalışır. Sonrasında yeni şifreyle giriş yap.",
    newPassword: "Yeni şifre",
    newPasswordAgain: "Bir daha yaz",
    savePassword: "Yeni şifreyi kaydet",
    passwordSavedTitle: "Yeni şifre geçerli oldu",
    passwordSavedDetail:
      "Diğer cihazlar açık kalmaya devam eder. Bu seni rahatsız ediyorsa giriş yapıp hesap güvenliğinde «Tüm cihazlardan çık» seçeneğini kullan.",
    passwordMismatch: "İki şifre birbirini tutmuyor.",
    passwordTooShort: "Şifre en az 6 karakter olmalı.",
    resetLinkExpired: "Bu sıfırlama bağlantısının süresi doldu. Giriş sayfasına dönüp yenisini iste.",
    resetLinkMissing: "Bu sayfa yalnızca e-postadaki bağlantıdan açıldığında işe yarar.",

    changePassword: "Şifreyi değiştir",
    changePasswordDesc:
      "Şifre değiştirmek için sen olduğunu kanıtlaman gerekir: ya mevcut şifrenle ya da e-postana gönderilen kodla.",
    currentPassword: "Mevcut şifre",
    emailCode: "E-posta kodu",
    sendEmailCode: "E-posta kodu gönder",
    emailCodeSent: "Kod gelen kutuna doğru yolda; birkaç dakika sürebilir.",
    wrongCurrentPassword: "Bu mevcut şifre doğru değil.",

    twoStepTitle: "İki adımlı doğrulama",
    twoStepOff: "Henüz açık değil. Açtığında yalnızca şifren yeterli olmaz.",
    twoStepOn:
      "Açık. Girerken şifrenin yanında doğrulayıcıdaki 6 haneli kodu da yazman gerekir.",
    turnOnTwoStep: "İki adımlı doğrulamayı aç",
    addAnotherAuthenticator: "Bir doğrulayıcı daha ekle",
    scanQr: "Bu QR kodunu bir doğrulayıcı uygulamayla okut",
    orTypeSecret: "Okutamıyor musun? Bu anahtarı elle yaz:",
    copySecret: "Anahtarı kopyala",
    secretCopied: "Anahtar kopyalandı.",
    enterSixDigits: "Doğrulayıcının şu anda gösterdiği 6 haneli kodu yaz",
    sixDigits: "6 hane",
    confirmAndEnable: "Onayla ve aç",
    twoStepEnabled: "İki adımlı doğrulama açık.",
    removeAuthenticatorConfirm:
      "Kaldırdıktan sonra yalnızca şifrenle bu hesaba girilebilir. Kaldıralım mı?",
    twoStepRemoved: "İki adımlı doğrulama kaldırıldı.",
    verifyBeforeRemove: "Kaldırmadan önce doğrulayıcıdaki 6 haneli kodu yaz.",
    lostAuthenticatorTitle: "Doğrulayıcını kaybedersen",
    lostAuthenticatorBody:
      "Henüz yedek kurtarma kodu vermiyoruz. Telefonunu kaybedersen veya değiştirirsen support@oceanleo.com adresine yaz; kimliğini elle doğrulayıp senin için kaldırırız, sen de yeniden kurarsın.",
    unnamedAuthenticator: "Adsız doğrulayıcı",
    authenticatorAddedOn: "{date} tarihinde eklendi",
    badTotpCode: "Bu kod yanlış ya da 30 saniyesi çoktan doldu.",
    twoStepUnavailable: "İki adımlı doğrulama şu anda kurulamıyor. Sonra tekrar dene.",

    twoStepPromptTitle: "Bir adım daha",
    twoStepPromptDetail:
      "Bu hesapta iki adımlı doğrulama açık. Doğrulayıcı uygulamanı aç ve şu anda gösterdiği 6 haneli kodu yaz.",

    securityCenter: "Hesap güvenliği",
    securityCenterDesc:
      "Son girişler ve değişiklikler, hâlâ açık olan cihazlar ve günde en fazla ne kadar harcanabileceği",
    recentActivity: "Son hareketler",
    recentActivityEmpty: "Henüz kayıt yok.",
    noMoreActivity: "Hepsi bu kadar.",
    activeDevices: "Girişi açık cihazlar",
    activeDevicesEmpty: "Şu anda başka bir cihazda giriş yok.",
    thisDevice: "Bu cihaz",
    signOutThisDevice: "Bu cihazdan çık",
    signOutThisDeviceConfirm:
      "O cihaz hemen çıkış yapar ve yeniden giriş yapması gerekir. Şu anki cihaz etkilenmez.",
    deviceSignedOut: "O cihaz çıkış yaptı.",
    unknownDevice: "Bilinmeyen cihaz",
    unknownIp: "Adres bilinmiyor",

    eventLogin: "Giriş",
    eventPasswordChanged: "Şifreyi değiştirdi",
    eventMfaEnrolled: "İki adımlı doğrulamayı açtı",
    eventMfaUnenrolled: "İki adımlı doğrulamayı kapattı",
    eventKeyAdded: "Bir API anahtarı ekledi",
    eventKeyRevoked: "Bir API anahtarını iptal etti",
    eventSpendBlocked: "Harcama günlük limite takıldı",
    eventLogoutAll: "Tüm cihazlardan çıktı",
    eventUnknown: "Diğer hesap hareketi",
    eventDenied: "Reddedildi",

    dailyLimit: "Günlük harcama limiti",
    dailyLimitWhy:
      "Bu kendine karşı bir sigorta: hesabına başkası girerse bir günün sana en fazla neye mal olacağını belirler.",
    dailyLimitNone: "Şu anda sınırsız.",
    dailyLimitNow: "Şu anda günde {yuan} CNY.",
    spentToday: "Bugün harcanan: {yuan} CNY.",
    limitPlaceholder: "örneğin 50",
    limitUnitYuan: "CNY / gün",
    saveLimit: "Limiti kaydet",
    removeLimit: "Limiti kaldır",
    limitSaved: "Limit kaydedildi.",
    limitInvalid: "0 veya daha büyük bir tutar yaz.",

    errSignedOut: "Oturumun sona erdi. Yeniden giriş yap.",
    errOffline: "Sunucuya ulaşılamıyor. Bağlantını kontrol edip tekrar dene.",
    errNotAvailable: "Bu bölüm henüz yayında değil. Birkaç gün sonra tekrar bak.",
    errNotFound: "O kayıt artık yok.",
    errRateLimited: "Arka arkaya çok fazla deneme oldu. Biraz bekle.",
    errServer: "Sunucuda bir şeyler ters gitti. Sonra tekrar dene.",
  },
} satisfies Record<
  "en" | "de" | "es" | "es-419" | "fr" | "it" | "pt-BR" | "pt-PT" | "vi" | "tr",
  AccountSecurityCopyMessages
>;
