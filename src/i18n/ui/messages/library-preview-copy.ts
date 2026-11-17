import type { Locale } from "../../config";

const keys = ["正在准备文件预览…", "预览准备期间仍可下载原文件", "前 60 列", "后 60 列", "此文件没有可直接显示的预览", "正在读取文件…", "预览加载超时，打开查看素材"] as const;
const translations: Record<Locale, readonly string[]> = {
  zh: keys,
  en: ["Preparing file preview…", "You can download the original while the preview is being prepared", "Previous 60 columns", "Next 60 columns", "No preview is available for this file", "Reading file…", "Preview timed out. Open the item to view it."],
  "zh-TW": ["正在準備檔案預覽…", "預覽準備期間仍可下載原始檔案", "前 60 欄", "後 60 欄", "此檔案沒有可直接顯示的預覽", "正在讀取檔案…", "預覽載入逾時，請開啟素材查看"],
  ja: ["ファイルのプレビューを準備中…", "プレビューの準備中も元のファイルをダウンロードできます", "前の60列", "次の60列", "このファイルには表示できるプレビューがありません", "ファイルを読み込み中…", "プレビューの読み込みがタイムアウトしました。項目を開いて表示してください。"],
  ko: ["파일 미리보기 준비 중…", "미리보기 준비 중에도 원본 파일을 다운로드할 수 있습니다", "이전 60개 열", "다음 60개 열", "이 파일에 표시할 미리보기가 없습니다", "파일 읽는 중…", "미리보기 로딩 시간이 초과되었습니다. 항목을 열어 확인하세요."],
  de: ["Dateivorschau wird vorbereitet…", "Die Originaldatei kann währenddessen heruntergeladen werden", "Vorherige 60 Spalten", "Nächste 60 Spalten", "Für diese Datei ist keine Vorschau verfügbar", "Datei wird gelesen…", "Zeitüberschreitung der Vorschau. Öffnen Sie das Element."],
  fr: ["Préparation de l’aperçu du fichier…", "Vous pouvez télécharger l’original pendant la préparation de l’aperçu", "60 colonnes précédentes", "60 colonnes suivantes", "Aucun aperçu n’est disponible pour ce fichier", "Lecture du fichier…", "Le chargement de l’aperçu a expiré. Ouvrez l’élément pour le consulter."],
  it: ["Preparazione dell’anteprima del file…", "Puoi scaricare l’originale mentre viene preparata l’anteprima", "60 colonne precedenti", "60 colonne successive", "Nessuna anteprima disponibile per questo file", "Lettura del file…", "L’anteprima ha impiegato troppo tempo. Apri l’elemento per visualizzarlo."],
  es: ["Preparando la vista previa del archivo…", "Puedes descargar el original mientras se prepara la vista previa", "60 columnas anteriores", "60 columnas siguientes", "No hay vista previa disponible para este archivo", "Leyendo archivo…", "La vista previa agotó el tiempo de espera. Abre el elemento para verlo."],
  "es-419": ["Preparando la vista previa del archivo…", "Puedes descargar el original mientras se prepara la vista previa", "60 columnas anteriores", "60 columnas siguientes", "No hay vista previa disponible para este archivo", "Leyendo archivo…", "La vista previa agotó el tiempo de espera. Abre el elemento para verlo."],
  "pt-BR": ["Preparando a prévia do arquivo…", "Você pode baixar o original enquanto a prévia é preparada", "60 colunas anteriores", "Próximas 60 colunas", "Não há prévia disponível para este arquivo", "Lendo arquivo…", "A prévia demorou demais. Abra o item para visualizá-lo."],
  "pt-PT": ["A preparar a pré-visualização do ficheiro…", "Pode transferir o original enquanto a pré-visualização é preparada", "60 colunas anteriores", "Próximas 60 colunas", "Não há pré-visualização disponível para este ficheiro", "A ler o ficheiro…", "A pré-visualização excedeu o tempo limite. Abra o item para o ver."],
  vi: ["Đang chuẩn bị bản xem trước…", "Bạn vẫn có thể tải tệp gốc trong khi chuẩn bị bản xem trước", "60 cột trước", "60 cột tiếp theo", "Không có bản xem trước cho tệp này", "Đang đọc tệp…", "Đã hết thời gian tải bản xem trước. Mở mục để xem."],
  tr: ["Dosya önizlemesi hazırlanıyor…", "Önizleme hazırlanırken özgün dosyayı indirebilirsiniz", "Önceki 60 sütun", "Sonraki 60 sütun", "Bu dosya için önizleme yok", "Dosya okunuyor…", "Önizleme zaman aşımına uğradı. Görmek için öğeyi açın."],
  ar: ["جارٍ تجهيز معاينة الملف…", "يمكنك تنزيل الملف الأصلي أثناء تجهيز المعاينة", "الأعمدة الـ60 السابقة", "الأعمدة الـ60 التالية", "لا تتوفر معاينة لهذا الملف", "جارٍ قراءة الملف…", "انتهت مهلة تحميل المعاينة. افتح العنصر لعرضه."],
  th: ["กำลังเตรียมตัวอย่างไฟล์…", "คุณยังดาวน์โหลดไฟล์ต้นฉบับได้ระหว่างเตรียมตัวอย่าง", "60 คอลัมน์ก่อนหน้า", "60 คอลัมน์ถัดไป", "ไม่มีตัวอย่างสำหรับไฟล์นี้", "กำลังอ่านไฟล์…", "โหลดตัวอย่างหมดเวลา โปรดเปิดรายการเพื่อดู"],
  hi: ["फ़ाइल का पूर्वावलोकन तैयार हो रहा है…", "पूर्वावलोकन तैयार होने के दौरान भी मूल फ़ाइल डाउनलोड कर सकते हैं", "पिछले 60 कॉलम", "अगले 60 कॉलम", "इस फ़ाइल का पूर्वावलोकन उपलब्ध नहीं है", "फ़ाइल पढ़ी जा रही है…", "पूर्वावलोकन लोड होने का समय समाप्त हुआ। देखने के लिए आइटम खोलें।"],
};
export const LIBRARY_PREVIEW_MESSAGES = Object.fromEntries(Object.entries(translations).map(([locale, values]) =>
  [locale, Object.fromEntries(keys.map((key, i) => [key, values[i]]))])) as Record<Locale, Record<string, string>>;
