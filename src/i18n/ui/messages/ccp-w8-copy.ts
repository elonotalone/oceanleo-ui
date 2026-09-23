// 2026-09-23 cloud-computer-polish 波 W8 的分表。只由 W8 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const CCP_W8_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "停用 leo（选中文本后不再显示气泡）": "停用 leo（选中文本后不再显示气泡）",
  "停用": "停用",
  "先有一段文字，才能在面板里做。": "先有一段文字，才能在面板里做。",
  "关闭": "关闭",
  "启用 leo": "启用 leo",
  "启用": "启用",
  "展开": "展开",
  "收起": "收起",
  "放大": "放大",
  "新会话": "新会话",
  "新对话": "新对话",
  "缩小": "缩小",
  "网络错误，请稍后再试。": "网络错误，请稍后再试。",
  "记录暂时不可用，稍后再试。": "记录暂时不可用，稍后再试。",
  "这台电脑": "这台电脑",
  "发送": "发送",
  "跟 leo 说": "跟 leo 说",
  "保存": "保存",
  "删除": "删除",
  "删除此 leo 会话及全部记录？": "删除此 leo 会话及全部记录？",
  "取消": "取消",
  "更多": "更多",
  "查看全部": "查看全部",
  "重命名": "重命名",
  "对话记录": "对话记录",
  "打开任务": "打开任务",
  "正在加载记录…": "正在加载记录…",
  "清空记录": "清空记录",
  "登录后 leo 才能记住对话": "登录后 leo 才能记住对话",
  "还没有对话，开始第一句吧。": "还没有对话，开始第一句吧。",
  "重试": "重试"
} as const;

