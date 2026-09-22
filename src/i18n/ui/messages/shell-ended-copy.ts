// Shell 页的结束与断线句子（合同 I2 的 UI 侧）：
//   missingSession  缺会话，没开始；
//   endedExit       服务端 exit 帧，进程真退出，带退出码；
//   endedGone       节点说会话已经不存在；
//   reconnecting    管道断了，退避重连中（细提示条，不是结束）；
//   connectionLost  重连 60 s 没接回来（也不是结束，配 retryConnection 按钮）；
//   retryConnection 手动重试，从头起退避、复用同一会话。
// 「这个 Shell 已结束」（用户主动结束）在 shell-overhaul-dock-copy，不在这里重复。

import { assembleCopy } from "./shell-overhaul-copy-shared";

export const SHELL_ENDED_ZH = {
  missingSession: "缺少会话，这个 Shell 没有开始。",
  endedExit: "这个 Shell 已结束，退出码 {code}。",
  endedGone: "这个 Shell 已经不存在了。",
  reconnecting: "重新连接中…",
  connectionLost: "连接断了。",
  retryConnection: "重新连接",
} as const;

const SOURCE = {
  missingSession: SHELL_ENDED_ZH.missingSession,
  endedExit: SHELL_ENDED_ZH.endedExit,
  endedGone: SHELL_ENDED_ZH.endedGone,
  reconnecting: SHELL_ENDED_ZH.reconnecting,
  connectionLost: SHELL_ENDED_ZH.connectionLost,
  retryConnection: SHELL_ENDED_ZH.retryConnection,
} as const;

