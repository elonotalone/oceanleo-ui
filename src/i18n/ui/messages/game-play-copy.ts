// Main-site game play/edit copy (claude_game_ui_1022, 2026-10-22).
import { assembleCopy } from "./shell-overhaul-copy-shared";

export const GAME_PLAY_SOURCE = {
  fullscreenRefused: "当前环境无法进入全屏。",
  playUnsupported: "当前站点暂不支持试玩，请在 OceanLeo 主站打开",
} as const;

export const GAME_PLAY_MESSAGES = assembleCopy(GAME_PLAY_SOURCE, {
  en: {
    fullscreenRefused: "This environment cannot enter full screen.",
    playUnsupported: "Playing is not supported on this site yet. Please open it on the OceanLeo main site.",
  },
  de: {
    fullscreenRefused: "Diese Umgebung kann nicht in den Vollbildmodus wechseln.",
    playUnsupported: "Spielen wird auf dieser Website noch nicht unterstützt. Bitte öffne es auf der OceanLeo-Hauptseite.",
  },
  es: {
    fullscreenRefused: "Este entorno no puede pasar a pantalla completa.",
    playUnsupported: "Jugar aún no está disponible en este sitio. Ábrelo en el sitio principal de OceanLeo.",
  },
  "es-419": {
    fullscreenRefused: "Este entorno no puede pasar a pantalla completa.",
    playUnsupported: "Jugar todavía no está disponible en este sitio. Ábrelo en el sitio principal de OceanLeo.",
  },
  fr: {
    fullscreenRefused: "Cet environnement ne peut pas passer en plein écran.",
    playUnsupported: "Le jeu n'est pas encore pris en charge sur ce site. Ouvrez-le sur le site principal d'OceanLeo.",
  },
  it: {
    fullscreenRefused: "Questo ambiente non può passare a schermo intero.",
    playUnsupported: "Giocare non è ancora supportato su questo sito. Aprilo sul sito principale di OceanLeo.",
  },
  "pt-BR": {
    fullscreenRefused: "Este ambiente não consegue entrar em tela cheia.",
    playUnsupported: "Ainda não é possível jogar neste site. Abra no site principal da OceanLeo.",
  },
  "pt-PT": {
    fullscreenRefused: "Este ambiente não consegue entrar em ecrã inteiro.",
    playUnsupported: "Ainda não é possível jogar neste site. Abra no site principal da OceanLeo.",
  },
  vi: {
    fullscreenRefused: "Môi trường này không thể vào chế độ toàn màn hình.",
    playUnsupported: "Trang này chưa hỗ trợ chơi thử. Hãy mở trên trang chính của OceanLeo.",
  },
  tr: {
    fullscreenRefused: "Bu ortam tam ekrana geçemiyor.",
    playUnsupported: "Bu sitede oynama henüz desteklenmiyor. Lütfen OceanLeo ana sitesinde açın.",
  },
  "zh-TW": {
    fullscreenRefused: "目前環境無法進入全螢幕。",
    playUnsupported: "目前網站暫不支援試玩，請在 OceanLeo 主站開啟。",
  },
  ja: {
    fullscreenRefused: "この環境では全画面表示にできません。",
    playUnsupported: "このサイトではまだ試遊に対応していません。OceanLeo のメインサイトで開いてください。",
  },
  ko: {
    fullscreenRefused: "이 환경에서는 전체 화면으로 전환할 수 없습니다.",
    playUnsupported: "이 사이트에서는 아직 플레이를 지원하지 않습니다. OceanLeo 메인 사이트에서 열어 주세요.",
  },
  ar: {
    fullscreenRefused: "لا تدعم هذه البيئة وضع ملء الشاشة.",
    playUnsupported: "اللعب غير مدعوم على هذا الموقع بعد. يُرجى فتحه على موقع OceanLeo الرئيسي.",
  },
  th: {
    fullscreenRefused: "สภาพแวดล้อมนี้ไม่สามารถเข้าสู่โหมดเต็มหน้าจอได้",
    playUnsupported: "เว็บไซต์นี้ยังไม่รองรับการเล่น กรุณาเปิดบนเว็บไซต์หลักของ OceanLeo",
  },
  hi: {
    fullscreenRefused: "यह परिवेश फ़ुलस्क्रीन में नहीं जा सकता।",
    playUnsupported: "इस साइट पर अभी खेलना समर्थित नहीं है। कृपया इसे OceanLeo की मुख्य साइट पर खोलें।",
  },
});
