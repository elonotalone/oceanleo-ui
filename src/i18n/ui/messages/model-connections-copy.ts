import type { Locale } from "../../config";

// API-key connection settings only.
export const MODEL_CONNECTION_COPY_MESSAGES = {
  "zh": {
    "连接名称": "连接名称",
    "接口协议": "接口协议",
    "备注（选填）": "备注（选填）"
  },
  "zh-TW": {
    "连接名称": "連線名稱",
    "接口协议": "介面協定",
    "备注（选填）": "備註（選填）"
  },
  "en": {
    "连接名称": "Connection name",
    "接口协议": "API protocol",
    "备注（选填）": "Remark (optional)"
  },
  "de": {
    "连接名称": "Verbindungsname",
    "接口协议": "API-Protokoll",
    "备注（选填）": "Anmerkung (optional)"
  },
  "es": {
    "连接名称": "Nombre de conexión",
    "接口协议": "Protocolo API",
    "备注（选填）": "Nota (opcional)"
  },
  "es-419": {
    "连接名称": "Nombre de conexión",
    "接口协议": "Protocolo API",
    "备注（选填）": "Nota (opcional)"
  },
  "fr": {
    "连接名称": "Nom de connexion",
    "接口协议": "Protocole API",
    "备注（选填）": "Remarque (facultatif)"
  },
  "it": {
    "连接名称": "Nome connessione",
    "接口协议": "Protocollo API",
    "备注（选填）": "Nota (facoltativa)"
  },
  "pt-BR": {
    "连接名称": "Nome da conexão",
    "接口协议": "Protocolo da API",
    "备注（选填）": "Observação (opcional)"
  },
  "pt-PT": {
    "连接名称": "Nome da ligação",
    "接口协议": "Protocolo da API",
    "备注（选填）": "Nota (opcional)"
  },
  "ja": {
    "连接名称": "接続名",
    "接口协议": "APIプロトコル",
    "备注（选填）": "メモ（任意）"
  },
  "ko": {
    "连接名称": "연결 이름",
    "接口协议": "API 프로토콜",
    "备注（选填）": "메모 (선택)"
  },
  "vi": {
    "连接名称": "Tên kết nối",
    "接口协议": "Giao thức API",
    "备注（选填）": "Ghi chú (tùy chọn)"
  },
  "tr": {
    "连接名称": "Bağlantı adı",
    "接口协议": "API protokolü",
    "备注（选填）": "Not (isteğe bağlı)"
  },
  "ar": {
    "连接名称": "اسم الاتصال",
    "接口协议": "بروتوكول API",
    "备注（选填）": "ملاحظة (اختياري)"
  },
  "th": {
    "连接名称": "ชื่อการเชื่อมต่อ",
    "接口协议": "โปรโตคอล API",
    "备注（选填）": "หมายเหตุ (ไม่บังคับ)"
  },
  "hi": {
    "连接名称": "कनेक्शन का नाम",
    "接口协议": "API प्रोटोकॉल",
    "备注（选填）": "टिप्पणी (वैकल्पिक)"
  }
} satisfies Record<Locale, Record<string, string>>;
