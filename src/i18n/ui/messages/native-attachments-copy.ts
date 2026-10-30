// 2026-10-31 W1: native-session attachments. Gateway faults read as the
// server's fault (not the user's computer), the unsent prompt is kept, the
// gateway's task-session sentences, and the open-session timeout.
// The gateway sends the task-session sentences as frame `text` in Simplified
// Chinese; the page translates them through this table.
import type { Locale } from "../../config";
import { assembleCopy } from "./shell-overhaul-copy-shared";

export const NATIVE_ATTACHMENTS_SOURCE = {
  gatewayError: "服务器出错了，请稍后重试。",
  unsentRestored: "没发出去：服务器出错了。文字和附件已保留，可直接重试。",
  sessionLoadTimeout: "这段对话打开得太久了，已重试过一次。请再点一下它，或稍后再试。",
  scopeMismatch: "这个任务会话不属于这台电脑或这个程序。",
  rebinding: "这个任务会话已经接着另一段对话了，请新开一个任务再发。",
  alreadyBound: "这段对话已经属于另一个任务了，请新开一个任务再发。",
  bindingRequired: "这个任务会话还没接上对话，请重新打开它再发。",
  invalidIdentifier: "这个任务会话编号无效。",
  sessionGone: "找不到这个任务会话，它可能已经被删除了。",
  taskGone: "找不到这个任务，它可能已经被删除了。",
  attachmentNotSaved: "附件还没存好，请把附件重新加一次再发。",
  attachmentTooLarge: "附件太大了（单个最多 20 MB）。",
  storageDown: "没发出去：服务器暂时存不了这次对话，请稍后重试。",
  attachmentStorageDown: "没发出去：服务器暂时存不了附件，请稍后重试。",
} as const;

type Copy = Record<keyof typeof NATIVE_ATTACHMENTS_SOURCE, string>;

const COPY_en: Copy = {
  gatewayError: "The server ran into an error. Please try again later.",
  unsentRestored: "Not sent: the server ran into an error. Your text and attachments are kept, so you can retry right away.",
  sessionLoadTimeout: "This conversation took too long to open, even after one retry. Click it again, or try again later.",
  scopeMismatch: "This task session does not belong to this computer or this program.",
  rebinding: "This task session already continues another conversation. Start a new task to send this.",
  alreadyBound: "This conversation already belongs to another task. Start a new task to send this.",
  bindingRequired: "This task session is not linked to a conversation yet. Open it again, then send.",
  invalidIdentifier: "This task session ID is not valid.",
  sessionGone: "This task session cannot be found. It may have been deleted.",
  taskGone: "This task cannot be found. It may have been deleted.",
  attachmentNotSaved: "The attachment was not saved yet. Add it again, then send.",
  attachmentTooLarge: "The attachment is too large (20 MB per file at most).",
  storageDown: "Not sent: the server cannot save this conversation right now. Please try again later.",
  attachmentStorageDown: "Not sent: the server cannot save attachments right now. Please try again later.",
};

const COPY_zh_TW: Copy = {
  gatewayError: "伺服器出錯了，請稍後重試。",
  unsentRestored: "沒有送出：伺服器出錯了。文字和附件已保留，可直接重試。",
  sessionLoadTimeout: "這段對話開啟得太久了，已重試過一次。請再點一下它，或稍後再試。",
  scopeMismatch: "這個任務會話不屬於這台電腦或這個程式。",
  rebinding: "這個任務會話已經接著另一段對話了，請新開一個任務再送出。",
  alreadyBound: "這段對話已經屬於另一個任務了，請新開一個任務再送出。",
  bindingRequired: "這個任務會話還沒接上對話，請重新開啟它再送出。",
  invalidIdentifier: "這個任務會話編號無效。",
  sessionGone: "找不到這個任務會話，它可能已經被刪除了。",
  taskGone: "找不到這個任務，它可能已經被刪除了。",
  attachmentNotSaved: "附件還沒存好，請把附件重新加一次再送出。",
  attachmentTooLarge: "附件太大了（單個最多 20 MB）。",
  storageDown: "沒有送出：伺服器暫時存不了這次對話，請稍後重試。",
  attachmentStorageDown: "沒有送出：伺服器暫時存不了附件，請稍後重試。",
};

