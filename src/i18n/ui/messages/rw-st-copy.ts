import type { Locale } from "../../config";

// Wave 2026-11-20 ST: under a message sent while the agent works and steered into that turn (`_session/steering`).
// Bind each translation to its source key; row order must never change its meaning.
const ZH = {
  "已送达：它会在下一步读到，不会打断正在做的事": "已送达：它会在下一步读到，不会打断正在做的事",
} as const;
type Copy = Record<keyof typeof ZH, string>;

const KEY = "已送达：它会在下一步读到，不会打断正在做的事";

const COPY: Record<Exclude<Locale, "zh">, Copy> = {
  "de": { [KEY]: "Zugestellt: wird beim nächsten Schritt gelesen, ohne die laufende Arbeit zu unterbrechen" },
  "en": { [KEY]: "Delivered: it will read this at its next step, without interrupting what it is doing" },
  "es": { [KEY]: "Entregado: lo leerá en el siguiente paso, sin interrumpir lo que está haciendo" },
  "es-419": { [KEY]: "Entregado: lo va a leer en el siguiente paso, sin interrumpir lo que está haciendo" },
  "fr": { [KEY]: "Remis : il le lira à la prochaine étape, sans interrompre ce qu'il fait" },
  "it": { [KEY]: "Consegnato: lo leggerà al prossimo passaggio, senza interrompere quello che sta facendo" },
  "pt-BR": { [KEY]: "Entregue: vai ler isto no próximo passo, sem interromper o que está fazendo" },
  "pt-PT": { [KEY]: "Entregue: vai ler isto no próximo passo, sem interromper o que está a fazer" },
  "vi": { [KEY]: "Đã gửi: nó sẽ đọc ở bước tiếp theo, không làm gián đoạn việc đang làm" },
  "tr": { [KEY]: "İletildi: yaptığı işi bölmeden bir sonraki adımda okuyacak" },
  "zh-TW": { [KEY]: "已送達：它會在下一步讀到，不會打斷正在做的事" },
  "ja": { [KEY]: "送信済み：今の作業を止めずに、次のステップで読まれます" },
  "ko": { [KEY]: "전달됨: 하던 일을 멈추지 않고 다음 단계에서 읽습니다" },
  "ar": { [KEY]: "تم التسليم: سيقرؤها في الخطوة التالية دون مقاطعة ما يفعله" },
  "th": { [KEY]: "ส่งแล้ว: จะอ่านในขั้นถัดไป โดยไม่ขัดจังหวะงานที่ทำอยู่" },
  "hi": { [KEY]: "पहुंच गया: यह अगले कदम पर इसे पढ़ेगा, जो कर रहा है उसे रोके बिना" },
};

export function rwStCopy(locale: Locale): Record<string, string> {
  return locale === "zh" ? { ...ZH } : { ...COPY[locale] };
}
