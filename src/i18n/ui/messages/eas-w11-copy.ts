// 2026-09-24 editors-and-shell 波 W11 的分表。只由 W11 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W11_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "先点一下，再按住就能拖动": "先点一下，再按住就能拖动",
} as const;

export const EAS_W11_MESSAGES = assembleCopy(SOURCE, {
  en: { "先点一下，再按住就能拖动": "Click once, then hold to drag" },
  de: { "先点一下，再按住就能拖动": "Einmal klicken, dann gedrückt halten zum Ziehen" },
  es: { "先点一下，再按住就能拖动": "Haz clic una vez y luego mantén pulsado para arrastrar" },
  "es-419": { "先点一下，再按住就能拖动": "Haz clic una vez y luego mantén presionado para arrastrar" },
  fr: { "先点一下，再按住就能拖动": "Cliquez une fois, puis maintenez pour faire glisser" },
  it: { "先点一下，再按住就能拖动": "Fai clic una volta, poi tieni premuto per trascinare" },
  "pt-BR": { "先点一下，再按住就能拖动": "Clique uma vez e depois mantenha pressionado para arrastar" },
  "pt-PT": { "先点一下，再按住就能拖动": "Clique uma vez e depois mantenha premido para arrastar" },
  vi: { "先点一下，再按住就能拖动": "Bấm một lần, rồi giữ để kéo" },
  tr: { "先点一下，再按住就能拖动": "Bir kez tıklayın, sonra sürüklemek için basılı tutun" },
  "zh-TW": { "先点一下，再按住就能拖动": "先點一下，再按住就能拖動" },
  ja: { "先点一下，再按住就能拖动": "一度クリックしてから、長押ししてドラッグ" },
  ko: { "先点一下，再按住就能拖动": "한 번 클릭한 다음 누른 채로 드래그하세요" },
  ar: { "先点一下，再按住就能拖动": "انقر مرة ثم اضغط مع الاستمرار للسحب" },
  th: { "先点一下，再按住就能拖动": "คลิกครั้งหนึ่ง แล้วกดค้างเพื่อลาก" },
  hi: { "先点一下，再按住就能拖动": "एक बार क्लिक करें, फिर खींचने के लिए दबाए रखें" },
});
