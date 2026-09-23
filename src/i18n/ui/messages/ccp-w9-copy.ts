import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = { newTerminal: "新终端" } as const;

export const CCP_W9_MESSAGES = assembleCopy(SOURCE, {
  en: { newTerminal: "New terminal" },
  de: { newTerminal: "Neues Terminal" },
  fr: { newTerminal: "Nouveau terminal" },
  es: { newTerminal: "Nueva terminal" },
  "es-419": { newTerminal: "Nuevo terminal" },
  it: { newTerminal: "Nuovo terminale" },
  "pt-BR": { newTerminal: "Novo terminal" },
  "pt-PT": { newTerminal: "Novo terminal" },
  vi: { newTerminal: "Thiết bị đầu cuối mới" },
  tr: { newTerminal: "Yeni terminal" },
  "zh-TW": { newTerminal: "新終端" },
  ja: { newTerminal: "新しいターミナル" },
  ko: { newTerminal: "새 터미널" },
  ar: { newTerminal: "طرفية جديدة" },
  th: { newTerminal: "เทอร์มินัลใหม่" },
  hi: { newTerminal: "नया टर्मिनल" },
});
