// 2026-09-24 editors-and-shell 波 W18 的分表。只由 W18 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W18_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  enterProNotReady: "还没准备好打开专业编辑，稍后再试。",
  umoSaveUnconfirmed: "专业编辑还没确认保存。",
  photopeaNoImage: "专业编辑没有带回可用的图片。",
  compositeNotOverwritten: "这份是分层设计稿，专业编辑里改完的平面图不会覆盖原稿。",
} as const;

export const EAS_W18_MESSAGES = assembleCopy(SOURCE, {
  en: {
    enterProNotReady: "Professional editing is not ready yet. Try again in a moment.",
    umoSaveUnconfirmed: "Professional editing has not confirmed the save yet.",
    photopeaNoImage: "Professional editing did not return a usable image.",
    compositeNotOverwritten: "This is a layered design. The flattened image from professional editing will not replace the original.",
  },
  de: {
    enterProNotReady: "Die professionelle Bearbeitung ist noch nicht bereit. Versuchen Sie es gleich noch einmal.",
    umoSaveUnconfirmed: "Die professionelle Bearbeitung hat das Speichern noch nicht bestätigt.",
    photopeaNoImage: "Die professionelle Bearbeitung hat kein verwendbares Bild zurückgegeben.",
    compositeNotOverwritten: "Das ist ein Ebenenentwurf. Das flache Bild aus der professionellen Bearbeitung ersetzt das Original nicht.",
  },
  es: {
    enterProNotReady: "La edición profesional aún no está lista. Inténtalo en un momento.",
    umoSaveUnconfirmed: "La edición profesional aún no ha confirmado el guardado.",
    photopeaNoImage: "La edición profesional no devolvió una imagen usable.",
    compositeNotOverwritten: "Este es un diseño por capas. La imagen plana de la edición profesional no sustituye el original.",
  },
  "es-419": {
    enterProNotReady: "La edición profesional todavía no está lista. Inténtalo en un momento.",
    umoSaveUnconfirmed: "La edición profesional todavía no confirmó el guardado.",
    photopeaNoImage: "La edición profesional no devolvió una imagen usable.",
    compositeNotOverwritten: "Este es un diseño por capas. La imagen plana de la edición profesional no reemplaza el original.",
  },
  fr: {
    enterProNotReady: "L’édition professionnelle n’est pas encore prête. Réessayez dans un instant.",
    umoSaveUnconfirmed: "L’édition professionnelle n’a pas encore confirmé l’enregistrement.",
    photopeaNoImage: "L’édition professionnelle n’a pas renvoyé d’image utilisable.",
    compositeNotOverwritten: "Ceci est un document calqué. L’image aplatie de l’édition professionnelle ne remplace pas l’original.",
  },
  it: {
    enterProNotReady: "La modifica professionale non è ancora pronta. Riprova tra un momento.",
    umoSaveUnconfirmed: "La modifica professionale non ha ancora confermato il salvataggio.",
    photopeaNoImage: "La modifica professionale non ha restituito un’immagine utilizzabile.",
    compositeNotOverwritten: "Questo è un progetto a livelli. L’immagine appiattita della modifica professionale non sostituisce l’originale.",
  },
  "pt-BR": {
    enterProNotReady: "A edição profissional ainda não está pronta. Tente de novo em instantes.",
    umoSaveUnconfirmed: "A edição profissional ainda não confirmou o salvamento.",
    photopeaNoImage: "A edição profissional não devolveu uma imagem utilizável.",
    compositeNotOverwritten: "Este é um desenho em camadas. A imagem achatada da edição profissional não substitui o original.",
  },
  "pt-PT": {
    enterProNotReady: "A edição profissional ainda não está pronta. Tente novamente dentro de momentos.",
    umoSaveUnconfirmed: "A edição profissional ainda não confirmou o guardar.",
    photopeaNoImage: "A edição profissional não devolveu uma imagem utilizável.",
    compositeNotOverwritten: "Este é um desenho em camadas. A imagem achatada da edição profissional não substitui o original.",
  },
  vi: {
    enterProNotReady: "Chế độ chỉnh sửa chuyên nghiệp chưa sẵn sàng. Hãy thử lại sau một lát.",
    umoSaveUnconfirmed: "Chế độ chỉnh sửa chuyên nghiệp chưa xác nhận đã lưu.",
    photopeaNoImage: "Chế độ chỉnh sửa chuyên nghiệp không trả về ảnh dùng được.",
    compositeNotOverwritten: "Đây là bản thiết kế nhiều lớp. Ảnh phẳng từ chế độ chuyên nghiệp sẽ không ghi đè bản gốc.",
  },
  tr: {
    enterProNotReady: "Profesyonel düzenleme henüz hazır değil. Biraz sonra yeniden deneyin.",
    umoSaveUnconfirmed: "Profesyonel düzenleme kaydı henüz onaylamadı.",
    photopeaNoImage: "Profesyonel düzenleme kullanılabilir bir görüntü döndürmedi.",
    compositeNotOverwritten: "Bu katmanlı bir tasarımdır. Profesyonel düzenlemeden gelen düz görüntü orijinalin üzerine yazılmaz.",
  },
  "zh-TW": {
    enterProNotReady: "還沒準備好打開專業編輯，稍後再試。",
    umoSaveUnconfirmed: "專業編輯還沒確認儲存。",
    photopeaNoImage: "專業編輯沒有帶回可用的圖片。",
    compositeNotOverwritten: "這份是分層設計稿，專業編輯裡改完的平面圖不會覆蓋原稿。",
  },
  ja: {
    enterProNotReady: "プロ編集の準備がまだできていません。少ししてからもう一度お試しください。",
    umoSaveUnconfirmed: "プロ編集が保存をまだ確認していません。",
    photopeaNoImage: "プロ編集から使える画像が返ってきませんでした。",
    compositeNotOverwritten: "これはレイヤー付きの原稿です。プロ編集で直した平面画像は原本を上書きしません。",
  },
  ko: {
    enterProNotReady: "전문가 편집을 열 준비가 되지 않았습니다. 잠시 후 다시 시도하세요.",
    umoSaveUnconfirmed: "전문가 편집이 아직 저장을 확인하지 않았습니다.",
    photopeaNoImage: "전문가 편집이 사용할 수 있는 이미지를 돌려주지 않았습니다.",
    compositeNotOverwritten: "이 파일은 레이어 디자인입니다. 전문가 편집에서 만든 평면 이미지는 원본을 덮어쓰지 않습니다.",
  },
  ar: {
    enterProNotReady: "التحرير الاحترافي ليس جاهزًا بعد. حاول مرة أخرى بعد لحظة.",
    umoSaveUnconfirmed: "التحرير الاحترافي لم يؤكد الحفظ بعد.",
    photopeaNoImage: "لم يُرجع التحرير الاحترافي صورة قابلة للاستخدام.",
    compositeNotOverwritten: "هذا تصميم بطبقات. الصورة المسطحة من التحرير الاحترافي لن تستبدل الأصل.",
  },
  th: {
    enterProNotReady: "โหมดแก้ไขระดับมืออาชีพยังไม่พร้อม ลองอีกครั้งในอีกสักครู่",
    umoSaveUnconfirmed: "โหมดแก้ไขระดับมืออาชีพยังไม่ยืนยันการบันทึก",
    photopeaNoImage: "โหมดแก้ไขระดับมืออาชีพไม่ได้ส่งรูปที่ใช้ได้กลับมา",
    compositeNotOverwritten: "นี่เป็นต้นฉบับแบบหลายเลเยอร์ รูปแบนจากโหมดมืออาชีพจะไม่ทับต้นฉบับ",
  },
  hi: {
    enterProNotReady: "प्रोफ़ेशनल संपादन अभी तैयार नहीं है। थोड़ी देर बाद फिर कोशिश करें।",
    umoSaveUnconfirmed: "प्रोफ़ेशनल संपादन ने सेव की पुष्टि अभी नहीं की है।",
    photopeaNoImage: "प्रोफ़ेशनल संपादन ने कोई उपयोगी छवि नहीं लौटाई।",
    compositeNotOverwritten: "यह परतदार डिज़ाइन है। प्रोफ़ेशनल संपादन से आई सपाट छवि मूल फ़ाइल को नहीं बदलेगी।",
  },
});