const COPY_de: Copy = {
  gatewayError: "Auf dem Server ist ein Fehler aufgetreten. Bitte versuche es später erneut.",
  unsentRestored: "Nicht gesendet: Auf dem Server ist ein Fehler aufgetreten. Text und Anhänge bleiben erhalten, du kannst es direkt erneut versuchen.",
  sessionLoadTimeout: "Diese Unterhaltung hat zu lange zum Öffnen gebraucht, auch nach einem erneuten Versuch. Klicke sie noch einmal an oder versuche es später.",
  scopeMismatch: "Diese Aufgabensitzung gehört nicht zu diesem Computer oder diesem Programm.",
  rebinding: "Diese Aufgabensitzung setzt bereits eine andere Unterhaltung fort. Starte eine neue Aufgabe, um das zu senden.",
  alreadyBound: "Diese Unterhaltung gehört bereits zu einer anderen Aufgabe. Starte eine neue Aufgabe, um das zu senden.",
  bindingRequired: "Diese Aufgabensitzung ist noch mit keiner Unterhaltung verbunden. Öffne sie erneut und sende dann.",
  invalidIdentifier: "Die ID dieser Aufgabensitzung ist ungültig.",
  sessionGone: "Diese Aufgabensitzung wurde nicht gefunden. Vielleicht wurde sie gelöscht.",
  taskGone: "Diese Aufgabe wurde nicht gefunden. Vielleicht wurde sie gelöscht.",
  attachmentNotSaved: "Der Anhang ist noch nicht gespeichert. Füge ihn erneut hinzu und sende dann.",
  attachmentTooLarge: "Der Anhang ist zu groß (höchstens 20 MB pro Datei).",
  storageDown: "Nicht gesendet: Der Server kann diese Unterhaltung gerade nicht speichern. Bitte versuche es später erneut.",
  attachmentStorageDown: "Nicht gesendet: Der Server kann Anhänge gerade nicht speichern. Bitte versuche es später erneut.",
};

const COPY_es: Copy = {
  gatewayError: "El servidor ha tenido un error. Inténtalo de nuevo más tarde.",
  unsentRestored: "No se ha enviado: el servidor ha tenido un error. Tu texto y tus adjuntos se conservan; puedes reintentarlo ya.",
  sessionLoadTimeout: "Esta conversación ha tardado demasiado en abrirse, incluso tras un reintento. Vuelve a pulsarla o inténtalo más tarde.",
  scopeMismatch: "Esta sesión de tarea no pertenece a este ordenador ni a este programa.",
  rebinding: "Esta sesión de tarea ya continúa otra conversación. Crea una tarea nueva para enviarlo.",
  alreadyBound: "Esta conversación ya pertenece a otra tarea. Crea una tarea nueva para enviarlo.",
  bindingRequired: "Esta sesión de tarea aún no está vinculada a una conversación. Vuelve a abrirla y envía.",
  invalidIdentifier: "El identificador de esta sesión de tarea no es válido.",
  sessionGone: "No se encuentra esta sesión de tarea. Puede que se haya eliminado.",
  taskGone: "No se encuentra esta tarea. Puede que se haya eliminado.",
  attachmentNotSaved: "El adjunto aún no se ha guardado. Vuelve a añadirlo y envía.",
  attachmentTooLarge: "El adjunto es demasiado grande (20 MB por archivo como máximo).",
  storageDown: "No se ha enviado: el servidor no puede guardar esta conversación ahora mismo. Inténtalo de nuevo más tarde.",
  attachmentStorageDown: "No se ha enviado: el servidor no puede guardar adjuntos ahora mismo. Inténtalo de nuevo más tarde.",
};

const COPY_es_419: Copy = {
  gatewayError: "El servidor tuvo un error. Vuelve a intentarlo más tarde.",
  unsentRestored: "No se envió: el servidor tuvo un error. Tu texto y tus adjuntos se conservaron; puedes volver a intentarlo ya.",
  sessionLoadTimeout: "Esta conversación tardó demasiado en abrirse, incluso después de un reintento. Vuelve a hacer clic en ella o inténtalo más tarde.",
  scopeMismatch: "Esta sesión de tarea no pertenece a esta computadora ni a este programa.",
  rebinding: "Esta sesión de tarea ya continúa otra conversación. Crea una tarea nueva para enviarlo.",
  alreadyBound: "Esta conversación ya pertenece a otra tarea. Crea una tarea nueva para enviarlo.",
  bindingRequired: "Esta sesión de tarea todavía no está vinculada a una conversación. Vuelve a abrirla y envía.",
  invalidIdentifier: "El identificador de esta sesión de tarea no es válido.",
  sessionGone: "No se encuentra esta sesión de tarea. Es posible que se haya eliminado.",
  taskGone: "No se encuentra esta tarea. Es posible que se haya eliminado.",
  attachmentNotSaved: "El adjunto todavía no se guardó. Vuelve a agregarlo y envía.",
  attachmentTooLarge: "El adjunto es demasiado grande (20 MB por archivo como máximo).",
  storageDown: "No se envió: el servidor no puede guardar esta conversación en este momento. Vuelve a intentarlo más tarde.",
  attachmentStorageDown: "No se envió: el servidor no puede guardar adjuntos en este momento. Vuelve a intentarlo más tarde.",
};

