// 2026-10-23 编辑器整改波 W12 的新文案。只有 W12 改这一册。
// key = 中文原文（tt("…") 里那一句）；16 个非中文语种都要给，不许留中文。
import type { EditorOverhaulCopy } from "./editor-overhaul-copy-types";

export const EDITOR_OVERHAUL_W12_COPY: EditorOverhaulCopy = {
  de: { "高频": "Höhen", "淡入淡出": "Ein-/Ausblenden" },
  en: { "高频": "Treble", "淡入淡出": "Fades" },
  es: { "高频": "Agudos", "淡入淡出": "Fundidos" },
  "es-419": { "高频": "Agudos", "淡入淡出": "Fundidos" },
  fr: { "高频": "Aigus", "淡入淡出": "Fondus" },
  it: { "高频": "Alti", "淡入淡出": "Dissolvenze" },
  "pt-BR": { "高频": "Agudos", "淡入淡出": "Transições de volume" },
  "pt-PT": { "高频": "Agudos", "淡入淡出": "Transições de volume" },
  vi: { "高频": "Âm cao", "淡入淡出": "Tăng/giảm âm dần" },
  tr: { "高频": "Tiz", "淡入淡出": "Ses geçişleri" },
  "zh-TW": { "高频": "高頻", "淡入淡出": "淡入淡出" },
  ja: { "高频": "高音", "淡入淡出": "フェード" },
  ko: { "高频": "고음", "淡入淡出": "페이드" },
  ar: { "高频": "الترددات العالية", "淡入淡出": "التلاشي" },
  th: { "高频": "เสียงสูง", "淡入淡出": "เฟดเสียง" },
  hi: { "高频": "उच्च आवृत्ति", "淡入淡出": "फ़ेड" },
};

