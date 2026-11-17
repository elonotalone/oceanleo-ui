import { LOCALES, type Locale } from "../../config";

// Row order is shared by every locale; tests reject missing translations.
export const PW_VA_SOURCE = ["生成音乐", "视频生成失败。"] as const;
const rows: Record<Locale, readonly string[]> = {
  zh: PW_VA_SOURCE,
  en: ["Generate music", "Video generation failed."],
  "zh-TW": ["產生音樂", "影片產生失敗。"],
  de: ["Musik erzeugen", "Videoerzeugung fehlgeschlagen."],
  es: ["Generar música", "No se pudo generar el vídeo."],
  "es-419": ["Generar música", "No se pudo generar el video."],
  fr: ["Générer de la musique", "La génération vidéo a échoué."],
  it: ["Genera musica", "Generazione del video non riuscita."],
  "pt-BR": ["Gerar música", "A geração do vídeo falhou."],
  "pt-PT": ["Gerar música", "A geração do vídeo falhou."],
  vi: ["Tạo nhạc", "Tạo video thất bại."],
  tr: ["Müzik oluştur", "Video oluşturulamadı."],
  ja: ["音楽を生成", "動画の生成に失敗しました。"],
  ko: ["음악 생성", "동영상 생성에 실패했습니다."],
  ar: ["إنشاء موسيقى", "فشل إنشاء الفيديو."],
  th: ["สร้างเพลง", "สร้างวิดีโอไม่สำเร็จ"],
  hi: ["संगीत बनाएँ", "वीडियो बनाना विफल रहा।"],
};
export const PW_VA_MESSAGES = Object.fromEntries(LOCALES.map((locale) => [locale, Object.fromEntries(PW_VA_SOURCE.map((source, index) => [source, rows[locale][index]]))])) as Record<Locale, Record<string, string>>;
