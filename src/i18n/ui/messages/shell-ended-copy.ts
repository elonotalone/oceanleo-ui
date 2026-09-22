// Shell 自己结束时的句子。缺会话、退出码、错误码各一句，不和「这个 Shell 已结束」共用。

import { assembleCopy } from "./shell-overhaul-copy-shared";

export const SHELL_ENDED_ZH = {
  missingSession: "缺少会话，这个 Shell 没有开始。",
  endedExit: "这个 Shell 已结束，退出码 {code}。",
  endedError: "这个 Shell 已结束，错误码 {code}。",
} as const;

const SOURCE = {
  missingSession: SHELL_ENDED_ZH.missingSession,
  endedExit: SHELL_ENDED_ZH.endedExit,
  endedError: SHELL_ENDED_ZH.endedError,
} as const;

export const SHELL_ENDED_MESSAGES = assembleCopy(SOURCE, {
  en: {
    missingSession: "The session is missing, so this Shell did not start.",
    endedExit: "This Shell has ended. Exit code {code}.",
    endedError: "This Shell has ended. Error code {code}.",
  },
  de: {
    missingSession: "Die Sitzung fehlt, deshalb hat diese Shell nicht angefangen.",
    endedExit: "Diese Shell ist beendet. Exit-Code {code}.",
    endedError: "Diese Shell ist beendet. Fehlercode {code}.",
  },
  es: {
    missingSession: "Falta la sesión, así que este Shell no ha empezado.",
    endedExit: "Este Shell ha terminado. Código de salida {code}.",
    endedError: "Este Shell ha terminado. Código de error {code}.",
  },
  "es-419": {
    missingSession: "Falta la sesión, así que este Shell no empezó.",
    endedExit: "Este Shell ya terminó. Código de salida {code}.",
    endedError: "Este Shell ya terminó. Código de error {code}.",
  },
  fr: {
    missingSession: "La session manque, donc ce Shell n'a pas démarré.",
    endedExit: "Ce Shell est terminé. Code de sortie {code}.",
    endedError: "Ce Shell est terminé. Code d'erreur {code}.",
  },
  it: {
    missingSession: "Manca la sessione, quindi questa Shell non è partita.",
    endedExit: "Questa Shell è terminata. Codice di uscita {code}.",
    endedError: "Questa Shell è terminata. Codice di errore {code}.",
  },
  "pt-BR": {
    missingSession: "Falta a sessão, então este Shell não começou.",
    endedExit: "Este Shell encerrou. Código de saída {code}.",
    endedError: "Este Shell encerrou. Código de erro {code}.",
  },
  "pt-PT": {
    missingSession: "Falta a sessão, por isso este Shell não começou.",
    endedExit: "Este Shell terminou. Código de saída {code}.",
    endedError: "Este Shell terminou. Código de erro {code}.",
  },
  vi: {
    missingSession: "Thiếu phiên, nên Shell này chưa bắt đầu.",
    endedExit: "Shell này đã kết thúc. Mã thoát {code}.",
    endedError: "Shell này đã kết thúc. Mã lỗi {code}.",
  },
  tr: {
    missingSession: "Oturum eksik, bu yüzden bu Shell başlamadı.",
    endedExit: "Bu Shell sona erdi. Çıkış kodu {code}.",
    endedError: "Bu Shell sona erdi. Hata kodu {code}.",
  },
  "zh-TW": {
    missingSession: "缺少工作階段，這個 Shell 沒有開始。",
    endedExit: "這個 Shell 已結束，結束碼 {code}。",
    endedError: "這個 Shell 已結束，錯誤碼 {code}。",
  },
  ja: {
    missingSession: "セッションがないので、この Shell は始まっていません。",
    endedExit: "この Shell は終了しました。終了コード {code}。",
    endedError: "この Shell は終了しました。エラーコード {code}。",
  },
  ko: {
    missingSession: "세션이 없어 이 Shell은 시작되지 않았습니다.",
    endedExit: "이 Shell이 종료되었습니다. 종료 코드 {code}.",
    endedError: "이 Shell이 종료되었습니다. 오류 코드 {code}.",
  },
  ar: {
    missingSession: "الجلسة ناقصة، لذلك لم يبدأ Shell هذا.",
    endedExit: "انتهت هذه الـ Shell. رمز الخروج {code}.",
    endedError: "انتهت هذه الـ Shell. رمز الخطأ {code}.",
  },
  th: {
    missingSession: "ไม่มีเซสชัน ดังนั้น Shell นี้ยังไม่เริ่ม",
    endedExit: "Shell นี้จบแล้ว รหัสออก {code}",
    endedError: "Shell นี้จบแล้ว รหัสข้อผิดพลาด {code}",
  },
  hi: {
    missingSession: "सत्र नहीं है, इसलिए यह Shell शुरू नहीं हुआ।",
    endedExit: "यह Shell समाप्त हो गया। निकास कोड {code}।",
    endedError: "यह Shell समाप्त हो गया। त्रुटि कोड {code}।",
  },
});
