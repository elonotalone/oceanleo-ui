import { LOCALES, type Locale } from "../../config";

const ZH = ["取消渲染", "视频轨", "宽度", "高度", "音量"] as const;

const ROWS: Record<Locale, readonly string[]> = {
  zh: ZH,
  en: ["Cancel render", "Video track", "Width", "Height", "Volume"],
  "zh-TW": ["取消算圖", "影片軌", "寬度", "高度", "音量"],
  de: ["Rendern abbrechen", "Videospur", "Breite", "Höhe", "Lautstärke"],
  es: ["Cancelar renderizado", "Pista de vídeo", "Anchura", "Altura", "Volumen"],
  "es-419": ["Cancelar renderizado", "Pista de video", "Ancho", "Alto", "Volumen"],
  fr: ["Annuler le rendu", "Piste vidéo", "Largeur", "Hauteur", "Volume"],
  it: ["Annulla rendering", "Traccia video", "Larghezza", "Altezza", "Volume"],
  "pt-BR": ["Cancelar renderização", "Faixa de vídeo", "Largura", "Altura", "Volume"],
  "pt-PT": ["Cancelar renderização", "Faixa de vídeo", "Largura", "Altura", "Volume"],
  vi: ["Hủy kết xuất", "Rãnh video", "Chiều rộng", "Chiều cao", "Âm lượng"],
  tr: ["İşlemeyi iptal et", "Video kanalı", "Genişlik", "Yükseklik", "Ses düzeyi"],
  ja: ["レンダリングを取消", "動画トラック", "幅", "高さ", "音量"],
  ko: ["렌더링 취소", "비디오 트랙", "너비", "높이", "볼륨"],
  ar: ["إلغاء التصيير", "مسار الفيديو", "العرض", "الارتفاع", "مستوى الصوت"],
  th: ["ยกเลิกการเรนเดอร์", "แทร็กวิดีโอ", "ความกว้าง", "ความสูง", "ระดับเสียง"],
  hi: ["रेंडर रद्द करें", "वीडियो ट्रैक", "चौड़ाई", "ऊंचाई", "आवाज़"],
};

export const PW_VB_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, Object.fromEntries(ZH.map((key, index) => [key, ROWS[locale][index]]))]),
) as Record<Locale, Record<string, string>>;