const COPY_fr: Copy = {
  gatewayError: "Le serveur a rencontré une erreur. Réessayez plus tard.",
  unsentRestored: "Non envoyé : le serveur a rencontré une erreur. Votre texte et vos pièces jointes sont conservés, vous pouvez réessayer tout de suite.",
  sessionLoadTimeout: "Cette conversation a mis trop de temps à s’ouvrir, même après une nouvelle tentative. Cliquez-la à nouveau ou réessayez plus tard.",
  scopeMismatch: "Cette session de tâche n’appartient pas à cet ordinateur ni à ce programme.",
  rebinding: "Cette session de tâche poursuit déjà une autre conversation. Créez une nouvelle tâche pour envoyer ceci.",
  alreadyBound: "Cette conversation appartient déjà à une autre tâche. Créez une nouvelle tâche pour envoyer ceci.",
  bindingRequired: "Cette session de tâche n’est pas encore reliée à une conversation. Rouvrez-la, puis envoyez.",
  invalidIdentifier: "L’identifiant de cette session de tâche n’est pas valide.",
  sessionGone: "Cette session de tâche est introuvable. Elle a peut-être été supprimée.",
  taskGone: "Cette tâche est introuvable. Elle a peut-être été supprimée.",
  attachmentNotSaved: "La pièce jointe n’est pas encore enregistrée. Ajoutez-la à nouveau, puis envoyez.",
  attachmentTooLarge: "La pièce jointe est trop volumineuse (20 Mo par fichier au maximum).",
  storageDown: "Non envoyé : le serveur ne peut pas enregistrer cette conversation pour le moment. Réessayez plus tard.",
  attachmentStorageDown: "Non envoyé : le serveur ne peut pas enregistrer les pièces jointes pour le moment. Réessayez plus tard.",
};

const COPY_it: Copy = {
  gatewayError: "Il server ha avuto un errore. Riprova più tardi.",
  unsentRestored: "Non inviato: il server ha avuto un errore. Testo e allegati sono stati conservati, puoi riprovare subito.",
  sessionLoadTimeout: "Questa conversazione ha impiegato troppo ad aprirsi, anche dopo un nuovo tentativo. Cliccala di nuovo o riprova più tardi.",
  scopeMismatch: "Questa sessione di attività non appartiene a questo computer o a questo programma.",
  rebinding: "Questa sessione di attività continua già un’altra conversazione. Crea una nuova attività per inviarlo.",
  alreadyBound: "Questa conversazione appartiene già a un’altra attività. Crea una nuova attività per inviarlo.",
  bindingRequired: "Questa sessione di attività non è ancora collegata a una conversazione. Riaprila e poi invia.",
  invalidIdentifier: "L’ID di questa sessione di attività non è valido.",
  sessionGone: "Questa sessione di attività non si trova. Potrebbe essere stata eliminata.",
  taskGone: "Questa attività non si trova. Potrebbe essere stata eliminata.",
  attachmentNotSaved: "L’allegato non è ancora stato salvato. Aggiungilo di nuovo e poi invia.",
  attachmentTooLarge: "L’allegato è troppo grande (al massimo 20 MB per file).",
  storageDown: "Non inviato: il server al momento non riesce a salvare questa conversazione. Riprova più tardi.",
  attachmentStorageDown: "Non inviato: il server al momento non riesce a salvare gli allegati. Riprova più tardi.",
};

