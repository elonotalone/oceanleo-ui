// 2026-10-23 leobay-projects 波 W04 的分表。只由 W04 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const LBP_W04_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 只放新的中文原文；已有词条不要在这里重定义（合并次序会让它覆盖别处的译文）。
// 「网站与软件服务」（类别下拉与每行类别标签要用）的 15 语译文由 lbp-w02-copy.ts 定义，这里不重复；
// 「现成文件」「人工服务」「课程」「其他」「列表」「类别」在基础词典与 bay-posting-copy / bay-mine-copy 里已有。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  // 「我的」页第一块页签。注意：键是「交易」+ 一个半角空格。裸「交易」已被 LeoChat 的筛选占用
  // （im-shell-copy 的 filterTalent，英文 Deals、德文 Aufträge…，意思是「谈成的单」），而这一块里
  // 有「我发布的 / 我卖出的 / 我买到的 / 我的收藏」，英文要写 Listings & orders；两处中文字面相同、
  // 含义不同，只能拆成两个键。末尾空格在按钮里不占位，中文界面上看到的仍是「交易」。
  // 别把这个键「修」成裸「交易」：那会把页签的英文及另 15 语全部退回 LeoChat 筛选的译法。
  mineTradeTab: "交易 ",
  // 「我的」页类别下拉的「全部」项：按 §5.2 自带名词。
  allCategories: "全部类别",
} as const;

export const LBP_W04_MESSAGES = assembleCopy(SOURCE, {
  en: {
    mineTradeTab: "Listings & orders",
    allCategories: "All categories",
  },
  "zh-TW": {
    mineTradeTab: "交易",
    allCategories: "全部類別",
  },
  ja: {
    mineTradeTab: "出品と注文",
    allCategories: "すべてのカテゴリ",
  },
  ko: {
    mineTradeTab: "게시물 및 주문",
    allCategories: "모든 카테고리",
  },
  de: {
    mineTradeTab: "Angebote & Bestellungen",
    allCategories: "Alle Kategorien",
  },
  es: {
    mineTradeTab: "Publicaciones y pedidos",
    allCategories: "Todas las categorías",
  },
  "es-419": {
    mineTradeTab: "Publicaciones y pedidos",
    allCategories: "Todas las categorías",
  },
  fr: {
    mineTradeTab: "Annonces et commandes",
    allCategories: "Toutes les catégories",
  },
  it: {
    mineTradeTab: "Inserzioni e ordini",
    allCategories: "Tutte le categorie",
  },
  "pt-BR": {
    mineTradeTab: "Anúncios e pedidos",
    allCategories: "Todas as categorias",
  },
  "pt-PT": {
    mineTradeTab: "Anúncios e encomendas",
    allCategories: "Todas as categorias",
  },
  vi: {
    mineTradeTab: "Tin đăng & đơn hàng",
    allCategories: "Tất cả danh mục",
  },
  tr: {
    mineTradeTab: "İlanlar ve siparişler",
    allCategories: "Tüm kategoriler",
  },
  ar: {
    mineTradeTab: "المنشورات والطلبات",
    allCategories: "جميع الفئات",
  },
  th: {
    mineTradeTab: "รายการและคำสั่งซื้อ",
    allCategories: "ทุกหมวดหมู่",
  },
  hi: {
    mineTradeTab: "लिस्टिंग और ऑर्डर",
    allCategories: "सभी श्रेणियाँ",
  },
});
