// 2026-09-24 regression-audit-0924 的分表：分享打不开的说明、长图没二维码、旧文档转可编辑。
// 注册在 shell-overhaul-copy.ts。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "这个分享不存在或已被关闭。": "这个分享不存在或已被关闭。",
  "这个分享暂时打不开，请稍后再试。": "这个分享暂时打不开，请稍后再试。",
  "长图已生成，但分享链接没建成，图上没有二维码。":
    "长图已生成，但分享链接没建成，图上没有二维码。",
  "转换为可编辑": "转换为可编辑",
} as const;

export const REGRESSION_0924_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "这个分享不存在或已被关闭。": "This share doesn’t exist or has been turned off.",
    "这个分享暂时打不开，请稍后再试。": "This share can’t be opened right now. Please try again later.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "The long image is ready, but the share link couldn’t be created, so it has no QR code.",
    "转换为可编辑": "Convert to editable",
  },
  de: {
    "这个分享不存在或已被关闭。": "Diese Freigabe existiert nicht oder wurde beendet.",
    "这个分享暂时打不开，请稍后再试。": "Diese Freigabe lässt sich gerade nicht öffnen. Bitte später erneut versuchen.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "Das lange Bild ist fertig, aber der Freigabelink konnte nicht erstellt werden – daher ohne QR-Code.",
    "转换为可编辑": "In bearbeitbar umwandeln",
  },
  es: {
    "这个分享不存在或已被关闭。": "Este enlace compartido no existe o se ha desactivado.",
    "这个分享暂时打不开，请稍后再试。": "No se puede abrir este enlace compartido ahora. Inténtalo más tarde.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "La imagen larga está lista, pero no se pudo crear el enlace para compartir, así que no lleva código QR.",
    "转换为可编辑": "Convertir en editable",
  },
  "es-419": {
    "这个分享不存在或已被关闭。": "Este enlace compartido no existe o se desactivó.",
    "这个分享暂时打不开，请稍后再试。": "No se puede abrir este enlace compartido ahora. Intenta más tarde.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "La imagen larga está lista, pero no se pudo crear el enlace para compartir, así que no tiene código QR.",
    "转换为可编辑": "Convertir en editable",
  },
  fr: {
    "这个分享不存在或已被关闭。": "Ce partage n’existe pas ou a été désactivé.",
    "这个分享暂时打不开，请稍后再试。": "Impossible d’ouvrir ce partage pour le moment. Réessayez plus tard.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "L’image longue est prête, mais le lien de partage n’a pas pu être créé : elle n’a donc pas de QR code.",
    "转换为可编辑": "Convertir en modifiable",
  },
  it: {
    "这个分享不存在或已被关闭。": "Questa condivisione non esiste o è stata disattivata.",
    "这个分享暂时打不开，请稍后再试。": "Al momento non è possibile aprire questa condivisione. Riprova più tardi.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "L’immagine lunga è pronta, ma non è stato possibile creare il link di condivisione, quindi non ha il codice QR.",
    "转换为可编辑": "Converti in modificabile",
  },
  "pt-BR": {
    "这个分享不存在或已被关闭。": "Este compartilhamento não existe ou foi desativado.",
    "这个分享暂时打不开，请稍后再试。": "Não foi possível abrir este compartilhamento agora. Tente novamente mais tarde.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "A imagem longa está pronta, mas o link de compartilhamento não foi criado, então ela não tem QR code.",
    "转换为可编辑": "Converter para editável",
  },
  "pt-PT": {
    "这个分享不存在或已被关闭。": "Esta partilha não existe ou foi desativada.",
    "这个分享暂时打不开，请稍后再试。": "Não é possível abrir esta partilha agora. Tente novamente mais tarde.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "A imagem longa está pronta, mas não foi possível criar a ligação de partilha, por isso não tem código QR.",
    "转换为可编辑": "Converter em editável",
  },
  vi: {
    "这个分享不存在或已被关闭。": "Liên kết chia sẻ này không tồn tại hoặc đã bị tắt.",
    "这个分享暂时打不开，请稍后再试。": "Hiện không mở được liên kết chia sẻ này. Vui lòng thử lại sau.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "Ảnh dài đã tạo xong, nhưng chưa tạo được liên kết chia sẻ nên ảnh không có mã QR.",
    "转换为可编辑": "Chuyển thành bản chỉnh sửa được",
  },
  tr: {
    "这个分享不存在或已被关闭。": "Bu paylaşım yok ya da kapatılmış.",
    "这个分享暂时打不开，请稍后再试。": "Bu paylaşım şu anda açılamıyor. Lütfen daha sonra tekrar deneyin.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "Uzun görsel hazır, ancak paylaşım bağlantısı oluşturulamadığı için QR kodu yok.",
    "转换为可编辑": "Düzenlenebilir hale getir",
  },
  "zh-TW": {
    "这个分享不存在或已被关闭。": "這個分享不存在或已被關閉。",
    "这个分享暂时打不开，请稍后再试。": "這個分享暫時打不開，請稍後再試。",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "長圖已產生，但分享連結沒建成，圖上沒有 QR 碼。",
    "转换为可编辑": "轉換為可編輯",
  },
  ja: {
    "这个分享不存在或已被关闭。": "この共有は存在しないか、停止されています。",
    "这个分享暂时打不开，请稍后再试。": "この共有は今は開けません。しばらくしてからもう一度お試しください。",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "長い画像はできましたが、共有リンクを作成できなかったため QR コードは入っていません。",
    "转换为可编辑": "編集できる形式に変換",
  },
  ko: {
    "这个分享不存在或已被关闭。": "이 공유는 없거나 종료되었습니다.",
    "这个分享暂时打不开，请稍后再试。": "지금은 이 공유를 열 수 없습니다. 잠시 후 다시 시도해 주세요.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "긴 이미지는 만들었지만 공유 링크를 만들지 못해 QR 코드가 없습니다.",
    "转换为可编辑": "편집 가능하게 변환",
  },
  ar: {
    "这个分享不存在或已被关闭。": "هذه المشاركة غير موجودة أو تم إيقافها.",
    "这个分享暂时打不开，请稍后再试。": "تعذر فتح هذه المشاركة الآن. حاول مرة أخرى لاحقًا.",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "الصورة الطويلة جاهزة، لكن تعذر إنشاء رابط المشاركة، لذلك لا تحتوي على رمز QR.",
    "转换为可编辑": "تحويل إلى قابل للتعديل",
  },
  th: {
    "这个分享不存在或已被关闭。": "ไม่มีการแชร์นี้ หรือถูกปิดไปแล้ว",
    "这个分享暂时打不开，请稍后再试。": "ตอนนี้เปิดการแชร์นี้ไม่ได้ โปรดลองอีกครั้งภายหลัง",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "สร้างภาพยาวแล้ว แต่สร้างลิงก์แชร์ไม่สำเร็จ ภาพจึงไม่มีคิวอาร์โค้ด",
    "转换为可编辑": "แปลงเป็นแบบแก้ไขได้",
  },
  hi: {
    "这个分享不存在或已被关闭。": "यह शेयर मौजूद नहीं है या बंद कर दिया गया है।",
    "这个分享暂时打不开，请稍后再试。": "यह शेयर अभी नहीं खुल रहा है। कृपया बाद में फिर कोशिश करें।",
    "长图已生成，但分享链接没建成，图上没有二维码。":
      "लंबी इमेज तैयार है, लेकिन शेयर लिंक नहीं बन पाया, इसलिए उसमें QR कोड नहीं है।",
    "转换为可编辑": "संपादन योग्य में बदलें",
  },
});
