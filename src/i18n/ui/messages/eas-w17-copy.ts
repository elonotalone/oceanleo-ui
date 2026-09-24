// 2026-09-24 editors-and-shell 波 W17 的分表。只由 W17 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W17_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 「重试」已在全站词典，这里只补进专业面失败时的提示。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "还没准备好，稍后再切换": "还没准备好，稍后再切换",
} as const;

export const EAS_W17_MESSAGES = assembleCopy(SOURCE, {
  en: { "还没准备好，稍后再切换": "Not ready yet. Switch again in a moment." },
  de: { "还没准备好，稍后再切换": "Noch nicht bereit. Bitte gleich noch einmal wechseln." },
  es: { "还没准备好，稍后再切换": "Aún no está listo. Vuelve a cambiar en un momento." },
  "es-419": { "还没准备好，稍后再切换": "Todavía no está listo. Vuelve a cambiar en un momento." },
  fr: { "还没准备好，稍后再切换": "Pas encore prêt. Réessayez de basculer dans un instant." },
  it: { "还没准备好，稍后再切换": "Non è ancora pronto. Riprova a cambiare tra un momento." },
  "pt-BR": { "还没准备好，稍后再切换": "Ainda não está pronto. Troque de novo em instantes." },
  "pt-PT": { "还没准备好，稍后再切换": "Ainda não está pronto. Mude novamente daqui a pouco." },
  vi: { "还没准备好，稍后再切换": "Chưa sẵn sàng. Hãy chuyển lại sau một lúc." },
  tr: { "还没准备好，稍后再切换": "Henüz hazır değil. Biraz sonra yeniden geçin." },
  "zh-TW": { "还没准备好，稍后再切换": "還沒準備好，稍後再切換" },
  ja: { "还没准备好，稍后再切换": "まだ準備できていません。しばらくしてから切り替えてください。" },
  ko: { "还没准备好，稍后再切换": "아직 준비되지 않았습니다. 잠시 후 다시 전환하세요." },
  ar: { "还没准备好，稍后再切换": "ليس جاهزًا بعد. بدّل مرة أخرى بعد قليل." },
  th: { "还没准备好，稍后再切换": "ยังไม่พร้อม สลับอีกครั้งในอีกสักครู่" },
  hi: { "还没准备好，稍后再切换": "अभी तैयार नहीं है। थोड़ी देर बाद फिर स्विच करें।" },
});
