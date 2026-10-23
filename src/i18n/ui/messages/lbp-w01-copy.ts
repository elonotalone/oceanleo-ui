// 2026-10-23 leobay-projects 波 W01 的分表。只由 W01 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const LBP_W01_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 只放新的中文原文；已有词条不要在这里重定义（合并次序会让它覆盖别处的译文）。
//
// 这一张表是「下拉只写当前值」之后库 / 工作台 / 应用目录筛选里新增的词：
//   · 「全部」必须自带名词：全部场景、全部板块（全部类型 / 全部分类 已有；全部站点 在 W02 的分表里）；
//   · 工作台分区的值：agent（复数写法，别的分区名「网站」「应用」「提示词」沿用已有词条）；
//   · 目录里「板块」这一级筛选的名字（原来 tt("板块") 一直没有译文，顺手补上）；
//   · 查看选项里排序那一块（排序方式 / 切换排序方向 / 默认顺序 / 正在加载完整列表以排序…）原来缺 16 语译文，同一个文件里顺手补上。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  // 应用市场 / 站点应用目录的场景下拉，选了「全部」时按键上写的字。
  allScenes: "全部场景",
  // 应用目录第一层「能力大板块」下拉的名字，以及它的「全部」。
  area: "板块",
  allAreas: "全部板块",
  // 工作台分区之一（与工作台别处「创建 agent」「新建 agent」同一个写法）。
  agentSection: "agent",
  // 「查看选项」里的排序块。
  sortBy: "排序方式",
  toggleSortDirection: "切换排序方向",
  defaultOrder: "默认顺序",
  loadingFullListToSort: "正在加载完整列表以排序…",
} as const;

