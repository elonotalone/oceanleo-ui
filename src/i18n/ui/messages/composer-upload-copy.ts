// 2026-10-31 W6: composer uploads are private (20 MB per file, never public);
// a failed tile stays with a retry badge and blocks sending until handled.
import type { Locale } from "../../config";
import { assembleCopy } from "./shell-overhaul-copy-shared";

export const COMPOSER_UPLOAD_SOURCE = {
  tooLarge: "文件超过 20MB，暂不支持",
  failedBlocksSend: "有附件上传失败，请重试或移除后再发送",
  missingId: "上传未返回私有文件编号，请重试",
} as const;

type Copy = Record<keyof typeof COMPOSER_UPLOAD_SOURCE, string>;

const COPY: Record<Exclude<Locale, "zh">, Copy> = {
  "en": { tooLarge: "Files over 20 MB are not supported yet", failedBlocksSend: "An attachment failed to upload. Retry or remove it, then send.", missingId: "The upload did not return a private file ID. Please try again." },
  "zh-TW": { tooLarge: "檔案超過 20MB，暫不支援", failedBlocksSend: "有附件上傳失敗，請重試或移除後再傳送", missingId: "上傳未傳回私有檔案編號，請重試" },
  "de": { tooLarge: "Dateien über 20 MB werden noch nicht unterstützt", failedBlocksSend: "Ein Anhang konnte nicht hochgeladen werden. Erneut versuchen oder entfernen, dann senden.", missingId: "Der Upload hat keine private Datei-ID zurückgegeben. Bitte erneut versuchen." },
  "es": { tooLarge: "Los archivos de más de 20 MB aún no son compatibles", failedBlocksSend: "No se pudo subir un adjunto. Reinténtalo o quítalo y luego envía.", missingId: "La subida no devolvió un ID de archivo privado. Inténtalo de nuevo." },
  "es-419": { tooLarge: "Los archivos de más de 20 MB todavía no son compatibles", failedBlocksSend: "No se pudo subir un adjunto. Vuelve a intentarlo o quítalo y luego envía.", missingId: "La carga no devolvió un ID de archivo privado. Vuelve a intentarlo." },
  "fr": { tooLarge: "Les fichiers de plus de 20 Mo ne sont pas encore pris en charge", failedBlocksSend: "Une pièce jointe n'a pas pu être envoyée. Réessayez ou retirez-la, puis envoyez.", missingId: "L'envoi n'a pas renvoyé d'identifiant de fichier privé. Veuillez réessayer." },
  "it": { tooLarge: "I file oltre 20 MB non sono ancora supportati", failedBlocksSend: "Caricamento di un allegato non riuscito. Riprova o rimuovilo, poi invia.", missingId: "Il caricamento non ha restituito un ID file privato. Riprova." },
  "pt-BR": { tooLarge: "Arquivos acima de 20 MB ainda não são compatíveis", failedBlocksSend: "Falha ao enviar um anexo. Tente de novo ou remova-o e depois envie.", missingId: "O envio não retornou um ID de arquivo privado. Tente de novo." },
  "pt-PT": { tooLarge: "Ficheiros acima de 20 MB ainda não são suportados", failedBlocksSend: "Falha ao carregar um anexo. Tente novamente ou remova-o e depois envie.", missingId: "O carregamento não devolveu um ID de ficheiro privado. Tente novamente." },
  "vi": { tooLarge: "Chưa hỗ trợ tệp lớn hơn 20 MB", failedBlocksSend: "Một tệp đính kèm tải lên thất bại. Hãy thử lại hoặc gỡ bỏ rồi gửi.", missingId: "Tải lên không trả về mã tệp riêng tư. Vui lòng thử lại." },
  "tr": { tooLarge: "20 MB üzerindeki dosyalar henüz desteklenmiyor", failedBlocksSend: "Bir ek yüklenemedi. Yeniden deneyin veya kaldırın, sonra gönderin.", missingId: "Yükleme özel dosya kimliği döndürmedi. Lütfen yeniden deneyin." },
  "ja": { tooLarge: "20MB を超えるファイルにはまだ対応していません", failedBlocksSend: "添付ファイルのアップロードに失敗しました。再試行するか削除してから送信してください。", missingId: "アップロードでプライベートファイル ID が返されませんでした。もう一度お試しください。" },
  "ko": { tooLarge: "20MB를 초과하는 파일은 아직 지원하지 않습니다", failedBlocksSend: "첨부 파일 업로드에 실패했습니다. 다시 시도하거나 제거한 뒤 보내세요.", missingId: "업로드에서 비공개 파일 ID를 받지 못했습니다. 다시 시도하세요." },
  "ar": { tooLarge: "الملفات التي تتجاوز 20 ميغابايت غير مدعومة بعد", failedBlocksSend: "تعذّر رفع أحد المرفقات. أعد المحاولة أو أزله ثم أرسل.", missingId: "لم يُرجع الرفع معرّف ملف خاص. يُرجى المحاولة مرة أخرى." },
  "th": { tooLarge: "ยังไม่รองรับไฟล์ที่ใหญ่กว่า 20 MB", failedBlocksSend: "อัปโหลดไฟล์แนบไม่สำเร็จ ลองใหม่หรือลบออกแล้วจึงส่ง", missingId: "การอัปโหลดไม่ได้ส่งรหัสไฟล์ส่วนตัวกลับมา โปรดลองอีกครั้ง" },
  "hi": { tooLarge: "20 MB से बड़ी फ़ाइलें अभी समर्थित नहीं हैं", failedBlocksSend: "एक अटैचमेंट अपलोड नहीं हो सका। दोबारा कोशिश करें या हटाएँ, फिर भेजें।", missingId: "अपलोड ने निजी फ़ाइल ID नहीं लौटाई। कृपया दोबारा कोशिश करें।" },
};

export const COMPOSER_UPLOAD_MESSAGES = assembleCopy(COMPOSER_UPLOAD_SOURCE, COPY);
