// 2026-10-05 work-chat 波 W14 的分表（游戏、3D、音频、PDF、视频、流程图的多人同改与回放画法）。只由 W14 改；注册在 work-chat-copy.ts（父改）。
// 写法：SOURCE 里「名字 → 简体中文原文」，TRANSLATIONS 里每个名字给 16 个语种（顺序见 ORDER），
// 再交给 assembleCopy 拼成 17 语种；键就是简体中文原文（`tt("中文原文")`）。
import { assembleCopy } from "./shell-overhaul-copy-shared";
import type { Locale } from "../../config";

const SOURCE = {
  noCode: "还没有代码",
  sceneEmpty: "场景里还没有改动",
  sceneNodes: "场景节点",
  transform: "变换",
  material: "材质",
  texture: "贴图",
  camera: "相机",
  light: "灯光",
  presence: "增删节点",
  visibility: "显示/隐藏",
  added: "新增",
  annotationCount: "{n} 条批注",
  crop: "裁剪",
  fade: "淡入淡出",
  effects: "效果",
  noEdits: "还没有剪辑操作",
  noAnnotations: "还没有批注",
  timelineEmpty: "时间线是空的",
  flowEmpty: "流程图是空的",
  peerAtLine: "{name} 在第 {n} 行",
  someoneEditing: "「{name}」正在编辑这个作品，你现在只能看；他保存后这里会自动更新。",
  // F07：只撤自己、只读但能播放、同步期间的提示。
  undoSkippedAll: "对方已经改过这一步涉及的内容，这一步没有撤销，你们两边的改动都还在。",
  redoSkippedAll: "对方已经改过这一步涉及的内容，这一步没有重做，你们两边的改动都还在。",
  undoSkippedSome: "有 {n} 处对方已经改过，这几处没有动，其余已撤销。",
  redoSkippedSome: "有 {n} 处对方已经改过，这几处没有动，其余已重做。",
  viewOnly: "只能查看，不能修改",
  timelineViewHint: "空格播放 · ←/→ 逐帧 · Ctrl+滚轮缩放",
  syncingPeerEdit: "正在同步对方的改动，本次操作未应用，请稍后重试",
} as const;

type Name = keyof typeof SOURCE;
const ORDER = [
  "en", "de", "es", "es-419", "fr", "it", "pt-BR", "pt-PT",
  "vi", "tr", "zh-TW", "ja", "ko", "ar", "th", "hi",
] as const satisfies readonly Exclude<Locale, "zh">[];

