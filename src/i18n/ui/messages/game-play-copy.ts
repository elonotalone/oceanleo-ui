// Main-site game play/edit copy (claude_game_ui_1022, 2026-10-22).
import { assembleCopy } from "./shell-overhaul-copy-shared";

export const GAME_PLAY_SOURCE = {
  fullscreenRefused: "当前环境无法进入全屏。",
  playUnsupported: "游戏试玩暂时不可用，请稍后重试",
} as const;

export const GAME_PLAY_MESSAGES = assembleCopy(GAME_PLAY_SOURCE, {
  en: {
    fullscreenRefused: "This environment cannot enter full screen.",
    playUnsupported: "Game preview is temporarily unavailable. Please try again.",
  },
  de: {
    fullscreenRefused: "Diese Umgebung kann nicht in den Vollbildmodus wechseln.",
    playUnsupported: "Die Spielvorschau ist vorübergehend nicht verfügbar. Bitte versuche es erneut.",
  },
  es: {
    fullscreenRefused: "Este entorno no puede pasar a pantalla completa.",
    playUnsupported: "La vista previa del juego no está disponible temporalmente. Inténtalo de nuevo.",
  },
  "es-419": {
    fullscreenRefused: "Este entorno no puede pasar a pantalla completa.",
    playUnsupported: "La vista previa del juego no está disponible temporalmente. Inténtalo de nuevo.",
  },
  fr: {
    fullscreenRefused: "Cet environnement ne peut pas passer en plein écran.",
    playUnsupported: "L’aperçu du jeu est temporairement indisponible. Réessayez.",
  },
  it: {
    fullscreenRefused: "Questo ambiente non può passare a schermo intero.",
    playUnsupported: "L’anteprima del gioco non è temporaneamente disponibile. Riprova.",
  },
  "pt-BR": {
    fullscreenRefused: "Este ambiente não consegue entrar em tela cheia.",
    playUnsupported: "A prévia do jogo está temporariamente indisponível. Tente novamente.",
  },
  "pt-PT": {
    fullscreenRefused: "Este ambiente não consegue entrar em ecrã inteiro.",
    playUnsupported: "A pré-visualização do jogo está temporariamente indisponível. Tente novamente.",
  },
  vi: {
    fullscreenRefused: "Môi trường này không thể vào chế độ toàn màn hình.",
    playUnsupported: "Bản chơi thử tạm thời không khả dụng. Vui lòng thử lại.",
  },
  tr: {
    fullscreenRefused: "Bu ortam tam ekrana geçemiyor.",
    playUnsupported: "Oyun önizlemesi geçici olarak kullanılamıyor. Lütfen tekrar deneyin.",
  },
  "zh-TW": {
    fullscreenRefused: "目前環境無法進入全螢幕。",
    playUnsupported: "遊戲試玩暫時無法使用，請稍後重試。",
  },
  ja: {
    fullscreenRefused: "この環境では全画面表示にできません。",
    playUnsupported: "ゲームのプレビューは一時的に利用できません。もう一度お試しください。",
  },
  ko: {
    fullscreenRefused: "이 환경에서는 전체 화면으로 전환할 수 없습니다.",
    playUnsupported: "게임 미리보기를 일시적으로 사용할 수 없습니다. 다시 시도해 주세요.",
  },
  ar: {
    fullscreenRefused: "لا تدعم هذه البيئة وضع ملء الشاشة.",
    playUnsupported: "معاينة اللعبة غير متاحة مؤقتًا. يُرجى المحاولة مجددًا.",
  },
  th: {
    fullscreenRefused: "สภาพแวดล้อมนี้ไม่สามารถเข้าสู่โหมดเต็มหน้าจอได้",
    playUnsupported: "ตัวอย่างเกมไม่พร้อมใช้งานชั่วคราว โปรดลองอีกครั้ง",
  },
  hi: {
    fullscreenRefused: "यह परिवेश फ़ुलस्क्रीन में नहीं जा सकता।",
    playUnsupported: "गेम का प्रीव्यू अभी उपलब्ध नहीं है। कृपया फिर कोशिश करें।",
  },
});
