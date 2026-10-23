// 2026-10-23 leobay-projects 波 W02 的分表。只由 W02 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const LBP_W02_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 只放新的中文原文；已有词条不要在这里重定义（合并次序会让它覆盖别处的译文）。
//
// 这一张表是 LeoBay「逛」的新词：筛选下拉里「全部」自带名词（全部站点 / 全部目录）、现成文件的新来源
// （卖家在售）、来源「我的」改名「我上传的」，以及第四个种类名「网站与软件服务」的 15 语译文
// （基础词典只有英文；英文必须与 en.ts 的 Website & software service 一致）。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  // 站点下拉的「全部」：按键上不能只剩一个光秃秃的「全部」。
  allSites: "全部站点",
  // 素材库「目录」下拉的「全部」。
  allCategories: "全部目录",
  // 素材库来源之一：用户自己上传 / 做出来的（原来叫「我的」）。
  myUploads: "我上传的",
  // 现成文件的第一个来源：卖家按「现成文件」发布的条目。
  fromSellers: "卖家在售",
  // 种类名（操作员 2026-10-23 拍板）；与基础词典的英文一致。
  websiteSoftwareService: "网站与软件服务",
} as const;

export const LBP_W02_MESSAGES = assembleCopy(SOURCE, {
  en: {
    allSites: "All sites",
    allCategories: "All categories",
    myUploads: "My uploads",
    fromSellers: "From sellers",
    websiteSoftwareService: "Website & software service",
  },
  de: {
    allSites: "Alle Sites",
    allCategories: "Alle Kategorien",
    myUploads: "Meine Uploads",
    fromSellers: "Von Verkäufern",
    websiteSoftwareService: "Website- und Softwareservice",
  },
  es: {
    allSites: "Todos los sitios",
    allCategories: "Todas las categorías",
    myUploads: "Mis subidas",
    fromSellers: "De vendedores",
    websiteSoftwareService: "Servicio de sitios web y software",
  },
  "es-419": {
    allSites: "Todos los sitios",
    allCategories: "Todas las categorías",
    myUploads: "Mis cargas",
    fromSellers: "De vendedores",
    websiteSoftwareService: "Servicio de sitios web y software",
  },
  fr: {
    allSites: "Tous les sites",
    allCategories: "Toutes les catégories",
    myUploads: "Mes imports",
    fromSellers: "Des vendeurs",
    websiteSoftwareService: "Service de sites web et de logiciels",
  },
  it: {
    allSites: "Tutti i siti",
    allCategories: "Tutte le categorie",
    myUploads: "I miei caricamenti",
    fromSellers: "Dai venditori",
    websiteSoftwareService: "Servizio di siti web e software",
  },
  "pt-BR": {
    allSites: "Todos os sites",
    allCategories: "Todas as categorias",
    myUploads: "Meus uploads",
    fromSellers: "De vendedores",
    websiteSoftwareService: "Serviço de sites e software",
  },
  "pt-PT": {
    allSites: "Todos os sites",
    allCategories: "Todas as categorias",
    myUploads: "Os meus carregamentos",
    fromSellers: "De vendedores",
    websiteSoftwareService: "Serviço de sites e software",
  },
  vi: {
    allSites: "Tất cả trang",
    allCategories: "Tất cả danh mục",
    myUploads: "Tệp tôi tải lên",
    fromSellers: "Từ người bán",
    websiteSoftwareService: "Dịch vụ website và phần mềm",
  },
  tr: {
    allSites: "Tüm siteler",
    allCategories: "Tüm kategoriler",
    myUploads: "Yüklediklerim",
    fromSellers: "Satıcılardan",
    websiteSoftwareService: "Web sitesi ve yazılım hizmeti",
  },
  "zh-TW": {
    allSites: "全部站點",
    allCategories: "全部目錄",
    myUploads: "我上傳的",
    fromSellers: "賣家在售",
    websiteSoftwareService: "網站與軟體服務",
  },
  ja: {
    allSites: "すべてのサイト",
    allCategories: "すべてのカテゴリ",
    myUploads: "自分のアップロード",
    fromSellers: "出品者から",
    websiteSoftwareService: "ウェブサイト・ソフトウェアサービス",
  },
  ko: {
    allSites: "모든 사이트",
    allCategories: "모든 카테고리",
    myUploads: "내가 업로드한 파일",
    fromSellers: "판매자 제공",
    websiteSoftwareService: "웹사이트 및 소프트웨어 서비스",
  },
  ar: {
    allSites: "جميع المواقع",
    allCategories: "كل الفئات",
    myUploads: "ما رفعته",
    fromSellers: "من البائعين",
    websiteSoftwareService: "خدمة المواقع والبرمجيات",
  },
  th: {
    allSites: "ทุกไซต์",
    allCategories: "ทุกหมวดหมู่",
    myUploads: "ที่ฉันอัปโหลด",
    fromSellers: "จากผู้ขาย",
    websiteSoftwareService: "บริการเว็บไซต์และซอฟต์แวร์",
  },
  hi: {
    allSites: "सभी साइट",
    allCategories: "सभी श्रेणियाँ",
    myUploads: "मेरे अपलोड",
    fromSellers: "विक्रेताओं से",
    websiteSoftwareService: "वेबसाइट और सॉफ़्टवेयर सेवा",
  },
});