const COPY_pt_BR: Copy = {
  gatewayError: "O servidor teve um erro. Tente de novo mais tarde.",
  unsentRestored: "Não enviado: o servidor teve um erro. Seu texto e seus anexos foram mantidos; você pode tentar de novo agora.",
  sessionLoadTimeout: "Esta conversa demorou demais para abrir, mesmo depois de uma nova tentativa. Clique nela de novo ou tente mais tarde.",
  scopeMismatch: "Esta sessão de tarefa não pertence a este computador nem a este programa.",
  rebinding: "Esta sessão de tarefa já continua outra conversa. Crie uma nova tarefa para enviar isto.",
  alreadyBound: "Esta conversa já pertence a outra tarefa. Crie uma nova tarefa para enviar isto.",
  bindingRequired: "Esta sessão de tarefa ainda não está ligada a uma conversa. Abra-a de novo e envie.",
  invalidIdentifier: "O ID desta sessão de tarefa não é válido.",
  sessionGone: "Não foi possível encontrar esta sessão de tarefa. Ela pode ter sido excluída.",
  taskGone: "Não foi possível encontrar esta tarefa. Ela pode ter sido excluída.",
  attachmentNotSaved: "O anexo ainda não foi salvo. Adicione-o de novo e envie.",
  attachmentTooLarge: "O anexo é grande demais (no máximo 20 MB por arquivo).",
  storageDown: "Não enviado: o servidor não consegue salvar esta conversa agora. Tente de novo mais tarde.",
  attachmentStorageDown: "Não enviado: o servidor não consegue salvar anexos agora. Tente de novo mais tarde.",
};

const COPY_pt_PT: Copy = {
  gatewayError: "O servidor teve um erro. Tente novamente mais tarde.",
  unsentRestored: "Não enviado: o servidor teve um erro. O seu texto e os anexos foram mantidos; pode tentar novamente já.",
  sessionLoadTimeout: "Esta conversa demorou demasiado a abrir, mesmo após uma nova tentativa. Clique nela novamente ou tente mais tarde.",
  scopeMismatch: "Esta sessão de tarefa não pertence a este computador nem a este programa.",
  rebinding: "Esta sessão de tarefa já continua outra conversa. Crie uma nova tarefa para enviar isto.",
  alreadyBound: "Esta conversa já pertence a outra tarefa. Crie uma nova tarefa para enviar isto.",
  bindingRequired: "Esta sessão de tarefa ainda não está ligada a uma conversa. Abra-a novamente e envie.",
  invalidIdentifier: "O ID desta sessão de tarefa não é válido.",
  sessionGone: "Não foi possível encontrar esta sessão de tarefa. Pode ter sido eliminada.",
  taskGone: "Não foi possível encontrar esta tarefa. Pode ter sido eliminada.",
  attachmentNotSaved: "O anexo ainda não foi guardado. Adicione-o novamente e envie.",
  attachmentTooLarge: "O anexo é demasiado grande (no máximo 20 MB por ficheiro).",
  storageDown: "Não enviado: o servidor não consegue guardar esta conversa neste momento. Tente novamente mais tarde.",
  attachmentStorageDown: "Não enviado: o servidor não consegue guardar anexos neste momento. Tente novamente mais tarde.",
};

const COPY_vi: Copy = {
  gatewayError: "Máy chủ gặp lỗi. Vui lòng thử lại sau.",
  unsentRestored: "Chưa gửi: máy chủ gặp lỗi. Văn bản và tệp đính kèm vẫn được giữ, bạn có thể thử lại ngay.",
  sessionLoadTimeout: "Cuộc trò chuyện này mở quá lâu, kể cả sau một lần thử lại. Hãy bấm vào nó lần nữa hoặc thử lại sau.",
  scopeMismatch: "Phiên tác vụ này không thuộc máy tính này hoặc chương trình này.",
  rebinding: "Phiên tác vụ này đã nối tiếp một cuộc trò chuyện khác. Hãy tạo tác vụ mới để gửi.",
  alreadyBound: "Cuộc trò chuyện này đã thuộc về một tác vụ khác. Hãy tạo tác vụ mới để gửi.",
  bindingRequired: "Phiên tác vụ này chưa được nối với cuộc trò chuyện nào. Hãy mở lại rồi gửi.",
  invalidIdentifier: "Mã phiên tác vụ này không hợp lệ.",
  sessionGone: "Không tìm thấy phiên tác vụ này. Có thể nó đã bị xóa.",
  taskGone: "Không tìm thấy tác vụ này. Có thể nó đã bị xóa.",
  attachmentNotSaved: "Tệp đính kèm chưa được lưu. Hãy thêm lại rồi gửi.",
  attachmentTooLarge: "Tệp đính kèm quá lớn (tối đa 20 MB mỗi tệp).",
  storageDown: "Chưa gửi: máy chủ tạm thời không lưu được cuộc trò chuyện này. Vui lòng thử lại sau.",
  attachmentStorageDown: "Chưa gửi: máy chủ tạm thời không lưu được tệp đính kèm. Vui lòng thử lại sau.",
};