export const SHELL_ENDED_MESSAGES = assembleCopy(SOURCE, {
  en: {
    missingSession: "The session is missing, so this Shell did not start.",
    endedExit: "This Shell has ended. Exit code {code}.",
    endedGone: "This Shell no longer exists.",
    reconnecting: "Reconnecting…",
    connectionLost: "Connection lost.",
    retryConnection: "Reconnect",
  },
  de: {
    missingSession: "Die Sitzung fehlt, deshalb hat diese Shell nicht angefangen.",
    endedExit: "Diese Shell ist beendet. Exit-Code {code}.",
    endedGone: "Diese Shell existiert nicht mehr.",
    reconnecting: "Verbindung wird wiederhergestellt…",
    connectionLost: "Verbindung unterbrochen.",
    retryConnection: "Erneut verbinden",
  },
  es: {
    missingSession: "Falta la sesión, así que este Shell no ha empezado.",
    endedExit: "Este Shell ha terminado. Código de salida {code}.",
    endedGone: "Este Shell ya no existe.",
    reconnecting: "Reconectando…",
    connectionLost: "Conexión perdida.",
    retryConnection: "Reconectar",
  },
  "es-419": {
    missingSession: "Falta la sesión, así que este Shell no empezó.",
    endedExit: "Este Shell ya terminó. Código de salida {code}.",
    endedGone: "Este Shell ya no existe.",
    reconnecting: "Reconectando…",
    connectionLost: "Se perdió la conexión.",
    retryConnection: "Reconectar",
  },
  fr: {
    missingSession: "La session manque, donc ce Shell n'a pas démarré.",
    endedExit: "Ce Shell est terminé. Code de sortie {code}.",
    endedGone: "Ce Shell n'existe plus.",
    reconnecting: "Reconnexion en cours…",
    connectionLost: "Connexion perdue.",
    retryConnection: "Se reconnecter",
  },
  it: {
    missingSession: "Manca la sessione, quindi questa Shell non è partita.",
    endedExit: "Questa Shell è terminata. Codice di uscita {code}.",
    endedGone: "Questa Shell non esiste più.",
    reconnecting: "Riconnessione in corso…",
    connectionLost: "Connessione persa.",
    retryConnection: "Riconnetti",
  },
  "pt-BR": {
    missingSession: "Falta a sessão, então este Shell não começou.",
    endedExit: "Este Shell encerrou. Código de saída {code}.",
    endedGone: "Este Shell não existe mais.",
    reconnecting: "Reconectando…",
    connectionLost: "Conexão perdida.",
    retryConnection: "Reconectar",
  },
  "pt-PT": {
    missingSession: "Falta a sessão, por isso este Shell não começou.",
    endedExit: "Este Shell terminou. Código de saída {code}.",
    endedGone: "Este Shell já não existe.",
    reconnecting: "A reconectar…",
    connectionLost: "Ligação perdida.",
    retryConnection: "Reconectar",
  },
  vi: {
    missingSession: "Thiếu phiên, nên Shell này chưa bắt đầu.",
    endedExit: "Shell này đã kết thúc. Mã thoát {code}.",
    endedGone: "Shell này không còn tồn tại.",
    reconnecting: "Đang kết nối lại…",
    connectionLost: "Mất kết nối.",
    retryConnection: "Kết nối lại",
  },
  tr: {
    missingSession: "Oturum eksik, bu yüzden bu Shell başlamadı.",
    endedExit: "Bu Shell sona erdi. Çıkış kodu {code}.",
    endedGone: "Bu Shell artık yok.",
    reconnecting: "Yeniden bağlanılıyor…",
    connectionLost: "Bağlantı kesildi.",
    retryConnection: "Yeniden bağlan",
  },
  "zh-TW": {
    missingSession: "缺少工作階段，這個 Shell 沒有開始。",
    endedExit: "這個 Shell 已結束，結束碼 {code}。",
    endedGone: "這個 Shell 已經不存在了。",
    reconnecting: "重新連線中…",
    connectionLost: "連線斷了。",
    retryConnection: "重新連線",
  },
  ja: {
    missingSession: "セッションがないので、この Shell は始まっていません。",
    endedExit: "この Shell は終了しました。終了コード {code}。",
    endedGone: "この Shell はもう存在しません。",
    reconnecting: "再接続しています…",
    connectionLost: "接続が切れました。",
    retryConnection: "再接続",
  },
  ko: {
    missingSession: "세션이 없어 이 Shell은 시작되지 않았습니다.",
    endedExit: "이 Shell이 종료되었습니다. 종료 코드 {code}.",
    endedGone: "이 Shell은 더 이상 존재하지 않습니다.",
    reconnecting: "다시 연결하는 중…",
    connectionLost: "연결이 끊어졌습니다.",
    retryConnection: "다시 연결",
  },
  ar: {
    missingSession: "الجلسة ناقصة، لذلك لم يبدأ Shell هذا.",
    endedExit: "انتهت هذه الـ Shell. رمز الخروج {code}.",
    endedGone: "هذه الـ Shell لم تعد موجودة.",
    reconnecting: "جارٍ إعادة الاتصال…",
    connectionLost: "انقطع الاتصال.",
    retryConnection: "إعادة الاتصال",
  },
  th: {
    missingSession: "ไม่มีเซสชัน ดังนั้น Shell นี้ยังไม่เริ่ม",
    endedExit: "Shell นี้จบแล้ว รหัสออก {code}",
    endedGone: "Shell นี้ไม่มีอยู่แล้ว",
    reconnecting: "กำลังเชื่อมต่อใหม่…",
    connectionLost: "การเชื่อมต่อขาดหาย",
    retryConnection: "เชื่อมต่อใหม่",
  },
  hi: {
    missingSession: "सत्र नहीं है, इसलिए यह Shell शुरू नहीं हुआ।",
    endedExit: "यह Shell समाप्त हो गया। निकास कोड {code}।",
    endedGone: "यह Shell अब मौजूद नहीं है।",
    reconnecting: "फिर से कनेक्ट हो रहा है…",
    connectionLost: "कनेक्शन टूट गया।",
    retryConnection: "फिर से कनेक्ट करें",
  },
});
