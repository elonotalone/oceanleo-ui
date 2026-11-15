import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = { expand: "展开连接器界面", collapse: "收起连接器界面" } as const;
export const PW_U4_MESSAGES = assembleCopy(SOURCE, {
  en: { expand: "Expand connector interface", collapse: "Collapse connector interface" },
  de: { expand: "Connector-Oberfläche vergrößern", collapse: "Connector-Oberfläche verkleinern" },
  es: { expand: "Ampliar interfaz del conector", collapse: "Reducir interfaz del conector" },
  "es-419": { expand: "Ampliar interfaz del conector", collapse: "Reducir interfaz del conector" },
  fr: { expand: "Agrandir l’interface du connecteur", collapse: "Réduire l’interface du connecteur" },
  it: { expand: "Espandi interfaccia del connettore", collapse: "Riduci interfaccia del connettore" },
  "pt-BR": { expand: "Expandir interface do conector", collapse: "Recolher interface do conector" },
  "pt-PT": { expand: "Expandir interface do conector", collapse: "Recolher interface do conector" },
  vi: { expand: "Mở rộng giao diện trình kết nối", collapse: "Thu gọn giao diện trình kết nối" },
  tr: { expand: "Bağlayıcı arayüzünü genişlet", collapse: "Bağlayıcı arayüzünü daralt" },
  "zh-TW": { expand: "展開連接器介面", collapse: "收起連接器介面" },
  ja: { expand: "コネクターの画面を拡大", collapse: "コネクターの画面を縮小" },
  ko: { expand: "커넥터 화면 펼치기", collapse: "커넥터 화면 접기" },
  ar: { expand: "توسيع واجهة الموصل", collapse: "طي واجهة الموصل" },
  th: { expand: "ขยายหน้าตัวเชื่อมต่อ", collapse: "ย่อหน้าตัวเชื่อมต่อ" },
  hi: { expand: "कनेक्टर इंटरफ़ेस बड़ा करें", collapse: "कनेक्टर इंटरफ़ेस छोटा करें" },
});
