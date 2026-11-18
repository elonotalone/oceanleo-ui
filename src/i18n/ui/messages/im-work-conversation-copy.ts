// IW: work conversation copy; keep this block separate from contact-request copy.
import { assembleCopy } from "./shell-overhaul-copy-shared";
const SOURCE = {
  notice: "对方回复前，最多发送三条不含链接的文字消息，暂不能发送附件或通话。",
  friend: "添加好友",
  sent: "请求已发送",
  blocked: "你们之间有拉黑关系，不能发送消息",
  buyer: "联系买家",
} as const;
export const IM_WORK_CONVERSATION_MESSAGES = assembleCopy(SOURCE, {
  en: { notice: "Before they reply, you can send up to three text messages without links. Attachments and calls are unavailable until then.", friend: "Add friend", sent: "Request sent", blocked: "Messages are unavailable because one of you blocked the other.", buyer: "Contact buyer" },
  "zh-TW": { notice: "對方回覆前，最多傳送三則不含連結的文字訊息，暫不能傳送附件或通話。", friend: "新增好友", sent: "請求已傳送", blocked: "你們之間有封鎖關係，無法傳送訊息", buyer: "聯絡買家" },
  ja: { notice: "相手が返信するまではリンクのないテキストを3件まで送れます。添付ファイルと通話は返信後に利用できます。", friend: "友達に追加", sent: "リクエスト送信済み", blocked: "ブロックされているためメッセージを送れません。", buyer: "購入者に連絡" },
  ko: { notice: "상대가 답장하기 전에는 링크 없는 텍스트 메시지를 3개까지 보낼 수 있습니다. 첨부와 통화는 답장 후에 가능합니다.", friend: "친구 추가", sent: "요청 보냄", blocked: "차단 관계로 메시지를 보낼 수 없습니다.", buyer: "구매자에게 연락" },
  fr: { notice: "Avant sa réponse, vous pouvez envoyer trois messages texte sans liens. Les pièces jointes et appels seront ensuite disponibles.", friend: "Ajouter un ami", sent: "Demande envoyée", blocked: "Un blocage empêche l’envoi de messages.", buyer: "Contacter l’acheteur" },
  de: { notice: "Bis zur ersten Antwort sind drei Textnachrichten ohne Links erlaubt. Anhänge und Anrufe sind erst danach verfügbar.", friend: "Als Freund hinzufügen", sent: "Anfrage gesendet", blocked: "Wegen einer Blockierung können keine Nachrichten gesendet werden.", buyer: "Käufer kontaktieren" },
  it: { notice: "Prima della risposta puoi inviare tre messaggi di testo senza link. Allegati e chiamate saranno disponibili dopo la risposta.", friend: "Aggiungi amico", sent: "Richiesta inviata", blocked: "Un blocco impedisce l’invio di messaggi.", buyer: "Contatta l’acquirente" },
  es: { notice: "Antes de su respuesta puedes enviar tres mensajes de texto sin enlaces. Los archivos y las llamadas estarán disponibles después.", friend: "Añadir amigo", sent: "Solicitud enviada", blocked: "Un bloqueo impide enviar mensajes.", buyer: "Contactar al comprador" },
  "es-419": { notice: "Antes de su respuesta puedes enviar tres mensajes de texto sin enlaces. Los archivos y las llamadas estarán disponibles después.", friend: "Agregar amigo", sent: "Solicitud enviada", blocked: "Un bloqueo impide enviar mensajes.", buyer: "Contactar al comprador" },
  "pt-BR": { notice: "Antes da resposta, você pode enviar três mensagens de texto sem links. Anexos e chamadas ficam disponíveis após a resposta.", friend: "Adicionar amigo", sent: "Solicitação enviada", blocked: "Um bloqueio impede o envio de mensagens.", buyer: "Contatar comprador" },
  "pt-PT": { notice: "Antes da resposta, pode enviar três mensagens de texto sem ligações. Anexos e chamadas ficam disponíveis após a resposta.", friend: "Adicionar amigo", sent: "Pedido enviado", blocked: "Um bloqueio impede o envio de mensagens.", buyer: "Contactar comprador" },
  vi: { notice: "Trước khi họ trả lời, bạn có thể gửi tối đa ba tin nhắn văn bản không có liên kết. Tệp đính kèm và cuộc gọi chỉ khả dụng sau khi họ trả lời.", friend: "Thêm bạn", sent: "Đã gửi yêu cầu", blocked: "Không thể gửi tin nhắn do một trong hai người đã chặn người kia.", buyer: "Liên hệ người mua" },
  tr: { notice: "Yanıt gelene kadar bağlantı içermeyen en fazla üç metin mesajı gönderebilirsiniz. Ekler ve aramalar yanıttan sonra kullanılabilir.", friend: "Arkadaş ekle", sent: "İstek gönderildi", blocked: "Engelleme nedeniyle mesaj gönderilemiyor.", buyer: "Alıcıyla iletişime geç" },
  ar: { notice: "قبل الرد يمكنك إرسال ثلاث رسائل نصية دون روابط كحد أقصى. تتاح المرفقات والمكالمات بعد الرد.", friend: "إضافة صديق", sent: "تم إرسال الطلب", blocked: "لا يمكن إرسال الرسائل بسبب الحظر بينكما.", buyer: "مراسلة المشتري" },
  th: { notice: "ก่อนอีกฝ่ายตอบ คุณส่งข้อความที่ไม่มีลิงก์ได้สูงสุดสามข้อความ ไฟล์แนบและการโทรจะใช้ได้หลังจากอีกฝ่ายตอบ", friend: "เพิ่มเพื่อน", sent: "ส่งคำขอแล้ว", blocked: "ส่งข้อความไม่ได้เนื่องจากมีการบล็อกระหว่างกัน", buyer: "ติดต่อผู้ซื้อ" },
  hi: { notice: "जवाब मिलने से पहले आप बिना लिंक वाले अधिकतम तीन टेक्स्ट संदेश भेज सकते हैं। अटैचमेंट और कॉल जवाब के बाद उपलब्ध होंगे।", friend: "मित्र जोड़ें", sent: "अनुरोध भेजा गया", blocked: "ब्लॉक होने के कारण संदेश नहीं भेज सकते।", buyer: "खरीदार से संपर्क करें" },
});
