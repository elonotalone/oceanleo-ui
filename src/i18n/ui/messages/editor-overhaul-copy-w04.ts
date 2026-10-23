// 2026-10-23 编辑器整改波 W04 的新文案。只有 W04 改这一册。
// key = 中文原文（tt("…") 里那一句）；16 个非中文语种都要给，不许留中文。
// artifact-client.ts 的请求失败原因（父 agent 转 W01：英文界面显示中文）。
import type { EditorOverhaulCopy } from "./editor-overhaul-copy-types";

export const EDITOR_OVERHAUL_W04_COPY: EditorOverhaulCopy = {
  de: {
    "素材请求超时，请重试。": "Zeitüberschreitung bei der Dateianfrage. Bitte erneut versuchen.",
    "素材请求已取消。": "Dateianfrage abgebrochen.",
    "连不上素材服务，请检查网络后重试。": "Dateidienst nicht erreichbar. Prüfe die Verbindung und versuche es erneut.",
  },
  en: {
    "素材请求超时，请重试。": "The file request timed out. Please try again.",
    "素材请求已取消。": "The file request was canceled.",
    "连不上素材服务，请检查网络后重试。": "Can't reach the file service. Check your connection and try again.",
  },
  es: {
    "素材请求超时，请重试。": "La solicitud del archivo ha caducado. Inténtalo de nuevo.",
    "素材请求已取消。": "Se canceló la solicitud del archivo.",
    "连不上素材服务，请检查网络后重试。": "No se puede conectar con el servicio de archivos. Revisa la conexión e inténtalo de nuevo.",
  },
  "es-419": {
    "素材请求超时，请重试。": "Se agotó el tiempo de la solicitud del archivo. Vuelve a intentarlo.",
    "素材请求已取消。": "Se canceló la solicitud del archivo.",
    "连不上素材服务，请检查网络后重试。": "No se puede conectar con el servicio de archivos. Revisa la conexión y vuelve a intentarlo.",
  },
  fr: {
    "素材请求超时，请重试。": "La requête du fichier a expiré. Réessayez.",
    "素材请求已取消。": "La requête du fichier a été annulée.",
    "连不上素材服务，请检查网络后重试。": "Impossible de joindre le service de fichiers. Vérifiez la connexion et réessayez.",
  },
  it: {
    "素材请求超时，请重试。": "La richiesta del file è scaduta. Riprova.",
    "素材请求已取消。": "Richiesta del file annullata.",
    "连不上素材服务，请检查网络后重试。": "Impossibile raggiungere il servizio file. Controlla la connessione e riprova.",
  },
  "pt-BR": {
    "素材请求超时，请重试。": "A solicitação do arquivo expirou. Tente novamente.",
    "素材请求已取消。": "A solicitação do arquivo foi cancelada.",
    "连不上素材服务，请检查网络后重试。": "Não foi possível acessar o serviço de arquivos. Verifique a conexão e tente novamente.",
  },
  "pt-PT": {
    "素材请求超时，请重试。": "O pedido do ficheiro expirou. Tente novamente.",
    "素材请求已取消。": "O pedido do ficheiro foi cancelado.",
    "连不上素材服务，请检查网络后重试。": "Não é possível aceder ao serviço de ficheiros. Verifique a ligação e tente novamente.",
  },
  vi: {
    "素材请求超时，请重试。": "Yêu cầu tệp đã hết thời gian. Vui lòng thử lại.",
    "素材请求已取消。": "Đã hủy yêu cầu tệp.",
    "连不上素材服务，请检查网络后重试。": "Không kết nối được dịch vụ tệp. Hãy kiểm tra mạng rồi thử lại.",
  },
  tr: {
    "素材请求超时，请重试。": "Dosya isteği zaman aşımına uğradı. Lütfen tekrar deneyin.",
    "素材请求已取消。": "Dosya isteği iptal edildi.",
    "连不上素材服务，请检查网络后重试。": "Dosya hizmetine ulaşılamıyor. Bağlantınızı kontrol edip tekrar deneyin.",
  },
  "zh-TW": {
    "素材请求超时，请重试。": "素材請求逾時，請重試。",
    "素材请求已取消。": "素材請求已取消。",
    "连不上素材服务，请检查网络后重试。": "連不上素材服務，請檢查網路後重試。",
  },
  ja: {
    "素材请求超时，请重试。": "ファイルの取得がタイムアウトしました。もう一度お試しください。",
    "素材请求已取消。": "ファイルの取得をキャンセルしました。",
    "连不上素材服务，请检查网络后重试。": "ファイルサービスに接続できません。接続を確認してもう一度お試しください。",
  },
  ko: {
    "素材请求超时，请重试。": "파일 요청 시간이 초과되었습니다. 다시 시도하세요.",
    "素材请求已取消。": "파일 요청이 취소되었습니다.",
    "连不上素材服务，请检查网络后重试。": "파일 서비스에 연결할 수 없습니다. 연결을 확인한 후 다시 시도하세요.",
  },
  ar: {
    "素材请求超时，请重试。": "انتهت مهلة طلب الملف. حاول مرة أخرى.",
    "素材请求已取消。": "تم إلغاء طلب الملف.",
    "连不上素材服务，请检查网络后重试。": "تعذّر الوصول إلى خدمة الملفات. تحقّق من الاتصال وحاول مرة أخرى.",
  },
  th: {
    "素材请求超时，请重试。": "คำขอไฟล์หมดเวลา โปรดลองอีกครั้ง",
    "素材请求已取消。": "ยกเลิกคำขอไฟล์แล้ว",
    "连不上素材服务，请检查网络后重试。": "เชื่อมต่อบริการไฟล์ไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
  },
  hi: {
    "素材请求超时，请重试。": "फ़ाइल अनुरोध का समय समाप्त हो गया। फिर से कोशिश करें।",
    "素材请求已取消。": "फ़ाइल अनुरोध रद्द कर दिया गया।",
    "连不上素材服务，请检查网络后重试。": "फ़ाइल सेवा तक नहीं पहुँच पा रहे। कनेक्शन जाँचें और फिर से कोशिश करें।",
  },
};
