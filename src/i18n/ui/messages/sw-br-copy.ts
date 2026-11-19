import type { Locale } from "../../config";

const COPY: Record<Locale, string[]> = {
  "en": [
    "Save pending; will retry automatically",
    "Someone else changed this file",
    "Discard local changes and use the latest version",
    "Updating asset status…"
  ],
  "zh": [
    "保存未完成，将自动重试",
    "文件已被他人修改",
    "放弃本地改动，使用最新版本",
    "正在刷新素材状态…"
  ],
  "zh-TW": [
    "儲存未完成，將自動重試",
    "檔案已被他人修改",
    "捨棄本機變更，使用最新版本",
    "正在更新素材狀態…"
  ],
  "de": [
    "Speichern ausstehend; erneuter Versuch erfolgt automatisch",
    "Jemand anderes hat diese Datei geändert",
    "Lokale Änderungen verwerfen und die neueste Version verwenden",
    "Materialstatus wird aktualisiert…"
  ],
  "es": [
    "Guardado pendiente; se reintentará automáticamente",
    "Otra persona ha cambiado este archivo",
    "Descartar cambios locales y usar la última versión",
    "Actualizando el estado del recurso…"
  ],
  "es-419": [
    "Guardado pendiente; se reintentará automáticamente",
    "Otra persona cambió este archivo",
    "Descartar cambios locales y usar la última versión",
    "Actualizando el estado del recurso…"
  ],
  "fr": [
    "Enregistrement en attente ; nouvelle tentative automatique",
    "Une autre personne a modifié ce fichier",
    "Abandonner les modifications locales et utiliser la dernière version",
    "Mise à jour du contenu…"
  ],
  "it": [
    "Salvataggio in attesa; nuovo tentativo automatico",
    "Un’altra persona ha modificato questo file",
    "Scarta le modifiche locali e usa l’ultima versione",
    "Aggiornamento dello stato del contenuto…"
  ],
  "pt-BR": [
    "Salvamento pendente; nova tentativa automática",
    "Outra pessoa alterou este arquivo",
    "Descartar alterações locais e usar a versão mais recente",
    "Atualizando o status do conteúdo…"
  ],
  "pt-PT": [
    "Gravação pendente; nova tentativa automática",
    "Outra pessoa alterou este ficheiro",
    "Descartar alterações locais e usar a versão mais recente",
    "A atualizar o estado do conteúdo…"
  ],
  "vi": [
    "Chưa lưu xong; sẽ tự động thử lại",
    "Người khác đã thay đổi tệp này",
    "Bỏ thay đổi cục bộ và dùng phiên bản mới nhất",
    "Đang cập nhật trạng thái nội dung…"
  ],
  "tr": [
    "Kaydetme bekliyor; otomatik olarak yeniden denenecek",
    "Bu dosyayı başka biri değiştirdi",
    "Yerel değişiklikleri sil ve en son sürümü kullan",
    "İçerik durumu güncelleniyor…"
  ],
  "ja": [
    "保存待ちです。自動で再試行します",
    "他のユーザーがこのファイルを変更しました",
    "ローカルの変更を破棄して最新バージョンを使う",
    "素材の状態を更新中…"
  ],
  "ko": [
    "저장 대기 중이며 자동으로 다시 시도합니다",
    "다른 사람이 이 파일을 변경했습니다",
    "로컬 변경 사항을 버리고 최신 버전 사용",
    "자료 상태 업데이트 중…"
  ],
  "ar": [
    "الحفظ قيد الانتظار؛ ستتم إعادة المحاولة تلقائيًا",
    "عدّل شخص آخر هذا الملف",
    "تجاهل التغييرات المحلية واستخدم أحدث إصدار",
    "جارٍ تحديث حالة المحتوى…"
  ],
  "th": [
    "ยังบันทึกไม่เสร็จ จะลองใหม่โดยอัตโนมัติ",
    "มีผู้อื่นแก้ไขไฟล์นี้",
    "ทิ้งการแก้ไขในเครื่องและใช้เวอร์ชันล่าสุด",
    "กำลังอัปเดตสถานะเนื้อหา…"
  ],
  "hi": [
    "सहेजना बाकी है; अपने आप फिर कोशिश होगी",
    "किसी और ने यह फ़ाइल बदल दी है",
    "स्थानीय बदलाव हटाएँ और नवीनतम संस्करण उपयोग करें",
    "सामग्री की स्थिति अपडेट हो रही है…"
  ]
};
const KEYS = ["保存未完成，将自动重试", "文件已被他人修改", "放弃本地改动，使用最新版本", "正在刷新素材状态…"];
export function swBrCopy(locale: Locale): Record<string, string> {
  return Object.fromEntries(KEYS.map((key, index) => [key, COPY[locale][index]]));
}
