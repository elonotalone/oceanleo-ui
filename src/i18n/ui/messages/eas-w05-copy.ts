// 2026-09-24 editors-and-shell 波 W05 的分表。只由 W05 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W05_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
// 「插件」各语种与 nav namespace 的 `plugins` 同词：侧栏那一行挪进了账号菜单。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {
  "插件": "插件",
} as const;

export const EAS_W05_MESSAGES = assembleCopy(SOURCE, {
  en: { "插件": "Plugins" },
  de: { "插件": "Plugins" },
  es: { "插件": "Complementos" },
  "es-419": { "插件": "Complementos" },
  fr: { "插件": "Extensions" },
  it: { "插件": "Plugin" },
  "pt-BR": { "插件": "Plugins" },
  "pt-PT": { "插件": "Plugins" },
  vi: { "插件": "Tiện ích" },
  tr: { "插件": "Eklentiler" },
  "zh-TW": { "插件": "外掛" },
  ja: { "插件": "プラグイン" },
  ko: { "插件": "플러그인" },
  ar: { "插件": "الإضافات" },
  th: { "插件": "ปลั๊กอิน" },
  hi: { "插件": "प्लगइन" },
});
