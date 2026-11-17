// W13 3D selection and Scene drawer copy; authored scene labels remain content.
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
  "es-419": ["Herramienta de transformación","Mover","Transformación del objeto","Mostrar nodo","Material PBR","Color base","Metalicidad","Rugosidad","Cámara del modelo","Luz del modelo","Color de luz","Anotaciones","Texto de anotación","Eliminar anotación","Cámara del editor","Órbita horizontal","Órbita vertical","Distancia de cámara","Rotación automática","Restablecer cámara","Entorno y sombras","Exposición","URL del entorno HDR","Intensidad del entorno","Activar sombras","Intensidad de sombra","Suavidad de sombra","Clip de animación","Pose de reposo","Reproducir animación","Tiempo de reproducción","Velocidad de animación","Campo de visión","Zoom ortográfico","Plano de corte cercano","Plano de corte lejano","Intensidad de luz","Alcance de luz","Decaimiento","Ángulo del cono","Penumbra","Escalar objeto"],
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