export const LBP_W01_MESSAGES = assembleCopy(SOURCE, {
  en: {
    allScenes: "All scenes",
    area: "Area",
    allAreas: "All areas",
    agentSection: "Agents",
    sortBy: "Sort by",
    toggleSortDirection: "Toggle sort direction",
    defaultOrder: "Default order",
    loadingFullListToSort: "Loading the full list to sort…",
  },
  de: {
    allScenes: "Alle Szenen",
    area: "Bereich",
    allAreas: "Alle Bereiche",
    agentSection: "Agenten",
    sortBy: "Sortieren nach",
    toggleSortDirection: "Sortierrichtung umschalten",
    defaultOrder: "Standardreihenfolge",
    loadingFullListToSort: "Die vollständige Liste wird zum Sortieren geladen…",
  },
  es: {
    allScenes: "Todas las escenas",
    area: "Área",
    allAreas: "Todas las áreas",
    agentSection: "Agentes",
    sortBy: "Ordenar por",
    toggleSortDirection: "Cambiar el sentido del orden",
    defaultOrder: "Orden predeterminado",
    loadingFullListToSort: "Cargando la lista completa para ordenar…",
  },
  "es-419": {
    allScenes: "Todas las escenas",
    area: "Área",
    allAreas: "Todas las áreas",
    agentSection: "Agentes",
    sortBy: "Ordenar por",
    toggleSortDirection: "Cambiar la dirección del orden",
    defaultOrder: "Orden predeterminado",
    loadingFullListToSort: "Cargando la lista completa para ordenar…",
  },
  fr: {
    allScenes: "Toutes les scènes",
    area: "Domaine",
    allAreas: "Tous les domaines",
    agentSection: "Agents",
    sortBy: "Trier par",
    toggleSortDirection: "Inverser le sens du tri",
    defaultOrder: "Ordre par défaut",
    loadingFullListToSort: "Chargement de la liste complète pour le tri…",
  },
  it: {
    allScenes: "Tutte le scene",
    area: "Area",
    allAreas: "Tutte le aree",
    agentSection: "Agenti",
    sortBy: "Ordina per",
    toggleSortDirection: "Cambia la direzione dell'ordinamento",
    defaultOrder: "Ordine predefinito",
    loadingFullListToSort: "Caricamento dell'elenco completo per l'ordinamento…",
  },
  "pt-BR": {
    allScenes: "Todas as cenas",
    area: "Área",
    allAreas: "Todas as áreas",
    agentSection: "Agentes",
    sortBy: "Ordenar por",
    toggleSortDirection: "Alternar a direção da ordenação",
    defaultOrder: "Ordem padrão",
    loadingFullListToSort: "Carregando a lista completa para ordenar…",
  },
  "pt-PT": {
    allScenes: "Todas as cenas",
    area: "Área",
    allAreas: "Todas as áreas",
    agentSection: "Agentes",
    sortBy: "Ordenar por",
    toggleSortDirection: "Alternar o sentido da ordenação",
    defaultOrder: "Ordem predefinida",
    loadingFullListToSort: "A carregar a lista completa para ordenar…",
  },
  vi: {
    allScenes: "Tất cả bối cảnh",
    area: "Lĩnh vực",
    allAreas: "Tất cả lĩnh vực",
    agentSection: "Tác nhân",
    sortBy: "Sắp xếp theo",
    toggleSortDirection: "Đổi chiều sắp xếp",
    defaultOrder: "Thứ tự mặc định",
    loadingFullListToSort: "Đang tải toàn bộ danh sách để sắp xếp…",
  },
  tr: {
    allScenes: "Tüm sahneler",
    area: "Alan",
    allAreas: "Tüm alanlar",
    agentSection: "Ajanlar",
    sortBy: "Sıralama ölçütü",
    toggleSortDirection: "Sıralama yönünü değiştir",
    defaultOrder: "Varsayılan sıra",
    loadingFullListToSort: "Sıralamak için tam liste yükleniyor…",
  },
  "zh-TW": {
    allScenes: "全部場景",
    area: "板塊",
    allAreas: "全部板塊",
    agentSection: "agent",
    sortBy: "排序方式",
    toggleSortDirection: "切換排序方向",
    defaultOrder: "預設順序",
    loadingFullListToSort: "正在載入完整清單以排序…",
  },
  ja: {
    allScenes: "すべてのシーン",
    area: "分野",
    allAreas: "すべての分野",
    agentSection: "エージェント",
    sortBy: "並び替えの基準",
    toggleSortDirection: "並び順の向きを切り替え",
    defaultOrder: "既定の順序",
    loadingFullListToSort: "並び替えのため全件を読み込み中…",
  },
  ko: {
    allScenes: "모든 장면",
    area: "영역",
    allAreas: "모든 영역",
    agentSection: "에이전트",
    sortBy: "정렬 기준",
    toggleSortDirection: "정렬 방향 전환",
    defaultOrder: "기본 순서",
    loadingFullListToSort: "정렬을 위해 전체 목록을 불러오는 중…",
  },
  ar: {
    allScenes: "جميع المشاهد",
    area: "المجال",
    allAreas: "جميع المجالات",
    agentSection: "الوكلاء الأذكياء",
    sortBy: "الترتيب حسب",
    toggleSortDirection: "تبديل اتجاه الترتيب",
    defaultOrder: "الترتيب الافتراضي",
    loadingFullListToSort: "جارٍ تحميل القائمة الكاملة للترتيب…",
  },
  th: {
    allScenes: "ทุกฉาก",
    area: "ด้าน",
    allAreas: "ทุกด้าน",
    agentSection: "เอเจนต์",
    sortBy: "เรียงตาม",
    toggleSortDirection: "สลับทิศทางการเรียงลำดับ",
    defaultOrder: "ลำดับเริ่มต้น",
    loadingFullListToSort: "กำลังโหลดรายการทั้งหมดเพื่อเรียงลำดับ…",
  },
  hi: {
    allScenes: "सभी दृश्य",
    area: "क्षेत्र",
    allAreas: "सभी क्षेत्र",
    agentSection: "एजेंट",
    sortBy: "इसके अनुसार क्रमबद्ध करें",
    toggleSortDirection: "क्रमबद्ध करने की दिशा बदलें",
    defaultOrder: "डिफ़ॉल्ट क्रम",
    loadingFullListToSort: "क्रमबद्ध करने के लिए पूरी सूची लोड हो रही है…",
  },
});