const TRANSCRIPT_KEYS = [
  "已删除这一句。时间轴已变化，请重新转写后再按句剪辑。",
  "转写前没能保存一份音频地址。", "转写失败", "转写是空的。",
  "转写没有切出句子。", "转写超时，请稍后再试。", "还没有音频可转写。",
  "这一句对不上时间轴。", "这一句没能删掉。",
] as const;
type TranscriptRow = readonly [string, string, string, string, string, string, string, string, string];
const TRANSCRIPT_ROWS: Record<keyof EditorOverhaulCopy, TranscriptRow> = {
  en: ["Sentence deleted. The timeline changed; transcribe again before editing by sentence.", "Could not save an audio source before transcription.", "Transcription failed", "The transcript is empty.", "No sentences were found in the transcript.", "Transcription timed out. Try again later.", "There is no audio to transcribe yet.", "This sentence does not match the timeline.", "Could not delete this sentence."],
  de: ["Satz gelöscht. Die Zeitleiste hat sich geändert; vor der Satzbearbeitung erneut transkribieren.", "Vor der Transkription konnte keine Audioquelle gespeichert werden.", "Transkription fehlgeschlagen", "Das Transkript ist leer.", "Im Transkript wurden keine Sätze gefunden.", "Zeitüberschreitung. Später erneut versuchen.", "Noch kein Audio zum Transkribieren vorhanden.", "Dieser Satz passt nicht zur Zeitleiste.", "Dieser Satz konnte nicht gelöscht werden."],
  es: ["Frase eliminada. La línea de tiempo cambió; vuelve a transcribir antes de editar por frases.", "No se pudo guardar una fuente de audio antes de transcribir.", "Error de transcripción", "La transcripción está vacía.", "No se encontraron frases en la transcripción.", "La transcripción agotó el tiempo. Inténtalo más tarde.", "Aún no hay audio para transcribir.", "Esta frase no coincide con la línea de tiempo.", "No se pudo eliminar esta frase."],
  "es-419": ["Frase eliminada. La línea de tiempo cambió; vuelve a transcribir antes de editar por frases.", "No se pudo guardar una fuente de audio antes de transcribir.", "Error de transcripción", "La transcripción está vacía.", "No se encontraron frases en la transcripción.", "La transcripción agotó el tiempo. Inténtalo más tarde.", "Aún no hay audio para transcribir.", "Esta frase no coincide con la línea de tiempo.", "No se pudo eliminar esta frase."],
  fr: ["Phrase supprimée. La timeline a changé ; retranscrivez avant de modifier par phrase.", "Impossible d’enregistrer une source audio avant la transcription.", "Échec de la transcription", "La transcription est vide.", "Aucune phrase trouvée dans la transcription.", "Délai de transcription dépassé. Réessayez plus tard.", "Aucun audio à transcrire pour le moment.", "Cette phrase ne correspond pas à la timeline.", "Impossible de supprimer cette phrase."],
  it: ["Frase eliminata. La timeline è cambiata; trascrivi di nuovo prima di modificare per frase.", "Impossibile salvare una sorgente audio prima della trascrizione.", "Trascrizione non riuscita", "La trascrizione è vuota.", "Nessuna frase trovata nella trascrizione.", "Tempo di trascrizione scaduto. Riprova più tardi.", "Non c’è ancora audio da trascrivere.", "Questa frase non corrisponde alla timeline.", "Impossibile eliminare questa frase."],
  "pt-BR": ["Frase excluída. A linha do tempo mudou; transcreva novamente antes de editar por frases.", "Não foi possível salvar uma fonte de áudio antes da transcrição.", "Falha na transcrição", "A transcrição está vazia.", "Nenhuma frase encontrada na transcrição.", "A transcrição excedeu o tempo. Tente mais tarde.", "Ainda não há áudio para transcrever.", "Esta frase não corresponde à linha do tempo.", "Não foi possível excluir esta frase."],
  "pt-PT": ["Frase eliminada. A linha temporal mudou; transcreva novamente antes de editar por frases.", "Não foi possível guardar uma fonte de áudio antes da transcrição.", "Falha na transcrição", "A transcrição está vazia.", "Não foram encontradas frases na transcrição.", "A transcrição excedeu o tempo. Tente mais tarde.", "Ainda não existe áudio para transcrever.", "Esta frase não corresponde à linha temporal.", "Não foi possível eliminar esta frase."],
  vi: ["Đã xóa câu. Dòng thời gian đã đổi; hãy chép lời lại trước khi sửa theo câu.", "Không lưu được nguồn âm thanh trước khi chép lời.", "Chép lời thất bại", "Bản chép lời trống.", "Không tìm thấy câu trong bản chép lời.", "Chép lời quá thời gian. Hãy thử lại sau.", "Chưa có âm thanh để chép lời.", "Câu này không khớp dòng thời gian.", "Không xóa được câu này."],
  tr: ["Cümle silindi. Zaman çizelgesi değişti; cümle düzenlemeden önce yeniden yazıya dökün.", "Yazıya dökmeden önce ses kaynağı kaydedilemedi.", "Yazıya dökme başarısız", "Döküm boş.", "Dökümde cümle bulunamadı.", "Yazıya dökme zaman aşımına uğradı. Daha sonra deneyin.", "Henüz yazıya dökülecek ses yok.", "Bu cümle zaman çizelgesiyle eşleşmiyor.", "Bu cümle silinemedi."],
  "zh-TW": ["已刪除這一句。時間軸已變更，請重新轉寫後再按句剪輯。", "轉寫前未能儲存音訊來源。", "轉寫失敗", "轉寫內容為空。", "轉寫未分出句子。", "轉寫逾時，請稍後再試。", "尚無音訊可供轉寫。", "這一句與時間軸不符。", "未能刪除這一句。"],
  ja: ["文を削除しました。タイムラインが変わったため、文単位の編集前に再度文字起こししてください。", "文字起こし前に音声ソースを保存できませんでした。", "文字起こしに失敗しました", "文字起こしが空です。", "文字起こしから文を分割できませんでした。", "文字起こしがタイムアウトしました。後で再試行してください。", "文字起こしする音声がまだありません。", "この文はタイムラインと一致しません。", "この文を削除できませんでした。"],
  ko: ["문장을 삭제했습니다. 타임라인이 변경되었으니 문장 편집 전에 다시 받아쓰세요.", "받아쓰기 전에 오디오 소스를 저장하지 못했습니다.", "받아쓰기 실패", "받아쓰기 결과가 비어 있습니다.", "받아쓰기 결과에서 문장을 나누지 못했습니다.", "받아쓰기 시간이 초과되었습니다. 나중에 다시 시도하세요.", "아직 받아쓸 오디오가 없습니다.", "이 문장은 타임라인과 일치하지 않습니다.", "이 문장을 삭제하지 못했습니다."],
  ar: ["حُذفت الجملة. تغيّر المخطط الزمني؛ أعد التفريغ قبل التحرير حسب الجمل.", "تعذر حفظ مصدر صوت قبل التفريغ.", "فشل التفريغ", "التفريغ فارغ.", "لم يُعثر على جمل في التفريغ.", "انتهت مهلة التفريغ. حاول لاحقًا.", "لا يوجد صوت لتفريغه بعد.", "هذه الجملة لا تطابق المخطط الزمني.", "تعذر حذف هذه الجملة."],
  th: ["ลบประโยคแล้ว ไทม์ไลน์เปลี่ยนไป โปรดถอดเสียงใหม่ก่อนแก้ไขตามประโยค", "บันทึกแหล่งเสียงก่อนถอดเสียงไม่สำเร็จ", "ถอดเสียงไม่สำเร็จ", "ผลถอดเสียงว่างเปล่า", "ไม่พบประโยคในผลถอดเสียง", "ถอดเสียงหมดเวลา โปรดลองอีกครั้งภายหลัง", "ยังไม่มีเสียงให้ถอด", "ประโยคนี้ไม่ตรงกับไทม์ไลน์", "ลบประโยคนี้ไม่สำเร็จ"],
  hi: ["वाक्य हटाया गया। टाइमलाइन बदल गई है; वाक्य के अनुसार संपादन से पहले फिर से लिप्यंतरण करें।", "लिप्यंतरण से पहले ऑडियो स्रोत सहेजा नहीं जा सका।", "लिप्यंतरण विफल", "लिप्यंतरण खाली है।", "लिप्यंतरण में वाक्य नहीं मिले।", "लिप्यंतरण का समय समाप्त हुआ। बाद में फिर कोशिश करें।", "लिप्यंतरण के लिए अभी ऑडियो नहीं है।", "यह वाक्य टाइमलाइन से मेल नहीं खाता।", "यह वाक्य हटाया नहीं जा सका।"],
};
for (const locale of Object.keys(TRANSCRIPT_ROWS) as Array<keyof EditorOverhaulCopy>) {
  TRANSCRIPT_KEYS.forEach((key, index) => { EDITOR_OVERHAUL_W12_COPY[locale][key] = TRANSCRIPT_ROWS[locale][index]; });
}
