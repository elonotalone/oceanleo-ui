// 2026-10-06 work-chat 第二轮 F06（流程图按节点与连线多人同改）的分表。只由该 owner 改；注册在 work-chat-copy.ts（父改）。
// 写法同 collab-visual-copy.ts：SOURCE 里「名字 → 简体中文原文」，各语种给同名条目；键就是简体中文原文（`tt("中文原文", { n })`）。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  viewerNote: "你现在是只读成员：可以平移、缩放、打开节点看参数，不能修改。",
  tooBigNote: "有 {n} 处内容太大，没能同步给同伴；你自己的画布不受影响。",
  notAppliedNote: "有同伴的改动没能应用到你的画布；重新打开这张图可以看到。",
} as const;

export const COLLAB_WORKFLOW_MESSAGES = assembleCopy(SOURCE, {
  de: {
    viewerNote: "Du bist nur Betrachter: Du kannst schwenken, zoomen und Knotenparameter ansehen, aber nichts ändern.",
    tooBigNote: "{n} Inhalte sind zu groß und wurden nicht mit den anderen synchronisiert; deine eigene Leinwand bleibt unverändert.",
    notAppliedNote: "Eine Änderung der anderen konnte nicht auf deine Leinwand übernommen werden; öffne dieses Diagramm erneut, um sie zu sehen.",
  },
  en: {
    viewerNote: "You are view-only: you can pan, zoom and open nodes to see their parameters, but you can't edit.",
    tooBigNote: "{n} items are too large and were not synced to your collaborators; your own canvas is unaffected.",
    notAppliedNote: "A change from a collaborator couldn't be applied to your canvas; reopen this chart to see it.",
  },
  es: {
    viewerNote: "Solo tienes acceso de lectura: puedes desplazarte, hacer zoom y abrir nodos para ver sus parámetros, pero no editar.",
    tooBigNote: "{n} elementos son demasiado grandes y no se sincronizaron con tus compañeros; tu propio lienzo no se ve afectado.",
    notAppliedNote: "No se pudo aplicar a tu lienzo un cambio de un compañero; vuelve a abrir este diagrama para verlo.",
  },
  "es-419": {
    viewerNote: "Solo tienes acceso de lectura: puedes desplazarte, hacer zoom y abrir nodos para ver sus parámetros, pero no editar.",
    tooBigNote: "{n} elementos son demasiado grandes y no se sincronizaron con tus compañeros; tu propio lienzo no se ve afectado.",
    notAppliedNote: "No se pudo aplicar a tu lienzo un cambio de un compañero; vuelve a abrir este diagrama para verlo.",
  },
  fr: {
    viewerNote: "Vous êtes en lecture seule : vous pouvez vous déplacer, zoomer et ouvrir les nœuds pour voir leurs paramètres, mais pas modifier.",
    tooBigNote: "{n} éléments sont trop volumineux et n'ont pas été synchronisés avec vos collaborateurs ; votre propre canevas n'est pas affecté.",
    notAppliedNote: "Une modification d'un collaborateur n'a pas pu être appliquée à votre canevas ; rouvrez ce diagramme pour la voir.",
  },
  it: {
    viewerNote: "Sei in sola lettura: puoi spostarti, ingrandire e aprire i nodi per vederne i parametri, ma non puoi modificare.",
    tooBigNote: "{n} elementi sono troppo grandi e non sono stati sincronizzati con i collaboratori; la tua tela non è interessata.",
    notAppliedNote: "Una modifica di un collaboratore non è stata applicata alla tua tela; riapri questo diagramma per vederla.",
  },
  "pt-BR": {
    viewerNote: "Você está somente em modo de leitura: pode arrastar, dar zoom e abrir nós para ver os parâmetros, mas não pode editar.",
    tooBigNote: "{n} itens são grandes demais e não foram sincronizados com os colegas; seu próprio canvas não é afetado.",
    notAppliedNote: "Uma alteração de um colega não pôde ser aplicada ao seu canvas; reabra este fluxograma para vê-la.",
  },
  "pt-PT": {
    viewerNote: "Está apenas em modo de leitura: pode deslocar, ampliar e abrir nós para ver os parâmetros, mas não pode editar.",
    tooBigNote: "{n} itens são demasiado grandes e não foram sincronizados com os colegas; a sua própria tela não é afetada.",
    notAppliedNote: "Uma alteração de um colega não pôde ser aplicada à sua tela; volte a abrir este fluxograma para a ver.",
  },
  vi: {
    viewerNote: "Bạn chỉ có quyền xem: có thể kéo, phóng to và mở nút để xem tham số, nhưng không thể chỉnh sửa.",
    tooBigNote: "{n} mục quá lớn nên chưa được đồng bộ cho đồng đội; bản vẽ của bạn không bị ảnh hưởng.",
    notAppliedNote: "Một thay đổi của đồng đội chưa áp dụng được vào bản vẽ của bạn; hãy mở lại sơ đồ này để xem.",
  },
  tr: {
    viewerNote: "Yalnızca görüntüleme yetkiniz var: kaydırabilir, yakınlaştırabilir ve düğümleri açıp parametrelerine bakabilirsiniz, ancak düzenleyemezsiniz.",
    tooBigNote: "{n} öğe çok büyük olduğu için ekip arkadaşlarınızla eşitlenmedi; kendi tuvaliniz etkilenmez.",
    notAppliedNote: "Bir ekip arkadaşınızın değişikliği tuvalinize uygulanamadı; görmek için bu diyagramı yeniden açın.",
  },
  "zh-TW": {
    viewerNote: "你目前是唯讀成員：可以平移、縮放、開啟節點查看參數，但不能修改。",
    tooBigNote: "有 {n} 處內容太大，未能同步給夥伴；你自己的畫布不受影響。",
    notAppliedNote: "有夥伴的改動未能套用到你的畫布；重新開啟這張圖即可看到。",
  },
  ja: {
    viewerNote: "閲覧のみのメンバーです。パン・ズーム・ノードを開いてパラメーターを見ることはできますが、編集はできません。",
    tooBigNote: "{n} 件の内容が大きすぎて共同編集者に同期できませんでした。あなたのキャンバスには影響ありません。",
    notAppliedNote: "共同編集者の変更をあなたのキャンバスに反映できませんでした。この図を開き直すと確認できます。",
  },
  ko: {
    viewerNote: "읽기 전용 멤버입니다. 이동, 확대/축소, 노드를 열어 매개변수를 볼 수 있지만 수정할 수는 없습니다.",
    tooBigNote: "{n}개 항목이 너무 커서 동료에게 동기화되지 않았습니다. 내 캔버스에는 영향이 없습니다.",
    notAppliedNote: "동료의 변경 사항을 내 캔버스에 적용하지 못했습니다. 이 차트를 다시 열면 볼 수 있습니다.",
  },
  ar: {
    viewerNote: "أنت في وضع العرض فقط: يمكنك التحريك والتكبير وفتح العُقد لرؤية معاملاتها، لكن لا يمكنك التعديل.",
    tooBigNote: "{n} من العناصر كبيرة جدًا ولم تتم مزامنتها مع زملائك؛ لوحتك الخاصة لم تتأثر.",
    notAppliedNote: "تعذّر تطبيق تغيير من أحد زملائك على لوحتك؛ أعد فتح هذا المخطط لرؤيته.",
  },
  th: {
    viewerNote: "คุณเป็นสมาชิกแบบดูอย่างเดียว: เลื่อน ซูม และเปิดโหนดดูพารามิเตอร์ได้ แต่แก้ไขไม่ได้",
    tooBigNote: "มี {n} รายการที่ใหญ่เกินไปจึงไม่ได้ซิงก์ให้เพื่อนร่วมงาน แคนวาสของคุณไม่ได้รับผลกระทบ",
    notAppliedNote: "การเปลี่ยนแปลงของเพื่อนร่วมงานยังใช้กับแคนวาสของคุณไม่ได้ เปิดแผนภาพนี้ใหม่เพื่อดู",
  },
  hi: {
    viewerNote: "आप केवल-देखने वाले सदस्य हैं: आप पैन, ज़ूम और नोड खोलकर पैरामीटर देख सकते हैं, लेकिन संपादित नहीं कर सकते।",
    tooBigNote: "{n} आइटम बहुत बड़े हैं और साथियों के साथ सिंक नहीं हुए; आपका अपना कैनवास प्रभावित नहीं है।",
    notAppliedNote: "किसी साथी का बदलाव आपके कैनवास पर लागू नहीं हो सका; देखने के लिए इस चार्ट को फिर से खोलें।",
  },
});