const COPY_tr: Copy = {
  gatewayError: "Sunucuda bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
  unsentRestored: "Gönderilmedi: sunucuda bir hata oluştu. Metniniz ve ekleriniz korundu, hemen yeniden deneyebilirsiniz.",
  sessionLoadTimeout: "Bu konuşmanın açılması bir yeniden denemeden sonra bile çok uzun sürdü. Ona tekrar tıklayın veya daha sonra deneyin.",
  scopeMismatch: "Bu görev oturumu bu bilgisayara veya bu programa ait değil.",
  rebinding: "Bu görev oturumu zaten başka bir konuşmayı sürdürüyor. Bunu göndermek için yeni bir görev başlatın.",
  alreadyBound: "Bu konuşma zaten başka bir göreve ait. Bunu göndermek için yeni bir görev başlatın.",
  bindingRequired: "Bu görev oturumu henüz bir konuşmaya bağlanmadı. Yeniden açıp gönderin.",
  invalidIdentifier: "Bu görev oturumunun kimliği geçersiz.",
  sessionGone: "Bu görev oturumu bulunamadı. Silinmiş olabilir.",
  taskGone: "Bu görev bulunamadı. Silinmiş olabilir.",
  attachmentNotSaved: "Ek henüz kaydedilmedi. Yeniden ekleyip gönderin.",
  attachmentTooLarge: "Ek çok büyük (dosya başına en fazla 20 MB).",
  storageDown: "Gönderilmedi: sunucu şu anda bu konuşmayı kaydedemiyor. Lütfen daha sonra tekrar deneyin.",
  attachmentStorageDown: "Gönderilmedi: sunucu şu anda ekleri kaydedemiyor. Lütfen daha sonra tekrar deneyin.",
};

const COPY_ja: Copy = {
  gatewayError: "サーバーでエラーが発生しました。しばらくしてからもう一度お試しください。",
  unsentRestored: "送信されませんでした：サーバーでエラーが発生しました。テキストと添付ファイルは残してあるので、そのまま再試行できます。",
  sessionLoadTimeout: "この会話は一度再試行しても開くのに時間がかかりすぎました。もう一度クリックするか、しばらくしてからお試しください。",
  scopeMismatch: "このタスクセッションはこのコンピューターまたはこのプログラムのものではありません。",
  rebinding: "このタスクセッションはすでに別の会話の続きです。新しいタスクを作成してから送信してください。",
  alreadyBound: "この会話はすでに別のタスクに属しています。新しいタスクを作成してから送信してください。",
  bindingRequired: "このタスクセッションはまだ会話につながっていません。開き直してから送信してください。",
  invalidIdentifier: "このタスクセッションの ID が無効です。",
  sessionGone: "このタスクセッションが見つかりません。削除された可能性があります。",
  taskGone: "このタスクが見つかりません。削除された可能性があります。",
  attachmentNotSaved: "添付ファイルがまだ保存されていません。もう一度追加してから送信してください。",
  attachmentTooLarge: "添付ファイルが大きすぎます（1 ファイル最大 20 MB）。",
  storageDown: "送信されませんでした：サーバーが現在この会話を保存できません。しばらくしてからもう一度お試しください。",
  attachmentStorageDown: "送信されませんでした：サーバーが現在添付ファイルを保存できません。しばらくしてからもう一度お試しください。",
};

