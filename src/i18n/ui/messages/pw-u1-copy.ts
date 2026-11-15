import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  timeout: "等待发送结果超时，请重发。",
  sending: "发送中", retrying: "正在重试", failed: "没有发出", resend: "重发",
  storage: "无法保留这条消息，请允许浏览器存储后重发。",
} as const;
export const PW_U1_MESSAGES = assembleCopy(SOURCE, {
  en: { timeout: "Timed out waiting for a send result. Please resend.", sending: "Sending", retrying: "Retrying", failed: "Not sent", resend: "Resend", storage: "This message could not be saved. Allow browser storage, then resend." },
  de: { timeout: "Zeitüberschreitung beim Warten auf das Sendeergebnis. Bitte erneut senden.", sending: "Wird gesendet", retrying: "Erneuter Versuch", failed: "Nicht gesendet", resend: "Erneut senden", storage: "Diese Nachricht konnte nicht gespeichert werden. Erlaube Browserspeicher und sende sie erneut." },
  es: { timeout: "Se agotó el tiempo de espera del envío. Vuelve a enviarlo.", sending: "Enviando", retrying: "Reintentando", failed: "No enviado", resend: "Reenviar", storage: "No se pudo guardar este mensaje. Permite el almacenamiento del navegador y vuelve a enviarlo." },
  "es-419": { timeout: "Se agotó el tiempo de espera del envío. Vuelve a enviarlo.", sending: "Enviando", retrying: "Reintentando", failed: "No enviado", resend: "Reenviar", storage: "No se pudo guardar este mensaje. Permite el almacenamiento del navegador y vuelve a enviarlo." },
  fr: { timeout: "Le délai d’attente du résultat de l’envoi a expiré. Renvoyez le message.", sending: "Envoi en cours", retrying: "Nouvelle tentative", failed: "Non envoyé", resend: "Renvoyer", storage: "Ce message n’a pas pu être enregistré. Autorisez le stockage du navigateur, puis renvoyez-le." },
  it: { timeout: "Tempo di attesa per l’esito dell’invio scaduto. Invia di nuovo.", sending: "Invio in corso", retrying: "Nuovo tentativo", failed: "Non inviato", resend: "Invia di nuovo", storage: "Impossibile salvare questo messaggio. Consenti l’archiviazione del browser, poi invialo di nuovo." },
  "pt-BR": { timeout: "O tempo de espera pelo resultado do envio acabou. Reenvie.", sending: "Enviando", retrying: "Tentando novamente", failed: "Não enviada", resend: "Reenviar", storage: "Não foi possível salvar esta mensagem. Permita o armazenamento do navegador e reenvie." },
  "pt-PT": { timeout: "O tempo de espera pelo resultado do envio terminou. Reenvie.", sending: "A enviar", retrying: "A tentar novamente", failed: "Não enviada", resend: "Reenviar", storage: "Não foi possível guardar esta mensagem. Permita o armazenamento do navegador e reenvie." },
  vi: { timeout: "Hết thời gian chờ kết quả gửi. Vui lòng gửi lại.", sending: "Đang gửi", retrying: "Đang thử lại", failed: "Chưa gửi", resend: "Gửi lại", storage: "Không lưu được tin nhắn này. Hãy cho phép lưu trữ trên trình duyệt rồi gửi lại." },
  tr: { timeout: "Gönderim sonucu beklenirken süre doldu. Lütfen yeniden gönderin.", sending: "Gönderiliyor", retrying: "Yeniden deneniyor", failed: "Gönderilmedi", resend: "Yeniden gönder", storage: "Bu mesaj kaydedilemedi. Tarayıcı depolamasına izin verip yeniden gönderin." },
  "zh-TW": { timeout: "等待傳送結果逾時，請重送。", sending: "傳送中", retrying: "正在重試", failed: "沒有送出", resend: "重送", storage: "無法保留這則訊息，請允許瀏覽器儲存後重送。" },
  ja: { timeout: "送信結果の待機がタイムアウトしました。再送信してください。", sending: "送信中", retrying: "再試行中", failed: "未送信", resend: "再送信", storage: "このメッセージを保存できませんでした。ブラウザーの保存を許可してから再送信してください。" },
  ko: { timeout: "전송 결과를 기다리는 시간이 초과되었습니다. 다시 보내세요.", sending: "전송 중", retrying: "다시 시도 중", failed: "전송되지 않음", resend: "다시 보내기", storage: "이 메시지를 저장할 수 없습니다. 브라우저 저장소를 허용한 후 다시 보내세요." },
  ar: { timeout: "انتهت مهلة انتظار نتيجة الإرسال. أعد الإرسال.", sending: "جارٍ الإرسال", retrying: "جارٍ إعادة المحاولة", failed: "لم تُرسل", resend: "إعادة الإرسال", storage: "تعذر حفظ هذه الرسالة. اسمح بالتخزين في المتصفح ثم أعد إرسالها." },
  th: { timeout: "หมดเวลารอผลการส่ง โปรดส่งอีกครั้ง", sending: "กำลังส่ง", retrying: "กำลังลองอีกครั้ง", failed: "ยังไม่ได้ส่ง", resend: "ส่งอีกครั้ง", storage: "บันทึกข้อความนี้ไม่ได้ โปรดอนุญาตพื้นที่จัดเก็บของเบราว์เซอร์แล้วส่งอีกครั้ง" },
  hi: { timeout: "भेजने के नतीजे का इंतज़ार करते हुए समय समाप्त हुआ। कृपया फिर भेजें।", sending: "भेजा जा रहा है", retrying: "फिर से कोशिश हो रही है", failed: "नहीं भेजा गया", resend: "फिर भेजें", storage: "यह संदेश सहेजा नहीं जा सका। ब्राउज़र स्टोरेज की अनुमति दें, फिर दोबारा भेजें।" },
});