const TRANSLATIONS: Record<Name, readonly [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]> = {
  noCode: ["No code yet", "Noch kein Code", "Todavía no hay código", "Todavía no hay código", "Pas encore de code", "Ancora nessun codice", "Ainda não há código", "Ainda não há código", "Chưa có mã", "Henüz kod yok", "還沒有程式碼", "まだコードがありません", "아직 코드가 없습니다", "لا يوجد كود بعد", "ยังไม่มีโค้ด", "अभी कोई कोड नहीं है"],
  sceneEmpty: ["No changes in the scene yet", "Noch keine Änderungen an der Szene", "Aún no hay cambios en la escena", "Aún no hay cambios en la escena", "Aucune modification de la scène pour l'instant", "Nessuna modifica alla scena per ora", "Ainda não há alterações na cena", "Ainda não há alterações na cena", "Cảnh chưa có thay đổi nào", "Sahnede henüz değişiklik yok", "場景裡還沒有改動", "シーンにはまだ変更がありません", "장면에 아직 변경 사항이 없습니다", "لا توجد تغييرات في المشهد بعد", "ยังไม่มีการเปลี่ยนแปลงในฉาก", "दृश्य में अभी कोई बदलाव नहीं है"],
  sceneNodes: ["Scene nodes", "Szenenknoten", "Nodos de la escena", "Nodos de la escena", "Nœuds de la scène", "Nodi della scena", "Nós da cena", "Nós da cena", "Nút cảnh", "Sahne düğümleri", "場景節點", "シーンノード", "장면 노드", "عُقد المشهد", "โหนดของฉาก", "दृश्य नोड"],
  transform: ["Transform", "Transformieren", "Transformar", "Transformar", "Transformer", "Trasforma", "Transformar", "Transformar", "Biến đổi", "Dönüştür", "變換", "変形", "변형", "تحويل", "แปลง", "रूपांतरण"],
  material: ["Material", "Material", "Material", "Material", "Matériau", "Materiale", "Material", "Material", "Vật liệu", "Malzeme", "材質", "マテリアル", "재질", "الخامة", "วัสดุ", "सामग्री"],
  texture: ["Texture", "Textur", "Textura", "Textura", "Texture", "Texture", "Textura", "Textura", "Kết cấu", "Doku", "貼圖", "テクスチャ", "텍스처", "الملمس", "พื้นผิว", "टेक्सचर"],
  camera: ["Camera", "Kamera", "Cámara", "Cámara", "Caméra", "Fotocamera", "Câmera", "Câmara", "Máy ảnh", "Kamera", "相機", "カメラ", "카메라", "الكاميرا", "กล้อง", "कैमरा"],
  light: ["Light", "Licht", "Luz", "Luz", "Lumière", "Luce", "Luz", "Luz", "Ánh sáng", "Işık", "燈光", "ライト", "조명", "الإضاءة", "แสงไฟ", "प्रकाश"],
  presence: ["Add/remove node", "Knoten hinzufügen/entfernen", "Añadir/quitar nodo", "Añadir/quitar nodo", "Ajouter/supprimer un nœud", "Aggiungi/rimuovi nodo", "Adicionar/remover nó", "Adicionar/remover nó", "Thêm/xóa nút", "Düğüm ekle/kaldır", "增刪節點", "ノードの追加/削除", "노드 추가/삭제", "إضافة/إزالة عقدة", "เพิ่ม/ลบโหนด", "नोड जोड़ें/हटाएँ"],
  visibility: ["Show/hide", "Sichtbarkeit", "Mostrar/ocultar", "Mostrar/ocultar", "Afficher/masquer", "Mostra/nascondi", "Mostrar/ocultar", "Mostrar/ocultar", "Hiện/ẩn", "Göster/gizle", "顯示/隱藏", "表示/非表示", "표시/숨김", "إظهار/إخفاء", "แสดง/ซ่อน", "दिखाएँ/छिपाएँ"],
  added: ["New", "Neu", "Nuevo", "Nuevo", "Nouveau", "Nuovo", "Novo", "Novo", "Mới", "Yeni", "新增", "新規", "신규", "جديد", "ใหม่", "नया"],
  annotationCount: ["{n} annotations", "{n} Anmerkungen", "{n} anotaciones", "{n} anotaciones", "{n} annotations", "{n} annotazioni", "{n} anotações", "{n} anotações", "{n} chú thích", "{n} açıklama", "{n} 則批註", "注釈 {n} 件", "주석 {n}개", "{n} تعليقات توضيحية", "หมายเหตุ {n} รายการ", "{n} टिप्पणियाँ"],
  crop: ["Crop", "Zuschneiden", "Recortar", "Recortar", "Rogner", "Ritaglia", "Cortar", "Cortar", "Cắt", "Kırp", "裁剪", "トリミング", "자르기", "اقتصاص", "ครอบตัด", "क्रॉप"],
  fade: ["Fade", "Ein-/Ausblenden", "Fundido", "Fundido", "Fondu", "Dissolvenza", "Esmaecer", "Desvanecer", "Mờ dần", "Solma", "淡入淡出", "フェード", "페이드", "تلاشي", "เฟด", "फ़ेड"],
  effects: ["Effects", "Effekte", "Efectos", "Efectos", "Effets", "Effetti", "Efeitos", "Efeitos", "Hiệu ứng", "Efektler", "效果", "エフェクト", "효과", "التأثيرات", "เอฟเฟกต์", "प्रभाव"],
  noEdits: ["No edits yet", "Noch keine Bearbeitungen", "Aún no hay ediciones", "Aún no hay ediciones", "Aucune modification pour l'instant", "Nessuna modifica per ora", "Ainda não há edições", "Ainda não há edições", "Chưa có thao tác chỉnh sửa", "Henüz düzenleme yok", "還沒有剪輯操作", "まだ編集操作がありません", "아직 편집 작업이 없습니다", "لا توجد عمليات تحرير بعد", "ยังไม่มีการตัดต่อ", "अभी कोई संपादन नहीं है"],
  noAnnotations: ["No annotations yet", "Noch keine Anmerkungen", "Aún no hay anotaciones", "Aún no hay anotaciones", "Pas encore d'annotations", "Ancora nessuna annotazione", "Ainda não há anotações", "Ainda não há anotações", "Chưa có chú thích", "Henüz açıklama yok", "還沒有批註", "まだ注釈がありません", "아직 주석이 없습니다", "لا توجد تعليقات توضيحية بعد", "ยังไม่มีหมายเหตุ", "अभी कोई टिप्पणी नहीं है"],
  timelineEmpty: ["The timeline is empty", "Die Zeitleiste ist leer", "La línea de tiempo está vacía", "La línea de tiempo está vacía", "La timeline est vide", "La timeline è vuota", "A linha do tempo está vazia", "A linha do tempo está vazia", "Dòng thời gian trống", "Zaman çizelgesi boş", "時間軸是空的", "タイムラインは空です", "타임라인이 비어 있습니다", "الخط الزمني فارغ", "ไทม์ไลน์ว่างเปล่า", "टाइमलाइन खाली है"],
  flowEmpty: ["The flowchart is empty", "Das Flussdiagramm ist leer", "El diagrama de flujo está vacío", "El diagrama de flujo está vacío", "L'organigramme est vide", "Il diagramma di flusso è vuoto", "O fluxograma está vazio", "O fluxograma está vazio", "Sơ đồ quy trình trống", "Akış şeması boş", "流程圖是空的", "フローチャートは空です", "순서도가 비어 있습니다", "مخطط التدفق فارغ", "ผังงานว่างเปล่า", "फ़्लोचार्ट खाली है"],
  peerAtLine: ["{name} is on line {n}", "{name} ist in Zeile {n}", "{name} está en la línea {n}", "{name} está en la línea {n}", "{name} est à la ligne {n}", "{name} è alla riga {n}", "{name} está na linha {n}", "{name} está na linha {n}", "{name} đang ở dòng {n}", "{name} {n}. satırda", "{name} 在第 {n} 行", "{name} さんは {n} 行目", "{name}님이 {n}번째 줄에 있음", "{name} في السطر {n}", "{name} อยู่ที่บรรทัด {n}", "{name} पंक्ति {n} पर हैं"],
  undoSkippedAll: ["The other person has already changed what this step touched, so it was not undone. Both sides' changes are still there.", "Die andere Person hat bereits geändert, was dieser Schritt betrifft, daher wurde er nicht rückgängig gemacht. Die Änderungen beider Seiten sind weiterhin vorhanden.", "La otra persona ya modificó lo que afecta este paso, así que no se deshizo. Los cambios de ambos siguen ahí.", "La otra persona ya modificó lo que afecta este paso, así que no se deshizo. Los cambios de ambos siguen ahí.", "L'autre personne a déjà modifié ce que concerne cette étape ; elle n'a donc pas été annulée. Les modifications des deux côtés sont conservées.", "L'altra persona ha già modificato ciò che riguarda questo passaggio, quindi non è stato annullato. Le modifiche di entrambi sono ancora presenti.", "A outra pessoa já alterou o que esta etapa afeta, então ela não foi desfeita. As alterações de ambos continuam lá.", "A outra pessoa já alterou o que este passo afeta, por isso não foi anulado. As alterações de ambos continuam lá.", "Người kia đã sửa nội dung mà bước này liên quan nên bước này không được hoàn tác. Thay đổi của cả hai bên vẫn còn.", "Karşı taraf bu adımın etkilediği şeyi zaten değiştirmiş, bu yüzden adım geri alınmadı. İki tarafın değişiklikleri de duruyor.", "對方已經改過這一步涉及的內容，這一步沒有復原，你們兩邊的改動都還在。", "相手がこの操作の対象をすでに変更していたため、元に戻しませんでした。双方の変更はそのまま残っています。", "상대방이 이 단계가 다루는 내용을 이미 바꿔서 실행 취소하지 않았습니다. 양쪽의 변경 사항은 모두 그대로 있습니다.", "قام الطرف الآخر بتغيير ما تتناوله هذه الخطوة، لذا لم يتم التراجع عنها. تغييرات الطرفين ما زالت موجودة.", "อีกฝ่ายแก้สิ่งที่ขั้นตอนนี้เกี่ยวข้องไปแล้ว จึงไม่ได้ย้อนกลับ การเปลี่ยนแปลงของทั้งสองฝ่ายยังอยู่ครบ", "दूसरे व्यक्ति ने इस चरण से जुड़ी चीज़ पहले ही बदल दी है, इसलिए इसे पूर्ववत नहीं किया गया। दोनों पक्षों के बदलाव अभी भी मौजूद हैं।"],
  redoSkippedAll: ["The other person has already changed what this step touched, so it was not redone. Both sides' changes are still there.", "Die andere Person hat bereits geändert, was dieser Schritt betrifft, daher wurde er nicht wiederholt. Die Änderungen beider Seiten sind weiterhin vorhanden.", "La otra persona ya modificó lo que afecta este paso, así que no se rehizo. Los cambios de ambos siguen ahí.", "La otra persona ya modificó lo que afecta este paso, así que no se rehizo. Los cambios de ambos siguen ahí.", "L'autre personne a déjà modifié ce que concerne cette étape ; elle n'a donc pas été rétablie. Les modifications des deux côtés sont conservées.", "L'altra persona ha già modificato ciò che riguarda questo passaggio, quindi non è stato ripristinato. Le modifiche di entrambi sono ancora presenti.", "A outra pessoa já alterou o que esta etapa afeta, então ela não foi refeita. As alterações de ambos continuam lá.", "A outra pessoa já alterou o que este passo afeta, por isso não foi refeito. As alterações de ambos continuam lá.", "Người kia đã sửa nội dung mà bước này liên quan nên bước này không được làm lại. Thay đổi của cả hai bên vẫn còn.", "Karşı taraf bu adımın etkilediği şeyi zaten değiştirmiş, bu yüzden adım yinelenmedi. İki tarafın değişiklikleri de duruyor.", "對方已經改過這一步涉及的內容，這一步沒有重做，你們兩邊的改動都還在。", "相手がこの操作の対象をすでに変更していたため、やり直しませんでした。双方の変更はそのまま残っています。", "상대방이 이 단계가 다루는 내용을 이미 바꿔서 다시 실행하지 않았습니다. 양쪽의 변경 사항은 모두 그대로 있습니다.", "قام الطرف الآخر بتغيير ما تتناوله هذه الخطوة، لذا لم تتم إعادتها. تغييرات الطرفين ما زالت موجودة.", "อีกฝ่ายแก้สิ่งที่ขั้นตอนนี้เกี่ยวข้องไปแล้ว จึงไม่ได้ทำซ้ำ การเปลี่ยนแปลงของทั้งสองฝ่ายยังอยู่ครบ", "दूसरे व्यक्ति ने इस चरण से जुड़ी चीज़ पहले ही बदल दी है, इसलिए इसे फिर से नहीं किया गया। दोनों पक्षों के बदलाव अभी भी मौजूद हैं।"],
  undoSkippedSome: ["{n} item(s) were already changed by the other person and left alone; the rest was undone.", "{n} Element(e) hat/haben die andere Person bereits geändert und wurden nicht angetastet; der Rest wurde rückgängig gemacht.", "{n} elemento(s) ya los modificó la otra persona y no se tocaron; el resto se deshizo.", "{n} elemento(s) ya los modificó la otra persona y no se tocaron; el resto se deshizo.", "{n} élément(s) ont déjà été modifiés par l'autre personne et n'ont pas été touchés ; le reste a été annulé.", "{n} elemento/i erano già stati modificati dall'altra persona e non sono stati toccati; il resto è stato annullato.", "{n} item(ns) já foram alterados pela outra pessoa e não foram mexidos; o restante foi desfeito.", "{n} item(ns) já foram alterados pela outra pessoa e não foram mexidos; o resto foi anulado.", "{n} mục đã được người kia sửa nên không bị động đến; phần còn lại đã được hoàn tác.", "{n} öğe karşı taraf tarafından zaten değiştirilmişti ve dokunulmadı; geri kalanı geri alındı.", "有 {n} 處對方已經改過，這幾處沒有動，其餘已復原。", "{n} 件は相手がすでに変更していたためそのままにし、残りを元に戻しました。", "{n}개 항목은 상대방이 이미 바꿔서 그대로 두었고, 나머지는 실행 취소했습니다.", "{n} من العناصر غيّرها الطرف الآخر بالفعل فتُركت كما هي؛ وتم التراجع عن الباقي.", "มี {n} รายการที่อีกฝ่ายแก้ไปแล้ว จึงไม่แตะต้อง ส่วนที่เหลือย้อนกลับแล้ว", "{n} आइटम दूसरे व्यक्ति पहले ही बदल चुके हैं, इसलिए उन्हें छुआ नहीं गया; बाकी को पूर्ववत कर दिया गया।"],
  redoSkippedSome: ["{n} item(s) were already changed by the other person and left alone; the rest was redone.", "{n} Element(e) hat/haben die andere Person bereits geändert und wurden nicht angetastet; der Rest wurde wiederholt.", "{n} elemento(s) ya los modificó la otra persona y no se tocaron; el resto se rehízo.", "{n} elemento(s) ya los modificó la otra persona y no se tocaron; el resto se rehízo.", "{n} élément(s) ont déjà été modifiés par l'autre personne et n'ont pas été touchés ; le reste a été rétabli.", "{n} elemento/i erano già stati modificati dall'altra persona e non sono stati toccati; il resto è stato ripristinato.", "{n} item(ns) já foram alterados pela outra pessoa e não foram mexidos; o restante foi refeito.", "{n} item(ns) já foram alterados pela outra pessoa e não foram mexidos; o resto foi refeito.", "{n} mục đã được người kia sửa nên không bị động đến; phần còn lại đã được làm lại.", "{n} öğe karşı taraf tarafından zaten değiştirilmişti ve dokunulmadı; geri kalanı yinelendi.", "有 {n} 處對方已經改過，這幾處沒有動，其餘已重做。", "{n} 件は相手がすでに変更していたためそのままにし、残りをやり直しました。", "{n}개 항목은 상대방이 이미 바꿔서 그대로 두었고, 나머지는 다시 실행했습니다.", "{n} من العناصر غيّرها الطرف الآخر بالفعل فتُركت كما هي؛ وتمت إعادة الباقي.", "มี {n} รายการที่อีกฝ่ายแก้ไปแล้ว จึงไม่แตะต้อง ส่วนที่เหลือทำซ้ำแล้ว", "{n} आइटम दूसरे व्यक्ति पहले ही बदल चुके हैं, इसलिए उन्हें छुआ नहीं गया; बाकी को फिर से कर दिया गया।"],
  viewOnly: ["View only — editing is not allowed", "Nur ansehen – Bearbeiten ist nicht möglich", "Solo lectura: no se puede editar", "Solo lectura: no se puede editar", "Lecture seule : modification impossible", "Solo visualizzazione: modifica non consentita", "Somente visualização: não é possível editar", "Apenas visualização: não é possível editar", "Chỉ xem — không thể chỉnh sửa", "Yalnızca görüntüleme — düzenleme yapılamaz", "只能查看，不能修改", "閲覧のみ可能です。編集はできません", "보기 전용 — 수정할 수 없습니다", "للعرض فقط — لا يمكن التعديل", "ดูได้อย่างเดียว — แก้ไขไม่ได้", "केवल देखने के लिए — संपादन की अनुमति नहीं है"],
  timelineViewHint: ["Space to play · ←/→ step frame · Ctrl+scroll to zoom", "Leertaste: Wiedergabe · ←/→: Einzelbild · Strg+Scrollen: Zoom", "Espacio para reproducir · ←/→ fotograma · Ctrl+rueda para hacer zoom", "Espacio para reproducir · ←/→ fotograma · Ctrl+rueda para hacer zoom", "Espace : lecture · ←/→ : image par image · Ctrl+molette : zoom", "Spazio per riprodurre · ←/→ fotogramma · Ctrl+rotella per lo zoom", "Espaço para reproduzir · ←/→ quadro a quadro · Ctrl+rolagem para zoom", "Espaço para reproduzir · ←/→ fotograma · Ctrl+roda para zoom", "Phím cách để phát · ←/→ từng khung hình · Ctrl+cuộn để thu phóng", "Boşluk: oynat · ←/→: kare kare · Ctrl+tekerlek: yakınlaştır", "空白鍵播放 · ←/→ 逐格 · Ctrl+滾輪縮放", "スペースで再生 · ←/→ でコマ送り · Ctrl+ホイールでズーム", "스페이스바로 재생 · ←/→ 프레임 이동 · Ctrl+휠로 확대/축소", "المسافة للتشغيل · ←/→ إطار بإطار · Ctrl+التمرير للتكبير", "เว้นวรรคเพื่อเล่น · ←/→ ทีละเฟรม · Ctrl+เลื่อนเมาส์เพื่อซูม", "स्पेस से चलाएँ · ←/→ फ़्रेम-दर-फ़्रेम · Ctrl+स्क्रॉल से ज़ूम"],
  syncingPeerEdit: ["Syncing the other person's changes — this action was not applied, please try again shortly", "Änderungen der anderen Person werden synchronisiert – diese Aktion wurde nicht angewendet, bitte gleich erneut versuchen", "Sincronizando los cambios de la otra persona: esta acción no se aplicó, inténtalo de nuevo en unos instantes", "Sincronizando los cambios de la otra persona: esta acción no se aplicó, inténtalo de nuevo en unos instantes", "Synchronisation des modifications de l'autre personne : cette action n'a pas été appliquée, réessayez dans un instant", "Sincronizzazione delle modifiche dell'altra persona: questa azione non è stata applicata, riprova tra poco", "Sincronizando as alterações da outra pessoa: esta ação não foi aplicada, tente novamente em instantes", "A sincronizar as alterações da outra pessoa: esta ação não foi aplicada, tente novamente dentro de instantes", "Đang đồng bộ thay đổi của người kia — thao tác này chưa được áp dụng, vui lòng thử lại sau giây lát", "Karşı tarafın değişiklikleri senkronize ediliyor — bu işlem uygulanmadı, lütfen biraz sonra tekrar deneyin", "正在同步對方的改動，本次操作未套用，請稍後重試", "相手の変更を同期中のため、この操作は適用されませんでした。しばらくしてからもう一度お試しください", "상대방의 변경 사항을 동기화하는 중이라 이 작업은 적용되지 않았습니다. 잠시 후 다시 시도해 주세요", "تتم مزامنة تغييرات الطرف الآخر — لم يتم تطبيق هذا الإجراء، يرجى المحاولة بعد قليل", "กำลังซิงก์การเปลี่ยนแปลงของอีกฝ่าย — ยังไม่ได้ทำตามคำสั่งนี้ โปรดลองอีกครั้งในอีกสักครู่", "दूसरे व्यक्ति के बदलाव सिंक हो रहे हैं — यह क्रिया लागू नहीं हुई, कृपया थोड़ी देर बाद फिर कोशिश करें"],
  someoneEditing: [
    "{name} is editing this work. You can only view it for now; it updates here after they save.",
    "{name} bearbeitet dieses Werk. Du kannst es vorerst nur ansehen; nach dem Speichern wird es hier automatisch aktualisiert.",
    "{name} está editando esta obra. Por ahora solo puedes verla; se actualizará aquí cuando guarde.",
    "{name} está editando esta obra. Por ahora solo puedes verla; se actualizará aquí cuando guarde.",
    "{name} modifie cette œuvre. Vous ne pouvez que la consulter pour l'instant ; elle se mettra à jour ici après son enregistrement.",
    "{name} sta modificando questa opera. Per ora puoi solo visualizzarla; si aggiornerà qui dopo il salvataggio.",
    "{name} está editando esta obra. Por enquanto você só pode vê-la; ela será atualizada aqui depois que ele salvar.",
    "{name} está a editar esta obra. Por agora só a pode ver; será atualizada aqui depois de ele guardar.",
    "{name} đang chỉnh sửa tác phẩm này. Hiện bạn chỉ có thể xem; nội dung sẽ tự cập nhật sau khi họ lưu.",
    "{name} bu çalışmayı düzenliyor. Şimdilik yalnızca görüntüleyebilirsiniz; kaydettiğinde burası otomatik güncellenir.",
    "「{name}」正在編輯這個作品，你現在只能看；他儲存後這裡會自動更新。",
    "{name} さんがこの作品を編集中です。今は閲覧のみ可能で、保存されるとここに自動で反映されます。",
    "{name}님이 이 작품을 편집 중입니다. 지금은 보기만 가능하며, 저장하면 여기에 자동으로 반영됩니다.",
    "{name} يحرّر هذا العمل الآن. يمكنك العرض فقط حاليًا، وسيتحدّث هنا تلقائيًا بعد أن يحفظ.",
    "{name} กำลังแก้ไขงานนี้ ตอนนี้คุณดูได้อย่างเดียว และจะอัปเดตที่นี่อัตโนมัติหลังเขาบันทึก",
    "{name} इस कार्य को संपादित कर रहे हैं। अभी आप केवल देख सकते हैं; उनके सहेजने के बाद यह यहाँ अपने आप अपडेट हो जाएगा।",
  ],
};

function forLocale(index: number): Record<Name, string> {
  return Object.fromEntries(
    (Object.keys(SOURCE) as Name[]).map((name) => [name, TRANSLATIONS[name][index]]),
  ) as Record<Name, string>;
}

export const COLLAB_MEDIA_MESSAGES = assembleCopy(
  SOURCE,
  Object.fromEntries(ORDER.map((locale, index) => [locale, forLocale(index)])) as Record<
    Exclude<Locale, "zh">,
    Record<Name, string>
  >,
);