const COPY_ko: Copy = {
  gatewayError: "서버에 오류가 발생했습니다. 잠시 후 다시 시도하세요.",
  unsentRestored: "보내지 못했습니다: 서버에 오류가 발생했습니다. 텍스트와 첨부 파일은 그대로 남아 있으니 바로 다시 시도할 수 있습니다.",
  sessionLoadTimeout: "이 대화는 한 번 다시 시도한 뒤에도 여는 데 너무 오래 걸렸습니다. 다시 클릭하거나 잠시 후 시도하세요.",
  scopeMismatch: "이 작업 세션은 이 컴퓨터나 이 프로그램의 것이 아닙니다.",
  rebinding: "이 작업 세션은 이미 다른 대화를 이어 가고 있습니다. 새 작업을 만든 뒤 보내세요.",
  alreadyBound: "이 대화는 이미 다른 작업에 속해 있습니다. 새 작업을 만든 뒤 보내세요.",
  bindingRequired: "이 작업 세션은 아직 대화와 연결되지 않았습니다. 다시 연 뒤 보내세요.",
  invalidIdentifier: "이 작업 세션 ID가 올바르지 않습니다.",
  sessionGone: "이 작업 세션을 찾을 수 없습니다. 삭제되었을 수 있습니다.",
  taskGone: "이 작업을 찾을 수 없습니다. 삭제되었을 수 있습니다.",
  attachmentNotSaved: "첨부 파일이 아직 저장되지 않았습니다. 다시 추가한 뒤 보내세요.",
  attachmentTooLarge: "첨부 파일이 너무 큽니다(파일당 최대 20MB).",
  storageDown: "보내지 못했습니다: 지금은 서버가 이 대화를 저장할 수 없습니다. 잠시 후 다시 시도하세요.",
  attachmentStorageDown: "보내지 못했습니다: 지금은 서버가 첨부 파일을 저장할 수 없습니다. 잠시 후 다시 시도하세요.",
};

const COPY_ar: Copy = {
  gatewayError: "حدث خطأ في الخادم. يُرجى المحاولة مرة أخرى لاحقًا.",
  unsentRestored: "لم يُرسل: حدث خطأ في الخادم. تم الاحتفاظ بالنص والمرفقات، ويمكنك إعادة المحاولة مباشرة.",
  sessionLoadTimeout: "استغرق فتح هذه المحادثة وقتًا طويلًا جدًا حتى بعد إعادة المحاولة مرة واحدة. انقر عليها مرة أخرى أو حاول لاحقًا.",
  scopeMismatch: "جلسة المهمة هذه لا تخص هذا الكمبيوتر أو هذا البرنامج.",
  rebinding: "جلسة المهمة هذه تُكمل محادثة أخرى بالفعل. ابدأ مهمة جديدة لإرسال هذا.",
  alreadyBound: "هذه المحادثة تخص مهمة أخرى بالفعل. ابدأ مهمة جديدة لإرسال هذا.",
  bindingRequired: "جلسة المهمة هذه غير مرتبطة بمحادثة بعد. افتحها مرة أخرى ثم أرسل.",
  invalidIdentifier: "معرّف جلسة المهمة هذه غير صالح.",
  sessionGone: "تعذّر العثور على جلسة المهمة هذه. ربما تم حذفها.",
  taskGone: "تعذّر العثور على هذه المهمة. ربما تم حذفها.",
  attachmentNotSaved: "لم يُحفظ المرفق بعد. أضفه مرة أخرى ثم أرسل.",
  attachmentTooLarge: "المرفق كبير جدًا (20 ميغابايت كحد أقصى لكل ملف).",
  storageDown: "لم يُرسل: لا يستطيع الخادم حفظ هذه المحادثة الآن. يُرجى المحاولة مرة أخرى لاحقًا.",
  attachmentStorageDown: "لم يُرسل: لا يستطيع الخادم حفظ المرفقات الآن. يُرجى المحاولة مرة أخرى لاحقًا.",
};

