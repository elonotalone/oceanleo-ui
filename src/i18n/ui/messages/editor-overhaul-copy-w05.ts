// 2026-10-23 编辑器整改波 W05 的新文案。只有 W05 改这一册。
// key = 中文原文（tt("…") 里那一句）；16 个非中文语种都要给，不许留中文。
//
// 「素材类别：表格」「素材类别：游戏」是库类型名的带语境 key（见
// `src/shell/library-editor-category.ts::translateLibraryTypeLabel`）：平铺词典里
// 「表格」= 插入表格的工具（Table）、「游戏」= 频道名（Games），类型菜单要的是
// Spreadsheet / Game。中文站回显 key 时由那个函数退回「表格」「游戏」。
import type { EditorOverhaulCopy } from "./editor-overhaul-copy-types";

export const EDITOR_OVERHAUL_W05_COPY: EditorOverhaulCopy = {
  de: {
    "视频画布": "Video-Leinwand",
    "素材类别：表格": "Tabelle",
    "素材类别：游戏": "Spiel",
  },
  en: {
    "视频画布": "Video canvas",
    "素材类别：表格": "Spreadsheet",
    "素材类别：游戏": "Game",
  },
  es: {
    "视频画布": "Lienzo de vídeo",
    "素材类别：表格": "Hoja de cálculo",
    "素材类别：游戏": "Juego",
  },
  "es-419": {
    "视频画布": "Lienzo de video",
    "素材类别：表格": "Hoja de cálculo",
    "素材类别：游戏": "Juego",
  },
  fr: {
    "视频画布": "Canevas vidéo",
    "素材类别：表格": "Feuille de calcul",
    "素材类别：游戏": "Jeu",
  },
  it: {
    "视频画布": "Tela video",
    "素材类别：表格": "Foglio di calcolo",
    "素材类别：游戏": "Gioco",
  },
  "pt-BR": {
    "视频画布": "Tela de vídeo",
    "素材类别：表格": "Planilha",
    "素材类别：游戏": "Jogo",
  },
  "pt-PT": {
    "视频画布": "Tela de vídeo",
    "素材类别：表格": "Folha de cálculo",
    "素材类别：游戏": "Jogo",
  },
  vi: {
    "视频画布": "Khung vẽ video",
    "素材类别：表格": "Bảng tính",
    "素材类别：游戏": "Trò chơi",
  },
  tr: {
    "视频画布": "Video tuvali",
    "素材类别：表格": "Elektronik tablo",
    "素材类别：游戏": "Oyun",
  },
  "zh-TW": {
    "视频画布": "影片畫布",
    "素材类别：表格": "試算表",
    "素材类别：游戏": "遊戲",
  },
  ja: {
    "视频画布": "動画キャンバス",
    "素材类别：表格": "スプレッドシート",
    "素材类别：游戏": "ゲーム",
  },
  ko: {
    "视频画布": "영상 캔버스",
    "素材类别：表格": "스프레드시트",
    "素材类别：游戏": "게임",
  },
  ar: {
    "视频画布": "لوحة الفيديو",
    "素材类别：表格": "جدول بيانات",
    "素材类别：游戏": "لعبة",
  },
  th: {
    "视频画布": "ผืนผ้าใบวิดีโอ",
    "素材类别：表格": "สเปรดชีต",
    "素材类别：游戏": "เกม",
  },
  hi: {
    "视频画布": "वीडियो कैनवास",
    "素材类别：表格": "स्प्रेडशीट",
    "素材类别：游戏": "गेम",
  },
};