export const CCP_W8_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "停用 leo（选中文本后不再显示气泡）": "Disable leo (no longer show bubble on selection)", "停用": "Disable", "先有一段文字，才能在面板里做。": "Add some text before using a panel action.", "关闭": "Close", "启用 leo": "Enable leo", "启用": "Enable", "展开": "Expand", "收起": "Collapse", "放大": "Expand panel", "新会话": "New session", "新对话": "New conversation", "缩小": "Shrink panel", "网络错误，请稍后再试。": "Network error, please try again later.", "记录暂时不可用，稍后再试。": "History is temporarily unavailable. Try again later.", "这台电脑": "This computer", "发送": "Send", "跟 leo 说": "Talk to leo", "保存": "Save", "删除": "Delete", "删除此 leo 会话及全部记录？": "Delete this leo session and all its history?", "取消": "Cancel", "更多": "More", "查看全部": "View all", "重命名": "Rename", "对话记录": "Conversation history", "打开任务": "Open task", "正在加载记录…": "Loading history…", "清空记录": "Clear history", "登录后 leo 才能记住对话": "Sign in so leo can remember your conversations", "还没有对话，开始第一句吧。": "No conversation yet — say the first line.", "重试": "Retry"
  },
  de: {
    "停用 leo（选中文本后不再显示气泡）": "leo deaktivieren (keine Auswahlblase)", "停用": "Deaktivieren", "先有一段文字，才能在面板里做。": "Füge zuerst Text hinzu.", "关闭": "Schließen", "启用 leo": "leo aktivieren", "启用": "Aktivieren", "展开": "Erweitern", "收起": "Einklappen", "放大": "Panel vergrößern", "新会话": "Neue Sitzung", "新对话": "Neue Unterhaltung", "缩小": "Panel verkleinern", "网络错误，请稍后再试。": "Netzwerkfehler. Später erneut versuchen.", "记录暂时不可用，稍后再试。": "Verlauf vorübergehend nicht verfügbar.", "这台电脑": "Dieser Computer", "发送": "Senden", "跟 leo 说": "Mit leo sprechen", "保存": "Speichern", "删除": "Löschen", "删除此 leo 会话及全部记录？": "Diese leo-Sitzung und den Verlauf löschen?", "取消": "Abbrechen", "更多": "Mehr", "查看全部": "Alle anzeigen", "重命名": "Umbenennen", "对话记录": "Unterhaltungsverlauf", "打开任务": "Aufgabe öffnen", "正在加载记录…": "Verlauf wird geladen…", "清空记录": "Verlauf löschen", "登录后 leo 才能记住对话": "Anmelden, damit leo Unterhaltungen speichert", "还没有对话，开始第一句吧。": "Noch keine Unterhaltung. Schreib die erste Nachricht.", "重试": "Erneut versuchen"
  },
  es: {
    "停用 leo（选中文本后不再显示气泡）": "Desactivar leo (sin burbuja de selección)", "停用": "Desactivar", "先有一段文字，才能在面板里做。": "Añade texto para usar una acción.", "关闭": "Cerrar", "启用 leo": "Activar leo", "启用": "Activar", "展开": "Expandir", "收起": "Contraer", "放大": "Ampliar panel", "新会话": "Nueva sesión", "新对话": "Nueva conversación", "缩小": "Reducir panel", "网络错误，请稍后再试。": "Error de red. Inténtalo más tarde.", "记录暂时不可用，稍后再试。": "El historial no está disponible temporalmente.", "这台电脑": "Este ordenador", "发送": "Enviar", "跟 leo 说": "Habla con leo", "保存": "Guardar", "删除": "Eliminar", "删除此 leo 会话及全部记录？": "¿Eliminar esta sesión de leo y su historial?", "取消": "Cancelar", "更多": "Más", "查看全部": "Ver todo", "重命名": "Cambiar nombre", "对话记录": "Historial de conversación", "打开任务": "Abrir tarea", "正在加载记录…": "Cargando historial…", "清空记录": "Borrar historial", "登录后 leo 才能记住对话": "Inicia sesión para que leo recuerde tus conversaciones", "还没有对话，开始第一句吧。": "Aún no hay conversaciones. Escribe un mensaje.", "重试": "Reintentar"
  },
  "es-419": {
    "停用 leo（选中文本后不再显示气泡）": "Desactivar leo (sin burbuja de selección)", "停用": "Desactivar", "先有一段文字，才能在面板里做。": "Agrega texto para usar una acción.", "关闭": "Cerrar", "启用 leo": "Activar leo", "启用": "Activar", "展开": "Expandir", "收起": "Contraer", "放大": "Ampliar panel", "新会话": "Nueva sesión", "新对话": "Nueva conversación", "缩小": "Reducir panel", "网络错误，请稍后再试。": "Error de red. Intenta más tarde.", "记录暂时不可用，稍后再试。": "El historial no está disponible temporalmente.", "这台电脑": "Esta computadora", "发送": "Enviar", "跟 leo 说": "Habla con leo", "保存": "Guardar", "删除": "Eliminar", "删除此 leo 会话及全部记录？": "¿Eliminar esta sesión de leo y todo su historial?", "取消": "Cancelar", "更多": "Más", "查看全部": "Ver todo", "重命名": "Cambiar nombre", "对话记录": "Historial de conversación", "打开任务": "Abrir tarea", "正在加载记录…": "Cargando historial…", "清空记录": "Borrar historial", "登录后 leo 才能记住对话": "Inicia sesión para que leo recuerde tus conversaciones", "还没有对话，开始第一句吧。": "Aún no hay conversaciones. Envía un mensaje.", "重试": "Reintentar"
  },
  fr: {
    "停用 leo（选中文本后不再显示气泡）": "Désactiver leo (sans bulle de sélection)", "停用": "Désactiver", "先有一段文字，才能在面板里做。": "Ajoutez du texte avant d’utiliser une action.", "关闭": "Fermer", "启用 leo": "Activer leo", "启用": "Activer", "展开": "Développer", "收起": "Réduire", "放大": "Agrandir le panneau", "新会话": "Nouvelle session", "新对话": "Nouvelle conversation", "缩小": "Réduire le panneau", "网络错误，请稍后再试。": "Erreur réseau. Réessayez plus tard.", "记录暂时不可用，稍后再试。": "Historique temporairement indisponible.", "这台电脑": "Cet ordinateur", "发送": "Envoyer", "跟 leo 说": "Parler à leo", "保存": "Enregistrer", "删除": "Supprimer", "删除此 leo 会话及全部记录？": "Supprimer cette session leo et son historique ?", "取消": "Annuler", "更多": "Plus", "查看全部": "Tout afficher", "重命名": "Renommer", "对话记录": "Historique des conversations", "打开任务": "Ouvrir la tâche", "正在加载记录…": "Chargement de l’historique…", "清空记录": "Effacer l’historique", "登录后 leo 才能记住对话": "Connectez-vous pour que leo mémorise vos conversations", "还没有对话，开始第一句吧。": "Aucune conversation. Envoyez un message.", "重试": "Réessayer"
  },
  it: {
    "停用 leo（选中文本后不再显示气泡）": "Disattiva leo (niente bolla di selezione)", "停用": "Disattiva", "先有一段文字，才能在面板里做。": "Aggiungi testo per usare un'azione.", "关闭": "Chiudi", "启用 leo": "Attiva leo", "启用": "Attiva", "展开": "Espandi", "收起": "Comprimi", "放大": "Espandi pannello", "新会话": "Nuova sessione", "新对话": "Nuova conversazione", "缩小": "Riduci pannello", "网络错误，请稍后再试。": "Errore di rete. Riprova più tardi.", "记录暂时不可用，稍后再试。": "Cronologia temporaneamente non disponibile.", "这台电脑": "Questo computer", "发送": "Invia", "跟 leo 说": "Parla con leo", "保存": "Salva", "删除": "Elimina", "删除此 leo 会话及全部记录？": "Eliminare questa sessione leo e la cronologia?", "取消": "Annulla", "更多": "Altro", "查看全部": "Vedi tutto", "重命名": "Rinomina", "对话记录": "Cronologia conversazioni", "打开任务": "Apri attività", "正在加载记录…": "Caricamento cronologia…", "清空记录": "Cancella cronologia", "登录后 leo 才能记住对话": "Accedi per permettere a leo di ricordare le conversazioni", "还没有对话，开始第一句吧。": "Nessuna conversazione. Inizia con un messaggio.", "重试": "Riprova"
  },
  "pt-BR": {
    "停用 leo（选中文本后不再显示气泡）": "Desativar leo (sem balão de seleção)", "停用": "Desativar", "先有一段文字，才能在面板里做。": "Adicione texto para usar uma ação.", "关闭": "Fechar", "启用 leo": "Ativar leo", "启用": "Ativar", "展开": "Expandir", "收起": "Recolher", "放大": "Ampliar painel", "新会话": "Nova sessão", "新对话": "Nova conversa", "缩小": "Reduzir painel", "网络错误，请稍后再试。": "Erro de rede. Tente novamente mais tarde.", "记录暂时不可用，稍后再试。": "Histórico temporariamente indisponível.", "这台电脑": "Este computador", "发送": "Enviar", "跟 leo 说": "Fale com leo", "保存": "Salvar", "删除": "Excluir", "删除此 leo 会话及全部记录？": "Excluir esta sessão leo e todo o histórico?", "取消": "Cancelar", "更多": "Mais", "查看全部": "Ver tudo", "重命名": "Renomear", "对话记录": "Histórico da conversa", "打开任务": "Abrir tarefa", "正在加载记录…": "Carregando histórico…", "清空记录": "Limpar histórico", "登录后 leo 才能记住对话": "Entre para que leo memorize suas conversas", "还没有对话，开始第一句吧。": "Ainda não há conversas. Envie uma mensagem.", "重试": "Tentar novamente"
  },
  "pt-PT": {
    "停用 leo（选中文本后不再显示气泡）": "Desativar leo (sem balão de seleção)", "停用": "Desativar", "先有一段文字，才能在面板里做。": "Adicione texto para usar uma ação.", "关闭": "Fechar", "启用 leo": "Ativar leo", "启用": "Ativar", "展开": "Expandir", "收起": "Recolher", "放大": "Ampliar painel", "新会话": "Nova sessão", "新对话": "Nova conversa", "缩小": "Reduzir painel", "网络错误，请稍后再试。": "Erro de rede. Tente novamente mais tarde.", "记录暂时不可用，稍后再试。": "Histórico temporariamente indisponível.", "这台电脑": "Este computador", "发送": "Enviar", "跟 leo 说": "Fale com leo", "保存": "Guardar", "删除": "Eliminar", "删除此 leo 会话及全部记录？": "Eliminar esta sessão leo e todo o histórico?", "取消": "Cancelar", "更多": "Mais", "查看全部": "Ver tudo", "重命名": "Mudar nome", "对话记录": "Histórico da conversa", "打开任务": "Abrir tarefa", "正在加载记录…": "A carregar histórico…", "清空记录": "Limpar histórico", "登录后 leo 才能记住对话": "Inicie sessão para o leo guardar as suas conversas", "还没有对话，开始第一句吧。": "Ainda não há conversas. Envie uma mensagem.", "重试": "Tentar novamente"
  },
  vi: {
    "停用 leo（选中文本后不再显示气泡）": "Tắt leo (không hiện bong bóng chọn)", "停用": "Tắt", "先有一段文字，才能在面板里做。": "Thêm văn bản để dùng thao tác.", "关闭": "Đóng", "启用 leo": "Bật leo", "启用": "Bật", "展开": "Mở rộng", "收起": "Thu gọn", "放大": "Mở rộng bảng", "新会话": "Phiên mới", "新对话": "Cuộc trò chuyện mới", "缩小": "Thu nhỏ bảng", "网络错误，请稍后再试。": "Lỗi mạng. Thử lại sau.", "记录暂时不可用，稍后再试。": "Lịch sử tạm thời không khả dụng.", "这台电脑": "Máy tính này", "发送": "Gửi", "跟 leo 说": "Nói với leo", "保存": "Lưu", "删除": "Xóa", "删除此 leo 会话及全部记录？": "Xóa phiên leo và toàn bộ lịch sử?", "取消": "Hủy", "更多": "Thêm", "查看全部": "Xem tất cả", "重命名": "Đổi tên", "对话记录": "Lịch sử trò chuyện", "打开任务": "Mở tác vụ", "正在加载记录…": "Đang tải lịch sử…", "清空记录": "Xóa lịch sử", "登录后 leo 才能记住对话": "Đăng nhập để leo ghi nhớ cuộc trò chuyện", "还没有对话，开始第一句吧。": "Chưa có cuộc trò chuyện. Hãy gửi tin nhắn.", "重试": "Thử lại"
  },
  tr: {
    "停用 leo（选中文本后不再显示气泡）": "leo'yu devre dışı bırak (seçim balonu yok)", "停用": "Devre dışı bırak", "先有一段文字，才能在面板里做。": "Bir işlem için önce metin ekleyin.", "关闭": "Kapat", "启用 leo": "leo'yu etkinleştir", "启用": "Etkinleştir", "展开": "Genişlet", "收起": "Daralt", "放大": "Paneli büyüt", "新会话": "Yeni oturum", "新对话": "Yeni konuşma", "缩小": "Paneli küçült", "网络错误，请稍后再试。": "Ağ hatası. Daha sonra tekrar deneyin.", "记录暂时不可用，稍后再试。": "Geçmiş geçici olarak kullanılamıyor.", "这台电脑": "Bu bilgisayar", "发送": "Gönder", "跟 leo 说": "leo ile konuş", "保存": "Kaydet", "删除": "Sil", "删除此 leo 会话及全部记录？": "Bu leo oturumu ve geçmişi silinsin mi?", "取消": "İptal", "更多": "Daha fazla", "查看全部": "Tümünü gör", "重命名": "Yeniden adlandır", "对话记录": "Konuşma geçmişi", "打开任务": "Görevi aç", "正在加载记录…": "Geçmiş yükleniyor…", "清空记录": "Geçmişi temizle", "登录后 leo 才能记住对话": "leo'nun konuşmalarınızı hatırlaması için giriş yapın", "还没有对话，开始第一句吧。": "Henüz konuşma yok. Bir mesaj gönderin.", "重试": "Tekrar dene"
  },
  "zh-TW": {
    "停用 leo（选中文本后不再显示气泡）": "停用 leo（選取文字後不再顯示氣泡）", "停用": "停用", "先有一段文字，才能在面板里做。": "請先加入文字，才能使用面板動作。", "关闭": "關閉", "启用 leo": "啟用 leo", "启用": "啟用", "展开": "展開", "收起": "收合", "放大": "放大面板", "新会话": "新工作階段", "新对话": "新對話", "缩小": "縮小面板", "网络错误，请稍后再试。": "網路錯誤，請稍後再試。", "记录暂时不可用，稍后再试。": "記錄暫時無法使用，請稍後再試。", "这台电脑": "這台電腦", "发送": "傳送", "跟 leo 说": "與 leo 對話", "保存": "儲存", "删除": "刪除", "删除此 leo 会话及全部记录？": "要刪除這個 leo 工作階段及全部記錄嗎？", "取消": "取消", "更多": "更多", "查看全部": "檢視全部", "重命名": "重新命名", "对话记录": "對話記錄", "打开任务": "開啟工作", "正在加载记录…": "正在載入記錄…", "清空记录": "清除記錄", "登录后 leo 才能记住对话": "登入後 leo 才能記住對話", "还没有对话，开始第一句吧。": "尚無對話，請傳送第一則訊息。", "重试": "重試"
  },
  ja: {
    "停用 leo（选中文本后不再显示气泡）": "leo を無効化（選択バブルを表示しない）", "停用": "無効化", "先有一段文字，才能在面板里做。": "パネル操作にはテキストを追加してください。", "关闭": "閉じる", "启用 leo": "leo を有効化", "启用": "有効化", "展开": "展開", "收起": "折りたたむ", "放大": "パネルを拡大", "新会话": "新しいセッション", "新对话": "新しい会話", "缩小": "パネルを縮小", "网络错误，请稍后再试。": "ネットワークエラー。後でもう一度お試しください。", "记录暂时不可用，稍后再试。": "履歴は一時的に利用できません。", "这台电脑": "このコンピューター", "发送": "送信", "跟 leo 说": "leo に話しかける", "保存": "保存", "删除": "削除", "删除此 leo 会话及全部记录？": "この leo セッションと履歴を削除しますか？", "取消": "キャンセル", "更多": "その他", "查看全部": "すべて表示", "重命名": "名前を変更", "对话记录": "会話履歴", "打开任务": "タスクを開く", "正在加载记录…": "履歴を読み込み中…", "清空记录": "履歴を消去", "登录后 leo 才能记住对话": "ログインすると leo が会話を記憶します", "还没有对话，开始第一句吧。": "会話はまだありません。メッセージを送信してください。", "重试": "再試行"
  },
  ko: {
    "停用 leo（选中文本后不再显示气泡）": "leo 비활성화(선택 말풍선 없음)", "停用": "비활성화", "先有一段文字，才能在面板里做。": "패널 작업을 하려면 텍스트를 추가하세요.", "关闭": "닫기", "启用 leo": "leo 활성화", "启用": "활성화", "展开": "펼치기", "收起": "접기", "放大": "패널 확대", "新会话": "새 세션", "新对话": "새 대화", "缩小": "패널 축소", "网络错误，请稍后再试。": "네트워크 오류입니다. 나중에 다시 시도하세요.", "记录暂时不可用，稍后再试。": "기록을 일시적으로 사용할 수 없습니다.", "这台电脑": "이 컴퓨터", "发送": "보내기", "跟 leo 说": "leo에게 말하기", "保存": "저장", "删除": "삭제", "删除此 leo 会话及全部记录？": "이 leo 세션과 기록을 모두 삭제할까요?", "取消": "취소", "更多": "더 보기", "查看全部": "모두 보기", "重命名": "이름 변경", "对话记录": "대화 기록", "打开任务": "작업 열기", "正在加载记录…": "기록을 불러오는 중…", "清空记录": "기록 지우기", "登录后 leo 才能记住对话": "로그인하면 leo가 대화를 기억합니다", "还没有对话，开始第一句吧。": "아직 대화가 없습니다. 메시지를 보내세요.", "重试": "다시 시도"
  },
  ar: {
    "停用 leo（选中文本后不再显示气泡）": "تعطيل leo (بدون فقاعة تحديد)", "停用": "تعطيل", "先有一段文字，才能在面板里做。": "أضف نصًا أولًا لاستخدام إجراء.", "关闭": "إغلاق", "启用 leo": "تمكين leo", "启用": "تمكين", "展开": "توسيع", "收起": "طيّ", "放大": "تكبير اللوحة", "新会话": "جلسة جديدة", "新对话": "محادثة جديدة", "缩小": "تصغير اللوحة", "网络错误，请稍后再试。": "خطأ في الشبكة. حاول لاحقًا.", "记录暂时不可用，稍后再试。": "السجل غير متاح مؤقتًا.", "这台电脑": "هذا الكمبيوتر", "发送": "إرسال", "跟 leo 说": "تحدث إلى leo", "保存": "حفظ", "删除": "حذف", "删除此 leo 会话及全部记录？": "حذف جلسة leo هذه وسجلها بالكامل؟", "取消": "إلغاء", "更多": "المزيد", "查看全部": "عرض الكل", "重命名": "إعادة التسمية", "对话记录": "سجل المحادثات", "打开任务": "فتح المهمة", "正在加载记录…": "جار تحميل السجل…", "清空记录": "مسح السجل", "登录后 leo 才能记住对话": "سجّل الدخول ليحفظ leo محادثاتك", "还没有对话，开始第一句吧。": "لا توجد محادثات بعد. أرسل رسالة.", "重试": "إعادة المحاولة"
  },
  th: {
    "停用 leo（选中文本后不再显示气泡）": "ปิดใช้ leo (ไม่แสดงบอลลูนการเลือก)", "停用": "ปิดใช้", "先有一段文字，才能在面板里做。": "เพิ่มข้อความก่อนใช้การทำงาน", "关闭": "ปิด", "启用 leo": "เปิดใช้ leo", "启用": "เปิดใช้", "展开": "ขยาย", "收起": "ย่อ", "放大": "ขยายแผง", "新会话": "เซสชันใหม่", "新对话": "การสนทนาใหม่", "缩小": "ย่อแผง", "网络错误，请稍后再试。": "ข้อผิดพลาดเครือข่าย ลองอีกครั้งภายหลัง", "记录暂时不可用，稍后再试。": "ประวัติใช้งานไม่ได้ชั่วคราว", "这台电脑": "คอมพิวเตอร์เครื่องนี้", "发送": "ส่ง", "跟 leo 说": "คุยกับ leo", "保存": "บันทึก", "删除": "ลบ", "删除此 leo 会话及全部记录？": "ลบเซสชัน leo และประวัติทั้งหมดหรือไม่", "取消": "ยกเลิก", "更多": "เพิ่มเติม", "查看全部": "ดูทั้งหมด", "重命名": "เปลี่ยนชื่อ", "对话记录": "ประวัติการสนทนา", "打开任务": "เปิดงาน", "正在加载记录…": "กำลังโหลดประวัติ…", "清空记录": "ล้างประวัติ", "登录后 leo 才能记住对话": "เข้าสู่ระบบเพื่อให้ leo จำการสนทนา", "还没有对话，开始第一句吧。": "ยังไม่มีการสนทนา ส่งข้อความแรก", "重试": "ลองอีกครั้ง"
  },
  hi: {
    "停用 leo（选中文本后不再显示气泡）": "leo अक्षम करें (चयन बबल नहीं)", "停用": "अक्षम करें", "先有一段文字，才能在面板里做。": "पैनल कार्रवाई के लिए पहले कुछ पाठ जोड़ें।", "关闭": "बंद करें", "启用 leo": "leo सक्षम करें", "启用": "सक्षम करें", "展开": "विस्तार करें", "收起": "समेटें", "放大": "पैनल बड़ा करें", "新会话": "नया सत्र", "新对话": "नई बातचीत", "缩小": "पैनल छोटा करें", "网络错误，请稍后再试。": "नेटवर्क त्रुटि। बाद में पुनः प्रयास करें।", "记录暂时不可用，稍后再试。": "इतिहास अस्थायी रूप से उपलब्ध नहीं है।", "这台电脑": "यह कंप्यूटर", "发送": "भेजें", "跟 leo 说": "leo से बात करें", "保存": "सहेजें", "删除": "हटाएं", "删除此 leo 会话及全部记录？": "क्या यह leo सत्र और इसका इतिहास हटाएं?", "取消": "रद्द करें", "更多": "अधिक", "查看全部": "सभी देखें", "重命名": "नाम बदलें", "对话记录": "बातचीत का इतिहास", "打开任务": "कार्य खोलें", "正在加载记录…": "इतिहास लोड हो रहा है…", "清空记录": "इतिहास साफ़ करें", "登录后 leo 才能记住对话": "leo को बातचीत याद रखने के लिए साइन इन करें", "还没有对话，开始第一句吧。": "अभी कोई बातचीत नहीं। संदेश भेजें।", "重试": "फिर कोशिश करें"
  }
});
