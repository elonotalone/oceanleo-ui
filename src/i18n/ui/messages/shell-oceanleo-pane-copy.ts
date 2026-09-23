// Shell 对话框里 OceanLeo agent 程序的文案（合同 I6，W6A）。简体中文是查找键。
// 旧 leo 面板的键随面板删除；这里只收当前对话框真正用到的键。

import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  leoAgent: "OceanLeo agent",
  paneTitleComputer: "OceanLeo agent · {name}",
  computerOffline: "这台电脑不在线",
  stepFallback: "步骤",
  errorFallback: "出错",
} as const;

export const SHELL_OCEANLEO_PANE_MESSAGES = assembleCopy(SOURCE, {
  de: {
    leoAgent: "OceanLeo-Agent",
    paneTitleComputer: "OceanLeo-Agent · {name}",
    computerOffline: "Dieser Computer ist nicht online",
    stepFallback: "Schritt",
    errorFallback: "Fehler",
  },
  en: {
    leoAgent: "OceanLeo agent",
    paneTitleComputer: "OceanLeo agent · {name}",
    computerOffline: "This computer is not online",
    stepFallback: "Step",
    errorFallback: "Error",
  },
  es: {
    leoAgent: "agente de OceanLeo",
    paneTitleComputer: "agente de OceanLeo · {name}",
    computerOffline: "Este ordenador no está en línea",
    stepFallback: "Paso",
    errorFallback: "Error",
  },
  "es-419": {
    leoAgent: "agente de OceanLeo",
    paneTitleComputer: "agente de OceanLeo · {name}",
    computerOffline: "Esta computadora no está en línea",
    stepFallback: "Paso",
    errorFallback: "Error",
  },
  fr: {
    leoAgent: "agent OceanLeo",
    paneTitleComputer: "agent OceanLeo · {name}",
    computerOffline: "Cet ordinateur n'est pas en ligne",
    stepFallback: "Étape",
    errorFallback: "Erreur",
  },
  it: {
    leoAgent: "agente OceanLeo",
    paneTitleComputer: "agente OceanLeo · {name}",
    computerOffline: "Questo computer non è online",
    stepFallback: "Passo",
    errorFallback: "Errore",
  },
  "pt-BR": {
    leoAgent: "agente OceanLeo",
    paneTitleComputer: "agente OceanLeo · {name}",
    computerOffline: "Este computador não está online",
    stepFallback: "Passo",
    errorFallback: "Erro",
  },
  "pt-PT": {
    leoAgent: "agente OceanLeo",
    paneTitleComputer: "agente OceanLeo · {name}",
    computerOffline: "Este computador não está online",
    stepFallback: "Passo",
    errorFallback: "Erro",
  },
  vi: {
    leoAgent: "tác nhân OceanLeo",
    paneTitleComputer: "tác nhân OceanLeo · {name}",
    computerOffline: "Máy này không trực tuyến",
    stepFallback: "Bước",
    errorFallback: "Lỗi",
  },
  tr: {
    leoAgent: "OceanLeo aracısı",
    paneTitleComputer: "OceanLeo aracısı · {name}",
    computerOffline: "Bu bilgisayar çevrimiçi değil",
    stepFallback: "Adım",
    errorFallback: "Hata",
  },
  "zh-TW": {
    leoAgent: "OceanLeo agent",
    paneTitleComputer: "OceanLeo agent · {name}",
    computerOffline: "這台電腦不在線",
    stepFallback: "步驟",
    errorFallback: "出錯",
  },
  ja: {
    leoAgent: "OceanLeo エージェント",
    paneTitleComputer: "OceanLeo エージェント · {name}",
    computerOffline: "このパソコンはオンラインではありません",
    stepFallback: "ステップ",
    errorFallback: "エラー",
  },
  ko: {
    leoAgent: "OceanLeo 에이전트",
    paneTitleComputer: "OceanLeo 에이전트 · {name}",
    computerOffline: "이 컴퓨터는 온라인이 아닙니다",
    stepFallback: "단계",
    errorFallback: "오류",
  },
  ar: {
    leoAgent: "وكيل OceanLeo",
    paneTitleComputer: "وكيل OceanLeo · {name}",
    computerOffline: "هذا الجهاز غير متصل",
    stepFallback: "خطوة",
    errorFallback: "خطأ",
  },
  th: {
    leoAgent: "ตัวแทน OceanLeo",
    paneTitleComputer: "ตัวแทน OceanLeo · {name}",
    computerOffline: "เครื่องนี้ไม่ได้ออนไลน์",
    stepFallback: "ขั้นตอน",
    errorFallback: "ผิดพลาด",
  },
  hi: {
    leoAgent: "OceanLeo एजेंट",
    paneTitleComputer: "OceanLeo एजेंट · {name}",
    computerOffline: "यह कंप्यूटर ऑनलाइन नहीं है",
    stepFallback: "कदम",
    errorFallback: "त्रुटि",
  },
});