const COPY_th: Copy = {
  gatewayError: "เซิร์ฟเวอร์เกิดข้อผิดพลาด โปรดลองอีกครั้งในภายหลัง",
  unsentRestored: "ยังไม่ได้ส่ง: เซิร์ฟเวอร์เกิดข้อผิดพลาด ข้อความและไฟล์แนบยังเก็บไว้ ลองส่งใหม่ได้ทันที",
  sessionLoadTimeout: "บทสนทนานี้ใช้เวลาเปิดนานเกินไป แม้ลองใหม่แล้วหนึ่งครั้ง โปรดคลิกอีกครั้งหรือลองใหม่ภายหลัง",
  scopeMismatch: "เซสชันงานนี้ไม่ได้เป็นของคอมพิวเตอร์เครื่องนี้หรือโปรแกรมนี้",
  rebinding: "เซสชันงานนี้ต่อจากบทสนทนาอื่นอยู่แล้ว โปรดสร้างงานใหม่แล้วค่อยส่ง",
  alreadyBound: "บทสนทนานี้เป็นของงานอื่นอยู่แล้ว โปรดสร้างงานใหม่แล้วค่อยส่ง",
  bindingRequired: "เซสชันงานนี้ยังไม่ได้เชื่อมกับบทสนทนา โปรดเปิดใหม่แล้วค่อยส่ง",
  invalidIdentifier: "รหัสเซสชันงานนี้ไม่ถูกต้อง",
  sessionGone: "ไม่พบเซสชันงานนี้ อาจถูกลบไปแล้ว",
  taskGone: "ไม่พบงานนี้ อาจถูกลบไปแล้ว",
  attachmentNotSaved: "ไฟล์แนบยังไม่ได้บันทึก โปรดเพิ่มใหม่แล้วค่อยส่ง",
  attachmentTooLarge: "ไฟล์แนบใหญ่เกินไป (สูงสุดไฟล์ละ 20 MB)",
  storageDown: "ยังไม่ได้ส่ง: ขณะนี้เซิร์ฟเวอร์บันทึกบทสนทนานี้ไม่ได้ โปรดลองอีกครั้งในภายหลัง",
  attachmentStorageDown: "ยังไม่ได้ส่ง: ขณะนี้เซิร์ฟเวอร์บันทึกไฟล์แนบไม่ได้ โปรดลองอีกครั้งในภายหลัง",
};

const COPY_hi: Copy = {
  gatewayError: "सर्वर में कोई त्रुटि हुई। कृपया बाद में फिर से कोशिश करें।",
  unsentRestored: "नहीं भेजा गया: सर्वर में कोई त्रुटि हुई। आपका टेक्स्ट और अटैचमेंट सुरक्षित हैं, आप तुरंत फिर से कोशिश कर सकते हैं।",
  sessionLoadTimeout: "यह बातचीत एक बार फिर कोशिश करने के बाद भी खुलने में बहुत देर लगा रही थी। इसे फिर से क्लिक करें या बाद में कोशिश करें।",
  scopeMismatch: "यह टास्क सेशन इस कंप्यूटर या इस प्रोग्राम का नहीं है।",
  rebinding: "यह टास्क सेशन पहले से किसी दूसरी बातचीत को आगे बढ़ा रहा है। इसे भेजने के लिए नया टास्क शुरू करें।",
  alreadyBound: "यह बातचीत पहले से किसी दूसरे टास्क की है। इसे भेजने के लिए नया टास्क शुरू करें।",
  bindingRequired: "यह टास्क सेशन अभी किसी बातचीत से नहीं जुड़ा है। इसे फिर से खोलें, फिर भेजें।",
  invalidIdentifier: "इस टास्क सेशन की ID मान्य नहीं है।",
  sessionGone: "यह टास्क सेशन नहीं मिला। हो सकता है इसे हटा दिया गया हो।",
  taskGone: "यह टास्क नहीं मिला। हो सकता है इसे हटा दिया गया हो।",
  attachmentNotSaved: "अटैचमेंट अभी सेव नहीं हुआ है। इसे फिर से जोड़ें, फिर भेजें।",
  attachmentTooLarge: "अटैचमेंट बहुत बड़ा है (हर फ़ाइल अधिकतम 20 MB)।",
  storageDown: "नहीं भेजा गया: सर्वर अभी यह बातचीत सेव नहीं कर पा रहा है। कृपया बाद में फिर से कोशिश करें।",
  attachmentStorageDown: "नहीं भेजा गया: सर्वर अभी अटैचमेंट सेव नहीं कर पा रहा है। कृपया बाद में फिर से कोशिश करें।",
};

export const NATIVE_ATTACHMENTS_MESSAGES = assembleCopy(NATIVE_ATTACHMENTS_SOURCE, {
  "en": COPY_en,
  "zh-TW": COPY_zh_TW,
  "de": COPY_de,
  "es": COPY_es,
  "es-419": COPY_es_419,
  "fr": COPY_fr,
  "it": COPY_it,
  "pt-BR": COPY_pt_BR,
  "pt-PT": COPY_pt_PT,
  "vi": COPY_vi,
  "tr": COPY_tr,
  "ja": COPY_ja,
  "ko": COPY_ko,
  "ar": COPY_ar,
  "th": COPY_th,
  "hi": COPY_hi,
} satisfies Record<Exclude<Locale, "zh">, Copy>);
