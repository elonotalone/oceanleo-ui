// Shared labels retained after removing the 3D editor.
import type { EditorOverhaulCopy } from "./editor-overhaul-copy-types";

const KEYS = [
  "移动",
  "标注",
  "衰减"
] as const;
const ROWS = {
  "de": ["Verschieben","Anmerkungen","Abfall"],
  "en": ["Move","Annotations","Decay"],
  "es": ["Mover","Anotaciones","Decaimiento"],
  "es-419": ["Mover","Anotaciones","Decaimiento"],
  "fr": ["Déplacer","Annotations","Atténuation"],
  "it": ["Sposta","Annotazioni","Decadimento"],
  "pt-BR": ["Mover","Anotações","Decaimento"],
  "pt-PT": ["Mover","Anotações","Decaimento"],
  "vi": ["Di chuyển","Chú thích","Suy giảm"],
  "tr": ["Taşı","Açıklamalar","Azalma"],
  "zh-TW": ["移動","標註","衰減"],
  "ja": ["移動","注釈","減衰"],
  "ko": ["이동","주석","감쇠"],
  "ar": ["تحريك","التعليقات","التلاشي"],
  "th": ["ย้าย","คำอธิบายประกอบ","การลดทอน"],
  "hi": ["खिसकाएँ","टिप्पणियाँ","क्षय"],
} satisfies Record<keyof EditorOverhaulCopy, readonly string[]>;

export const EDITOR_OVERHAUL_W13_COPY = Object.fromEntries(
  Object.entries(ROWS).map(([locale, values]) => [locale,
    Object.fromEntries([
      ...KEYS.map((key, index) => [key, values[index]]),
    ]),
  ]),
) as EditorOverhaulCopy;
