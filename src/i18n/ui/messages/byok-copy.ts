import type { Locale } from "../../config";
import { assembleByokCopy, BYOK_COPY_KEYS } from "./byok-copy-base";
import { BYOK_COPY_EASTERN } from "./byok-copy-eastern";
import { BYOK_COPY_WESTERN } from "./byok-copy-western";
import { MODEL_CONNECTION_COPY_MESSAGES } from "./model-connections-copy";

export { BYOK_COPY_KEYS };

/**
 * 17 语言 × BYOK 设置页文案，形状是 `useUI()` 要的「中文原文 → 译文」平表。
 * `assembleByokCopy` 的入参类型是 `Record<Exclude<Locale, "zh">, ByokCopyMessages>`，
 * 所以少一个语种或少一条 key，tsc 就编不过。
 */
export const BYOK_COPY_MESSAGES: Record<Locale, Record<string, string>> =
  assembleByokCopy({
    ...BYOK_COPY_WESTERN,
    ...BYOK_COPY_EASTERN,
  });

for (const locale of Object.keys(BYOK_COPY_MESSAGES) as Locale[]) {
  Object.assign(BYOK_COPY_MESSAGES[locale], MODEL_CONNECTION_COPY_MESSAGES[locale]);
}

const MULTI_MODEL_COPY: Record<Locale, Record<string, string>> = {
  "zh": {
    "一个连接，多个模型": "一个连接，多个模型",
    "请填写模型 ID": "请填写模型 ID",
    "留空保留现有密钥": "留空保留现有密钥",
    "模型 ID": "模型 ID",
    "模型备注（选填）": "模型备注（选填）",
    "使用连接协议": "使用连接协议",
    "移除模型": "移除模型",
    "添加模型": "添加模型",
    "复制并编辑组合": "复制并编辑组合"
  },
  "zh-TW": {
    "一个连接，多个模型": "一個連線，多個模型",
    "请填写模型 ID": "請填寫模型 ID",
    "留空保留现有密钥": "留空保留現有密鑰",
    "模型 ID": "模型 ID",
    "模型备注（选填）": "模型備註（選填）",
    "使用连接协议": "使用連線協定",
    "移除模型": "移除模型",
    "添加模型": "添加模型",
    "复制并编辑组合": "複製並編輯組合"
  },
  "en": {
    "一个连接，多个模型": "One connection, multiple models",
    "请填写模型 ID": "Enter a model ID",
    "留空保留现有密钥": "Leave blank to keep the existing key",
    "模型 ID": "Model ID",
    "模型备注（选填）": "Model label (optional)",
    "使用连接协议": "Use connection protocol",
    "移除模型": "Remove model",
    "添加模型": "Add model",
    "复制并编辑组合": "Copy and edit group"
  },
  "de": {
    "一个连接，多个模型": "Eine Verbindung, mehrere Modelle",
    "请填写模型 ID": "Modell-ID eingeben",
    "留空保留现有密钥": "Leer lassen, um den Schlüssel zu behalten",
    "模型 ID": "Modell-ID",
    "模型备注（选填）": "Modellname (optional)",
    "使用连接协议": "Verbindungsprotokoll verwenden",
    "移除模型": "Modell entfernen",
    "添加模型": "Modell hinzufügen",
    "复制并编辑组合": "Gruppe kopieren und bearbeiten"
  },
  "es": {
    "一个连接，多个模型": "Una conexión, varios modelos",
    "请填写模型 ID": "Introduce un ID de modelo",
    "留空保留现有密钥": "Déjalo vacío para conservar la clave",
    "模型 ID": "ID del modelo",
    "模型备注（选填）": "Nombre del modelo (opcional)",
    "使用连接协议": "Usar protocolo de conexión",
    "移除模型": "Eliminar modelo",
    "添加模型": "Añadir modelo",
    "复制并编辑组合": "Copiar y editar grupo"
  },
  "es-419": {
    "一个连接，多个模型": "Una conexión, varios modelos",
    "请填写模型 ID": "Introduce un ID de modelo",
    "留空保留现有密钥": "Déjalo vacío para conservar la clave",
    "模型 ID": "ID del modelo",
    "模型备注（选填）": "Nombre del modelo (opcional)",
    "使用连接协议": "Usar protocolo de conexión",
    "移除模型": "Eliminar modelo",
    "添加模型": "Añadir modelo",
    "复制并编辑组合": "Copiar y editar grupo"
  },
  "fr": {
    "一个连接，多个模型": "Une connexion, plusieurs modèles",
    "请填写模型 ID": "Saisissez un ID de modèle",
    "留空保留现有密钥": "Laisser vide pour conserver la clé",
    "模型 ID": "ID du modèle",
    "模型备注（选填）": "Nom du modèle (facultatif)",
    "使用连接协议": "Utiliser le protocole de connexion",
    "移除模型": "Retirer le modèle",
    "添加模型": "Ajouter un modèle",
    "复制并编辑组合": "Copier et modifier le groupe"
  },
  "it": {
    "一个连接，多个模型": "Una connessione, più modelli",
    "请填写模型 ID": "Inserisci un ID modello",
    "留空保留现有密钥": "Lascia vuoto per mantenere la chiave",
    "模型 ID": "ID modello",
    "模型备注（选填）": "Nome modello (facoltativo)",
    "使用连接协议": "Usa protocollo della connessione",
    "移除模型": "Rimuovi modello",
    "添加模型": "Aggiungi modello",
    "复制并编辑组合": "Copia e modifica gruppo"
  },
  "pt-BR": {
    "一个连接，多个模型": "Uma conexão, vários modelos",
    "请填写模型 ID": "Insira um ID de modelo",
    "留空保留现有密钥": "Deixe vazio para manter a chave",
    "模型 ID": "ID do modelo",
    "模型备注（选填）": "Nome do modelo (opcional)",
    "使用连接协议": "Usar protocolo da conexão",
    "移除模型": "Remover modelo",
    "添加模型": "Adicionar modelo",
    "复制并编辑组合": "Copiar e editar grupo"
  },
  "pt-PT": {
    "一个连接，多个模型": "Uma conexão, vários modelos",
    "请填写模型 ID": "Insira um ID de modelo",
    "留空保留现有密钥": "Deixe vazio para manter a chave",
    "模型 ID": "ID do modelo",
    "模型备注（选填）": "Nome do modelo (opcional)",
    "使用连接协议": "Usar protocolo da conexão",
    "移除模型": "Remover modelo",
    "添加模型": "Adicionar modelo",
    "复制并编辑组合": "Copiar e editar grupo"
  },
  "ja": {
    "一个连接，多个模型": "1つの接続に複数のモデル",
    "请填写模型 ID": "モデル ID を入力してください",
    "留空保留现有密钥": "空欄で現在のキーを保持",
    "模型 ID": "モデル ID",
    "模型备注（选填）": "モデル名（任意）",
    "使用连接协议": "接続のプロトコルを使用",
    "移除模型": "モデルを削除",
    "添加模型": "モデルを追加",
    "复制并编辑组合": "グループをコピーして編集"
  },
  "ko": {
    "一个连接，多个模型": "연결 하나에 여러 모델",
    "请填写模型 ID": "모델 ID를 입력하세요",
    "留空保留现有密钥": "비워 두면 기존 키 유지",
    "模型 ID": "모델 ID",
    "模型备注（选填）": "모델 이름 (선택)",
    "使用连接协议": "연결 프로토콜 사용",
    "移除模型": "모델 제거",
    "添加模型": "모델 추가",
    "复制并编辑组合": "그룹 복사 및 편집"
  },
  "vi": {
    "一个连接，多个模型": "Một kết nối, nhiều mô hình",
    "请填写模型 ID": "Nhập ID mô hình",
    "留空保留现有密钥": "Để trống để giữ khóa hiện tại",
    "模型 ID": "ID mô hình",
    "模型备注（选填）": "Tên mô hình (tùy chọn)",
    "使用连接协议": "Dùng giao thức kết nối",
    "移除模型": "Xóa mô hình",
    "添加模型": "Thêm mô hình",
    "复制并编辑组合": "Sao chép và sửa nhóm"
  },
  "tr": {
    "一个连接，多个模型": "Tek bağlantı, birden çok model",
    "请填写模型 ID": "Model kimliği girin",
    "留空保留现有密钥": "Mevcut anahtarı korumak için boş bırakın",
    "模型 ID": "Model kimliği",
    "模型备注（选填）": "Model adı (isteğe bağlı)",
    "使用连接协议": "Bağlantı protokolünü kullan",
    "移除模型": "Modeli kaldır",
    "添加模型": "Model ekle",
    "复制并编辑组合": "Grubu kopyala ve düzenle"
  },
  "ar": {
    "一个连接，多个模型": "اتصال واحد، نماذج متعددة",
    "请填写模型 ID": "أدخل معرّف النموذج",
    "留空保留现有密钥": "اتركه فارغًا للاحتفاظ بالمفتاح الحالي",
    "模型 ID": "معرّف النموذج",
    "模型备注（选填）": "اسم النموذج (اختياري)",
    "使用连接协议": "استخدام بروتوكول الاتصال",
    "移除模型": "إزالة النموذج",
    "添加模型": "إضافة نموذج",
    "复制并编辑组合": "نسخ المجموعة وتعديلها"
  },
  "th": {
    "一个连接，多个模型": "การเชื่อมต่อเดียว หลายโมเดล",
    "请填写模型 ID": "กรอก ID โมเดล",
    "留空保留现有密钥": "เว้นว่างเพื่อเก็บคีย์เดิม",
    "模型 ID": "ID โมเดล",
    "模型备注（选填）": "ชื่อโมเดล (ไม่บังคับ)",
    "使用连接协议": "ใช้โปรโตคอลการเชื่อมต่อ",
    "移除模型": "ลบโมเดล",
    "添加模型": "เพิ่มโมเดล",
    "复制并编辑组合": "คัดลอกและแก้ไขกลุ่ม"
  },
  "hi": {
    "一个连接，多个模型": "एक कनेक्शन, कई मॉडल",
    "请填写模型 ID": "मॉडल ID दर्ज करें",
    "留空保留现有密钥": "मौजूदा कुंजी रखने के लिए खाली छोड़ें",
    "模型 ID": "मॉडल ID",
    "模型备注（选填）": "मॉडल नाम (वैकल्पिक)",
    "使用连接协议": "कनेक्शन प्रोटोकॉल उपयोग करें",
    "移除模型": "मॉडल हटाएँ",
    "添加模型": "मॉडल जोड़ें",
    "复制并编辑组合": "समूह कॉपी करके संपादित करें"
  }
};
for (const locale of Object.keys(MULTI_MODEL_COPY) as Locale[]) {
  Object.assign(BYOK_COPY_MESSAGES[locale], MULTI_MODEL_COPY[locale]);
}
