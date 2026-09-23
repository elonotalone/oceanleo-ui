import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = { newTerminal: "新终端" } as const;

export const CCP_W9_MESSAGES = assembleCopy(SOURCE, {
  en: { newTerminal: "New terminal" },
  de: { newTerminal: "Neues Terminal" },
  fr: { newTerminal: "Nouveau terminal" },
  es: { newTerminal: "Nueva terminal" },
  it: { newTerminal: "Nuovo terminale" },
  pt: { newTerminal: "Novo terminal" },
  nl: { newTerminal: "Nieuwe terminal" },
  sv: { newTerminal: "Ny terminal" },
  ja: { newTerminal: "新しいターミナル" },
  ko: { newTerminal: "새 터미널" },
  ru: { newTerminal: "Новый терминал" },
  ar: { newTerminal: "طرفية جديدة" },
  hi: { newTerminal: "नया टर्मिनल" },
  tr: { newTerminal: "Yeni terminal" },
  vi: { newTerminal: "Terminal mới" },
  id: { newTerminal: "Terminal baru" },
});
