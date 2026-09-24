// 2026-09-24 editors-and-shell 波 W04 的分表。只由 W04 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W04_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "Leo 服务版本过旧，暂时不能保存对话": "Leo 服务版本过旧，暂时不能保存对话",
  "Leo 服务版本过旧，暂时不能对话": "Leo 服务版本过旧，暂时不能对话",
} as const;

export const EAS_W04_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "Leo 服务版本过旧，暂时不能保存对话": "The Leo service is too old to save conversations right now",
    "Leo 服务版本过旧，暂时不能对话": "The Leo service is too old to chat right now",
  },
  de: {
    "Leo 服务版本过旧，暂时不能保存对话": "Der Leo-Dienst ist zu alt, um Unterhaltungen zu speichern",
    "Leo 服务版本过旧，暂时不能对话": "Der Leo-Dienst ist zu alt, um zu chatten",
  },
  es: {
    "Leo 服务版本过旧，暂时不能保存对话": "El servicio de Leo es demasiado antiguo para guardar conversaciones",
    "Leo 服务版本过旧，暂时不能对话": "El servicio de Leo es demasiado antiguo para conversar",
  },
  "es-419": {
    "Leo 服务版本过旧，暂时不能保存对话": "El servicio de Leo es demasiado viejo para guardar conversaciones",
    "Leo 服务版本过旧，暂时不能对话": "El servicio de Leo es demasiado viejo para conversar",
  },
  fr: {
    "Leo 服务版本过旧，暂时不能保存对话": "Le service Leo est trop ancien pour enregistrer les conversations",
    "Leo 服务版本过旧，暂时不能对话": "Le service Leo est trop ancien pour discuter",
  },
  it: {
    "Leo 服务版本过旧，暂时不能保存对话": "Il servizio Leo è troppo vecchio per salvare le conversazioni",
    "Leo 服务版本过旧，暂时不能对话": "Il servizio Leo è troppo vecchio per conversare",
  },
  "pt-BR": {
    "Leo 服务版本过旧，暂时不能保存对话": "O serviço da Leo está antigo demais para salvar conversas",
    "Leo 服务版本过旧，暂时不能对话": "O serviço da Leo está antigo demais para conversar",
  },
  "pt-PT": {
    "Leo 服务版本过旧，暂时不能保存对话": "O serviço da Leo está demasiado antigo para guardar conversas",
    "Leo 服务版本过旧，暂时不能对话": "O serviço da Leo está demasiado antigo para conversar",
  },
  vi: {
    "Leo 服务版本过旧，暂时不能保存对话": "Dịch vụ Leo quá cũ, tạm thời không lưu được hội thoại",
    "Leo 服务版本过旧，暂时不能对话": "Dịch vụ Leo quá cũ, tạm thời không trò chuyện được",
  },
  tr: {
    "Leo 服务版本过旧，暂时不能保存对话": "Leo hizmeti sohbetleri kaydetmek için çok eski",
    "Leo 服务版本过旧，暂时不能对话": "Leo hizmeti sohbet etmek için çok eski",
  },
  "zh-TW": {
    "Leo 服务版本过旧，暂时不能保存对话": "Leo 服務版本過舊，暫時不能儲存對話",
    "Leo 服务版本过旧，暂时不能对话": "Leo 服務版本過舊，暫時不能對話",
  },
  ja: {
    "Leo 服务版本过旧，暂时不能保存对话": "Leo のサービスが古く、会話を保存できません",
    "Leo 服务版本过旧，暂时不能对话": "Leo のサービスが古く、会話できません",
  },
  ko: {
    "Leo 服务版本过旧，暂时不能保存对话": "Leo 서비스 버전이 오래되어 대화를 저장할 수 없습니다",
    "Leo 服务版本过旧，暂时不能对话": "Leo 서비스 버전이 오래되어 대화할 수 없습니다",
  },
  ar: {
    "Leo 服务版本过旧，暂时不能保存对话": "خدمة Leo قديمة جدًا ولا يمكنها حفظ المحادثات الآن",
    "Leo 服务版本过旧，暂时不能对话": "خدمة Leo قديمة جدًا ولا يمكنها الدردشة الآن",
  },
  th: {
    "Leo 服务版本过旧，暂时不能保存对话": "บริการ Leo รุ่นเก่าเกินไป ยังบันทึกบทสนทนาไม่ได้",
    "Leo 服务版本过旧，暂时不能对话": "บริการ Leo รุ่นเก่าเกินไป ยังคุยไม่ได้",
  },
  hi: {
    "Leo 服务版本过旧，暂时不能保存对话": "Leo सेवा पुरानी है, अभी बातचीत सहेजी नहीं जा सकती",
    "Leo 服务版本过旧，暂时不能对话": "Leo सेवा पुरानी है, अभी बात नहीं हो सकती",
  },
});
