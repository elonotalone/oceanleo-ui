// 2026-10-06 oceanleo-bay 波 W10 的分表（门户 Bay 页、公开页、帮助中心规则页、各站 /bay）。只由 W10 改；登记在 bay-copy.ts。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  pageTitle: "OceanLeo Bay：找真人做事的市场",
  pageIntro: "发需求找人做，或者直接买现成的服务；会做设计、视频、文档、网站和代码的人，也能在这里接单。",
  browseByCategory: "按类目逛",
} as const;

export const BAY_PORTAL_MESSAGES = assembleCopy(SOURCE, {
  "zh-TW": {
    pageTitle: "OceanLeo Bay：找真人做事的市場",
    pageIntro: "發需求找人做，或直接買現成的服務；會做設計、影片、文件、網站和程式的人，也能在這裡接案。",
    browseByCategory: "依類別瀏覽",
  },
  en: {
    pageTitle: "OceanLeo Bay: the marketplace for hiring real people",
    pageIntro:
      "Post a request and find someone to do it, or buy a ready-made service. People who do design, video, documents, websites and code can take on work here too.",
    browseByCategory: "Browse by category",
  },
  ja: {
    pageTitle: "OceanLeo Bay：人に仕事を頼めるマーケット",
    pageIntro:
      "依頼を出して引き受けてくれる人を探すことも、出来合いのサービスをそのまま購入することもできます。デザイン、動画、文書、Web サイト、コードが得意な人は、ここで仕事を受けられます。",
    browseByCategory: "カテゴリから探す",
  },
  ko: {
    pageTitle: "OceanLeo Bay: 사람에게 일을 맡기는 마켓",
    pageIntro:
      "요청을 올려 맡아 줄 사람을 찾거나, 이미 준비된 서비스를 바로 구매하세요. 디자인, 영상, 문서, 웹사이트, 코드를 다루는 분은 여기서 일을 받을 수도 있습니다.",
    browseByCategory: "카테고리별로 둘러보기",
  },
  fr: {
    pageTitle: "OceanLeo Bay : la place de marché pour confier un travail à de vraies personnes",
    pageIntro:
      "Publiez une demande pour trouver quelqu'un, ou achetez directement un service prêt à l'emploi. Celles et ceux qui font du design, de la vidéo, des documents, des sites web ou du code peuvent aussi trouver des missions ici.",
    browseByCategory: "Parcourir par catégorie",
  },
  de: {
    pageTitle: "OceanLeo Bay: der Marktplatz, um echte Menschen zu beauftragen",
    pageIntro:
      "Stellen Sie eine Anfrage und finden Sie jemanden dafür, oder kaufen Sie direkt einen fertigen Service. Wer Design, Video, Dokumente, Websites oder Code macht, findet hier auch Aufträge.",
    browseByCategory: "Nach Kategorie stöbern",
  },
  it: {
    pageTitle: "OceanLeo Bay: il marketplace per affidare lavori a persone reali",
    pageIntro:
      "Pubblica una richiesta e trova chi la realizza, oppure acquista direttamente un servizio già pronto. Chi si occupa di design, video, documenti, siti web e codice può anche trovare lavoro qui.",
    browseByCategory: "Sfoglia per categoria",
  },
  es: {
    pageTitle: "OceanLeo Bay: el mercado para contratar a personas reales",
    pageIntro:
      "Publica una solicitud y encuentra a alguien que la haga, o compra directamente un servicio ya listo. Quienes hacen diseño, vídeo, documentos, webs y código también pueden conseguir encargos aquí.",
    browseByCategory: "Explorar por categoría",
  },
  "es-419": {
    pageTitle: "OceanLeo Bay: el mercado para contratar a personas reales",
    pageIntro:
      "Publica una solicitud y encuentra a alguien que la haga, o compra directamente un servicio listo. Quienes hacen diseño, video, documentos, sitios web y código también pueden conseguir trabajos aquí.",
    browseByCategory: "Explorar por categoría",
  },
  "pt-BR": {
    pageTitle: "OceanLeo Bay: o marketplace para contratar pessoas de verdade",
    pageIntro:
      "Publique um pedido e encontre alguém para fazer, ou compre direto um serviço pronto. Quem faz design, vídeo, documentos, sites e código também pode pegar trabalhos aqui.",
    browseByCategory: "Navegar por categoria",
  },
  "pt-PT": {
    pageTitle: "OceanLeo Bay: o mercado para contratar pessoas reais",
    pageIntro:
      "Publique um pedido e encontre alguém para o fazer, ou compre diretamente um serviço já pronto. Quem faz design, vídeo, documentos, sites e código também pode aceitar trabalhos aqui.",
    browseByCategory: "Explorar por categoria",
  },
  ar: {
    pageTitle: "OceanLeo Bay: سوق لتكليف أشخاص حقيقيين بالعمل",
    pageIntro:
      "انشر طلبًا وابحث عمّن ينفّذه، أو اشترِ خدمة جاهزة مباشرة. ويمكن لمن يعمل في التصميم والفيديو والمستندات والمواقع والبرمجة أن يجد عملًا هنا أيضًا.",
    browseByCategory: "تصفّح حسب الفئة",
  },
  hi: {
    pageTitle: "OceanLeo Bay: असली लोगों से काम करवाने का बाज़ार",
    pageIntro:
      "अनुरोध डालें और उसे करने वाला ढूँढें, या सीधे कोई तैयार सेवा खरीदें। डिज़ाइन, वीडियो, दस्तावेज़, वेबसाइट और कोड का काम करने वाले लोग भी यहाँ काम ले सकते हैं।",
    browseByCategory: "श्रेणी के अनुसार देखें",
  },
  th: {
    pageTitle: "OceanLeo Bay: ตลาดสำหรับจ้างคนจริงทำงาน",
    pageIntro:
      "โพสต์คำขอเพื่อหาคนมาทำ หรือซื้อบริการสำเร็จรูปได้ทันที ผู้ที่ทำงานออกแบบ วิดีโอ เอกสาร เว็บไซต์ และโค้ด ก็รับงานได้ที่นี่เช่นกัน",
    browseByCategory: "เลือกดูตามหมวดหมู่",
  },
  tr: {
    pageTitle: "OceanLeo Bay: gerçek insanlara iş yaptırma pazarı",
    pageIntro:
      "Bir talep yayınlayıp işi yapacak birini bulun ya da hazır bir hizmeti doğrudan satın alın. Tasarım, video, belge, web sitesi ve kod işi yapanlar da burada iş alabilir.",
    browseByCategory: "Kategoriye göre göz at",
  },
  vi: {
    pageTitle: "OceanLeo Bay: chợ thuê người thật làm việc",
    pageIntro:
      "Đăng yêu cầu để tìm người làm, hoặc mua ngay một dịch vụ có sẵn. Ai làm thiết kế, video, tài liệu, website và lập trình cũng có thể nhận việc ở đây.",
    browseByCategory: "Xem theo danh mục",
  },
});
