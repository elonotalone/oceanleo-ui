// 「我的」改版的分表（我发布的类别标签、买到的东西的交易操作）。只由「我的」改版改；登记在 bay-copy.ts。
// key = 简体中文原文（与 tt() 字面量相同）。

import type { Locale } from "../../config";

type Row = Record<Locale, string>;

const ROWS: Record<string, Row> = {
  "成品文件": {
    zh: "成品文件", en: "Ready-made files", "zh-TW": "成品檔案", ja: "完成品ファイル", ko: "완성된 파일", de: "Fertige Dateien",
    es: "Archivos listos", "es-419": "Archivos listos", fr: "Fichiers prêts à l’emploi", it: "File pronti", "pt-BR": "Arquivos prontos",
    "pt-PT": "Ficheiros prontos", vi: "Tệp có sẵn", tr: "Hazır dosyalar", ar: "ملفات جاهزة", th: "ไฟล์สำเร็จรูป", hi: "तैयार फ़ाइलें",
  },
  "人工服务": {
    zh: "人工服务", en: "Human service", "zh-TW": "人工服務", ja: "人によるサービス", ko: "사람 서비스", de: "Persönliche Dienstleistung",
    es: "Servicio humano", "es-419": "Servicio humano", fr: "Service humain", it: "Servizio umano", "pt-BR": "Serviço humano",
    "pt-PT": "Serviço humano", vi: "Dịch vụ người thật", tr: "İnsan hizmeti", ar: "خدمة بشرية", th: "บริการโดยคน", hi: "मानव सेवा",
  },
  "网站与软件服务": {
    zh: "网站与软件服务", en: "Website & software service", "zh-TW": "網站與軟體服務", ja: "ウェブサイト・ソフトウェアサービス", ko: "웹사이트·소프트웨어 서비스",
    de: "Website- & Software-Service", es: "Servicio de web y software", "es-419": "Servicio de sitio web y software", fr: "Service site web & logiciel",
    it: "Servizio sito web e software", "pt-BR": "Serviço de site e software", "pt-PT": "Serviço de website e software", vi: "Dịch vụ website & phần mềm",
    tr: "Web sitesi ve yazılım hizmeti", ar: "خدمة المواقع والبرمجيات", th: "บริการเว็บไซต์และซอฟต์แวร์", hi: "वेबसाइट और सॉफ़्टवेयर सेवा",
  },
  "课程": {
    zh: "课程", en: "Lessons", "zh-TW": "課程", ja: "レッスン", ko: "강의", de: "Kurse",
    es: "Lecciones", "es-419": "Lecciones", fr: "Cours", it: "Lezioni", "pt-BR": "Aulas",
    "pt-PT": "Aulas", vi: "Bài học", tr: "Dersler", ar: "الدروس", th: "บทเรียน", hi: "पाठ",
  },
  "联系卖家": {
    zh: "联系卖家", en: "Contact seller", "zh-TW": "聯絡賣家", ja: "販売者に連絡", ko: "판매자에게 연락", de: "Verkäufer kontaktieren",
    es: "Contactar al vendedor", "es-419": "Contactar al vendedor", fr: "Contacter le vendeur", it: "Contatta il venditore", "pt-BR": "Falar com o vendedor",
    "pt-PT": "Contactar o vendedor", vi: "Liên hệ người bán", tr: "Satıcıyla iletişime geç", ar: "التواصل مع البائع", th: "ติดต่อผู้ขาย", hi: "विक्रेता से संपर्क करें",
  },
  "去评价": {
    zh: "去评价", en: "Leave a review", "zh-TW": "去評價", ja: "評価する", ko: "평가하기", de: "Bewerten",
    es: "Valorar", "es-419": "Dejar una reseña", fr: "Laisser un avis", it: "Lascia una recensione", "pt-BR": "Avaliar",
    "pt-PT": "Avaliar", vi: "Đánh giá", tr: "Değerlendir", ar: "تقييم", th: "ไปให้คะแนน", hi: "समीक्षा करें",
  },
  "交易状态": {
    zh: "交易状态", en: "Trade status", "zh-TW": "交易狀態", ja: "取引状況", ko: "거래 상태", de: "Auftragsstatus",
    es: "Estado de la operación", "es-419": "Estado de la operación", fr: "Statut de la transaction", it: "Stato dell’operazione", "pt-BR": "Status da negociação",
    "pt-PT": "Estado da negociação", vi: "Trạng thái giao dịch", tr: "İşlem durumu", ar: "حالة الصفقة", th: "สถานะการซื้อขาย", hi: "लेन-देन की स्थिति",
  },
};

// 每个语种一张表：按简体中文原文取出该语种的译文。
export const BAY_MINE_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  (Object.keys(ROWS["课程"]) as Locale[]).map((locale) => [locale, Object.fromEntries(Object.entries(ROWS).map(([zh, row]) => [zh, row[locale]]))]),
) as Record<Locale, Record<string, string>>;
