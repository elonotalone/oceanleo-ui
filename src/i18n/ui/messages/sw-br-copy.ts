import type { Locale } from "../../config";

// Bind each translation to its source key; row order must never change its meaning.
const ZH = {
  "保存未完成，将自动重试": "保存未完成，将自动重试",
  "文件已被他人修改": "文件已被他人修改",
  "放弃本地改动，使用最新版本": "放弃本地改动，使用最新版本",
  "正在刷新素材状态…": "正在刷新素材状态…"
} as const;
type Copy = Record<keyof typeof ZH, string>;

const COPY: Record<Exclude<Locale, "zh">, Copy> = {
  "en": {
    "保存未完成，将自动重试": "Save pending; will retry automatically",
    "文件已被他人修改": "Someone else changed this file",
    "放弃本地改动，使用最新版本": "Discard local changes and use the latest version",
    "正在刷新素材状态…": "Updating asset status…"
  },
  "zh-TW": {
    "保存未完成，将自动重试": "儲存未完成，將自動重試",
    "文件已被他人修改": "檔案已被他人修改",
    "放弃本地改动，使用最新版本": "捨棄本機變更，使用最新版本",
    "正在刷新素材状态…": "正在更新素材狀態…"
  },
  "de": {
    "保存未完成，将自动重试": "Speichern ausstehend; erneuter Versuch erfolgt automatisch",
    "文件已被他人修改": "Jemand anderes hat diese Datei geändert",
    "放弃本地改动，使用最新版本": "Lokale Änderungen verwerfen und die neueste Version verwenden",
    "正在刷新素材状态…": "Materialstatus wird aktualisiert…"
  },
  "es": {
    "保存未完成，将自动重试": "Guardado pendiente; se reintentará automáticamente",
    "文件已被他人修改": "Otra persona ha cambiado este archivo",
    "放弃本地改动，使用最新版本": "Descartar cambios locales y usar la última versión",
    "正在刷新素材状态…": "Actualizando el estado del recurso…"
  },
  "es-419": {
    "保存未完成，将自动重试": "Guardado pendiente; se reintentará automáticamente",
    "文件已被他人修改": "Otra persona cambió este archivo",
    "放弃本地改动，使用最新版本": "Descartar cambios locales y usar la última versión",
    "正在刷新素材状态…": "Actualizando el estado del recurso…"
  },
  "fr": {
    "保存未完成，将自动重试": "Enregistrement en attente ; nouvelle tentative automatique",
    "文件已被他人修改": "Une autre personne a modifié ce fichier",
    "放弃本地改动，使用最新版本": "Abandonner les modifications locales et utiliser la dernière version",
    "正在刷新素材状态…": "Mise à jour du contenu…"
  },
  "it": {
    "保存未完成，将自动重试": "Salvataggio in attesa; nuovo tentativo automatico",
    "文件已被他人修改": "Un’altra persona ha modificato questo file",
    "放弃本地改动，使用最新版本": "Scarta le modifiche locali e usa l’ultima versione",
    "正在刷新素材状态…": "Aggiornamento dello stato del contenuto…"
  },
  "pt-BR": {
    "保存未完成，将自动重试": "Salvamento pendente; nova tentativa automática",
    "文件已被他人修改": "Outra pessoa alterou este arquivo",
    "放弃本地改动，使用最新版本": "Descartar alterações locais e usar a versão mais recente",
    "正在刷新素材状态…": "Atualizando o status do conteúdo…"
  },
  "pt-PT": {
    "保存未完成，将自动重试": "Gravação pendente; nova tentativa automática",
    "文件已被他人修改": "Outra pessoa alterou este ficheiro",
    "放弃本地改动，使用最新版本": "Descartar alterações locais e usar a versão mais recente",
    "正在刷新素材状态…": "A atualizar o estado do conteúdo…"
  },
  "vi": {
    "保存未完成，将自动重试": "Chưa lưu xong; sẽ tự động thử lại",
    "文件已被他人修改": "Người khác đã thay đổi tệp này",
    "放弃本地改动，使用最新版本": "Bỏ thay đổi cục bộ và dùng phiên bản mới nhất",
    "正在刷新素材状态…": "Đang cập nhật trạng thái nội dung…"
  },
  "tr": {
    "保存未完成，将自动重试": "Kaydetme bekliyor; otomatik olarak yeniden denenecek",
    "文件已被他人修改": "Bu dosyayı başka biri değiştirdi",
    "放弃本地改动，使用最新版本": "Yerel değişiklikleri sil ve en son sürümü kullan",
    "正在刷新素材状态…": "İçerik durumu güncelleniyor…"
  },
  "ja": {
    "保存未完成，将自动重试": "保存待ちです。自動で再試行します",
    "文件已被他人修改": "他のユーザーがこのファイルを変更しました",
    "放弃本地改动，使用最新版本": "ローカルの変更を破棄して最新バージョンを使う",
    "正在刷新素材状态…": "素材の状態を更新中…"
  },
  "ko": {
    "保存未完成，将自动重试": "저장 대기 중이며 자동으로 다시 시도합니다",
    "文件已被他人修改": "다른 사람이 이 파일을 변경했습니다",
    "放弃本地改动，使用最新版本": "로컬 변경 사항을 버리고 최신 버전 사용",
    "正在刷新素材状态…": "자료 상태 업데이트 중…"
  },
  "ar": {
    "保存未完成，将自动重试": "الحفظ قيد الانتظار؛ ستتم إعادة المحاولة تلقائيًا",
    "文件已被他人修改": "عدّل شخص آخر هذا الملف",
    "放弃本地改动，使用最新版本": "تجاهل التغييرات المحلية واستخدم أحدث إصدار",
    "正在刷新素材状态…": "جارٍ تحديث حالة المحتوى…"
  },
  "th": {
    "保存未完成，将自动重试": "ยังบันทึกไม่เสร็จ จะลองใหม่โดยอัตโนมัติ",
    "文件已被他人修改": "มีผู้อื่นแก้ไขไฟล์นี้",
    "放弃本地改动，使用最新版本": "ทิ้งการแก้ไขในเครื่องและใช้เวอร์ชันล่าสุด",
    "正在刷新素材状态…": "กำลังอัปเดตสถานะเนื้อหา…"
  },
  "hi": {
    "保存未完成，将自动重试": "सहेजना बाकी है; अपने आप फिर कोशिश होगी",
    "文件已被他人修改": "किसी और ने यह फ़ाइल बदल दी है",
    "放弃本地改动，使用最新版本": "स्थानीय बदलाव हटाएँ और नवीनतम संस्करण उपयोग करें",
    "正在刷新素材状态…": "सामग्री की स्थिति अपडेट हो रही है…"
  }
};

export function swBrCopy(locale: Locale): Record<string, string> {
  return locale === "zh" ? { ...ZH } : { ...COPY[locale] };
}
