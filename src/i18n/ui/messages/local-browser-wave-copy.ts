import type { Locale } from "../../config";

const keys = ["授权后，网页内容会发送给服务器和模型。", "连接说明"] as const;
const rows: Record<Locale, readonly [string, string]> = {
  "zh": [
    "授权后，网页内容会发送给服务器和模型。",
    "连接说明"
  ],
  "en": [
    "After approval, page content is sent to the server and model.",
    "Connection setup"
  ],
  "zh-TW": [
    "授權後，網頁內容會傳送給伺服器和模型。",
    "連線說明"
  ],
  "ja": [
    "許可後、ページの内容がサーバーとモデルに送信されます。",
    "接続手順"
  ],
  "ko": [
    "승인하면 페이지 콘텐츠가 서버와 모델로 전송됩니다.",
    "연결 안내"
  ],
  "de": [
    "Nach der Zustimmung werden die Seiteninhalte an den Server und das Modell gesendet.",
    "Anleitung zur Verbindung"
  ],
  "fr": [
    "Après votre autorisation, le contenu de la page est envoyé au serveur et au modèle.",
    "Instructions de connexion"
  ],
  "it": [
    "Dopo l’autorizzazione, il contenuto della pagina viene inviato al server e al modello.",
    "Istruzioni di connessione"
  ],
  "es": [
    "Tras autorizarlo, el contenido de la página se envía al servidor y al modelo.",
    "Instrucciones de conexión"
  ],
  "es-419": [
    "Después de autorizarlo, el contenido de la página se envía al servidor y al modelo.",
    "Cómo conectar"
  ],
  "pt-BR": [
    "Após a autorização, o conteúdo da página é enviado ao servidor e ao modelo.",
    "Instruções de conexão"
  ],
  "pt-PT": [
    "Após a autorização, o conteúdo da página é enviado para o servidor e para o modelo.",
    "Instruções de ligação"
  ],
  "vi": [
    "Sau khi được cho phép, nội dung trang sẽ được gửi đến máy chủ và mô hình.",
    "Hướng dẫn kết nối"
  ],
  "tr": [
    "Onaydan sonra sayfa içeriği sunucuya ve modele gönderilir.",
    "Bağlantı yönergeleri"
  ],
  "ar": [
    "بعد الموافقة، يُرسل محتوى الصفحة إلى الخادم والنموذج.",
    "إرشادات الاتصال"
  ],
  "th": [
    "หลังอนุญาต เนื้อหาหน้าเว็บจะถูกส่งไปยังเซิร์ฟเวอร์และโมเดล",
    "คำแนะนำการเชื่อมต่อ"
  ],
  "hi": [
    "अनुमति मिलने के बाद, पेज की सामग्री सर्वर और मॉडल को भेजी जाती है।",
    "कनेक्शन के निर्देश"
  ]
};

export const LOCAL_BROWSER_WAVE_COPY = Object.fromEntries(Object.entries(rows).map(([locale, values]) => [locale,
  Object.fromEntries(keys.map((key, index) => [key, values[index]])),
])) as Record<Locale, Record<string, string>>;
