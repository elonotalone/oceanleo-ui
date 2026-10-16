// 2026-09-24 editors-and-shell 波 W18 的分表。只由 W18 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W18_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  enterProNotReady: "还没准备好打开专业编辑，稍后再试。",
  umoSaveUnconfirmed: "专业编辑还没确认保存。",
  compositeNotOverwritten: "这份是分层设计稿，专业编辑里改完的平面图不会覆盖原稿。",
  psdNoComposite:
    "这个 PSD 里没有可显示的合成图，请在 Photoshop 里勾选「最大兼容」后重新上传。",
} as const;

export const EAS_W18_MESSAGES = assembleCopy(SOURCE, {
  en: {
    enterProNotReady: "Professional editing is not ready yet. Try again in a moment.",
    umoSaveUnconfirmed: "Professional editing has not confirmed the save yet.",
    compositeNotOverwritten: "This is a layered design. The flattened image from professional editing will not replace the original.",
    psdNoComposite:
      "This PSD has no displayable composite. In Photoshop, enable “Maximize Compatibility” and upload again.",
  },
  de: {
    enterProNotReady: "Die professionelle Bearbeitung ist noch nicht bereit. Versuchen Sie es gleich noch einmal.",
    umoSaveUnconfirmed: "Die professionelle Bearbeitung hat das Speichern noch nicht bestätigt.",
    compositeNotOverwritten: "Das ist ein Ebenenentwurf. Das flache Bild aus der professionellen Bearbeitung ersetzt das Original nicht.",
    psdNoComposite:
      "Diese PSD enthält kein anzeigbares Gesamtbild. Aktivieren Sie in Photoshop „Maximale Kompatibilität“ und laden Sie die Datei erneut hoch.",
  },
  es: {
    enterProNotReady: "La edición profesional aún no está lista. Inténtalo en un momento.",
    umoSaveUnconfirmed: "La edición profesional aún no ha confirmado el guardado.",
    compositeNotOverwritten: "Este es un diseño por capas. La imagen plana de la edición profesional no sustituye el original.",
    psdNoComposite:
      "Este PSD no tiene una imagen compuesta visible. En Photoshop, activa «Maximizar compatibilidad» y vuelve a subirlo.",
  },
  "es-419": {
    enterProNotReady: "La edición profesional todavía no está lista. Inténtalo en un momento.",
    umoSaveUnconfirmed: "La edición profesional todavía no confirmó el guardado.",
    compositeNotOverwritten: "Este es un diseño por capas. La imagen plana de la edición profesional no reemplaza el original.",
    psdNoComposite:
      "Este PSD no tiene una imagen compuesta visible. En Photoshop, activa “Maximizar compatibilidad” y vuelve a subirlo.",
  },
  fr: {
    enterProNotReady: "L’édition professionnelle n’est pas encore prête. Réessayez dans un instant.",
    umoSaveUnconfirmed: "L’édition professionnelle n’a pas encore confirmé l’enregistrement.",
    compositeNotOverwritten: "Ceci est un document calqué. L’image aplatie de l’édition professionnelle ne remplace pas l’original.",
    psdNoComposite:
      "Ce PSD n’a pas d’image composite affichable. Dans Photoshop, activez « Compatibilité maximale » puis renvoyez le fichier.",
  },
  it: {
    enterProNotReady: "La modifica professionale non è ancora pronta. Riprova tra un momento.",
    umoSaveUnconfirmed: "La modifica professionale non ha ancora confermato il salvataggio.",
    compositeNotOverwritten: "Questo è un progetto a livelli. L’immagine appiattita della modifica professionale non sostituisce l’originale.",
    psdNoComposite:
      "Questo PSD non ha un’immagine composita visualizzabile. In Photoshop attiva «Massimizza compatibilità» e carica di nuovo.",
  },
  "pt-BR": {
    enterProNotReady: "A edição profissional ainda não está pronta. Tente de novo em instantes.",
    umoSaveUnconfirmed: "A edição profissional ainda não confirmou o salvamento.",
    compositeNotOverwritten: "Este é um desenho em camadas. A imagem achatada da edição profissional não substitui o original.",
    psdNoComposite:
      "Este PSD não tem uma imagem composta exibível. No Photoshop, ative “Maximizar compatibilidade” e envie de novo.",
  },
  "pt-PT": {
    enterProNotReady: "A edição profissional ainda não está pronta. Tente novamente dentro de momentos.",
    umoSaveUnconfirmed: "A edição profissional ainda não confirmou o guardar.",
    compositeNotOverwritten: "Este é um desenho em camadas. A imagem achatada da edição profissional não substitui o original.",
    psdNoComposite:
      "Este PSD não tem uma imagem composta visível. No Photoshop, ative «Maximizar compatibilidade» e carregue novamente.",
  },
  vi: {
    enterProNotReady: "Chế độ chỉnh sửa chuyên nghiệp chưa sẵn sàng. Hãy thử lại sau một lát.",
    umoSaveUnconfirmed: "Chế độ chỉnh sửa chuyên nghiệp chưa xác nhận đã lưu.",
    compositeNotOverwritten: "Đây là bản thiết kế nhiều lớp. Ảnh phẳng từ chế độ chuyên nghiệp sẽ không ghi đè bản gốc.",
    psdNoComposite:
      "PSD này không có ảnh tổng hợp để hiển thị. Trong Photoshop, hãy bật “Maximize Compatibility” rồi tải lên lại.",
  },
  tr: {
    enterProNotReady: "Profesyonel düzenleme henüz hazır değil. Biraz sonra yeniden deneyin.",
    umoSaveUnconfirmed: "Profesyonel düzenleme kaydı henüz onaylamadı.",
    compositeNotOverwritten: "Bu katmanlı bir tasarımdır. Profesyonel düzenlemeden gelen düz görüntü orijinalin üzerine yazılmaz.",
    psdNoComposite:
      "Bu PSD’de görüntülenebilir bir birleşik görüntü yok. Photoshop’ta “Maximize Compatibility” seçeneğini açıp yeniden yükleyin.",
  },
  "zh-TW": {
    enterProNotReady: "還沒準備好打開專業編輯，稍後再試。",
    umoSaveUnconfirmed: "專業編輯還沒確認儲存。",
    compositeNotOverwritten: "這份是分層設計稿，專業編輯裡改完的平面圖不會覆蓋原稿。",
    psdNoComposite:
      "這個 PSD 裡沒有可顯示的合成圖，請在 Photoshop 裡勾選「最大相容」後重新上傳。",
  },
  ja: {
    enterProNotReady: "プロ編集の準備がまだできていません。少ししてからもう一度お試しください。",
    umoSaveUnconfirmed: "プロ編集が保存をまだ確認していません。",
    compositeNotOverwritten: "これはレイヤー付きの原稿です。プロ編集で直した平面画像は原本を上書きしません。",
    psdNoComposite:
      "この PSD には表示できる合成画像がありません。Photoshop で「最大互換性」をオンにしてから、もう一度アップロードしてください。",
  },
  ko: {
    enterProNotReady: "전문가 편집을 열 준비가 되지 않았습니다. 잠시 후 다시 시도하세요.",
    umoSaveUnconfirmed: "전문가 편집이 아직 저장을 확인하지 않았습니다.",
    compositeNotOverwritten: "이 파일은 레이어 디자인입니다. 전문가 편집에서 만든 평면 이미지는 원본을 덮어쓰지 않습니다.",
    psdNoComposite:
      "이 PSD에는 표시할 수 있는 합성 이미지가 없습니다. Photoshop에서 “최대 호환성”을 켠 뒤 다시 올려 주세요.",
  },
  ar: {
    enterProNotReady: "التحرير الاحترافي ليس جاهزًا بعد. حاول مرة أخرى بعد لحظة.",
    umoSaveUnconfirmed: "التحرير الاحترافي لم يؤكد الحفظ بعد.",
    compositeNotOverwritten: "هذا تصميم بطبقات. الصورة المسطحة من التحرير الاحترافي لن تستبدل الأصل.",
    psdNoComposite:
      "لا يحتوي ملف PSD هذا على صورة مركّبة يمكن عرضها. في Photoshop، فعّل «أقصى توافق» ثم أعد الرفع.",
  },
  th: {
    enterProNotReady: "โหมดแก้ไขระดับมืออาชีพยังไม่พร้อม ลองอีกครั้งในอีกสักครู่",
    umoSaveUnconfirmed: "โหมดแก้ไขระดับมืออาชีพยังไม่ยืนยันการบันทึก",
    compositeNotOverwritten: "นี่เป็นต้นฉบับแบบหลายเลเยอร์ รูปแบนจากโหมดมืออาชีพจะไม่ทับต้นฉบับ",
    psdNoComposite:
      "PSD นี้ไม่มีภาพรวมที่แสดงได้ ใน Photoshop ให้เปิด “Maximize Compatibility” แล้วอัปโหลดใหม่",
  },
  hi: {
    enterProNotReady: "प्रोफ़ेशनल संपादन अभी तैयार नहीं है। थोड़ी देर बाद फिर कोशिश करें।",
    umoSaveUnconfirmed: "प्रोफ़ेशनल संपादन ने सेव की पुष्टि अभी नहीं की है।",
    compositeNotOverwritten: "यह परतदार डिज़ाइन है। प्रोफ़ेशनल संपादन से आई सपाट छवि मूल फ़ाइल को नहीं बदलेगी।",
    psdNoComposite:
      "इस PSD में दिखाने योग्य कंपोज़िट नहीं है। Photoshop में “Maximize Compatibility” चालू करके फिर अपलोड करें।",
  },
});
