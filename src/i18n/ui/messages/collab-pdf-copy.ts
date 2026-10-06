// 2026-10-06 work-chat 第二轮 F05（PDF 按批注多人同改）的分表。只由该 owner 改；注册在 work-chat-copy.ts（父改）。
// 写法同 collab-visual-copy.ts：SOURCE 里「名字 → 简体中文原文」，各语种给同名条目；键就是简体中文原文（`tt("中文原文", { n })`）。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  pageAdjusting: "「{name}」正在调整页面，你现在只能看；他保存后这里会自动更新。",
  noPageLock: "现在拿不到调整页面的权限，请稍后再试。",
  viewerOnly: "你只有查看权限，只能看、翻页和复制文字。",
  docJustUpdated: "文档刚被同事更新，请再试一次",
} as const;

export const COLLAB_PDF_MESSAGES = assembleCopy(SOURCE, {
  de: {
    pageAdjusting: "{name} ordnet gerade die Seiten. Du kannst vorerst nur ansehen; nach dem Speichern wird es hier automatisch aktualisiert.",
    noPageLock: "Die Seiten können gerade nicht von dir bearbeitet werden. Bitte versuche es gleich noch einmal.",
    viewerOnly: "Du hast nur Leserechte: Blättern, Zoomen und Text kopieren sind möglich.",
    docJustUpdated: "Das Dokument wurde gerade von einem Kollegen aktualisiert. Bitte versuche es noch einmal.",
  },
  en: {
    pageAdjusting: "{name} is rearranging the pages. You can only view for now; it updates here after they save.",
    noPageLock: "You can't change the pages right now. Please try again in a moment.",
    viewerOnly: "You have view-only access: you can turn pages, zoom and copy text.",
    docJustUpdated: "A teammate just updated this document. Please try again.",
  },
  es: {
    pageAdjusting: "{name} está reorganizando las páginas. Por ahora solo puedes verlas; se actualizarán aquí cuando guarde.",
    noPageLock: "Ahora mismo no puedes modificar las páginas. Inténtalo de nuevo en un momento.",
    viewerOnly: "Solo tienes permiso de lectura: puedes pasar páginas, hacer zoom y copiar texto.",
    docJustUpdated: "Un compañero acaba de actualizar el documento. Inténtalo de nuevo.",
  },
  "es-419": {
    pageAdjusting: "{name} está reorganizando las páginas. Por ahora solo puedes verlas; se actualizarán aquí cuando guarde.",
    noPageLock: "En este momento no puedes modificar las páginas. Inténtalo de nuevo en un momento.",
    viewerOnly: "Solo tienes permiso de lectura: puedes cambiar de página, hacer zoom y copiar texto.",
    docJustUpdated: "Un compañero acaba de actualizar el documento. Inténtalo de nuevo.",
  },
  fr: {
    pageAdjusting: "{name} réorganise les pages. Vous pouvez seulement consulter pour l'instant ; la mise à jour apparaîtra ici après son enregistrement.",
    noPageLock: "Vous ne pouvez pas modifier les pages pour le moment. Réessayez dans un instant.",
    viewerOnly: "Vous avez un accès en lecture seule : vous pouvez tourner les pages, zoomer et copier du texte.",
    docJustUpdated: "Un collègue vient de mettre à jour ce document. Réessayez.",
  },
  it: {
    pageAdjusting: "{name} sta riordinando le pagine. Per ora puoi solo guardare; si aggiornerà qui dopo il salvataggio.",
    noPageLock: "Al momento non puoi modificare le pagine. Riprova tra poco.",
    viewerOnly: "Hai solo accesso in lettura: puoi sfogliare le pagine, ingrandire e copiare il testo.",
    docJustUpdated: "Un collega ha appena aggiornato il documento. Riprova.",
  },
  "pt-BR": {
    pageAdjusting: "{name} está reorganizando as páginas. Por enquanto você só pode ver; ao salvar, a atualização aparece aqui.",
    noPageLock: "Você não pode alterar as páginas agora. Tente novamente em instantes.",
    viewerOnly: "Você só tem permissão de leitura: pode passar páginas, dar zoom e copiar texto.",
    docJustUpdated: "Um colega acabou de atualizar o documento. Tente novamente.",
  },
  "pt-PT": {
    pageAdjusting: "{name} está a reorganizar as páginas. Por agora só pode ver; ao guardar, a atualização aparece aqui.",
    noPageLock: "Neste momento não pode alterar as páginas. Tente novamente daqui a pouco.",
    viewerOnly: "Só tem permissão de leitura: pode virar páginas, ampliar e copiar texto.",
    docJustUpdated: "Um colega acabou de atualizar o documento. Tente novamente.",
  },
  vi: {
    pageAdjusting: "{name} đang sắp xếp lại các trang. Hiện bạn chỉ có thể xem; sau khi họ lưu, nội dung sẽ tự cập nhật ở đây.",
    noPageLock: "Hiện bạn chưa thể chỉnh sửa các trang. Vui lòng thử lại sau giây lát.",
    viewerOnly: "Bạn chỉ có quyền xem: có thể lật trang, phóng to và sao chép văn bản.",
    docJustUpdated: "Đồng nghiệp vừa cập nhật tài liệu. Vui lòng thử lại.",
  },
  tr: {
    pageAdjusting: "{name} sayfaları düzenliyor. Şimdilik yalnızca görüntüleyebilirsiniz; kaydedince burası otomatik güncellenir.",
    noPageLock: "Şu anda sayfaları değiştiremezsiniz. Lütfen biraz sonra tekrar deneyin.",
    viewerOnly: "Yalnızca görüntüleme izniniz var: sayfa çevirebilir, yakınlaştırabilir ve metin kopyalayabilirsiniz.",
    docJustUpdated: "Bir ekip arkadaşınız belgeyi az önce güncelledi. Lütfen tekrar deneyin.",
  },
  "zh-TW": {
    pageAdjusting: "「{name}」正在調整頁面，你現在只能看；他儲存後這裡會自動更新。",
    noPageLock: "現在無法取得調整頁面的權限，請稍後再試。",
    viewerOnly: "你只有檢視權限，只能看、翻頁和複製文字。",
    docJustUpdated: "文件剛被同事更新，請再試一次",
  },
  ja: {
    pageAdjusting: "{name} さんがページを調整中です。いまは閲覧のみで、保存されるとここが自動で更新されます。",
    noPageLock: "いまはページを変更できません。しばらくしてからもう一度お試しください。",
    viewerOnly: "閲覧権限のみのため、ページ送り・拡大縮小・テキストのコピーだけができます。",
    docJustUpdated: "同僚が文書を更新したばかりです。もう一度お試しください。",
  },
  ko: {
    pageAdjusting: "{name}님이 페이지를 조정하고 있습니다. 지금은 보기만 가능하며, 저장되면 이곳이 자동으로 업데이트됩니다.",
    noPageLock: "지금은 페이지를 변경할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    viewerOnly: "보기 권한만 있어 페이지 넘기기, 확대/축소, 텍스트 복사만 할 수 있습니다.",
    docJustUpdated: "동료가 방금 문서를 업데이트했습니다. 다시 시도해 주세요.",
  },
  ar: {
    pageAdjusting: "{name} يعيد ترتيب الصفحات الآن. يمكنك المشاهدة فقط في الوقت الحالي، وسيتحدّث المحتوى هنا بعد أن يحفظ.",
    noPageLock: "لا يمكنك تعديل الصفحات الآن. يُرجى المحاولة مرة أخرى بعد قليل.",
    viewerOnly: "لديك صلاحية العرض فقط: يمكنك تقليب الصفحات والتكبير ونسخ النص.",
    docJustUpdated: "حدّث زميلٌ المستند للتو. يُرجى المحاولة مرة أخرى.",
  },
  th: {
    pageAdjusting: "{name} กำลังปรับหน้าเอกสารอยู่ ตอนนี้คุณดูได้อย่างเดียว เมื่อเขาบันทึกแล้วหน้านี้จะอัปเดตเอง",
    noPageLock: "ตอนนี้ยังปรับหน้าเอกสารไม่ได้ โปรดลองอีกครั้งในอีกสักครู่",
    viewerOnly: "คุณมีสิทธิ์ดูเท่านั้น: เปิดหน้า ซูม และคัดลอกข้อความได้",
    docJustUpdated: "เพื่อนร่วมงานเพิ่งอัปเดตเอกสาร โปรดลองอีกครั้ง",
  },
  hi: {
    pageAdjusting: "{name} पेज व्यवस्थित कर रहे हैं। अभी आप केवल देख सकते हैं; उनके सेव करने के बाद यह यहाँ अपने-आप अपडेट हो जाएगा।",
    noPageLock: "अभी आप पेज नहीं बदल सकते। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    viewerOnly: "आपके पास केवल देखने की अनुमति है: आप पेज पलट सकते हैं, ज़ूम कर सकते हैं और टेक्स्ट कॉपी कर सकते हैं।",
    docJustUpdated: "किसी सहकर्मी ने अभी दस्तावेज़ अपडेट किया है। कृपया फिर कोशिश करें।",
  },
});
