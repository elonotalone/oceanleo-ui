// 2026-09-24 editors-and-shell 波 W13 的分表。只由 W13 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W13_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "右侧全屏": "右侧全屏",
  "退出右侧全屏": "退出右侧全屏",
} as const;

export const EAS_W13_MESSAGES = assembleCopy(SOURCE, {
  en: {
    "右侧全屏": "Maximize right pane",
    "退出右侧全屏": "Exit right pane maximize",
  },
  de: {
    "右侧全屏": "Rechtes Feld maximieren",
    "退出右侧全屏": "Rechtes Feld wiederherstellen",
  },
  es: {
    "右侧全屏": "Maximizar el panel derecho",
    "退出右侧全屏": "Salir de la maximización del panel derecho",
  },
  "es-419": {
    "右侧全屏": "Maximizar el panel derecho",
    "退出右侧全屏": "Salir de la maximización del panel derecho",
  },
  fr: {
    "右侧全屏": "Agrandir le volet droit",
    "退出右侧全屏": "Quitter l'agrandissement du volet droit",
  },
  it: {
    "右侧全屏": "Ingrandisci il riquadro destro",
    "退出右侧全屏": "Esci dall'ingrandimento del riquadro destro",
  },
  "pt-BR": {
    "右侧全屏": "Maximizar o painel direito",
    "退出右侧全屏": "Sair da maximização do painel direito",
  },
  "pt-PT": {
    "右侧全屏": "Maximizar o painel direito",
    "退出右侧全屏": "Sair da maximização do painel direito",
  },
  vi: {
    "右侧全屏": "Phóng to cột phải",
    "退出右侧全屏": "Thoát phóng to cột phải",
  },
  tr: {
    "右侧全屏": "Sağ bölmeyi büyüt",
    "退出右侧全屏": "Sağ bölme büyütmeden çık",
  },
  "zh-TW": {
    "右侧全屏": "右側全螢幕",
    "退出右侧全屏": "退出右側全螢幕",
  },
  ja: {
    "右侧全屏": "右ペインを全画面",
    "退出右侧全屏": "右ペインの全画面を終了",
  },
  ko: {
    "右侧全屏": "오른쪽 전체 화면",
    "退出右侧全屏": "오른쪽 전체 화면 종료",
  },
  ar: {
    "右侧全屏": "ملء الشاشة للوحة اليمنى",
    "退出右侧全屏": "إنهاء ملء الشاشة للوحة اليمنى",
  },
  th: {
    "右侧全屏": "เต็มจอด้านขวา",
    "退出右侧全屏": "ออกจากเต็มจอด้านขวา",
  },
  hi: {
    "右侧全屏": "दायाँ फलक पूरा स्क्रीन",
    "退出右侧全屏": "दायाँ फलक पूरा स्क्रीन से बाहर",
  },
});
