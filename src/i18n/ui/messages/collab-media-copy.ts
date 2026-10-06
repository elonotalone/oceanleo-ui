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
  someoneEditing: "「{name}」正在编辑这个作品，你现在只能看；他保存后这里会自动更新。",
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
